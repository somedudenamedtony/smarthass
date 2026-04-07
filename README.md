# SmartHass

AI-powered companion for Home Assistant. Connect your HA instance, and SmartHass will analyze your smart home data to provide insights, detect anomalies, identify automation opportunities, and suggest efficiency improvements — all powered by Claude AI.

## Features

- **Dashboard** — Overview metrics, D3.js charts (top entities, domain distribution), and activity feed
- **Entity Management** — Browse, search, filter by domain, and track entities for daily stat aggregation
- **Automation Browser** — View all HA automations with trigger/condition/action breakdowns
- **AI Insights** — Four analysis types: usage patterns, anomaly detection, automation gaps, efficiency suggestions
- **Automation Suggestions** — AI-generated HA automation YAML you can copy directly into your configuration
- **Dual Deployment** — Run on Vercel (cloud, multi-user) or self-host with Docker (single-user, data stays local)
- **Home Assistant Add-on** — Install directly in HA with continuous real-time sync via WebSocket

---

## Home Assistant Add-on (Recommended)

The easiest way to run SmartHass — install it as a native Home Assistant add-on. Data syncs in real-time via WebSocket, authentication is handled by HA, and PostgreSQL is bundled inside the container.

### Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**
2. Click the three-dot menu (top-right) → **Repositories**
3. Add: `https://github.com/somedudenamedtony/smarthass`
4. Find **SmartHass** in the store and click **Install**
5. In the add-on **Configuration** tab, set your **Anthropic API Key**
6. Click **Start** — SmartHass auto-configures and opens in the sidebar

### How it works

- **Real-time sync** — Entity state changes stream via HA WebSocket (no polling)
- **Daily reconciliation** — New entities and automations are picked up automatically
- **No separate login** — Authentication is handled by HA Ingress
- **Local data** — PostgreSQL runs inside the add-on container, data stored in `/data`

---

## Quick Start (Self-Hosted with Docker)

This is the recommended way to get started. All data stays on your network.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A Home Assistant instance accessible on your network
- An [Anthropic API key](https://console.anthropic.com/) (for AI features)

### 1. Clone and configure

```bash
git clone https://github.com/somedudenamedtony/smarthass.git
cd smarthass
cp .env.example .env
```

Edit `.env` and set the required values:

```env
DEPLOY_MODE=self-hosted
DATABASE_URL=postgresql://smarthass:smarthass@db:5432/smarthass
AUTH_SECRET=<generate below>
ENCRYPTION_KEY=<generate below>
ANTHROPIC_API_KEY=<your Anthropic API key>
```

Generate the secrets:

```bash
# AUTH_SECRET — random string for session signing
npx auth secret
# or: openssl rand -base64 32

# ENCRYPTION_KEY — 32-byte hex key for HA token encryption
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or: openssl rand -hex 32
```

### 2. Start the stack

```bash
docker compose up -d
```

This starts the Next.js app on port 3000 and a Postgres 16 database.

### 3. Create your admin account

Open [http://localhost:3000/setup](http://localhost:3000/setup) and create your admin account.

### 4. Connect Home Assistant

1. Go to **Settings** in the sidebar
2. Click **Add Instance**
3. Enter your HA URL (e.g., `http://homeassistant.local:8123` or `http://192.168.1.x:8123`)
4. Enter a **Long-Lived Access Token** (see [how to create one](#getting-a-home-assistant-access-token))
5. SmartHass will verify the connection and sync your entities

### 5. Get AI insights

- Go to **Insights** and click **Analyze Now** to run an on-demand AI analysis
- Insights also run automatically on a weekly schedule (configurable in `.env`)

---

## Getting a Home Assistant Access Token

1. In Home Assistant, click your user profile (bottom-left)
2. Scroll to **Long-Lived Access Tokens**
3. Click **Create Token**, give it a name like "SmartHass"
4. Copy the token — you'll only see it once

The token is encrypted (AES-256-GCM) before being stored in the database.

---

## Cloud Deployment (Vercel + Neon)

For multi-user deployment with OAuth authentication.

### Prerequisites

- [Vercel](https://vercel.com) account
- [Neon](https://neon.tech) Postgres database
- GitHub and/or Google OAuth app credentials
- Anthropic API key

### Steps

1. Fork this repository
2. Create a Neon database and copy the connection string
3. Set environment variables in Vercel:

```env
DEPLOY_MODE=cloud
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/smarthass?sslmode=require
AUTH_SECRET=<generate with: npx auth secret>
AUTH_GITHUB_ID=<your GitHub OAuth app ID>
AUTH_GITHUB_SECRET=<your GitHub OAuth app secret>
AUTH_GOOGLE_ID=<your Google OAuth client ID>
AUTH_GOOGLE_SECRET=<your Google OAuth client secret>
ENCRYPTION_KEY=<32-byte hex key>
ANTHROPIC_API_KEY=<your Anthropic API key>
CRON_SECRET=<random string for cron endpoint auth>
```

4. Deploy to Vercel — cron jobs for daily sync and weekly analysis are configured in `vercel.json`
5. Push the database schema: `npx drizzle-kit push`

> **Note:** Cloud mode requires your HA instance to be publicly accessible (via Nabu Casa, DuckDNS, or a reverse proxy). Self-hosted mode works with local network URLs.

---

## Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in DATABASE_URL (local Postgres), AUTH_SECRET, ENCRYPTION_KEY
# Set DEPLOY_MODE=self-hosted for credentials auth

# Push database schema
npx drizzle-kit push

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Visit `/setup` on first run to create your account.

---

## Environment Variables

See [`.env.example`](.env.example) for the full annotated list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOY_MODE` | Yes | `cloud`, `self-hosted`, or `home-assistant` |
| `DATABASE_URL` | Yes | Postgres connection string |
| `AUTH_SECRET` | Yes | Session signing secret |
| `ENCRYPTION_KEY` | Yes | 32-byte hex key for AES-256-GCM token encryption |
| `ANTHROPIC_API_KEY` | For AI | Anthropic API key for Claude analysis |
| `AUTH_GITHUB_ID/SECRET` | Cloud only | GitHub OAuth credentials |
| `AUTH_GOOGLE_ID/SECRET` | Cloud only | Google OAuth credentials |
| `CRON_SECRET` | Cloud only | Auth secret for Vercel Cron endpoints |
| `SYNC_CRON_SCHEDULE` | Optional | Daily sync cron (default: `0 3 * * *`) |
| `ANALYSIS_CRON_SCHEDULE` | Optional | Weekly analysis cron (default: `0 4 * * 0`) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, shadcn/ui, Tailwind CSS v4, D3.js |
| Backend | Next.js API Routes (Node.js runtime) |
| Auth | NextAuth.js v5 — OAuth for cloud, credentials for self-hosted |
| Database | Postgres via Drizzle ORM (Neon HTTP driver for cloud, node-postgres for self-hosted) |
| AI | Anthropic Claude — Sonnet 4 for analysis, Haiku 4 for classification |
| Scheduling | Vercel Cron (cloud) / node-cron (self-hosted / HA add-on) |
| Infrastructure | Docker + Docker Compose (self-hosted), Vercel (cloud), HA Add-on (home-assistant) |

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐
│  SmartHass Frontend  │────▶│  Next.js API      │
│  (React + D3.js)     │     │  Routes           │
└─────────────────────┘     └────────┬─────────┘
                                     │
                      ┌──────────────┼──────────────┐
                      │              │              │
                ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────────┐
                │ Postgres  │  │  Claude   │  │ Home         │
                │ (Drizzle) │  │  API      │  │ Assistant    │
                └──────────┘  └──────────┘  │ (REST API)   │
                                            └──────────────┘
```

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/     # Dashboard pages (entities, automations, insights, settings)
│   ├── api/             # API routes (HA proxy, analysis, insights, cron, setup)
│   ├── login/           # Login page
│   └── setup/           # First-run setup wizard
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── charts/          # D3.js chart components
│   ├── insights/        # Insight card components
│   ├── dashboard/       # Responsive nav
│   └── settings/        # HA instance management
├── db/
│   ├── schema.ts        # Drizzle ORM schema (10 tables, 4 enums)
│   └── index.ts         # Conditional DB client (Neon / node-postgres)
├── lib/
│   ├── ai/              # AI analysis engine (prompts, service, types, YAML)
│   ├── ha-client.ts     # Home Assistant REST API client
│   ├── ha-websocket.ts  # HA WebSocket connection for real-time state sync
│   ├── state-aggregator.ts # In-memory state aggregation with periodic DB flush
│   ├── sync-service.ts  # Entity sync, automation sync, daily stats
│   ├── encryption.ts    # AES-256-GCM token encryption
│   ├── rate-limit.ts    # In-memory rate limiter
│   ├── scheduler.ts     # Conditional cron scheduler
│   └── config.ts        # Deploy mode detection
├── auth.ts              # NextAuth.js v5 configuration
└── middleware.ts         # Auth middleware
```

## AI Analysis

SmartHass runs four types of analysis on your smart home data:

1. **Usage Patterns** — Identifies recurring patterns in device usage (e.g., "lights turn on at 6pm daily")
2. **Anomaly Detection** — Flags unusual activity (e.g., "garage door opened at 3am")
3. **Automation Gaps** — Suggests new automations based on observed manual patterns
4. **Efficiency Insights** — Identifies energy waste, redundant automations, and optimization opportunities

Analysis runs automatically on a weekly schedule, or on-demand via the **Analyze Now** button on the Insights page. Results include confidence scores, relevant entity references, and for automation suggestions — ready-to-use HA YAML you can copy into your `automations.yaml`.

## License

[MIT](LICENSE)
