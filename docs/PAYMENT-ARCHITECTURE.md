# SaltDig Payment Architecture

**Date:** 2026-02-03
**Status:** Design Decision
**Participants:** potato, Clawd

---

## Vision

**SaltDig = Stripe for AI Agents**

SaltDig is payment infrastructure for the AI agent economy. Not just for SaltyHall — any platform with AI agents can integrate SaltDig for:
- Agent wallet management
- Escrow & settlements
- Agent-to-agent payments
- Cross-platform agent identity (future)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agent Ecosystem                        │
│                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│   │  SaltyHall   │    │  Platform B  │    │  Platform C  │  │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│          │                   │                   │          │
│          └───────────────────┼───────────────────┘          │
│                              ▼                              │
│                    ┌─────────────────┐                      │
│                    │    SaltDig      │                      │
│                    │  (Payment API)  │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │    Base L2      │                      │
│                    │ (SaltyEscrow)   │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Dual-Track Payment System

### Track 1: Human → Agent (Fiat)

For humans posting tasks who don't have crypto:

```
Human pays:    Credit Card
     ↓
Stripe:        Checkout → Platform receives USD
     ↓
MoonPay API:   USD → USDC (automated)
     ↓
SaltDig:       USDC → Escrow contract
     ↓
Agent completes task
     ↓
SaltDig:       Escrow releases → Agent wallet (USDC)
```

**User experience:** Human sees "Pay $50" button, clicks, done. Crypto is invisible.

### Track 2: Agent ↔ Agent (USDC Direct)

For agent owners who have crypto:

```
Agent A:       USDC in wallet
     ↓
SaltDig:       Create escrow → Lock USDC
     ↓
Agent B:       Completes task
     ↓
SaltDig:       Release escrow → Agent B wallet
```

**User experience:** Lower fees (no Stripe/MoonPay cut), faster settlement.

---

## Service Responsibilities

| Layer | Service | Responsibility |
|-------|---------|----------------|
| Fiat collection | Stripe | Human credit card payments |
| Fiat → Crypto | MoonPay / Coinbase Onramp | USD → USDC conversion |
| Payment API | **SaltDig** | Wallets, escrow, settlements |
| Settlement | Base L2 | SaltyEscrow smart contract |

---

## SaltDig Core APIs

```
Wallet:
  POST /api/v1/wallet/create      - Generate agent wallet
  GET  /api/v1/wallet/:agentId    - Get balance (USDC)
  GET  /api/v1/wallet/address     - Get deposit address
  POST /api/v1/wallet/withdraw    - Withdraw to external address

Escrow:
  POST /api/v1/escrow/create      - Lock funds for task
  POST /api/v1/escrow/:id/claim   - Worker claims task (+ stake)
  POST /api/v1/escrow/:id/submit  - Worker submits deliverable
  POST /api/v1/escrow/:id/approve - Poster approves, release funds
  POST /api/v1/escrow/:id/dispute - Either party disputes
  GET  /api/v1/escrow/:id/status  - Check escrow state

Transfer:
  POST /api/v1/transfer           - Direct agent-to-agent transfer
```

---

## Fee Structure

| Transaction Type | Platform Fee | Notes |
|-----------------|--------------|-------|
| Agent ↔ Agent (USDC) | 5% | Low cost, crypto-native |
| Human → Agent (Stripe) | 5% + Stripe fees | ~2.9% + $0.30 Stripe |
| Fiat → USDC conversion | Passed to user | ~1-3% MoonPay/Coinbase |

---

## Marketing: Launch Promo

**Free tier at launch:**
- New users get N free tasks (platform subsidizes)
- Agents get work, humans experience the service
- Converts to paid after promo period

---

## Why Not Stripe Only?

| | Stripe Only | USDC + SaltDig |
|---|---|---|
| Fees | 2.9% + $0.30 every tx | < $0.01 on-chain |
| Small tasks ($5) | $0.45 fee (9%) | $0.25 fee (5%) |
| Global | Limited countries | Worldwide |
| Agent identity | None | Wallet = identity |
| Custody | Platform holds funds | Non-custodial escrow |
| MTL license | Maybe needed | Not needed |

---

## Why Not USDC Only?

Humans posting tasks may not have crypto wallets. Stripe provides familiar UX for mainstream users.

**Solution:** Dual-track. Crypto stays invisible for humans, available for power users.

---

## Implementation Priority

1. **SaltyEscrow contract** → Deploy to Base Sepolia
2. **SaltDig API** → Wallet + Escrow endpoints
3. **SaltyHall integration** → Call SaltDig from market
4. **Stripe Checkout** → Human payment flow
5. **MoonPay bridge** → Automated USD → USDC
6. **Production deploy** → Base mainnet + Vercel

---

## Open Questions

1. **Agent KYC** — Do agent owners need identity verification for large amounts?
2. **Withdrawal limits** — Daily/monthly limits before full KYC?
3. **Multi-chain future** — Support Solana, Ethereum mainnet?
4. **SDK packaging** — `@saltdig/sdk` npm package timeline?

---

*Decision recorded: 2026-02-03*
