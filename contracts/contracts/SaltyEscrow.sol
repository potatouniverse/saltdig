// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SaltyEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public usdc; // USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

    uint256 public platformFeeBps = 500;   // 5%
    uint256 public workerStakeBps = 1000;  // 10%
    uint256 public autoReleaseSeconds = 72 hours;
    uint256 public accumulatedFees;

    enum BountyStatus { Open, Claimed, Submitted, Approved, Disputed, Cancelled, AutoReleased }

    struct Bounty {
        address poster;
        address worker;
        uint256 amount;
        uint256 workerStake;
        uint256 deadline;
        uint256 submittedAt;
        BountyStatus status;
        string bountyId;
    }

    mapping(bytes32 => Bounty) public bounties;

    event BountyCreated(bytes32 indexed hash, string bountyId, address poster, uint256 amount);
    event BountyClaimed(bytes32 indexed hash, address worker, uint256 stake);
    event BountySubmitted(bytes32 indexed hash);
    event BountyApproved(bytes32 indexed hash, uint256 workerPayout, uint256 platformFee);
    event BountyDisputed(bytes32 indexed hash, address disputedBy);
    event BountyCancelled(bytes32 indexed hash);
    event BountyAutoReleased(bytes32 indexed hash);

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }

    function computeHash(string calldata bountyId) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(bountyId));
    }

    function createBounty(string calldata bountyId, uint256 amount, uint256 deadline) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(deadline > block.timestamp, "Deadline must be in the future");

        bytes32 hash = computeHash(bountyId);
        require(bounties[hash].poster == address(0), "Bounty already exists");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        bounties[hash] = Bounty({
            poster: msg.sender,
            worker: address(0),
            amount: amount,
            workerStake: 0,
            deadline: deadline,
            submittedAt: 0,
            status: BountyStatus.Open,
            bountyId: bountyId
        });

        emit BountyCreated(hash, bountyId, msg.sender, amount);
    }

    function claimBounty(bytes32 hash) external nonReentrant {
        Bounty storage b = bounties[hash];
        require(b.poster != address(0), "Bounty does not exist");
        require(b.status == BountyStatus.Open, "Bounty is not open");
        require(b.deadline > block.timestamp, "Bounty has expired");
        require(msg.sender != b.poster, "Poster cannot claim own bounty");

        uint256 stakeAmount = (b.amount * workerStakeBps) / 10000;
        usdc.safeTransferFrom(msg.sender, address(this), stakeAmount);

        b.worker = msg.sender;
        b.workerStake = stakeAmount;
        b.status = BountyStatus.Claimed;

        emit BountyClaimed(hash, msg.sender, stakeAmount);
    }

    function submitBounty(bytes32 hash) external {
        Bounty storage b = bounties[hash];
        require(b.status == BountyStatus.Claimed, "Bounty is not claimed");
        require(msg.sender == b.worker, "Only worker can submit");

        b.status = BountyStatus.Submitted;
        b.submittedAt = block.timestamp;

        emit BountySubmitted(hash);
    }

    function approveBounty(bytes32 hash) external nonReentrant {
        Bounty storage b = bounties[hash];
        require(b.status == BountyStatus.Submitted, "Bounty is not submitted");
        require(msg.sender == b.poster, "Only poster can approve");

        _payWorker(hash, b);
        b.status = BountyStatus.Approved;
    }

    function disputeBounty(bytes32 hash) external {
        Bounty storage b = bounties[hash];
        require(b.status == BountyStatus.Submitted, "Can only dispute submitted bounties");
        require(msg.sender == b.poster || msg.sender == b.worker, "Only poster or worker can dispute");

        b.status = BountyStatus.Disputed;

        emit BountyDisputed(hash, msg.sender);
    }

    function resolveDispute(bytes32 hash, bool favorWorker) external onlyOwner nonReentrant {
        Bounty storage b = bounties[hash];
        require(b.status == BountyStatus.Disputed, "Bounty is not disputed");

        if (favorWorker) {
            _payWorker(hash, b);
            b.status = BountyStatus.Approved;
        } else {
            // Refund poster, return worker stake to worker
            usdc.safeTransfer(b.poster, b.amount);
            usdc.safeTransfer(b.worker, b.workerStake);
            b.status = BountyStatus.Cancelled;
        }
    }

    function cancelBounty(bytes32 hash) external nonReentrant {
        Bounty storage b = bounties[hash];
        require(b.status == BountyStatus.Open, "Can only cancel open bounties");
        require(msg.sender == b.poster, "Only poster can cancel");

        uint256 cancellationFee = (b.amount * 100) / 10000; // 1%
        uint256 refund = b.amount - cancellationFee;

        accumulatedFees += cancellationFee;
        usdc.safeTransfer(b.poster, refund);

        b.status = BountyStatus.Cancelled;

        emit BountyCancelled(hash);
    }

    function autoRelease(bytes32 hash) external nonReentrant {
        Bounty storage b = bounties[hash];
        require(b.status == BountyStatus.Submitted, "Bounty is not submitted");
        require(block.timestamp >= b.submittedAt + autoReleaseSeconds, "Auto-release period not reached");

        _payWorker(hash, b);
        b.status = BountyStatus.AutoReleased;

        emit BountyAutoReleased(hash);
    }

    function updatePlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 2000, "Fee too high"); // Max 20%
        platformFeeBps = newFeeBps;
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees;
        require(amount > 0, "No fees to withdraw");
        accumulatedFees = 0;
        usdc.safeTransfer(owner(), amount);
    }

    // --- Internal ---

    function _payWorker(bytes32 hash, Bounty storage b) internal {
        uint256 fee = (b.amount * platformFeeBps) / 10000;
        uint256 workerPayout = b.amount - fee + b.workerStake;

        accumulatedFees += fee;
        usdc.safeTransfer(b.worker, workerPayout);

        emit BountyApproved(hash, workerPayout, fee);
    }
}
