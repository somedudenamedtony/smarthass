-- Migration: Automation Coach, Coverage, Templates, Notifications
-- Adds tables for automation reviews, automation templates, and notifications

-- Automation Reviews (cached AI reviews per automation config hash)
CREATE TABLE IF NOT EXISTS "automation_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "instance_id" uuid NOT NULL REFERENCES "ha_instances"("id") ON DELETE CASCADE,
  "automation_id" uuid NOT NULL REFERENCES "automations"("id") ON DELETE CASCADE,
  "config_hash" text NOT NULL,
  "health_score" integer NOT NULL DEFAULT 0,
  "findings" jsonb NOT NULL DEFAULT '[]',
  "improved_yaml" text,
  "summary" text,
  "tokens_used" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_automation_reviews_automation_id" ON "automation_reviews"("automation_id");
CREATE INDEX IF NOT EXISTS "idx_automation_reviews_config_hash" ON "automation_reviews"("config_hash");

-- Automation Templates (curated + AI-generated templates)
CREATE TABLE IF NOT EXISTS "automation_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "instance_id" uuid REFERENCES "ha_instances"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "icon" text,
  "use_case" text NOT NULL,
  "required_domains" jsonb NOT NULL DEFAULT '[]',
  "optional_domains" jsonb DEFAULT '[]',
  "template_yaml" text NOT NULL,
  "input_schema" jsonb DEFAULT '{}',
  "example_config" jsonb,
  "match_score" numeric DEFAULT 0,
  "deploy_count" integer DEFAULT 0 NOT NULL,
  "is_curated" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_automation_templates_category" ON "automation_templates"("category");
CREATE INDEX IF NOT EXISTS "idx_automation_templates_instance_id" ON "automation_templates"("instance_id");

-- Notifications (proactive analysis results + alerts)
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "instance_id" uuid NOT NULL REFERENCES "ha_instances"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "action_url" text,
  "metadata" jsonb,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_notifications_instance_id" ON "notifications"("instance_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_is_read" ON "notifications"("is_read");
