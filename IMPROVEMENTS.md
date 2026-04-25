# SmartHass — Improvement Spec: Automation Creation & Sensor Gap Analysis

> **Core thesis**: SmartHass should be an opinionated AI assistant that proactively tells you what to automate, how to improve what you already have, and what's missing from your sensor/device network — not just a dashboard that shows you data.

---

## Problem Statement

The current app accumulates data and runs periodic AI analysis, but the output feels passive and generic. The friction points are:

1. **Analysis often returns nothing** — Delta detection, deduplication, and missing daily stats conspire to suppress results. Users click "Analyze Now" and get 0 insights.
2. **Automation suggestions are abstract** — "You could automate your morning routine" isn't actionable. Users need ready-to-deploy YAML with clear before/after context.
3. **No feedback loop on existing automations** — The app knows about automations but doesn't critique them or suggest improvements.
4. **Sensor gaps are invisible** — If you're missing a motion sensor in a room, or lack presence detection for your away-mode automation, the app never tells you.
5. **No guided workflow** — Users land on the dashboard and have to figure out what to do. There's no "here's what I'd do next if I were you" flow.

---

## Proposed Features (Priority Order)

### 1. Automation Coach (High Impact)

**What**: A dedicated page that treats each automation like a code review. For every automation synced from HA, show:

- **Health score** (0-100): Based on trigger robustness, condition coverage, action completeness, error handling
- **Improvement suggestions**: Missing conditions (time guards, presence checks), better triggers, reliability fixes
- **Side-by-side diff**: Current YAML vs. improved YAML with explanations
- **One-click deploy**: Push the improved version back to HA via the REST API

**Why**: This is the highest-value feature because users already have automations — they just don't know they're fragile or suboptimal. Every HA user has at least a few automations that fire at wrong times or lack conditions.

**Implementation**:
- New page at `/automations/[id]/review` with AI-generated review
- Extend the automation detail page with a "Review with AI" button
- Use the new `automation_review` analysis category (already added)
- Cache reviews per automation hash so re-reviews are instant when config hasn't changed

---

### 2. Smart Home Coverage Map (High Impact)

**What**: A visual map of your home organized by area/room that shows:

- **Sensor coverage**: Which rooms have motion, temperature, humidity, light, door/window sensors
- **Actuator coverage**: Which rooms have controllable lights, switches, climate, locks
- **Gap indicators**: Red/yellow/green coverage scoring per room
- **AI recommendations**: "Your bedroom has a temperature sensor but no motion sensor — adding one would enable sleep detection and automatic climate adjustment"

**Why**: This directly addresses the "identify gaps in the existing device and sensor network" goal. Most users don't think in terms of coverage — they buy devices reactively. Showing them a coverage map with gaps makes the next purchase decision obvious.

**Implementation**:
- New page at `/coverage` (or integrate into existing areas API)
- Use HA's area registry (already synced) to group entities by room
- Define a "coverage model" — what sensor types are expected per room type (bedroom, bathroom, kitchen, living room, garage, outdoor)
- AI prompt that takes the coverage map + existing automations and generates specific device recommendations with the automations they would unlock
- Show "automations you could build IF you had [device]" — this is the killer insight

---

### 3. Automation Builder Wizard (High Impact)

**What**: A guided flow that takes a user from "I want X to happen" to deployed automation:

1. **Intent step**: Natural language input — "Turn off all lights when everyone leaves" or "Set thermostat to 68 when I wake up"
2. **Entity mapping**: AI identifies which entities are needed, flags any missing ones, and suggests alternatives
3. **Condition refinement**: Interactive condition builder — "Only on weekdays?", "Only between 6am-10pm?", "Only when home mode is X?"
4. **Preview & test**: Show the generated YAML, explain each section, allow edits
5. **Deploy**: Push to HA with option to create as disabled (test mode)

**Why**: The biggest friction in HA automation is the YAML/UI builder. Users know what they want but can't express it in HA's terms. Natural language → automation removes that barrier entirely.

**Implementation**:
- New page at `/automations/new` with a multi-step wizard
- AI prompt that takes intent + entity list + area map → generates automation config
- Entity resolution step that validates all referenced entities exist
- "Missing entity" callout that links to the Coverage Map recommendations
- HA REST API integration to create the automation

---

### 4. Proactive Analysis (Medium Impact)

**What**: Instead of waiting for users to click "Analyze Now", run targeted micro-analyses automatically when meaningful events occur:

- **After sync**: If new entities appeared, or existing entities changed domains, run a quick coverage analysis
- **After automation changes**: If an automation was added/modified in HA, run an automation review on just that one
- **On threshold breach**: If an entity's state change rate deviates >2σ from baseline, surface an anomaly immediately
- **Weekly digest**: Email/notification summary of what changed, what's new, and what's recommended

**Why**: The "I ran it and got nothing" experience is the worst UX in the app. Proactive analysis means insights appear when relevant, not when the user remembers to check.

**Implementation**:
- Post-sync hook in the sync service that triggers targeted analysis
- Lightweight "quick analysis" function that runs a single prompt on a narrow data slice (cheap, fast)
- Notification system (initially just a badge count + in-app notification panel)
- Extend the cron job to run micro-analyses on recent changes, not just full batch

---

### 5. Automation Dependency Graph (Medium Impact)

**What**: Visualize how automations relate to each other and to entities:

- **Entity fan-out**: Show which entities are used by multiple automations (conflict risk)
- **Chain detection**: Automation A triggers entity X, which triggers Automation B — show the chain
- **Orphan detection**: Automations that reference entities that no longer exist or are always unavailable
- **Timing conflicts**: Automations that could fire simultaneously and conflict

**Why**: As HA setups grow, automation interactions become invisible. Two automations fighting over the same light, or a chain reaction that wasn't intended, are common bugs that are hard to debug in HA's native UI.

**Implementation**:
- Parse all automation trigger/condition/action configs to build an entity→automation graph
- D3.js force-directed graph visualization
- AI analysis of the graph to identify conflicts, redundancies, and optimization opportunities
- Integrate into the automation browser page as a "View Dependencies" toggle

---

### 6. "What If" Simulator (Lower Priority)

**What**: Let users ask hypothetical questions about their setup:

- "What happens if the internet goes down?" → Shows which automations still work (local vs cloud), which sensors stop reporting
- "What happens if I remove this motion sensor?" → Shows which automations break
- "What would change if I added a presence sensor to the garage?" → Shows new automation opportunities

**Why**: Users are afraid to change things because they don't understand the blast radius. A simulator removes that fear and encourages experimentation.

---

### 7. Automation Templates Library (Lower Priority)

**What**: Curated automation templates organized by use case (not device type):

- **Morning routine**: Wake-up lights, thermostat schedule, coffee maker, blinds
- **Away mode**: Security arm, lights off, thermostat setback, cameras active
- **Movie night**: Dim lights, close blinds, set TV input, silence notifications
- **Baby monitor**: Temperature alerts, noise detection, night light automation

Each template is parameterized — user picks their entities, adjusts thresholds, and deploys.

**Why**: Most HA automations are variations of the same 20-30 patterns. A template library seeded by what works for others (and refined by AI for this specific setup) dramatically lowers the barrier.

**Implementation**:
- Extend the existing blueprints feature with a curated library
- AI generates personalized templates based on available entities
- Template diff: Show what's different between the template and what you already have

---

## Architecture Changes Required

### New Analysis Categories
- `automation_review` — **Done** (added in this PR)
- `coverage_analysis` — Evaluate sensor/device coverage per area
- `automation_conflict` — Detect inter-automation conflicts and chains

### New API Routes
- `POST /api/automations/[id]/review` — On-demand AI review of a single automation
- `GET /api/coverage` — Coverage map data (areas × sensor types)
- `POST /api/automations/generate` — Natural language → automation YAML
- `POST /api/automations/deploy` — Push automation to HA

### New Pages
- `/automations/[id]/review` — Automation review detail
- `/coverage` — Smart home coverage map
- `/automations/new` — Automation builder wizard

### Data Model Additions
- `automation_reviews` table — Cached reviews per automation config hash
- `coverage_model` config — Expected sensors/actuators per room type (configurable)

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Insights generated per analysis run | 0-5 (often 0) | 5-15 consistently |
| User action rate on suggestions | ~10% (viewed only) | 30%+ (applied/deployed) |
| Time from "I want X" to deployed automation | N/A (manual in HA) | <2 minutes via wizard |
| Sensor gaps identified per setup | 0 | 3-10 actionable recommendations |
| Automation improvement suggestions | 0 | 1-3 per existing automation |

---

## Implementation Priority

| Phase | Features | Rationale |
|-------|----------|-----------|
| **Now** | Automation Coach (#1), fix analysis reliability | Highest value, builds on existing code |
| **Next** | Coverage Map (#2), Proactive Analysis (#4) | Addresses core "identify gaps" goal |
| **Then** | Automation Builder (#3), Dependency Graph (#5) | Reduces automation creation friction |
| **Later** | Simulator (#6), Templates (#7) | Nice-to-have, builds on earlier features |
