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
  isTracked: boolean("is_tracked").default(false).notNull(),
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

export const aiAnalyses = pgTable("ai_analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => haInstances.id, { onDelete: "cascade" }),
  type: analysisTypeEnum("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  status: analysisStatusEnum("status").default("new").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
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

export const automationsRelations = relations(automations, ({ one }) => ({
  instance: one(haInstances, {
    fields: [automations.instanceId],
    references: [haInstances.id],
  }),
}));

export const aiAnalysesRelations = relations(aiAnalyses, ({ one }) => ({
  instance: one(haInstances, {
    fields: [aiAnalyses.instanceId],
    references: [haInstances.id],
  }),
}));

export const syncJobsRelations = relations(syncJobs, ({ one }) => ({
  instance: one(haInstances, {
    fields: [syncJobs.instanceId],
    references: [haInstances.id],
  }),
}));
