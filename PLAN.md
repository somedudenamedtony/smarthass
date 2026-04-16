# SmartHass — Product Roadmap & Development Plan

> **Vision**: Transform SmartHass into the definitive AI-powered analytics and automation companion for Home Assistant, with a native look and feel that integrates seamlessly into the HA ecosystem.

---

## Executive Summary

SmartHass v1.4 delivers core AI analytics capabilities. This roadmap outlines the path to v2.0 and beyond, focusing on:

1. **Home Assistant Native Experience** — Match HA's design language and interaction patterns
2. **Real-Time Intelligence** — Move from batch analysis to live, actionable insights
3. **Deeper HA Integration** — Leverage more HA capabilities (areas, labels, blueprints)
4. **User-Centric Features** — Goals, schedules, and personalized recommendations
5. **Performance & Reliability** — Optimizations for low-power HA hardware

---

## Current State Assessment

### ✅ What Works Well

| Area | Assessment |
|------|------------|
| **Architecture** | Clean separation of concerns, multi-deployment flexibility |
| **AI Analysis** | Sophisticated prompt engineering, token budgeting, feedback loops |
| **Data Pipeline** | Reliable sync, daily aggregation, historical retention |
| **Security** | AES-256-GCM token encryption, proper auth flows |
| **Type Safety** | Full TypeScript coverage with Drizzle ORM |

### ⚠️ Areas for Improvement

| Area | Issue | Impact |
|------|-------|--------|
| **UI/UX** | Generic modern look, doesn't feel like HA | Users feel disconnected from their HA workflow |
| **Analysis Timing** | Batch-only (daily/weekly), no real-time insights | Misses time-sensitive anomalies |
| **Entity Context** | Missing areas, labels, device groupings | Insights lack spatial/logical context |
| **Automation Lifecycle** | Can deploy but limited management | Incomplete automation workflow |
| **Performance** | Not optimized for RPi/low-power devices | Sluggish on typical HA hardware |
| **Onboarding** | Minimal guidance after setup | Users unsure what to do next |

---

## Roadmap Phases

### Phase 1: Home Assistant Native Experience (v1.5)

**Goal**: Make SmartHass feel like a native extension of Home Assistant, not a separate app.

#### 1.1 Design System Overhaul

**Current**: Custom dark theme with slate-blue palette and glow effects.  
**Target**: Match HA's design language (Material Design 3 inspired).

| Component | Change |
|-----------|--------|
| **Colors** | Adopt HA's primary blue (#03A9F4), surface grays, and accent palette |
| **Typography** | Use Roboto (HA's font family) for consistency |
| **Cards** | Match HA card styling (subtle shadows, 12px radius, surface-variant background) |
| **Icons** | Use Material Design Icons (MDI) — same icon set as HA |
| **Spacing** | Align to HA's 8px grid system |
| **Dark/Light** | Full light mode support (HA users often use light themes) |

**Deliverables**:
- [ ] Create HA-inspired Tailwind theme preset
- [ ] Replace Lucide icons with MDI equivalents
- [ ] Implement light/dark mode toggle (auto-detect from HA preference)
- [ ] Update all card components to match HA styling
- [ ] Add CSS custom properties for easy theming

#### 1.2 Navigation & Layout

**Current**: Custom sidebar with accent colors.  
**Target**: HA-style sidebar with icon-focused navigation.

| Feature | Implementation |
|---------|---------------|
| **Sidebar** | Collapsible icon rail (like HA), expands on hover |
| **Top Bar** | Instance selector + quick actions (sync, analyze) |
| **Breadcrumbs** | Contextual navigation trail |
| **Mobile** | Bottom navigation bar (HA Companion app style) |

**Deliverables**:
- [ ] Redesign sidebar as collapsible icon rail
- [ ] Add instance selector to top bar
- [ ] Implement breadcrumb navigation
- [ ] Create mobile bottom navigation component

#### 1.3 Dashboard Widgets (HA Card Style)

**Current**: Fixed dashboard layout with D3.js charts.  
**Target**: Drag-and-drop widget system matching HA's Lovelace approach.

| Widget Type | Description |
|-------------|-------------|
| **Glance Card** | Quick status of multiple entities |
| **Stats Card** | Single metric with trend indicator |
| **Graph Card** | Time-series chart (entity history) |
| **Insights Card** | AI insight feed (scrollable) |
| **Automation Card** | Quick automation stats and suggestions |
| **Health Card** | Instance connection status |
| **Heatmap Card** | Activity by hour/day matrix |

**Deliverables**:
- [ ] Implement widget registry system
- [ ] Create base widget wrapper component
- [ ] Build 7 core widget types
- [ ] Add drag-and-drop reordering (use `@dnd-kit/core`)
- [ ] Persist layout to user preferences

#### 1.4 Entity Browser Improvements

**Current**: Basic list with domain filter.  
**Target**: Rich entity browser with HA-style entity cards.

| Feature | Description |
|---------|-------------|
| **Entity Cards** | Visual state representation (icons, colors, toggles) |
| **Area Grouping** | Group entities by HA areas |
| **Label Filtering** | Filter by HA labels |
| **Device View** | Group entities by parent device |
| **Inline Actions** | Toggle lights/switches directly from list |
| **Bulk Selection** | Select multiple entities for tracking |

**Deliverables**:
- [ ] Sync HA areas/labels/devices to database
- [ ] Create entity card component with state visualization
- [ ] Implement grouping views (area, device, domain)
- [ ] Add bulk tracking selection
- [ ] Support inline toggle for supported domains

---

### Phase 2: Real-Time Intelligence (v1.6)

**Goal**: Shift from batch analysis to continuous, real-time insights.

#### 2.1 Live Anomaly Detection

**Current**: Anomalies detected in weekly batch analysis.  
**Target**: Real-time anomaly alerts as they happen.

| Component | Implementation |
|-----------|---------------|
| **Stream Processor** | Process WebSocket state changes in real-time |
| **Statistical Engine** | Z-score deviation detection against baselines |
| **Alert System** | In-app notifications + optional HA notify service |
| **Severity Levels** | Info, Warning, Critical based on deviation magnitude |

**Deliverables**:
- [ ] Build real-time state analyzer module
- [ ] Implement z-score anomaly detection
- [ ] Create notification center component
- [ ] Add HA notify service integration
- [ ] Build anomaly dashboard widget

#### 2.2 Pattern Learning Engine

**Current**: Patterns identified from historical stats.  
**Target**: Adaptive learning that evolves with user behavior.

| Feature | Description |
|---------|-------------|
| **Sliding Window** | Continuously update patterns (not just daily) |
| **Confidence Scoring** | Track pattern reliability over time |
| **Drift Detection** | Notice when patterns change (season, routine shift) |
| **Pattern Clusters** | Group related patterns into routines |

**Deliverables**:
- [ ] Implement sliding window pattern calculator
- [ ] Add confidence decay/growth logic
- [ ] Build drift detection algorithm
- [ ] Create routines dashboard view

#### 2.3 Proactive Suggestions

**Current**: Suggestions require manual "Analyze Now".  
**Target**: Proactive suggestions triggered by events.

| Trigger | Suggestion Type |
|---------|-----------------|
| **New Entity** | "We noticed a new device — here's how similar users automate it" |
| **Repeated Manual Action** | "You turn this on every morning — want an automation?" |
| **Energy Spike** | "This device used 3x normal energy today — check it?" |
| **Failed Automation** | "This automation hasn't worked in 2 weeks — review?" |

**Deliverables**:
- [ ] Build event-driven suggestion trigger system
- [ ] Implement suggestion templates
- [ ] Add "snooze" and "never suggest" options
- [ ] Create suggestion notification feed

---

### Phase 3: Deeper HA Integration (v1.7)

**Goal**: Leverage HA's full ecosystem for richer context and capabilities.

#### 3.1 Area & Floor Awareness

| Feature | Benefit |
|---------|---------|
| **Area Sync** | Pull HA areas and map entities |
| **Floor Plans** | Optional floor plan visualization |
| **Spatial Insights** | "Living room is most active area" |
| **Cross-Area Patterns** | "When kitchen is active, living room follows" |

**Deliverables**:
- [ ] Add areas table to schema
- [ ] Sync areas from HA config
- [ ] Build area-based entity grouping
- [ ] Add area-aware insights prompts
- [ ] Create area activity dashboard

#### 3.2 Blueprint Integration

**Current**: Generate raw automation YAML.  
**Target**: Generate and share HA Blueprints.

| Feature | Description |
|---------|-------------|
| **Blueprint Export** | Convert suggestions to reusable blueprints |
| **Input Parameters** | Expose configurable fields (entities, times, thresholds) |
| **Blueprint Library** | Save and reuse your generated blueprints |
| **Community Sharing** | Export blueprint to share with others |

**Deliverables**:
- [ ] Build blueprint YAML generator
- [ ] Create blueprint parameter extraction logic
- [ ] Add blueprint library UI
- [ ] Implement blueprint import from HA

#### 3.3 Scene & Script Support

| Feature | Description |
|---------|-------------|
| **Scene Sync** | Track scene usage patterns |
| **Scene Suggestions** | "These entities change together — create a scene?" |
| **Script Analysis** | Include scripts in automation analysis |
| **Script Suggestions** | Suggest reusable scripts for repeated action sequences |

**Deliverables**:
- [ ] Add scenes/scripts to sync pipeline
- [ ] Extend AI prompts for scene analysis
- [ ] Build scene suggestion logic
- [ ] Create scene browser view

#### 3.4 Energy Dashboard Integration

| Feature | Description |
|---------|-------------|
| **Energy Entity Sync** | Pull energy sensors and grid data |
| **Cost Analysis** | Calculate energy costs by device/area |
| **Efficiency Scoring** | Rate devices by energy efficiency |
| **Savings Suggestions** | "Scheduling X would save ~$Y/month" |

**Deliverables**:
- [ ] Identify and sync energy sensors
- [ ] Build cost calculation engine
- [ ] Create energy dashboard view
- [ ] Add energy-specific AI analysis type

---

### Phase 4: User-Centric Features (v1.8)

**Goal**: Personalize the experience around user goals and preferences.

#### 4.1 Goals & Objectives

| Feature | Description |
|---------|-------------|
| **Goal Setting** | "I want to reduce energy usage by 10%" |
| **Progress Tracking** | Visual progress toward goals |
| **Goal-Driven Insights** | Prioritize suggestions that help achieve goals |
| **Celebrations** | Acknowledge when goals are met |

**Deliverables**:
- [ ] Add goals table to schema
- [ ] Build goal setting UI
- [ ] Create goal progress tracking
- [ ] Integrate goals into AI analysis prompts

#### 4.2 Household Profiles

| Feature | Description |
|---------|-------------|
| **Occupancy Modes** | Home, Away, Vacation, Sleep |
| **Mode Detection** | Auto-detect mode from sensor patterns |
| **Mode-Based Analysis** | Compare energy usage across modes |
| **Mode Suggestions** | "When you're away, consider turning off X" |

**Deliverables**:
- [ ] Add household modes schema
- [ ] Build mode detection algorithm
- [ ] Create mode management UI
- [ ] Add mode-aware analysis prompts

#### 4.3 Scheduling Assistant

| Feature | Description |
|---------|-------------|
| **Visual Scheduler** | Drag-and-drop weekly schedule builder |
| **Schedule Templates** | Pre-built schedules (work-from-home, vacation) |
| **Conflict Detection** | Warn about overlapping automations |
| **Smart Scheduling** | AI suggests optimal times based on patterns |

**Deliverables**:
- [ ] Build visual schedule editor component
- [ ] Create schedule template library
- [ ] Implement conflict detection logic
- [ ] Add schedule optimization suggestions

#### 4.4 Family Dashboard

| Feature | Description |
|---------|-------------|
| **Simplified View** | Kid-friendly interface for basic controls |
| **Activity Feed** | "What happened today" summary |
| **Scheduled Events** | Show upcoming automations |
| **Quick Actions** | Big buttons for common actions |

**Deliverables**:
- [ ] Create simplified dashboard mode
- [ ] Build activity summary component
- [ ] Add scheduled events view
- [ ] Implement quick action buttons

---

### Phase 5: Performance & Scale (v1.9)

**Goal**: Optimize for HA's typical hardware (RPi 3/4, NUC, low-power devices).

#### 5.1 Query Optimization

| Optimization | Impact |
|--------------|--------|
| **Index Tuning** | Add indexes for common query patterns |
| **Pagination** | Lazy load large entity lists |
| **Aggregation Caching** | Cache computed stats (Redis optional) |
| **Query Batching** | Combine multiple API calls |

**Deliverables**:
- [ ] Audit and add database indexes
- [ ] Implement cursor-based pagination
- [ ] Add stats caching layer
- [ ] Batch API requests where possible

#### 5.2 Resource Management

| Optimization | Impact |
|--------------|--------|
| **Memory Limits** | Cap memory usage for analysis |
| **CPU Throttling** | Limit concurrent analysis jobs |
| **Startup Time** | Lazy load non-critical components |
| **Bundle Size** | Code split dashboard widgets |

**Deliverables**:
- [ ] Profile memory usage under load
- [ ] Implement job queue with concurrency limits
- [ ] Add lazy loading for widgets
- [ ] Optimize client bundle

#### 5.3 Offline Resilience

| Feature | Description |
|---------|-------------|
| **Offline Indicator** | Show when HA connection is lost |
| **Cached Data** | Display last known state while offline |
| **Retry Logic** | Automatic reconnection with backoff |
| **Queue Offline Actions** | Retry failed syncs when back online |

**Deliverables**:
- [ ] Add connection status indicator
- [ ] Implement data caching strategy
- [ ] Improve WebSocket reconnection logic
- [ ] Build offline action queue

---

### Phase 6: Advanced AI (v2.0)

**Goal**: Next-generation AI capabilities for power users.

#### 6.1 Local LLM Support

| Feature | Description |
|---------|-------------|
| **Ollama Integration** | Run analysis locally (Mistral, Llama) |
| **Hybrid Mode** | Use local for quick tasks, cloud for deep analysis |
| **Model Selection** | Let users choose model by capability/speed |
| **Privacy Mode** | Option to never send data to cloud |

**Deliverables**:
- [ ] Build Ollama client adapter
- [ ] Create model selection UI
- [ ] Implement hybrid routing logic
- [ ] Add privacy mode toggle

#### 6.2 Conversational Interface

| Feature | Description |
|---------|-------------|
| **Natural Language Queries** | "What was my energy usage last week?" |
| **Automation Builder** | "Create an automation that..." |
| **Insight Explanations** | "Why did you suggest this?" |
| **Context Awareness** | Remember conversation history |

**Deliverables**:
- [ ] Build chat interface component
- [ ] Create query parsing and routing
- [ ] Implement automation builder from NL
- [ ] Add conversation memory

#### 6.3 Multi-Instance Intelligence

| Feature | Description |
|---------|-------------|
| **Cross-Instance Analysis** | Compare patterns across homes |
| **Aggregated Insights** | "Your vacation home uses more energy" |
| **Sync Recommendations** | "Replicate this automation to other instance?" |

**Deliverables**:
- [ ] Enable multi-instance analysis runs
- [ ] Build comparison dashboard
- [ ] Add cross-instance automation sync

#### 6.4 Predictive Analytics

| Feature | Description |
|---------|-------------|
| **Usage Forecasting** | Predict future energy/activity |
| **Maintenance Alerts** | "This device may fail soon based on patterns" |
| **Cost Projection** | "At this rate, your monthly bill will be $X" |
| **Seasonal Adjustments** | Account for seasonal pattern changes |

**Deliverables**:
- [ ] Build time-series forecasting model
- [ ] Create maintenance prediction logic
- [ ] Implement cost projection calculator
- [ ] Add seasonal adjustment factors

---

## Feature Priority Matrix

| Feature | User Value | Effort | HA Alignment | Priority |
|---------|------------|--------|--------------|----------|
| HA Design System | High | Medium | Critical | P0 |
| Light/Dark Mode | High | Low | Critical | P0 |
| Area Awareness | High | Medium | High | P0 |
| Real-Time Anomalies | High | High | Medium | P1 |
| Blueprint Export | Medium | Medium | High | P1 |
| Drag-and-Drop Widgets | Medium | High | High | P1 |
| Energy Dashboard | High | Medium | High | P1 |
| Local LLM | Medium | High | Low | P2 |
| Conversational AI | Medium | High | Low | P2 |
| Goals System | Medium | Medium | Medium | P2 |
| Multi-Instance Analysis | Low | Medium | Low | P3 |
| Predictive Analytics | Medium | High | Low | P3 |

---

## Technical Debt & Cleanup

### High Priority

- [ ] **Migrate to HA Design Tokens** — Replace custom CSS variables with HA-aligned tokens
- [ ] **Add E2E Tests** — Playwright tests for critical flows (setup, sync, analysis)
- [ ] **API Error Handling** — Consistent error responses with error codes
- [ ] **Loading States** — Skeleton loaders for all async content
- [ ] **Accessibility Audit** — WCAG 2.1 AA compliance

### Medium Priority

- [ ] **Logging Infrastructure** — Structured logging with correlation IDs
- [ ] **Metrics Collection** — Track sync times, analysis durations, error rates
- [ ] **Rate Limiting** — Protect API endpoints from abuse
- [ ] **Database Migrations** — Review and consolidate migration files
- [ ] **Environment Validation** — Fail fast on missing required config

### Low Priority

- [ ] **Storybook** — Component documentation and visual testing
- [ ] **API Documentation** — OpenAPI spec for all endpoints
- [ ] **Internationalization** — Extract strings for i18n support
- [ ] **Plugin Architecture** — Allow community extensions

---

## Release Timeline

| Version | Target Date | Focus |
|---------|-------------|-------|
| **v1.5** | Q2 2026 | HA Native Experience (Design, Navigation, Widgets) |
| **v1.6** | Q3 2026 | Real-Time Intelligence (Anomalies, Patterns) |
| **v1.7** | Q4 2026 | Deeper HA Integration (Areas, Blueprints, Energy) |
| **v1.8** | Q1 2027 | User-Centric Features (Goals, Schedules) |
| **v1.9** | Q2 2027 | Performance & Scale |
| **v2.0** | Q3 2027 | Advanced AI (Local LLM, Conversational, Predictive) |

---

## Success Metrics

### User Engagement

- **Daily Active Users** — Target: 70% of installed base
- **Insights Applied Rate** — Target: 40% of suggestions applied
- **Return Visits** — Target: 3x/week average

### Technical Health

- **Sync Success Rate** — Target: 99.5%
- **Analysis Latency** — Target: <30s for standard analysis
- **Memory Usage** — Target: <512MB peak on RPi4

### HA Community

- **Add-on Installs** — Target: 5,000 in first year
- **GitHub Stars** — Target: 1,000
- **Community Contributions** — Target: 10 external PRs merged

---

## Appendix: Design References

### Home Assistant UI References

- **HA Frontend**: https://github.com/home-assistant/frontend
- **HA Design System**: https://design.home-assistant.io/
- **Material Design 3**: https://m3.material.io/

### Color Palette (HA-Aligned)

```css
/* Primary */
--ha-primary: #03A9F4;
--ha-primary-variant: #0288D1;

/* Surface */
--ha-surface: #1C1C1E;
--ha-surface-variant: #2C2C2E;
--ha-on-surface: #E1E1E1;

/* Semantic */
--ha-success: #4CAF50;
--ha-warning: #FF9800;
--ha-error: #F44336;
--ha-info: #2196F3;

/* Accents */
--ha-accent-blue: #03A9F4;
--ha-accent-orange: #FF9800;
--ha-accent-purple: #9C27B0;
--ha-accent-teal: #009688;
```

### Icon Reference (MDI)

| Current (Lucide) | HA Equivalent (MDI) |
|------------------|---------------------|
| `Activity` | `mdi:pulse` |
| `Brain` | `mdi:brain` |
| `Zap` | `mdi:flash` |
| `Sparkles` | `mdi:auto-fix` |
| `Settings` | `mdi:cog` |
| `Lightbulb` | `mdi:lightbulb` |
| `AlertTriangle` | `mdi:alert` |

---

## Contributing

This roadmap is a living document. To propose changes:

1. Open an issue with the `roadmap` label
2. Describe the feature/change and its impact
3. Reference the relevant phase/section
4. Include mockups or technical details if applicable

---

*Last updated: April 2026 — Version 1.4.0*
