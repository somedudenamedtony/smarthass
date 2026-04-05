# SmartHass — AI-Powered Home Assistant Companion

## Overview

SmartHass is an AI-powered Home Assistant companion that connects to HA instances, ingests entity state history and logs, stores data in Postgres, and uses Claude to provide statistics, insights, data analysis, and automation suggestions.

It supports two deployment modes:

- **Cloud-hosted** (Vercel + Neon) — multi-user SaaS, OAuth sign-in, Vercel Cron for background jobs
- **Self-hosted** (Docker / HA Add-on) — single-user, data stays on your network, local HA access, built-in scheduler, optional local LLM support

The codebase is identical for both modes — deployment behavior is driven by environment variables.

**MVP scope**: Dashboard, log parsing, insights, automation suggestions, and Docker self-hosting.
**Deferred to v2**: Device recommendations, HA Add-on distribution, local LLM support.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 App Router, shadcn/ui + Tailwind CSS, D3.js |
| **Backend** | Next.js API Routes (Node.js runtime, not Edge) |
| **Auth** | NextAuth.js v5 (Auth.js) — OAuth (cloud) or credentials (self-hosted), Drizzle adapter |
| **Database** | Postgres via Drizzle ORM — Neon HTTP driver (cloud) or `node-postgres` (self-hosted) |
| **AI** | Anthropic Claude — Sonnet 4.6 for analysis, Haiku 4.5 for classification |
| **Scheduler** | Vercel Cron (cloud) or `node-cron` (self-hosted) |
| **Hosting** | Vercel (cloud) or Docker / Docker Compose (self-hosted) |

### Deployment Modes

| Capability | Cloud (Vercel) | Self-Hosted (Docker) |
|------------|---------------|---------------------|
| **Users** | Multi-user (OAuth) | Single-user (credentials) |
| **Database** | Neon Postgres (`@neondatabase/serverless`) | Any Postgres (bundled in Docker Compose) |
| **HA connectivity** | Public URL required (Nabu Casa, DuckDNS) | Local network (`http://homeassistant.local:8123`) |
| **Background jobs** | Vercel Cron | Built-in `node-cron` scheduler |
| **WebSocket sync** | Not available (serverless limitation) | Available (persistent process) |
| **Data privacy** | Data transits through Vercel/Neon | All data stays on user's network |
| **AI provider** | Anthropic API (user provides key) | Anthropic API (user provides key) — local LLM support in v2 |

---

## Architecture

### HA Connectivity Model

Users connect their HA instance by providing:

1. **Instance URL** — e.g., `https://my-ha.duckdns.org`, Nabu Casa URL, or `http://homeassistant.local:8123`
2. **Long-Lived Access Token** — stored encrypted server-side (AES-256-GCM)

The app connects server-side to the user's HA via the REST API for on-demand pulls and initial syncs.

| Mode | HA Access | WebSocket |
|------|-----------|----------|
| **Cloud** | Public URL required (Nabu Casa, DuckDNS, reverse proxy) | Not available (serverless can't hold persistent connections) |
| **Self-hosted** | Local network URL works (same LAN / Docker network) | Available — persistent process can maintain WebSocket subscriptions for real-time state sync |

### Data Strategy (Hybrid)

| Data | Storage | Notes |
|------|---------|-------|
| Entity registry, automation configs, daily aggregated stats, AI analysis results, user preferences | **Synced to Postgres** | Persists beyond HA's retention |
| Live states, recent history (10-day window), error logs, service catalog | **Pulled on-demand from HA** | Always fresh |
| History for tracked entities → daily stats | **Scheduled job (daily)** — Vercel Cron or `node-cron` | Overcomes HA's 10-day default retention |

### Home Assistant API Usage

#### REST API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/` | GET | API status check |
| `/api/config` | GET | Current HA configuration |
| `/api/states` | GET | All current entity states |
| `/api/states/<entity_id>` | GET | Single entity state |
| `/api/history/period/<timestamp>` | GET | Historical state changes (filterable) |
| `/api/logbook/<timestamp>` | GET | Logbook/activity entries |
| `/api/error_log` | GET | HA error log |
| `/api/services` | GET | Available services |
| `/api/services/<domain>/<service>` | POST | Call a service |
| `/api/template` | POST | Render Jinja2 template |

**Authentication**: `Authorization: Bearer <LONG_LIVED_ACCESS_TOKEN>` header on all requests.

#### State Object Shape

```json
{
  "entity_id": "light.living_room",
  "state": "on",
  "attributes": {
    "brightness": 254,
    "rgb_color": [255, 0, 0],
    "friendly_name": "Living Room Light"
  },
  "last_changed": "2026-04-05T12:34:56.789+00:00",
  "last_updated": "2026-04-05T12:34:56.789+00:00",
  "context": {
    "id": "326ef27d19415c60c492fe330945f954",
    "parent_id": null,
    "user_id": "31ddb597e03147118cf8d2f8fbea5553"
  }
}
```

#### History & Logbook

- **History**: `/api/history/period/<timestamp>?filter_entity_id=...&end_time=...` — returns array of state change records per entity, oldest to newest.
- **Logbook**: `/api/logbook/<timestamp>` — returns activity entries (state changes, service calls, automation triggers).
- **Retention**: HA stores detailed state history for 10 days by default. Long-term statistics (hourly aggregation) are unlimited for sensors with `state_class`. SmartHass's daily cron overcomes the 10-day limit by syncing and aggregating data into Postgres.

#### WebSocket API

Used for real-time subscriptions (`subscribe_events` for `state_changed`), service calls, config validation (`validate_config`), and entity registry queries.

- **Self-hosted**: Available in MVP — the persistent Node.js process can maintain WebSocket connections for real-time state change events, eliminating the need for polling.
- **Cloud**: Not available in MVP — Vercel serverless functions can't hold persistent connections. Cloud users rely on REST API polling and daily cron sync.

---

## Database Schema

### Auth Tables (NextAuth-managed)

1. **users** — `id`, `name`, `email`, `image`, `emailVerified`
2. **accounts** — OAuth provider links
3. **sessions** — Active sessions
4. **verification_tokens** — Email verification tokens

### Application Tables

#### `ha_instances` — User's HA connections

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `userId` | text (FK → users) | Owner |
| `name` | text | Display name |
| `url` | text | HA instance URL |
| `encryptedToken` | text | AES-256-GCM encrypted Long-Lived Access Token |
| `lastSyncAt` | timestamp | Last successful sync |
| `status` | enum | `connected` / `error` / `pending` |
| `haVersion` | text | Detected HA version |
| `createdAt` | timestamp | |

#### `entities` — Synced entity registry

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `instanceId` | uuid (FK → ha_instances) | |
| `entityId` | text | e.g., `light.living_room` |
| `domain` | text | e.g., `light`, `sensor`, `switch` |
| `platform` | text | Integration platform |
| `friendlyName` | text | Human-readable name |
| `areaId` | text | HA area assignment |
| `deviceId` | text | HA device assignment |
| `attributes` | jsonb | Last known attributes |
| `lastState` | text | Last known state value |
| `lastChangedAt` | timestamp | Last state change time |
| `isTracked` | boolean | User flag for deep statistical tracking |
| `createdAt` | timestamp | |

#### `entity_daily_stats` — Aggregated daily statistics for tracked entities

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `entityId` | uuid (FK → entities) | |
| `date` | date | Stats date |
| `stateChanges` | integer | Number of state changes |
| `activeTime` | integer | Seconds in "active" state (on, open, etc.) |
| `avgValue` | numeric | For sensors: average reading |
| `minValue` | numeric | For sensors: minimum reading |
| `maxValue` | numeric | For sensors: maximum reading |
| `stateDistribution` | jsonb | Time per state, e.g., `{"on": 3600, "off": 82800}` |
| `createdAt` | timestamp | |

#### `automations` — Synced automation configs from HA

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `instanceId` | uuid (FK → ha_instances) | |
| `haAutomationId` | text | Automation entity_id in HA |
| `alias` | text | Automation name |
| `description` | text | |
| `triggerConfig` | jsonb | Trigger definition |
| `conditionConfig` | jsonb | Condition definition |
| `actionConfig` | jsonb | Action definition |
| `enabled` | boolean | |
| `lastTriggered` | timestamp | |
| `createdAt` | timestamp | |

#### `ai_analyses` — Stored AI analysis results

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `instanceId` | uuid (FK → ha_instances) | |
| `type` | enum | `insight` / `suggestion` / `automation` / `anomaly` |
| `title` | text | Summary heading |
| `content` | text | Full analysis text |
| `metadata` | jsonb | Structured data (entity refs, confidence scores, etc.) |
| `status` | enum | `new` / `viewed` / `dismissed` / `applied` |
| `createdAt` | timestamp | |

#### `sync_jobs` — Background sync job tracking

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key |
| `instanceId` | uuid (FK → ha_instances) | |
| `type` | text | Job type identifier |
| `status` | enum | `pending` / `running` / `completed` / `failed` |
| `startedAt` | timestamp | |
| `completedAt` | timestamp | |
| `error` | text | Error message if failed |
| `metadata` | jsonb | Job-specific data |

---

## Implementation Phases

### Phase 1: Project Scaffolding & Infrastructure

1. Initialize Next.js 15 project with App Router, TypeScript, Tailwind CSS, ESLint
2. Install and configure shadcn/ui (default theme)
3. Set up Drizzle ORM with conditional driver — Neon HTTP (`@neondatabase/serverless`) when `DATABASE_URL` contains `neon.tech`, otherwise `node-postgres` (`pg`)
4. Define database schema (all tables above) and run initial migration
5. Set up NextAuth.js v5 with Drizzle adapter — GitHub + Google OAuth providers (cloud) and credentials provider (self-hosted, controlled by `DEPLOY_MODE` env var)
6. Configure environment variables structure (`.env.local` template, `.env.example`) with `DEPLOY_MODE=cloud|self-hosted`
7. Set up project layout: `src/app/`, `src/db/`, `src/lib/`, `src/components/`
8. Create `Dockerfile` and `docker-compose.yml` (Next.js + Postgres) for self-hosted deployment
9. Create `src/lib/scheduler.ts` — conditional scheduler: no-op on Vercel (uses Vercel Cron), `node-cron` jobs when `DEPLOY_MODE=self-hosted`

### Phase 2: HA Connection & Data Ingestion

*Depends on Phase 1.*

10. Build HA connection management UI — add/edit/remove HA instances
11. Create server-side HA API client library (`src/lib/ha-client.ts`)
    - REST client: `getStates()`, `getHistory()`, `getLogbook()`, `getServices()`, `getConfig()`, `getErrorLog()`
    - WebSocket client: `subscribeStateChanges()`, `validateConfig()` (used when available — self-hosted mode)
    - Token encryption/decryption utilities (AES-256-GCM with `ENCRYPTION_KEY` env var)
    - Connection health check (verify token + URL, works with both public and local URLs)
12. Build entity sync flow: pull entity registry from HA → upsert into `entities` table *(depends on 10, 11)*
13. Build automation sync flow: pull automations from HA → upsert into `automations` table *(depends on 11)*
14. Build on-demand history pull: fetch history from HA REST API for selected entity/time range *(depends on 11)*
15. Set up daily sync job (`/api/cron/daily-sync`) — for each active instance, pull history for tracked entities, compute daily stats, store in `entity_daily_stats`. Triggered by Vercel Cron (cloud) or `node-cron` (self-hosted) *(depends on 12, 14)*
16. (Self-hosted) Start WebSocket subscription on app boot for connected instances — real-time state change events update `entities` table and feed into stats *(depends on 11, 12)*

### Phase 3: Dashboard & Visualization

*Depends on Phase 2.*

17. Build main dashboard layout with sidebar navigation
    - Pages: Dashboard (overview), Entities, Automations, Insights, Settings
18. Dashboard overview page *(depends on 12, 15)*:
    - Instance health status card (+ WebSocket connection status indicator for self-hosted)
    - Key metrics: total entities, active automations, state changes today
    - Activity timeline (recent state changes from on-demand pull or WebSocket feed)
    - Top 5 most active entities chart (D3.js bar chart)
19. Entities page *(depends on 12, 14)*:
    - Filterable/searchable entity table (domain, area, status)
    - Entity detail view: current state, history chart (D3.js line chart), daily stats
    - Toggle "track" for deep statistical tracking
20. Automations page *(depends on 13)*:
    - List view of all automations with enable/disable status
    - Detail view showing trigger/condition/action breakdown
    - Last triggered timestamp

### Phase 4: AI Analysis Engine

*Depends on Phase 2.*

21. Create AI analysis service (`src/lib/ai/analysis-service.ts`)
    - Builds structured prompts from entity data, stats, and automation configs
    - Calls Claude API via `@anthropic-ai/sdk` (server-side only)
    - Parses structured responses (JSON mode or tool_use)
    - Stores results in `ai_analyses` table
22. Implement analysis types *(depends on 21)*:
    - **Usage Patterns**: Analyze `entity_daily_stats` to identify patterns (e.g., "lights turn on at 6pm daily", "thermostat runs 8hrs/day")
    - **Anomaly Detection**: Flag unusual activity (e.g., "garage door opened at 3am — unusual for this entity")
    - **Automation Gaps**: Compare observed patterns vs existing automations, suggest new ones (e.g., "you manually turn on porch light every evening — consider an automation")
    - **Efficiency Insights**: Identify energy waste, redundant automations, devices that rarely change state
23. Build automation suggestion generator *(depends on 22)*:
    - Generate valid HA automation YAML from AI suggestions
    - Use HA's `validate_config` WebSocket command to validate before presenting (self-hosted uses direct WebSocket; cloud uses REST fallback)
    - Present as copyable YAML + natural language explanation
24. Set up weekly AI analysis job (`/api/cron/weekly-analysis`) — runs all analysis types on accumulated data. Triggered by Vercel Cron (cloud) or `node-cron` (self-hosted) *(depends on 21, 15)*

### Phase 5: Insights UI

*Depends on Phase 3 and Phase 4.*

25. Insights page:
    - Feed-style list of AI insights grouped by type (patterns, anomalies, suggestions)
    - Status management (new / viewed / dismissed / applied)
    - Automation suggestion cards with expandable YAML preview
    - "Analyze Now" button to trigger on-demand analysis for an instance
26. Inline insights on entity detail pages — show relevant insights for that entity

### Phase 6: Polish & Production Readiness

27. Error handling: global error boundary, toast notifications, HA connection error states
28. Loading states and skeletons for all async operations
29. Rate limiting on API routes (simple in-memory or Vercel KV)
30. Responsive design pass (mobile-friendly sidebar, cards)
31. README with dual deployment instructions (Vercel + Docker), LICENSE (MIT), contributing guide
32. Vercel deployment configuration (env vars, cron schedules, region settings)
33. Docker deployment: `Dockerfile` (multi-stage build), `docker-compose.yml` (app + Postgres), `.env.example` for self-hosted mode
34. Self-hosted setup wizard: first-run page to create admin account and configure HA connection (when no users exist in DB)

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx                       — Root layout with auth provider, sidebar
│   ├── page.tsx                         — Landing page (unauthenticated)
│   ├── (auth)/
│   │   └── login/page.tsx               — Login page
│   ├── (dashboard)/
│   │   ├── layout.tsx                   — Dashboard layout with sidebar
│   │   ├── page.tsx                     — Dashboard overview
│   │   ├── entities/page.tsx            — Entity list
│   │   ├── entities/[id]/page.tsx       — Entity detail
│   │   ├── automations/page.tsx         — Automations list
│   │   ├── insights/page.tsx            — AI insights feed
│   │   └── settings/page.tsx            — HA instance management
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── ha/
│       │   ├── instances/route.ts       — CRUD for HA instances
│       │   ├── sync/route.ts            — Trigger manual sync
│       │   ├── states/route.ts          — Proxy live states from HA
│       │   ├── history/route.ts         — Proxy history from HA
│       │   └── logbook/route.ts         — Proxy logbook from HA
│       ├── analysis/
│       │   └── route.ts                 — Trigger on-demand AI analysis
│       └── cron/
│           ├── daily-sync/route.ts      — Vercel Cron: daily data sync
│           └── weekly-analysis/route.ts — Vercel Cron: weekly AI analysis
├── db/
│   ├── index.ts                         — Drizzle client init (conditional: Neon HTTP or node-postgres)
│   ├── schema.ts                        — All table definitions
│   └── migrations/                      — Generated by drizzle-kit
├── lib/
│   ├── ha-client.ts                     — HA REST API client
│   ├── ha-websocket.ts                  — HA WebSocket client (self-hosted real-time sync)
│   ├── encryption.ts                    — AES-256-GCM token encryption
│   ├── scheduler.ts                     — Conditional scheduler (no-op on Vercel, node-cron self-hosted)
│   ├── config.ts                        — Deploy mode detection and feature flags
│   ├── ai/
│   │   ├── analysis-service.ts          — Core AI analysis orchestrator
│   │   ├── prompts.ts                   — Prompt templates for each analysis type
│   │   └── types.ts                     — AI response types
│   └── utils.ts                         — Shared utilities
├── components/
│   ├── ui/                              — shadcn/ui components
│   ├── charts/                          — D3.js chart components
│   │   ├── activity-timeline.tsx
│   │   ├── entity-history-chart.tsx
│   │   └── state-distribution.tsx
│   ├── dashboard/                       — Dashboard-specific components
│   ├── entities/                        — Entity-specific components
│   ├── insights/                        — Insight cards, automation preview
│   └── settings/                        — HA instance management forms
├── auth.ts                              — NextAuth.js config + exports
└── middleware.ts                         — Auth middleware (protect dashboard routes)

drizzle.config.ts                        — Drizzle Kit configuration
next.config.ts                           — Next.js configuration
server.ts                                — Custom server entry (self-hosted: starts scheduler + WebSocket manager)
Dockerfile                               — Multi-stage build for self-hosted deployment
docker-compose.yml                       — App + Postgres for self-hosted deployment
.env.example                             — Environment variable template (annotated for both modes)
```

---

## Environment Variables

```env
# ── Deployment Mode ──────────────────────────────────────────
DEPLOY_MODE=cloud                # "cloud" (Vercel + Neon) or "self-hosted" (Docker + local Postgres)

# ── Database ─────────────────────────────────────────────────
# Cloud (Neon):
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/smarthass?sslmode=require
# Self-hosted (local Postgres in Docker Compose):
# DATABASE_URL=postgresql://smarthass:password@db:5432/smarthass

# ── Auth (NextAuth.js) ───────────────────────────────────────
AUTH_SECRET=                     # Generate with: npx auth secret
# Cloud only — OAuth providers:
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
# Self-hosted — initial admin credentials (used by setup wizard on first run):
# ADMIN_EMAIL=admin@local
# ADMIN_PASSWORD=                # Set a strong password; bcrypt-hashed before storage

# ── Encryption ───────────────────────────────────────────────
ENCRYPTION_KEY=                  # 32-byte hex key for AES-256-GCM token encryption

# ── AI (Anthropic) ───────────────────────────────────────────
ANTHROPIC_API_KEY=               # Required for both modes; user provides their own key

# ── Scheduler ────────────────────────────────────────────────
# Cloud: Vercel Cron handles scheduling (see vercel.json); these are ignored.
# Self-hosted: node-cron schedules (cron syntax).
SYNC_CRON_SCHEDULE="0 3 * * *"   # Daily sync — default 3:00 AM
ANALYSIS_CRON_SCHEDULE="0 4 * * 0" # Weekly analysis — default Sunday 4:00 AM

# ── Vercel Cron (cloud only) ─────────────────────────────────
CRON_SECRET=                     # Shared secret for cron endpoint auth
```

---

## Verification Criteria

### Both Modes

1. **HA connection**: Add instance with valid URL + token → health check passes → entity list populates
2. **Entity sync**: After connection, entities table populated → entity list page shows correct data
3. **History pull**: Select an entity → view history chart → data matches what HA UI shows
4. **Daily sync**: Trigger daily sync (cron or manual) → `entity_daily_stats` rows created for tracked entities
5. **AI analysis**: Trigger "Analyze Now" → Claude returns structured insights → insights page shows results
6. **Automation suggestions**: Analysis produces automation suggestion → YAML is valid HA syntax → copy-paste-able
7. **Error handling**: Provide invalid HA URL/token → clear error message, no crash

### Cloud Mode

8. **OAuth flow**: Sign in with GitHub/Google → redirect to dashboard → session persists
9. **Multi-user isolation**: Two different users → each sees only their own instances and data
10. **Vercel deploy**: Push to main → Vercel deploys → cron jobs registered → app accessible

### Self-Hosted Mode

11. **Docker deploy**: `docker compose up` → app + Postgres start → accessible on configured port
12. **Setup wizard**: First visit → create admin account → configure HA connection
13. **Credentials auth**: Sign in with email/password → dashboard access
14. **Local HA**: Connect to `http://homeassistant.local:8123` → health check passes
15. **WebSocket sync**: After connection, real-time state changes appear without manual refresh
16. **Scheduler**: `node-cron` daily/weekly jobs fire at configured times → data synced, analysis generated

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Dual deployment (cloud + self-hosted) | HA users are privacy-conscious; self-hosting keeps all data on their network |
| Same codebase, config-driven behavior | `DEPLOY_MODE` env var switches DB driver, auth mode, scheduler — no code forks |
| Self-hosted gets WebSocket sync | Persistent Node.js process can hold connections; cloud is serverless so uses polling |
| Docker Compose as primary self-hosted distribution | Simple, familiar to HA users (many run HA in Docker), bundles Postgres |
| Cloud requires publicly accessible HA | Self-hosted runs on same LAN — no public URL needed |
| Claude Sonnet 4.6 for analysis | Best cost/quality balance ($3/$15 per MTok); Haiku 4.5 for simple classification |
| User provides own Anthropic API key | No proxy/billing needed; transparent cost; local LLM support deferred to v2 |
| Token encryption with AES-256-GCM | HA tokens stored encrypted at rest, decrypted only server-side during API calls |
| Open source (MIT license) | No billing/payment infrastructure needed |
| Device recommendations deferred to v2 | Requires product database and recommendation engine beyond MVP scope |
| Conditional DB driver (Neon HTTP / node-postgres) | Neon HTTP ideal for serverless; node-postgres for standard long-running Postgres |
| Node.js runtime (not Edge) | Required for Claude SDK + full Node.js API compatibility |
| Custom `server.ts` for self-hosted | Wraps Next.js with `node-cron` scheduler + WebSocket manager startup |

---

## Scope Boundaries

### Included in MVP (v1)

- **Both modes**: HA instance connection management, entity registry sync, on-demand history/logbook with D3.js charts, daily stat aggregation, AI insights (usage patterns, anomalies, efficiency), AI automation suggestions with valid YAML output
- **Cloud mode**: Multi-user OAuth, Vercel Cron, Neon Postgres
- **Self-hosted mode**: Single-user credentials auth, Docker Compose deployment, local Postgres, `node-cron` scheduler, WebSocket real-time sync, setup wizard, local HA network access

### Excluded from MVP (deferred to v2)

- HA Add-on distribution (one-click install from HA add-on store)
- Local LLM support (Ollama / llama.cpp) as alternative to Anthropic API
- Device purchase recommendations
- Push notifications / alerts
- Direct automation creation (writing back to HA)
- Energy dashboard / cost tracking
- Mobile app / PWA
- Multi-user support for self-hosted (team/household mode)
