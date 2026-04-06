/** Types for AI analysis engine responses */

export type AnalysisType = "insight" | "suggestion" | "automation" | "anomaly";

export interface AnalysisResult {
  type: AnalysisType;
  title: string;
  content: string;
  metadata: AnalysisMetadata;
}

export interface AnalysisMetadata {
  /** Entity IDs relevant to this analysis */
  entityIds?: string[];
  /** Confidence score 0-1 */
  confidence?: number;
  /** For automation suggestions: the generated YAML */
  automationYaml?: string;
  /** For anomaly detection: the anomalous event details */
  anomalyDetails?: {
    entityId: string;
    expectedPattern: string;
    actualEvent: string;
    timestamp: string;
  };
  /** For efficiency insights: estimated savings */
  efficiencyDetails?: {
    entityId: string;
    currentUsage: string;
    suggestedChange: string;
    estimatedImpact: string;
  };
  /** Category tag for grouping */
  category?:
    | "usage_pattern"
    | "anomaly_detection"
    | "automation_gap"
    | "efficiency";
}

/** Input data shape for the analysis service */
export interface AnalysisInput {
  instanceId: string;
  entities: EntitySnapshot[];
  automations: AutomationSnapshot[];
  dailyStats: DailyStatSnapshot[];
  previousPeriodStats: DailyStatSnapshot[];
  feedbackHistory: FeedbackEntry[];
  baselines: BaselineSnapshot[];
  analysisWindowDays: number;
}

export interface FeedbackEntry {
  title: string;
  type: AnalysisType;
  status: "dismissed" | "applied";
  entityIds: string[];
  createdAt: string;
}

export interface BaselineSnapshot {
  entityId: string;
  friendlyName: string | null;
  domain: string;
  dayOfWeek: number;
  avgStateChanges: number | null;
  avgActiveTime: number | null;
  stdDevStateChanges: number | null;
}

export interface EntitySnapshot {
  entityId: string;
  domain: string;
  friendlyName: string | null;
  lastState: string | null;
  areaId: string | null;
  isTracked: boolean;
}

export interface AutomationSnapshot {
  haAutomationId: string;
  alias: string | null;
  description: string | null;
  triggerConfig: unknown;
  conditionConfig: unknown;
  actionConfig: unknown;
  enabled: boolean;
  lastTriggered: Date | null;
}

export interface DailyStatSnapshot {
  entityId: string;
  friendlyName: string | null;
  domain: string;
  date: string;
  stateChanges: number;
  activeTime: number;
  avgValue: string | null;
  minValue: string | null;
  maxValue: string | null;
  stateDistribution: Record<string, number> | null;
}
