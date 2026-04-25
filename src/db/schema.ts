import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  numeric,
  date,
  jsonb,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── Enums ──────────────────────────────────────────────────────────────────

export const instanceStatusEnum = pgEnum("instance_status", [
  "connected",
  "error",
  "pending",
]);

export const analysisTypeEnum = pgEnum("analysis_type", [
  "insight",
  "suggestion",
  "automation",
  "anomaly",
  "correlation",
  "device_recommendation",
]);

export const analysisStatusEnum = pgEnum("analysis_status", [
  "new",
  "viewed",
  "dismissed",
  "applied",
]);

export const syncJobStatusEnum = pgEnum("sync_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const analysisRunStatusEnum = pgEnum("analysis_run_status", [
  "running",
  "completed",
  "failed",
]);

// ─── Auth Tables (NextAuth.js v5) ───────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"), // Used for self-hosted credentials auth
  dashboardPreferences: jsonb("dashboard_preferences"), // Widget order, visibility, pinned entities
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// ─── Application Tables ─────────────────────────────────────────────────────

export const haInstances = pgTable("ha_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
  status: instanceStatusEnum("status").default("pending").notNull(),
  haVersion: text("ha_version"),
  analysisWindowDays: integer("analysis_window_days").default(7).notNull(),
  lastAnalysisHash: text("last_analysis_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const entities = pgTable("entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(),
  domain: text("domain").notNull(),
  platform: text("platform"),
  friendlyName: text("friendly_name"),
  areaId: text("area_id"),
  deviceId: text("device_id"),
  attributes: jsonb("attributes"),
  lastState: text("last_state"),
  lastChangedAt: timestamp("last_changed_at", { mode: "date" }),
  isTracked: boolean("is_tracked").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const entityDailyStats = pgTable("entity_daily_stats", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  stateChanges: integer("state_changes").default(0).notNull(),
  activeTime: integer("active_time").default(0).notNull(), // seconds
  avgValue: numeric("avg_value"),
  minValue: numeric("min_value"),
  maxValue: numeric("max_value"),
  stateDistribution: jsonb("state_distribution"), // e.g., {"on": 3600, "off": 82800}
  hourlyActivity: jsonb("hourly_activity"), // e.g., {"0": 0, "7": 5, "8": 12, ...} — state changes per hour
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const automations = pgTable("automations", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  haAutomationId: text("ha_automation_id").notNull(),
  alias: text("alias"),
  description: text("description"),
  triggerConfig: jsonb("trigger_config"),
  conditionConfig: jsonb("condition_config"),
  actionConfig: jsonb("action_config"),
  enabled: boolean("enabled").default(true).notNull(),
  lastTriggered: timestamp("last_triggered", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const analysisRuns = pgTable("analysis_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
  status: analysisRunStatusEnum("status").default("running").notNull(),
  insightsGenerated: jsonb("insights_generated"), // e.g. { usage_patterns: 3, anomaly_detection: 1 }
  tokensUsed: integer("tokens_used"),
  error: text("error"),
});

export const aiAnalyses = pgTable("ai_analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  analysisRunId: uuid("analysis_run_id")
    .references(() => analysisRuns.id, { onDelete: "set null" }),
  parentId: uuid("parent_id"),
  type: analysisTypeEnum("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  status: analysisStatusEnum("status").default("new").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const entityBaselines = pgTable("entity_baselines", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 6=Saturday
  avgStateChanges: numeric("avg_state_changes"),
  avgActiveTime: numeric("avg_active_time"),
  stdDevStateChanges: numeric("std_dev_state_changes"),
  computedAt: timestamp("computed_at", { mode: "date" }).defaultNow().notNull(),
});

export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: syncJobStatusEnum("status").default("pending").notNull(),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  error: text("error"),
  metadata: jsonb("metadata"),
});

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  isSecret: boolean("is_secret").default(false).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  haInstances: many(haInstances),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const haInstancesRelations = relations(haInstances, ({ one, many }) => ({
  user: one(users, { fields: [haInstances.userId], references: [users.id] }),
  entities: many(entities),
  automations: many(automations),
  aiAnalyses: many(aiAnalyses),
  analysisRuns: many(analysisRuns),
  syncJobs: many(syncJobs),
}));

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  instance: one(haInstances, {
    fields: [entities.instanceId],
    references: [haInstances.id],
  }),
  dailyStats: many(entityDailyStats),
}));

export const entityDailyStatsRelations = relations(
  entityDailyStats,
  ({ one }) => ({
    entity: one(entities, {
      fields: [entityDailyStats.entityId],
      references: [entities.id],
    }),
  })
);

export const entityBaselinesRelations = relations(
  entityBaselines,
  ({ one }) => ({
    entity: one(entities, {
      fields: [entityBaselines.entityId],
      references: [entities.id],
    }),
  })
);

export const automationsRelations = relations(automations, ({ one }) => ({
  instance: one(haInstances, {
    fields: [automations.instanceId],
    references: [haInstances.id],
  }),
}));

export const analysisRunsRelations = relations(analysisRuns, ({ one, many }) => ({
  instance: one(haInstances, {
    fields: [analysisRuns.instanceId],
    references: [haInstances.id],
  }),
  analyses: many(aiAnalyses),
}));

export const aiAnalysesRelations = relations(aiAnalyses, ({ one }) => ({
  instance: one(haInstances, {
    fields: [aiAnalyses.instanceId],
    references: [haInstances.id],
  }),
  analysisRun: one(analysisRuns, {
    fields: [aiAnalyses.analysisRunId],
    references: [analysisRuns.id],
  }),
}));

export const syncJobsRelations = relations(syncJobs, ({ one }) => ({
  instance: one(haInstances, {
    fields: [syncJobs.instanceId],
    references: [haInstances.id],
  }),
}));

// ─── Phase 2 & 3: New Enums ─────────────────────────────────────────────────

export const anomalySeverityEnum = pgEnum("anomaly_severity", [
  "info",
  "warning",
  "critical",
]);

export const anomalyStatusEnum = pgEnum("anomaly_status", [
  "active",
  "acknowledged",
  "resolved",
  "dismissed",
]);

export const blueprintStatusEnum = pgEnum("blueprint_status", [
  "draft",
  "active",
  "exported",
  "archived",
]);

export const patternTypeEnum = pgEnum("pattern_type", [
  "routine",
  "correlation",
  "threshold",
  "sequence",
  "seasonal",
]);

export const widgetTypeEnum = pgEnum("widget_type", [
  "stats",
  "entity_list",
  "chart",
  "insights",
  "activity",
  "health",
  "energy",
  "heatmap",
  "areas",
  "quick_actions",
]);

export const energySensorTypeEnum = pgEnum("energy_sensor_type", [
  "consumption",
  "production",
  "battery",
  "cost",
  "gas",
  "water",
]);

// ─── Phase 3: Areas Table ───────────────────────────────────────────────────

export const areas = pgTable("areas", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  haAreaId: text("ha_area_id").notNull(),
  name: text("name").notNull(),
  floorId: text("floor_id"),
  icon: text("icon"),
  aliases: jsonb("aliases"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 3: Devices Table ─────────────────────────────────────────────────

export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  haDeviceId: text("ha_device_id").notNull(),
  name: text("name"),
  nameByUser: text("name_by_user"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  swVersion: text("sw_version"),
  hwVersion: text("hw_version"),
  areaId: text("area_id"),
  disabledBy: text("disabled_by"),
  entryType: text("entry_type"),
  viaDeviceId: text("via_device_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 3: Scenes Table ──────────────────────────────────────────────────

export const scenes = pgTable("scenes", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  areaId: text("area_id"),
  entityIds: jsonb("entity_ids"),
  lastActivated: timestamp("last_activated", { mode: "date" }),
  activationCount: integer("activation_count").default(0).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 3: Scripts Table ─────────────────────────────────────────────────

export const scripts = pgTable("scripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  description: text("description"),
  mode: text("mode"),
  fields: jsonb("fields"),
  sequence: jsonb("sequence"),
  lastTriggered: timestamp("last_triggered", { mode: "date" }),
  triggerCount: integer("trigger_count").default(0).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 3: Energy Sensors Table ──────────────────────────────────────────

export const energySensors = pgTable("energy_sensors", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  entityDbId: uuid("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  sensorType: energySensorTypeEnum("sensor_type").notNull(),
  unitOfMeasurement: text("unit_of_measurement"),
  deviceClass: text("device_class"),
  stateClass: text("state_class"),
  tariffEntityId: text("tariff_entity_id"),
  costPerKwh: numeric("cost_per_kwh"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 3: Energy Daily Stats Table ──────────────────────────────────────

export const energyDailyStats = pgTable("energy_daily_stats", {
  id: uuid("id").defaultRandom().primaryKey(),
  energySensorId: uuid("energy_sensor_id")
    .notNull()
    .references(() => energySensors.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  totalConsumption: numeric("total_consumption"),
  totalProduction: numeric("total_production"),
  netConsumption: numeric("net_consumption"),
  peakConsumption: numeric("peak_consumption"),
  peakTime: text("peak_time"),
  costEstimate: numeric("cost_estimate"),
  hourlyData: jsonb("hourly_data"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 2: Anomaly Alerts Table ──────────────────────────────────────────

export const anomalyAlerts = pgTable("anomaly_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  entityDbId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  severity: anomalySeverityEnum("severity").default("info").notNull(),
  status: anomalyStatusEnum("status").default("active").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  detectedValue: text("detected_value"),
  expectedRange: text("expected_range"),
  deviationScore: numeric("deviation_score"),
  detectedAt: timestamp("detected_at", { mode: "date" }).defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { mode: "date" }),
  resolvedAt: timestamp("resolved_at", { mode: "date" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 3: Blueprints Table ──────────────────────────────────────────────

export const blueprints = pgTable("blueprints", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  analysisId: uuid("analysis_id").references(() => aiAnalyses.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  domain: text("domain").default("automation").notNull(),
  sourceEntities: jsonb("source_entities"),
  inputSchema: jsonb("input_schema"),
  blueprintYaml: text("blueprint_yaml").notNull(),
  status: blueprintStatusEnum("status").default("draft").notNull(),
  exportedAt: timestamp("exported_at", { mode: "date" }),
  deployCount: integer("deploy_count").default(0).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 2: Learned Patterns Table ────────────────────────────────────────

export const learnedPatterns = pgTable("learned_patterns", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  patternType: patternTypeEnum("pattern_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  entities: jsonb("entities").notNull(),
  conditions: jsonb("conditions"),
  patternData: jsonb("pattern_data").notNull(),
  confidence: numeric("confidence").default("0.5").notNull(),
  occurrenceCount: integer("occurrence_count").default(1).notNull(),
  lastSeenAt: timestamp("last_seen_at", { mode: "date" }).defaultNow().notNull(),
  firstSeenAt: timestamp("first_seen_at", { mode: "date" }).defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 1: Dashboard Widgets Table ───────────────────────────────────────

export const dashboardWidgets = pgTable("dashboard_widgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  instanceId: uuid("instance_id").references(() => haInstances.id, { onDelete: "cascade" }),
  widgetType: widgetTypeEnum("widget_type").notNull(),
  title: text("title"),
  position: integer("position").default(0).notNull(),
  width: integer("width").default(1).notNull(),
  height: integer("height").default(1).notNull(),
  config: jsonb("config"),
  isVisible: boolean("is_visible").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Automation Reviews Table ───────────────────────────────────────────────

export const automationReviews = pgTable("automation_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  automationId: uuid("automation_id")
    .notNull()
    .references(() => automations.id, { onDelete: "cascade" }),
  configHash: text("config_hash").notNull(),
  healthScore: integer("health_score").default(0).notNull(),
  findings: jsonb("findings").notNull(),
  improvedYaml: text("improved_yaml"),
  summary: text("summary"),
  tokensUsed: integer("tokens_used").default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Automation Templates Table ─────────────────────────────────────────────

export const automationTemplates = pgTable("automation_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .references(() => haInstances.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  icon: text("icon"),
  useCase: text("use_case").notNull(),
  requiredDomains: jsonb("required_domains").notNull(),
  optionalDomains: jsonb("optional_domains"),
  templateYaml: text("template_yaml").notNull(),
  inputSchema: jsonb("input_schema"),
  exampleConfig: jsonb("example_config"),
  matchScore: numeric("match_score").default("0"),
  deployCount: integer("deploy_count").default(0).notNull(),
  isCurated: boolean("is_curated").default(false).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Notifications Table ────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  metadata: jsonb("metadata"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Phase 2 & 3: Additional Relations ──────────────────────────────────────

export const areasRelations = relations(areas, ({ one, many }) => ({
  instance: one(haInstances, {
    fields: [areas.instanceId],
    references: [haInstances.id],
  }),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  instance: one(haInstances, {
    fields: [devices.instanceId],
    references: [haInstances.id],
  }),
}));

export const scenesRelations = relations(scenes, ({ one }) => ({
  instance: one(haInstances, {
    fields: [scenes.instanceId],
    references: [haInstances.id],
  }),
}));

export const scriptsRelations = relations(scripts, ({ one }) => ({
  instance: one(haInstances, {
    fields: [scripts.instanceId],
    references: [haInstances.id],
  }),
}));

export const energySensorsRelations = relations(energySensors, ({ one, many }) => ({
  instance: one(haInstances, {
    fields: [energySensors.instanceId],
    references: [haInstances.id],
  }),
  entity: one(entities, {
    fields: [energySensors.entityDbId],
    references: [entities.id],
  }),
  dailyStats: many(energyDailyStats),
}));

export const energyDailyStatsRelations = relations(energyDailyStats, ({ one }) => ({
  sensor: one(energySensors, {
    fields: [energyDailyStats.energySensorId],
    references: [energySensors.id],
  }),
}));

export const anomalyAlertsRelations = relations(anomalyAlerts, ({ one }) => ({
  instance: one(haInstances, {
    fields: [anomalyAlerts.instanceId],
    references: [haInstances.id],
  }),
  entity: one(entities, {
    fields: [anomalyAlerts.entityDbId],
    references: [entities.id],
  }),
}));

export const blueprintsRelations = relations(blueprints, ({ one }) => ({
  instance: one(haInstances, {
    fields: [blueprints.instanceId],
    references: [haInstances.id],
  }),
  analysis: one(aiAnalyses, {
    fields: [blueprints.analysisId],
    references: [aiAnalyses.id],
  }),
}));

export const learnedPatternsRelations = relations(learnedPatterns, ({ one }) => ({
  instance: one(haInstances, {
    fields: [learnedPatterns.instanceId],
    references: [haInstances.id],
  }),
}));

export const dashboardWidgetsRelations = relations(dashboardWidgets, ({ one }) => ({
  user: one(users, {
    fields: [dashboardWidgets.userId],
    references: [users.id],
  }),
  instance: one(haInstances, {
    fields: [dashboardWidgets.instanceId],
    references: [haInstances.id],
  }),
}));

export const automationReviewsRelations = relations(automationReviews, ({ one }) => ({
  instance: one(haInstances, {
    fields: [automationReviews.instanceId],
    references: [haInstances.id],
  }),
  automation: one(automations, {
    fields: [automationReviews.automationId],
    references: [automations.id],
  }),
}));

export const automationTemplatesRelations = relations(automationTemplates, ({ one }) => ({
  instance: one(haInstances, {
    fields: [automationTemplates.instanceId],
    references: [haInstances.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  instance: one(haInstances, {
    fields: [notifications.instanceId],
    references: [haInstances.id],
  }),
}));
