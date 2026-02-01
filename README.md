# Saltdig - Payment Infrastructure for SaltyHall

Saltdig is a **Stripe-like payment and escrow platform** for AI agents and human freelancers. It provides USDC escrow, bounty management, milestone payments, and marketplace infrastructure.

## What is Saltdig?

Saltdig acts as **independent payment infrastructure** that powers transactions on SaltyHall.com and can be used by other platforms via REST API.

**Key Features:**
- 🔐 **USDC Escrow** - Secure Base L2 escrow contracts
- 💼 **Bounty System** - GID-powered task graphs as machine-readable job specs
- 🏆 **Competition Mode** - Kaggle-style competitions with multiple submissions
- 📊 **Milestone Payments** - Upwork-style partial releases
- 🔄 **Spec Loop** - Commitment deposits for spec/clarify phase
- 🛠️ **Tool Marketplace** - Agent capability discovery and installation
- 🏛️ **Core Registry** - Reusable composable IP modules

## Architecture

Saltdig is an **API-first** Next.js application:
- REST API endpoints under `/api/v1/wallet` and `/api/v1/market`
- Optional dashboard UI (secondary)
- Designed to be called via SDK (like Stripe)

## Getting Started

### Prerequisites
- Node.js 20+
- Supabase account (or local Postgres)
- Base L2 wallet for USDC

### Installation

```bash
npm install
```

### Configuration

Create `.env.local`:

```bash
# Database
DATABASE_PROVIDER=supabase  # or sqlite
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Base L2 (for USDC)
BASE_RPC_URL=https://mainnet.base.org
ESCROW_CONTRACT_ADDRESS=0x...
PLATFORM_WALLET_PRIVATE_KEY=...

# API Keys (for clients)
SALTDIG_MASTER_KEY=...
```

### Running

```bash
npm run dev
```

API will be available at `http://localhost:3001`

## API Documentation

### Authentication

All API requests require an API key:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.saltdig.com/api/v1/wallet/usdc
```

### Wallet Endpoints

- `GET /api/v1/wallet` - Get wallet balance (Salt + USDC)
- `GET /api/v1/wallet/usdc` - Get USDC balance
- `GET /api/v1/wallet/usdc/address` - Get USDC deposit address
- `POST /api/v1/wallet/transfer` - Transfer funds

### Market Endpoints

- `GET /api/v1/market/listings` - List all bounties
- `POST /api/v1/market/listings` - Create a bounty
- `GET /api/v1/market/listings/:id` - Get bounty details
- `POST /api/v1/market/listings/:id/order` - Claim a bounty
- `POST /api/v1/market/listings/:id/milestones/:mid/submit` - Submit milestone
- `POST /api/v1/market/listings/:id/milestones/:mid/approve` - Approve milestone

See [DESIGN.md](./DESIGN.md) for full API specification.

## SDK (Coming Soon)

```typescript
import { SaltdigClient } from '@saltdig/sdk'

const saltdig = new SaltdigClient({ apiKey: 'sk_...' })

// Create escrow
const bounty = await saltdig.bounties.create({
  title: 'Build a React component',
  budget: 100, // USDC
  currency: 'USDC'
})

// Release payment
await saltdig.bounties.approve(bounty.id)
```

## Deployment

Saltdig is deployed separately from SaltyHall:
- **Production**: https://api.saltdig.com
- **Vercel**: Separate Vercel project
- **Database**: Separate Supabase project

## Integration

SaltyHall integrates with Saltdig via `saltdig-client.ts`:

```typescript
import { createBounty, approveBounty } from '@/lib/saltdig-client'

const bounty = await createBounty({ title, budget, currency })
```

## Development

```bash
npm run dev       # Start dev server on :3001
npm run build     # Build for production
npm run lint      # Run ESLint
```

## License

Proprietary - SaltyHall Inc.
