import type {
  AnalysisInput,
  DailyStatSnapshot,
  AutomationSnapshot,
  FeedbackEntry,
  BaselineSnapshot,
} from "./types";

// ── Token Estimation ────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Entity Relevance Scoring ────────────────────────────────────────────────

interface EntityScore {
  entityId: string;
  name: string;
  domain: string;
  score: number;
  totalChanges: number;
  avgDailyActive: number;
}

export function scoreEntities(stats: DailyStatSnapshot[]): EntityScore[] {
  const byEntity = new Map<string, DailyStatSnapshot[]>();
  for (const s of stats) {
    if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
    byEntity.get(s.entityId)!.push(s);
  }

  const scores: EntityScore[] = [];
  for (const [entityId, entityStats] of byEntity) {
    const days = entityStats.length || 1;
    const totalChanges = entityStats.reduce((sum, s) => sum + s.stateChanges, 0);
    const totalActive = entityStats.reduce((sum, s) => sum + s.activeTime, 0);
    const avgDailyChanges = totalChanges / days;
    const avgDailyActive = totalActive / days;

    // Variance in daily activity (interesting entities have varied patterns)
    const variance = entityStats.reduce(
      (sum, s) => sum + Math.pow(s.stateChanges - avgDailyChanges, 2), 0
    ) / days;
    const coeffOfVariation = avgDailyChanges > 0 ? Math.sqrt(variance) / avgDailyChanges : 0;

    const score = avgDailyChanges * 0.4 + (avgDailyActive / 3600) * 0.3 + coeffOfVariation * 0.3;

    scores.push({
      entityId,
      name: entityStats[0].friendlyName || entityId,
      domain: entityStats[0].domain,
      score,
      totalChanges,
      avgDailyActive: avgDailyActive / 60,
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

export function filterInputByRelevance(
  input: AnalysisInput,
  maxEntities: number = 50
): AnalysisInput {
  if (input.dailyStats.length === 0) return input;

  const scored = scoreEntities(input.dailyStats);
  if (scored.length <= maxEntities) return input;

  const topEntityIds = new Set(scored.slice(0, maxEntities).map((s) => s.entityId));

  return {
    ...input,
    dailyStats: input.dailyStats.filter((s) => topEntityIds.has(s.entityId)),
    previousPeriodStats: input.previousPeriodStats.filter((s) => topEntityIds.has(s.entityId)),
    baselines: input.baselines.filter((b) => topEntityIds.has(b.entityId)),
  };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function formatStats(stats: DailyStatSnapshot[], detailedTopN: number = 10): string {
  if (stats.length === 0) return "No daily statistics available yet.";

  const scored = scoreEntities(stats);
  const topEntityIds = new Set(scored.slice(0, detailedTopN).map((s) => s.entityId));

  const byEntity = new Map<string, DailyStatSnapshot[]>();
  for (const s of stats) {
    if (!byEntity.has(s.entityId)) byEntity.set(s.entityId, []);
    byEntity.get(s.entityId)!.push(s);
  }

  const summaryLines: string[] = [];
  const detailedLines: string[] = [];

  for (const sc of scored) {
    const entityStats = byEntity.get(sc.entityId) || [];
    if (entityStats.length === 0) continue;

    const days = entityStats.length;
    const totalChanges = entityStats.reduce((sum, s) => sum + s.stateChanges, 0);
    const totalActive = entityStats.reduce((sum, s) => sum + s.activeTime, 0);
    const avgChanges = (totalChanges / days).toFixed(1);
    const avgActive = Math.round(totalActive / days / 60);

    // Dominant state distribution (aggregated)
    let stateStr = "";
    if (entityStats.some((s) => s.stateDistribution)) {
      const merged: Record<string, number> = {};
      for (const s of entityStats) {
        if (s.stateDistribution) {
          for (const [state, secs] of Object.entries(s.stateDistribution)) {
            merged[state] = (merged[state] || 0) + secs;
          }
        }
      }
      const total = Object.values(merged).reduce((a, b) => a + b, 0);
      if (total > 0) {
        stateStr = " " + Object.entries(merged)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([state, secs]) => `${state}:${Math.round(secs / total * 100)}%`)
          .join(",");
      }
    }

    // Sensor value range
    let valueStr = "";
    const avgValues = entityStats.filter((s) => s.avgValue != null).map((s) => Number(s.avgValue));
    if (avgValues.length > 0) {
      const minVals = entityStats.filter((s) => s.minValue != null).map((s) => Number(s.minValue));
      const maxVals = entityStats.filter((s) => s.maxValue != null).map((s) => Number(s.maxValue));
      const avg = (avgValues.reduce((a, b) => a + b, 0) / avgValues.length).toFixed(1);
      valueStr = ` val=${avg}(${Math.min(...minVals)}-${Math.max(...maxVals)})`;
    }

    summaryLines.push(
      `${sc.name} (${sc.domain}): ${avgChanges}chg/d, ${avgActive}m/d${stateStr}${valueStr}`
    );

    // Full daily breakdown for top entities only (last 3 days)
    if (topEntityIds.has(sc.entityId)) {
      detailedLines.push(`\n### ${sc.name} (${sc.domain})`);
      for (const s of entityStats.slice(0, 3)) {
        let line = `- ${s.date}: ${s.stateChanges}chg, ${Math.round(s.activeTime / 60)}m`;
        if (s.avgValue) line += ` avg=${s.avgValue}`;
        if (s.stateDistribution) {
          const dist = Object.entries(s.stateDistribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([state, secs]) => `${state}:${Math.round(secs / 60)}m`)
            .join(",");
          line += ` [${dist}]`;
        }
        detailedLines.push(line);
      }
    }
  }

  let result = summaryLines.join("\n");
  if (detailedLines.length > 0) {
    result += "\n\n### Daily Detail (top entities)" + detailedLines.join("\n");
  }
  return result;
}

function summarizeTrigger(config: unknown): string {
  if (!config) return "?";
  try {
    const triggers = Array.isArray(config) ? config : [config];
    return triggers.map((t) => {
      const p = t.platform || t.trigger || "?";
      if (p === "time" || p === "time_pattern") return `time@${t.at || t.hours || "?"}`;
      if (p === "state") return `${t.entity_id || "?"}→${t.to || "any"}`;
      if (p === "sun") return `sun:${t.event || "?"}${t.offset ? `(${t.offset})` : ""}`;
      if (p === "numeric_state") return `${t.entity_id}${t.above ? `>${t.above}` : ""}${t.below ? `<${t.below}` : ""}`;
      if (p === "zone") return `zone:${t.zone || "?"}(${t.event || "enter"})`;
      if (p === "device") return `device:${t.device_id || "?"}`;
      if (p === "homeassistant") return `ha:${t.event || "start"}`;
      return `${p}${t.entity_id ? `(${t.entity_id})` : ""}`;
    }).join(" | ");
  } catch {
    return "complex";
  }
}

function summarizeAction(config: unknown): string {
  if (!config) return "?";
  try {
    const actions = Array.isArray(config) ? config : [config];
    return actions.slice(0, 3).map((a) => {
      if (a.service) {
        const svc = a.service.replace("homeassistant.", "ha.");
        const target = a.target?.entity_id
          ? `(${Array.isArray(a.target.entity_id) ? a.target.entity_id.join(",") : a.target.entity_id})`
          : a.entity_id ? `(${a.entity_id})` : "";
        return `${svc}${target}`;
      }
      if (a.action) return a.action;
      if (a.delay) return `delay(${typeof a.delay === "object" ? JSON.stringify(a.delay) : a.delay})`;
      if (a.choose) return `choose(${a.choose.length})`;
      if (a.repeat) return "repeat";
      if (a.condition) return `if(${a.condition})`;
      return "action";
    }).join("+") + (actions.length > 3 ? `+${actions.length - 3}more` : "");
  } catch {
    return "complex";
  }
}

function formatAutomations(automations: AutomationSnapshot[]): string {
  if (automations.length === 0) return "No automations configured.";

  return automations.map((a) => {
    const status = a.enabled ? "on" : "off";
    const triggered = a.lastTriggered
      ? a.lastTriggered.toISOString().split("T")[0]
      : "never";
    const trigger = summarizeTrigger(a.triggerConfig);
    const action = summarizeAction(a.actionConfig);
    return `- ${a.alias || a.haAutomationId} [${status}, ${triggered}]: ${trigger} → ${action}`;
  }).join("\n");
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

  const dayAbbr = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const byEntity = new Map<string, BaselineSnapshot[]>();
  for (const b of baselines) {
    const key = b.friendlyName || b.entityId;
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key)!.push(b);
  }

  const lines: string[] = [];
  for (const [name, entityBaselines] of byEntity) {
    const domain = entityBaselines[0].domain;
    const sorted = [...entityBaselines].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const dayParts = sorted.map((b) => {
      const day = dayAbbr[b.dayOfWeek] || "?";
      const chg = b.avgStateChanges !== null ? Number(b.avgStateChanges).toFixed(0) : "?";
      const std = b.stdDevStateChanges !== null ? `±${Number(b.stdDevStateChanges).toFixed(0)}` : "";
      const act = b.avgActiveTime !== null ? `/${Math.round(Number(b.avgActiveTime) / 60)}m` : "";
      return `${day}=${chg}${std}${act}`;
    }).join(" ");
    lines.push(`${name} (${domain}): ${dayParts}`);
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
  const system = `You are a smart home data analyst. Analyze Home Assistant entity usage data to identify meaningful patterns.

Output a JSON array of insight objects:
- "type": "insight"
- "title": Short title (max 80 chars)
- "content": 2-4 sentences explaining the pattern and recommendation
- "metadata": { "entityIds": [...HA entity_ids], "confidence": 0-1, "category": "usage_pattern" }

Focus on: daily/weekly routines, usage duration patterns, entity correlations, emerging trends.
Do NOT repeat dismissed insights from User Feedback. Applied patterns are already handled.
Return 1-5 insights by confidence. Empty array if insufficient data.
Only valid JSON, no markdown fences.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);
  const trendSection = formatTrendComparison(input.dailyStats, input.previousPeriodStats);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Entity Activity (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Trends
${trendSection}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Anomaly Detection ───────────────────────────────────────────────────────

export function buildAnomalyDetectionPrompt(input: AnalysisInput) {
  const system = `You are a smart home anomaly analyst. Detect unusual activity in Home Assistant data.

Output a JSON array of anomaly objects:
- "type": "anomaly"
- "title": Short title (max 80 chars)
- "content": 2-4 sentences about what's unusual and suggested action
- "metadata": { "entityIds": [...], "confidence": 0-1, "category": "anomaly_detection", "anomalyDetails": { "entityId": "...", "expectedPattern": "...", "actualEvent": "...", "timestamp": "..." } }

Look for: unusual-hour activity, spikes/drops vs baseline (>2 std devs), stuck states, out-of-range sensors.
Do NOT repeat dismissed anomalies from User Feedback.
Return 0-5 anomalies by severity. Empty array if nothing unusual.
Only valid JSON, no markdown fences.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Entity Activity (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Baselines (per day of week)
${formatBaselines(input.baselines)}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Automation Gaps ─────────────────────────────────────────────────────────

export function buildAutomationGapsPrompt(input: AnalysisInput) {
  const system = `You are a Home Assistant automation expert. Find automation opportunities by comparing usage patterns with existing automations.

Output a JSON array of suggestion objects:
- "type": "automation"
- "title": Short title (max 80 chars)
- "content": 2-4 sentences about the pattern and suggested automation
- "metadata": { "entityIds": [...], "confidence": 0-1, "category": "automation_gap", "automationYaml": "..." }

automationYaml must be valid HA automation YAML.
Look for: manual patterns that could be automated, automations that could be improved, common patterns not yet set up.
Do NOT repeat dismissed suggestions from User Feedback.
Return 0-5 suggestions by impact. Empty array if no clear gaps.
Only valid JSON, no markdown fences.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Existing Automations
${formatAutomations(input.automations)}

## Entity Activity (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Efficiency Insights ─────────────────────────────────────────────────────

export function buildEfficiencyPrompt(input: AnalysisInput) {
  const system = `You are a smart home efficiency consultant. Identify energy waste, underutilized devices, and optimization opportunities.

Output a JSON array of suggestion objects:
- "type": "suggestion"
- "title": Short title (max 80 chars)
- "content": 2-4 sentences about the inefficiency and recommendation
- "metadata": { "entityIds": [...], "confidence": 0-1, "category": "efficiency", "efficiencyDetails": { "entityId": "...", "currentUsage": "...", "suggestedChange": "...", "estimatedImpact": "..." } }

Look for: devices left on too long, unused devices, redundant automations, climate waste, lights on during sleep, worsening trends.
Do NOT repeat dismissed suggestions from User Feedback.
Return 0-5 insights by impact. Empty array if no clear inefficiencies.
Only valid JSON, no markdown fences.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);
  const trendSection = formatTrendComparison(input.dailyStats, input.previousPeriodStats);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Existing Automations
${formatAutomations(input.automations)}

## Entity Activity (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Trends
${trendSection}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Cross-Device Correlation ────────────────────────────────────────────────

export function buildCrossDeviceCorrelationPrompt(input: AnalysisInput) {
  const system = `You are a smart home data scientist. Find meaningful cross-device behavioral correlations in Home Assistant data.

Output a JSON array of correlation objects:
- "type": "correlation"
- "title": Short title (max 80 chars)
- "content": 3-5 sentences about the pattern, significance, and automation potential
- "metadata": { "entityIds": [...], "confidence": 0-1, "category": "cross_device_correlation", "correlationDetails": { "entityPairs": [{"entityA":"...","entityB":"...","relationship":"...","strength":0-1}], "timeWindow": "...", "patternType": "sequential|simultaneous|inverse|conditional" }, "automationYaml": "..." }

Find: sequential patterns, simultaneous state changes, inverse correlations, conditional patterns, multi-device chains.
automationYaml must be valid HA YAML. Do NOT repeat dismissed correlations.
Return 0-5 correlations by strength. Empty array if insufficient data.
Only valid JSON, no markdown fences.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);
  const trendSection = formatTrendComparison(input.dailyStats, input.previousPeriodStats);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Existing Automations
${formatAutomations(input.automations)}

## Entity Activity (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Baselines (per day of week)
${formatBaselines(input.baselines)}

## Trends
${trendSection}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Device Suggestions ──────────────────────────────────────────────────────

export function buildDeviceSuggestionPrompt(input: AnalysisInput) {
  const system = `You are a smart home IoT consultant. Suggest new devices based on the user's setup and usage patterns.

Output a JSON array of recommendations:
- "type": "device_recommendation"
- "title": Short title (max 80 chars)
- "content": 3-5 sentences about why this device adds value based on observed data
- "metadata": { "entityIds": [...related existing], "confidence": 0-1, "category": "device_suggestion", "deviceRecommendation": { "suggestedDevice": "...", "deviceType": "sensor|actuator|climate|media|security|energy", "rationale": "...", "enhancedEntities": [...], "estimatedBenefit": "..." }, "automationYaml": "..." }

Look for: missing sensors, incomplete rooms, energy monitoring gaps, security gaps, routine enhancement opportunities.
Do NOT repeat dismissed suggestions.
Return 0-4 recommendations by impact. Empty array if setup seems comprehensive.
Only valid JSON, no markdown fences.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Existing Automations
${formatAutomations(input.automations)}

## Entity Activity (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Baselines (per day of week)
${formatBaselines(input.baselines)}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Merged: Usage Patterns + Efficiency ─────────────────────────────────────

export function buildUsageAndEfficiencyPrompt(input: AnalysisInput) {
  const system = `You are a smart home analyst. Analyze Home Assistant data to identify both usage patterns AND efficiency issues.

Return a JSON array mixing two result types:

**Usage insights** (type "insight"):
- "type": "insight", "title": max 80 chars, "content": 2-4 sentences
- "metadata": { "entityIds": [...], "confidence": 0-1, "category": "usage_pattern" }

**Efficiency suggestions** (type "suggestion"):
- "type": "suggestion", "title": max 80 chars, "content": 2-4 sentences
- "metadata": { "entityIds": [...], "confidence": 0-1, "category": "efficiency", "efficiencyDetails": { "entityId":"...", "currentUsage":"...", "suggestedChange":"...", "estimatedImpact":"..." } }

Usage: daily/weekly routines, duration patterns, entity correlations, trends.
Efficiency: devices left on too long, unused devices, climate waste, lights on during sleep.
Do NOT repeat dismissed insights. Applied patterns are already handled.
Return 2-8 results total (mix of both types) by confidence/impact. Empty array if insufficient data.
Only valid JSON, no markdown fences.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);
  const trendSection = formatTrendComparison(input.dailyStats, input.previousPeriodStats);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Existing Automations
${formatAutomations(input.automations)}

## Entity Activity (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Trends
${trendSection}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}

// ── Merged: Automation Gaps + Cross-Device Correlation ──────────────────────

export function buildAutomationAndCorrelationPrompt(input: AnalysisInput) {
  const system = `You are a Home Assistant automation expert and cross-device analyst. Find automation opportunities AND cross-device correlations.

Return a JSON array mixing two result types:

**Automation suggestions** (type "automation"):
- "type": "automation", "title": max 80 chars, "content": 2-4 sentences
- "metadata": { "entityIds": [...], "confidence": 0-1, "category": "automation_gap", "automationYaml": "..." }

**Cross-device correlations** (type "correlation"):
- "type": "correlation", "title": max 80 chars, "content": 3-5 sentences
- "metadata": { "entityIds": [...], "confidence": 0-1, "category": "cross_device_correlation", "correlationDetails": { "entityPairs": [{"entityA":"...","entityB":"...","relationship":"...","strength":0-1}], "timeWindow":"...", "patternType":"sequential|simultaneous|inverse|conditional" }, "automationYaml": "..." }

All automationYaml must be valid HA automation YAML.
Find: manual patterns to automate, sequential/simultaneous/inverse device patterns, multi-device chains, improvements to existing automations.
Do NOT repeat dismissed suggestions.
Return 2-8 results total (mix of both types). Empty array if no opportunities.
Only valid JSON, no markdown fences.`;

  const feedbackSection = formatFeedback(input.feedbackHistory);

  const user = `## Home Overview
${formatEntitySummary(input)}

## Existing Automations
${formatAutomations(input.automations)}

## Entity Activity (last ${input.analysisWindowDays} days)
${formatStats(input.dailyStats)}

## Baselines (per day of week)
${formatBaselines(input.baselines)}
${feedbackSection ? `\n## User Feedback\n${feedbackSection}` : ""}`;

  return { system, user };
}
