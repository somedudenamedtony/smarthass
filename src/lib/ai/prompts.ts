import type {
  AnalysisInput,
  DailyStatSnapshot,
  AutomationSnapshot,
  FeedbackEntry,
  BaselineSnapshot,
} from "./types";

/**
 * Prompt templates for each AI analysis type.
 * Each returns a system prompt and user prompt for Claude.
 */

// ── Shared helpers ──────────────────────────────────────────────────────────

function formatStats(stats: DailyStatSnapshot[]): string {
  if (stats.length === 0) return "No daily statistics available yet.";

  // Group by entity
  const byEntity = new Map<string, DailyStatSnapshot[]>();
  for (const s of stats) {
    const key = s.friendlyName || s.entityId;
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key)!.push(s);
  }

  const lines: string[] = [];
  for (const [name, entityStats] of byEntity) {
    const domain = entityStats[0].domain;
    lines.push(`\n### ${name} (${domain})`);
    for (const s of entityStats.slice(0, 14)) {
      let line = `- ${s.date}: ${s.stateChanges} changes, active ${Math.round(s.activeTime / 60)}min`;
      if (s.avgValue) line += `, avg=${s.avgValue}, min=${s.minValue}, max=${s.maxValue}`;
      if (s.stateDistribution) {
        const dist = Object.entries(s.stateDistribution)
          .map(([state, secs]) => `${state}:${Math.round(secs / 60)}min`)
          .join(", ");
        line += ` [${dist}]`;
      }
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function formatAutomations(automations: AutomationSnapshot[]): string {
  if (automations.length === 0) return "No automations configured.";

  return automations
    .map((a) => {
      const status = a.enabled ? "enabled" : "disabled";
      const triggered = a.lastTriggered
        ? `last triggered ${a.lastTriggered.toISOString()}`
        : "never triggered";
      const trigger = a.triggerConfig
        ? `\n  Trigger: ${JSON.stringify(a.triggerConfig)}`
        : "";
      const action = a.actionConfig
        ? `\n  Action: ${JSON.stringify(a.actionConfig)}`
        : "";
      return `- **${a.alias || a.haAutomationId}** (${status}, ${triggered})${trigger}${action}`;
    })
    .join("\n");
}

function formatEntitySummary(input: AnalysisInput): string {
  const domainCounts = new Map<string, number>();
  for (const e of input.entities) {
    domainCounts.set(e.domain, (domainCounts.get(e.domain) || 0) + 1);
  }
  const domains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d, c]) => `${d}: ${c}`)
    .join(", ");

  return `Total entities: ${input.entities.length} (${domains}).\nTracked entities: ${input.entities.filter((e) => e.isTracked).length}.`;
}

function formatFeedback(feedback: FeedbackEntry[]): string {
  if (feedback.length === 0) return "";

  const dismissed = feedback.filter((f) => f.status === "dismissed");
  const applied = feedback.filter((f) => f.status === "applied");

  const lines: string[] = [];

  if (dismissed.length > 0) {
    lines.push("### Previously Dismissed (do NOT repeat similar insights)");
    for (const f of dismissed) {
      const entities = f.entityIds.length > 0 ? ` [${f.entityIds.join(", ")}]` : "";
      lines.push(`- [${f.type}] "${f.title}"${entities}`);
    }
  }

  if (applied.length > 0) {
    lines.push("\n### Previously Applied (these are already automated — look for NEW opportunities)");
    for (const f of applied) {
      const entities = f.entityIds.length > 0 ? ` [${f.entityIds.join(", ")}]` : "";
      lines.push(`- [${f.type}] "${f.title}"${entities}`);
    }
  }

  return lines.join("\n");
}

function formatBaselines(baselines: BaselineSnapshot[]): string {
  if (baselines.length === 0) return "No historical baselines available yet.";

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Group by entity
  const byEntity = new Map<string, BaselineSnapshot[]>();
  for (const b of baselines) {
    const key = b.friendlyName || b.entityId;
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key)!.push(b);
  }

  const lines: string[] = [];
  for (const [name, entityBaselines] of byEntity) {
    const domain = entityBaselines[0].domain;
    lines.push(`\n### ${name} (${domain})`);
    // Sort by day of week
    const sorted = [...entityBaselines].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    for (const b of sorted) {
      const day = dayNames[b.dayOfWeek] || `Day${b.dayOfWeek}`;
      const changes = b.avgStateChanges !== null ? `avg ${Number(b.avgStateChanges).toFixed(1)} changes` : "";
      const active = b.avgActiveTime !== null ? `avg ${Math.round(Number(b.avgActiveTime) / 60)}min active` : "";
      const stdDev = b.stdDevStateChanges !== null ? `±${Number(b.stdDevStateChanges).toFixed(1)}` : "";
      const parts = [changes, stdDev, active].filter(Boolean).join(", ");
      lines.push(`- ${day}: ${parts}`);
    }
  }
  return lines.join("\n");
}

function formatTrendComparison(
  currentStats: DailyStatSnapshot[],
  previousStats: DailyStatSnapshot[]
): string {
  if (previousStats.length === 0 || currentStats.length === 0) {
    return "No previous period data available for trend comparison.";
  }

  // Aggregate per entity for both periods
  function aggregate(stats: DailyStatSnapshot[]) {
    const byEntity = new Map<string, { changes: number; active: number; count: number; name: string; domain: string }>();
    for (const s of stats) {
      const key = s.entityId;
      const existing = byEntity.get(key) || { changes: 0, active: 0, count: 0, name: s.friendlyName || s.entityId, domain: s.domain };
      existing.changes += s.stateChanges;
      existing.active += s.activeTime;
      existing.count++;
      byEntity.set(key, existing);
    }
    return byEntity;
  }

  const current = aggregate(currentStats);
  const previous = aggregate(previousStats);

  const lines: string[] = [];
  for (const [entityId, curr] of current) {
    const prev = previous.get(entityId);
    if (!prev) continue;

    const changesDelta = prev.changes > 0
      ? ((curr.changes - prev.changes) / prev.changes * 100).toFixed(0)
      : null;
    const activeDelta = prev.active > 0
      ? ((curr.active - prev.active) / prev.active * 100).toFixed(0)
      : null;

    const parts: string[] = [];
    if (changesDelta !== null && Math.abs(Number(changesDelta)) >= 10) {
      parts.push(`state changes ${Number(changesDelta) > 0 ? "+" : ""}${changesDelta}%`);
    }
    if (activeDelta !== null && Math.abs(Number(activeDelta)) >= 10) {
      parts.push(`active time ${Number(activeDelta) > 0 ? "+" : ""}${activeDelta}%`);
    }

    if (parts.length > 0) {
      lines.push(`- **${curr.name}** (${curr.domain}): ${parts.join(", ")}`);
    }
  }

  if (lines.length === 0) return "No significant trend changes detected vs. previous period.";
  return lines.join("\n");
}

// ── Usage Patterns ──────────────────────────────────────────────────────────

export function buildUsagePatternsPrompt(input: AnalysisInput) {
  const system = `You are a smart home data analyst. Analyze Home Assistant entity usage data to identify meaningful patterns and habits.

Output a JSON array of insight objects. Each object must have:
- "type": "insight"
- "title": A short, descriptive title (max 80 chars)
- "content": 2-4 sentences explaining the pattern, why it matters, and any recommendation
- "metadata": { "entityIds": [...HA entity_ids], "confidence": 0-1, "category": "usage_pattern" }

Focus on:
- Daily/weekly routines (e.g., "Living room lights turn on around 6pm weekdays")
- Usage duration patterns (e.g., "Thermostat runs an average of 8 hours/day")
- Correlations between entities (e.g., "TV and living room light often change together")
- Unusual usage levels compared to entity type norms
- Emerging trends compared to the previous period (if trend data is provided)

IMPORTANT: Check the "User Feedback" section. Do NOT repeat insights similar to dismissed ones. If patterns have been marked as applied/automated, look for new opportunities instead.

Return between 1 and 5 insights, ordered by confidence. Return an empty array if insufficient data.
Only output valid JSON. No markdown fences or explanation.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);
  const trendSection = formatTrendComparison(input.dailyStats, input.previousPeriodStats);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Daily Statistics (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Trend Comparison (current vs previous period)
${trendSection}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Anomaly Detection ───────────────────────────────────────────────────────

export function buildAnomalyDetectionPrompt(input: AnalysisInput) {
  const system = `You are a smart home security and anomaly analyst. Review Home Assistant entity data to detect unusual or potentially concerning activity.

Output a JSON array of anomaly objects. Each object must have:
- "type": "anomaly"
- "title": A short, descriptive title (max 80 chars)
- "content": 2-4 sentences explaining what's unusual, the potential concern, and suggested action
- "metadata": { "entityIds": [...HA entity_ids], "confidence": 0-1, "category": "anomaly_detection", "anomalyDetails": { "entityId": "...", "expectedPattern": "...", "actualEvent": "...", "timestamp": "..." } }

Look for:
- Activity at unusual hours (e.g., door opens at 3am when pattern shows only daytime activity)
- Sudden spikes or drops in state changes vs historical baseline
- Entities stuck in unexpected states for abnormal durations
- Sensors reporting out-of-range values
- Deviations from the statistical baselines (if provided) — flag values more than 2 standard deviations from the mean

IMPORTANT: Check the "User Feedback" section. Do NOT repeat anomalies similar to dismissed ones.

Return between 0 and 5 anomalies, ordered by severity. Return an empty array if nothing unusual is detected.
Only output valid JSON. No markdown fences or explanation.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);
  const baselinesSection = formatBaselines(input.baselines);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Daily Statistics (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Historical Baselines (per day of week)
${baselinesSection}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Automation Gaps ─────────────────────────────────────────────────────────

export function buildAutomationGapsPrompt(input: AnalysisInput) {
  const system = `You are a Home Assistant automation expert. Compare observed entity usage patterns with existing automations to identify opportunities for new automations.

Output a JSON array of suggestion objects. Each object must have:
- "type": "automation"
- "title": A short, descriptive title for the suggested automation (max 80 chars)
- "content": 2-4 sentences explaining the observed pattern, why an automation would help, and what it would do
- "metadata": { "entityIds": [...HA entity_ids], "confidence": 0-1, "category": "automation_gap", "automationYaml": "..." }

The automationYaml must be valid Home Assistant automation YAML (a single automation object, not a list). Use proper HA service calls, triggers, and conditions.

Compare:
- Manual patterns in entity stats that could be automated (e.g., lights turned on/off at same time daily)
- Existing automations that could be improved or extended
- Common automation patterns for the entity types present that the user hasn't set up

IMPORTANT: Check the "User Feedback" section. Do NOT suggest automations similar to dismissed ones. Previously applied suggestions are already automated — suggest new complementary or advanced automations instead.

Return between 0 and 5 suggestions, ordered by impact. Return an empty array if no clear gaps exist.
Only output valid JSON. No markdown fences or explanation.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Existing Automations
${formatAutomations(input.automations)}

## Daily Statistics (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Efficiency Insights ─────────────────────────────────────────────────────

export function buildEfficiencyPrompt(input: AnalysisInput) {
  const system = `You are a smart home efficiency consultant. Analyze Home Assistant entity data to identify energy waste, underutilized devices, and optimization opportunities.

Output a JSON array of insight objects. Each object must have:
- "type": "suggestion"
- "title": A short, descriptive title (max 80 chars)
- "content": 2-4 sentences explaining the inefficiency, its impact, and a concrete recommendation
- "metadata": { "entityIds": [...HA entity_ids], "confidence": 0-1, "category": "efficiency", "efficiencyDetails": { "entityId": "...", "currentUsage": "...", "suggestedChange": "...", "estimatedImpact": "..." } }

Look for:
- Devices left on for unusually long periods
- Entities with very few state changes (potentially unused devices)
- Redundant or conflicting automations
- Climate entities running when patterns suggest nobody is home
- Lights left on during typical sleep hours
- Worsening trends compared to the previous period (if trend data is provided)

IMPORTANT: Check the "User Feedback" section. Do NOT repeat suggestions similar to dismissed ones. If efficiency changes have been applied, look for new opportunities.

Return between 0 and 5 insights, ordered by estimated impact. Return an empty array if no clear inefficiencies.
Only output valid JSON. No markdown fences or explanation.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);
  const trendSection = formatTrendComparison(input.dailyStats, input.previousPeriodStats);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Existing Automations
${formatAutomations(input.automations)}

## Daily Statistics (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Trend Comparison (current vs previous period)
${trendSection}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}
