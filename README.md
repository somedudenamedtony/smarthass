# SmartHass

<div align="center">

**AI-Powered Analytics & Automation Companion for Home Assistant**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://typescriptlang.org/)
[![Anthropic Claude](https://img.shields.io/badge/AI-Claude-orange)](https://anthropic.com/)

</div>

---

SmartHass connects to your Home Assistant instance, analyzes your smart home data, and uses Claude AI to provide actionable insights, detect anomalies, suggest automations, and identify efficiency improvements — all while keeping your data private.

## ✨ Features

### Dashboard & Analytics
- **Overview Dashboard** — Instance health, key metrics, and activity feed at a glance
- **Interactive Charts** — D3.js visualizations for entity activity, domain distribution, and usage patterns
- **Activity Heatmap** — See when your smart home is most active by hour and day
- **Trend Analysis** — Track entity behavior changes over time

### Entity Management
- **Entity Browser** — Search, filter, and browse all entities by domain
- **Entity Tracking** — Mark important entities for detailed statistical tracking
- **Daily Statistics** — Automated aggregation of state changes, active time, and value ranges
- **Historical Retention** — Store data beyond Home Assistant's default 10-day limit

### Automation Intelligence
- **Automation Browser** — View all HA automations with trigger/condition/action breakdowns
- **AI Suggestions** — Get ready-to-deploy automation YAML based on your usage patterns
- **One-Click Deploy** — Push AI-generated automations directly to Home Assistant
- **Last Triggered Tracking** — Monitor automation execution history

### AI-Powered Insights
| Analysis Type | Description |
|---------------|-------------|
| **Usage Patterns** | Identify daily/weekly routines and recurring behaviors |
| **Anomaly Detection** | Flag unusual activity with statistical deviation analysis |
| **Automation Gaps** | Find patterns that could be automated but aren't |
| **Efficiency Insights** | Discover energy waste and underutilized devices |
| **Cross-Device Correlations** | Uncover hidden relationships between devices |
| **Device Recommendations** | Get suggestions for devices that complement your setup |

### Security & Privacy
- **AES-256-GCM Encryption** — HA access tokens encrypted at rest
- **Local Data Option** — Self-host to keep all data on your network
- **No Telemetry** — Zero data collection beyond your explicit consent

---

## 🏠 Deployment Options

SmartHass supports three deployment modes to fit your needs:

| Mode | Best For | Data Location | HA Access |
|------|----------|---------------|-----------|
| **Home Assistant Add-on** | Most users | Local (in add-on) | Automatic |
| **Docker Self-Hosted** | Privacy-focused users | Local (your server) | Local network |
| **Vercel Cloud** | Multi-user/SaaS | Neon Postgres | Public URL required |

---

## 🚀 Home Assistant Add-on (Recommended)

The easiest way to run SmartHass — install it as a native Home Assistant add-on. Data syncs in real-time via WebSocket, authentication is handled by HA, and PostgreSQL is bundled inside the container.

### Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**
2. Click the three-dot menu (top-right) → **Repositories**
3. Add: `https://github.com/somedudenamedtony/smarthass`
4. Find **SmartHass** in the store and click **Install**
5. In the add-on **Configuration** tab, set your **Anthropic API Key**
6. Click **Start** — SmartHass auto-configures and opens in the sidebar

### How It Works

| Feature | Description |
|---------|-------------|
| **Real-time Sync** | Entity state changes stream via HA WebSocket (no polling) |
| **Daily Reconciliation** | New entities and automations are picked up automatically |
| **Seamless Auth** | No separate login — authentication handled by HA Ingress |
| **Local Storage** | PostgreSQL runs inside the add-on, data stored in `/data` |
| **Auto-Discovery** | Connects to HA via Supervisor API automatically |

### Add-on Configuration

```yaml
anthropic_api_key: "sk-ant-..."   # Required: Your Anthropic API key
analysis_schedule: "0 4 * * 0"    # Optional: Weekly analysis cron (default: Sunday 4am)
sync_schedule: "0 3 * * *"        # Optional: Daily sync cron (default: 3am daily)
```

---

## 🐳 Docker Self-Hosted Setup

For users who want full control over their data and deployment.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2+
- A Home Assistant instance accessible on your network
- An [Anthropic API key](https://console.anthropic.com/) for AI features

### Quick Start

```bash
# Clone the repository
git clone https://github.com/somedudenamedtony/smarthass.git
cd smarthass

# Copy and configure environment
cp .env.example .env
```

Edit `.env` with required values:

```env
# Deployment
DEPLOY_MODE=self-hosted

# Database (bundled Postgres)
DATABASE_URL=postgresql://smarthass:smarthass@db:5432/smarthass

# Security (generate these!)
AUTH_SECRET=<generate-with-openssl-rand-base64-32>
ENCRYPTION_KEY=<generate-with-openssl-rand-hex-32>

# AI
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional: Custom schedules
DAILY_SYNC_CRON="0 3 * * *"
WEEKLY_ANALYSIS_CRON="0 4 * * 0"
```

Generate secure secrets:

```bash
# AUTH_SECRET — session signing key
openssl rand -base64 32

# ENCRYPTION_KEY — 32-byte hex key for token encryption
openssl rand -hex 32
```

Start the stack:

```bash
docker compose up -d
```

### Initial Setup

1. Open [http://localhost:3000/setup](http://localhost:3000/setup)
2. Create your admin account (email + password)
3. Go to **Settings** → **Add Instance**
4. Enter your HA URL: `http://homeassistant.local:8123` (or IP address)
5. Enter your Long-Lived Access Token ([how to get one](#getting-a-home-assistant-access-token))
6. Click **Test Connection** then **Save**

### Docker Compose Services

| Service | Description | Port |
|---------|-------------|------|
| `smarthass` | Next.js application | 3000 |
| `db` | PostgreSQL 16 database | 5432 (internal) |

### Updating

```bash
git pull
docker compose pull
docker compose up -d --build
```

---

## ☁️ Vercel Cloud Deployment

For multi-user deployment with OAuth authentication.

### Prerequisites

- [Vercel](https://vercel.com) account
- [Neon](https://neon.tech) Postgres database (or any Postgres)
- GitHub and/or Google OAuth app credentials
- Anthropic API key

### Environment Variables

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

### Steps

1. Fork this repository
2. Create a Neon database and copy the connection string
3. Set environment variables in Vercel dashboard
4. Deploy — cron jobs are configured in `vercel.json`
5. Run migrations: `npx drizzle-kit push`

> **Important:** Cloud mode requires your HA instance to be publicly accessible via Nabu Casa, DuckDNS, or a reverse proxy. Self-hosted mode works with local network URLs.

---

## 🔑 Getting a Home Assistant Access Token

1. In Home Assistant, click your **user profile** (bottom-left of sidebar)
2. Scroll to **Long-Lived Access Tokens** section
3. Click **Create Token**
4. Name it "SmartHass" and click **OK**
5. **Copy the token immediately** — you won't see it again

The token is encrypted with AES-256-GCM before storage. SmartHass only uses it for read access and deploying automations.

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

## 📊 Using SmartHass

### Dashboard Overview

The main dashboard provides at-a-glance metrics:

- **Instance Status** — Connection health and HA version
- **Entity Count** — Total entities synced from HA
- **Active Automations** — Number of enabled automations
- **Tracked Entities** — Entities marked for detailed tracking
- **State Changes** — Activity over the selected time period

### Entity Tracking

Mark entities as "tracked" to collect detailed statistics:

1. Go to **Entities** in the sidebar
2. Find the entity you want to track
3. Toggle the **Track** switch

Tracked entities get daily statistics including:
- State change count
- Active time duration
- Min/max/average values (for numeric sensors)
- Hourly activity breakdown
- State distribution

### Running AI Analysis

**On-Demand Analysis:**
1. Go to **Dashboard** or **Insights**
2. Click **Sync & Analyze**
3. Wait for sync and AI processing (~30-60 seconds)
4. Review insights in the feed

**Scheduled Analysis:**
- **Daily Sync**: Runs at 3 AM (configurable) to sync entities and automations
- **Weekly Analysis**: Runs Sundays at 4 AM (configurable) to generate AI insights

### Deploying Automation Suggestions

When AI suggests an automation:

1. Review the suggestion card on the Insights page
2. Click **View Details** to see the full YAML
3. Click **Deploy to HA** to push it to your Home Assistant
4. The automation appears in your HA automations list
5. Enable/disable it from HA's Automations page

---

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEPLOY_MODE` | Yes | — | `cloud`, `self-hosted`, or `home-assistant` |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | — | NextAuth.js session signing secret (32+ chars) |
| `ENCRYPTION_KEY` | Yes | — | 32-byte hex key for AES-256-GCM token encryption |
| `ANTHROPIC_API_KEY` | For AI | — | Anthropic API key for Claude analysis |
| `AUTH_GITHUB_ID` | Cloud | — | GitHub OAuth app ID |
| `AUTH_GITHUB_SECRET` | Cloud | — | GitHub OAuth app secret |
| `AUTH_GOOGLE_ID` | Cloud | — | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Cloud | — | Google OAuth client secret |
| `CRON_SECRET` | Cloud | — | Auth secret for Vercel Cron endpoints |
| `DAILY_SYNC_CRON` | No | `0 3 * * *` | Daily sync schedule (cron expression) |
| `WEEKLY_ANALYSIS_CRON` | No | `0 4 * * 0` | Weekly analysis schedule (cron expression) |
| `ANALYSIS_WINDOW_DAYS` | No | `7` | Days of history to include in AI analysis |
| `LOG_LEVEL` | No | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, shadcn/ui, Tailwind CSS v4, D3.js |
| **Backend** | Next.js API Routes (Node.js runtime) |
| **Auth** | NextAuth.js v5 — OAuth for cloud, credentials for self-hosted, Supervisor for HA add-on |
| **Database** | PostgreSQL via Drizzle ORM (Neon HTTP for cloud, node-postgres for self-hosted) |
| **AI** | Anthropic Claude — Sonnet 4 for analysis, Haiku 4 for classification |
| **Scheduling** | Vercel Cron (cloud) / node-cron (self-hosted) |
| **Real-Time** | WebSocket connection to HA for live state updates (self-hosted/add-on only) |

---

## 📁 Project Structure

```
smarthass/
├── src/
│   ├── app/
│   │   ├── (dashboard)/      # Protected dashboard routes
│   │   │   ├── dashboard/    # Main overview page
│   │   │   ├── entities/     # Entity browser & details
│   │   │   ├── automations/  # Automation browser
│   │   │   ├── insights/     # AI insights feed
│   │   │   ├── ai-usage/     # Token usage tracking
│   │   │   └── settings/     # Instance & config management
│   │   ├── api/              # API routes
│   │   │   ├── analysis/     # AI analysis endpoint
│   │   │   ├── automations/  # Automation CRUD + deploy
│   │   │   ├── cron/         # Scheduled job endpoints
│   │   │   ├── dashboard/    # Dashboard data endpoints
│   │   │   ├── entities/     # Entity data endpoints
│   │   │   ├── ha/           # HA instance management
│   │   │   ├── insights/     # Insights CRUD
│   │   │   └── settings/     # App settings
│   │   ├── login/            # Login page
│   │   └── setup/            # Initial setup wizard
│   ├── components/
│   │   ├── ui/               # shadcn/ui components
│   │   ├── charts/           # D3.js visualizations
│   │   ├── dashboard/        # Dashboard-specific components
│   │   ├── insights/         # Insight card components
│   │   └── settings/         # Settings form components
│   ├── db/
│   │   ├── schema.ts         # Drizzle ORM schema
│   │   ├── index.ts          # Database client
│   │   └── migrations/       # SQL migrations
│   └── lib/
│       ├── ai/               # AI analysis engine
│       │   ├── analysis-service.ts   # Main analysis orchestration
│       │   ├── prompts.ts            # Claude prompt templates
│       │   ├── automation-yaml.ts    # YAML generation
│       │   └── types.ts              # AI response types
│       ├── ha-client.ts      # HA REST API client
│       ├── ha-websocket.ts   # HA WebSocket client
│       ├── sync-service.ts   # Data synchronization
│       ├── encryption.ts     # Token encryption
│       └── config.ts         # Environment configuration
├── ha-addon/                 # Home Assistant add-on files
│   ├── config.yaml           # Add-on manifest
│   ├── Dockerfile            # Add-on container
│   └── DOCS.md               # Add-on documentation
├── docker-compose.yml        # Self-hosted deployment
├── Dockerfile                # Application container
└── drizzle.config.ts         # Database migration config
```

---

## 🔌 API Reference

### Dashboard Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard/stats` | GET | Overview metrics (entities, automations, activity) |
| `/api/dashboard/top-entities` | GET | Most active entities by state changes |
| `/api/dashboard/preferences` | GET/PATCH | User dashboard preferences |

### Entity Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/entities` | GET | List entities (filterable by domain, tracked status) |
| `/api/entities/[id]` | GET | Entity details with daily stats |
| `/api/entities/[id]` | PATCH | Update entity (toggle tracking) |

### Automation Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/automations` | GET | List synced automations |
| `/api/automations/[id]` | GET | Automation details |
| `/api/automations/deploy` | POST | Deploy AI suggestion to HA |
| `/api/automations/deploy` | DELETE | Remove deployed automation |

### Analysis Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analysis` | POST | Trigger on-demand AI analysis |
| `/api/insights` | GET | List AI insights (filterable by type, status) |
| `/api/insights/[id]` | PATCH | Update insight status (viewed, dismissed, applied) |
| `/api/ai-usage` | GET | Token usage statistics |

### HA Instance Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ha/instances` | GET | List connected HA instances |
| `/api/ha/instances` | POST | Add new HA instance |
| `/api/ha/instances/[id]` | DELETE | Remove HA instance |
| `/api/ha/sync` | POST | Trigger manual sync |

---

## 🧠 AI Analysis Details

SmartHass uses Claude AI to analyze your smart home data across six categories:

### Analysis Types

| Type | Description | Example Output |
|------|-------------|----------------|
| **Usage Patterns** | Recurring behaviors and routines | "Living room lights turn on at 6pm on weekdays (92% confidence)" |
| **Anomaly Detection** | Unusual or unexpected activity | "Garage door opened at 3:14 AM — unusual for this time" |
| **Automation Gaps** | Manual patterns that could be automated | "You manually turn off kitchen lights every night at 11pm" |
| **Efficiency Insights** | Energy waste and optimization opportunities | "Office AC runs while no motion detected for 4+ hours" |
| **Cross-Device Correlations** | Relationships between devices | "Motion sensor triggers lights 94% of the time within 2 minutes" |
| **Device Recommendations** | Complementary device suggestions | "Consider a smart plug for the coffee maker you turn on daily" |

### How Analysis Works

1. **Data Collection** — Aggregates daily stats for tracked entities over the analysis window (default: 7 days)
2. **Context Building** — Compiles entity metadata, automation configs, and historical baselines
3. **AI Processing** — Sends structured prompt to Claude with token budgeting and caching
4. **Result Storage** — Parses JSON response and stores insights with metadata
5. **Delta Detection** — Skips analysis if data hasn't changed (SHA256 hash comparison)

### Token Usage

AI analysis consumes Anthropic API tokens:

- **Sonnet 4** — Main analysis (~$3/1M input, ~$15/1M output)
- **Haiku 4** — Classification tasks (~$0.25/1M input, ~$1.25/1M output)

Typical analysis run: 5,000-15,000 input tokens, 1,000-3,000 output tokens

Track usage on the **AI Usage** page.

---

## ❓ Troubleshooting

### Connection Issues

**"Cannot connect to Home Assistant"**
- Verify the URL is accessible from where SmartHass is running
- For Docker: use `host.docker.internal` or actual IP instead of `localhost`
- For cloud deployment: ensure HA is publicly accessible (Nabu Casa, DuckDNS, reverse proxy)
- Check your Long-Lived Access Token hasn't expired

**"WebSocket disconnected"**
- WebSocket is only available in self-hosted/add-on mode
- Check HA logs for connection errors
- Verify no firewall blocking WebSocket connections

### Sync Issues

**"No entities found"**
- Run a manual sync from Settings
- Check HA connection status
- Verify the access token has sufficient permissions

**"Daily stats not updating"**
- Check the sync schedule in Settings
- For Docker: verify the container hasn't restarted (loses in-memory state)
- Check logs: `docker compose logs smarthass`

### AI Analysis Issues

**"Analysis failed: API error"**
- Verify your Anthropic API key is valid
- Check you have sufficient API credits
- Try a smaller analysis window if hitting token limits

**"No new insights generated"**
- Analysis skips if data hasn't changed significantly
- Try tracking more entities for richer analysis
- Wait for more historical data to accumulate

---

## 🗺️ Roadmap

See [PLAN.md](PLAN.md) for the detailed product roadmap including:

- **Phase 1**: Home Assistant Native Experience — Match HA's design language
- **Phase 2**: Real-Time Intelligence — Live anomaly detection and pattern learning
- **Phase 3**: Deeper HA Integration — Areas, blueprints, energy dashboard
- **Phase 4**: User-Centric Features — Goals, schedules, household profiles
- **Phase 5**: Performance & Scale — Optimizations for low-power hardware
- **Phase 6**: Advanced AI — Local LLM support, conversational interface

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Setup

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Configure DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY

# Start local Postgres (or use existing)
docker run -d --name smarthass-db -e POSTGRES_PASSWORD=smarthass -e POSTGRES_USER=smarthass -e POSTGRES_DB=smarthass -p 5432:5432 postgres:16

# Push schema
npx drizzle-kit push

# Start dev server
npm run dev
```

### Code Style

- TypeScript strict mode enabled
- ESLint with recommended rules
- Prettier for formatting

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Home Assistant](https://www.home-assistant.io/) — The best open-source home automation platform
- [Anthropic](https://www.anthropic.com/) — Claude AI powers our analysis
- [shadcn/ui](https://ui.shadcn.com/) — Beautiful UI components
- [Drizzle ORM](https://orm.drizzle.team/) — Type-safe database queries
- [Next.js](https://nextjs.org/) — The React framework for production

---

<div align="center">

**Made with ❤️ for the Home Assistant community**

[Report Bug](https://github.com/somedudenamedtony/smarthass/issues) · [Request Feature](https://github.com/somedudenamedtony/smarthass/issues) · [Documentation](https://github.com/somedudenamedtony/smarthass/wiki)

</div>
