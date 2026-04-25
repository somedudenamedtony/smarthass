-- Phase 2 & 3: Areas, Scenes, Scripts, Energy, Anomaly Detection, Blueprints
-- SmartHass v1.5 Migration

-- ─── Areas Table ────────────────────────────────────────────────────────────
-- Synced from HA area registry
CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ha_instances(id) ON DELETE CASCADE,
  ha_area_id TEXT NOT NULL,
  name TEXT NOT NULL,
  floor_id TEXT,
  icon TEXT,
  aliases JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(instance_id, ha_area_id)
);

CREATE INDEX IF NOT EXISTS idx_areas_instance ON areas(instance_id);

-- ─── Devices Table ──────────────────────────────────────────────────────────
-- Synced from HA device registry
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ha_instances(id) ON DELETE CASCADE,
  ha_device_id TEXT NOT NULL,
  name TEXT,
  name_by_user TEXT,
  manufacturer TEXT,
  model TEXT,
  sw_version TEXT,
  hw_version TEXT,
  area_id TEXT,
  disabled_by TEXT,
  entry_type TEXT,
  via_device_id TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(instance_id, ha_device_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_instance ON devices(instance_id);
CREATE INDEX IF NOT EXISTS idx_devices_area ON devices(area_id);

-- ─── Scenes Table ───────────────────────────────────────────────────────────
-- Synced HA scenes
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ha_instances(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  area_id TEXT,
  entity_ids JSONB,
  last_activated TIMESTAMP,
  activation_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(instance_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_scenes_instance ON scenes(instance_id);

-- ─── Scripts Table ──────────────────────────────────────────────────────────
-- Synced HA scripts
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ha_instances(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  mode TEXT,
  fields JSONB,
  sequence JSONB,
  last_triggered TIMESTAMP,
  trigger_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(instance_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_scripts_instance ON scripts(instance_id);

-- ─── Energy Sensors Table ───────────────────────────────────────────────────
-- Track energy-related entities specifically
CREATE TABLE IF NOT EXISTS energy_sensors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ha_instances(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  sensor_type TEXT NOT NULL, -- 'consumption', 'production', 'battery', 'cost', 'gas', 'water'
  unit_of_measurement TEXT,
  device_class TEXT,
  state_class TEXT,
  tariff_entity_id TEXT,
  cost_per_kwh NUMERIC,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(instance_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_energy_sensors_instance ON energy_sensors(instance_id);
CREATE INDEX IF NOT EXISTS idx_energy_sensors_type ON energy_sensors(sensor_type);

-- ─── Energy Daily Stats Table ───────────────────────────────────────────────
-- Daily energy consumption/production stats
CREATE TABLE IF NOT EXISTS energy_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  energy_sensor_id UUID NOT NULL REFERENCES energy_sensors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_consumption NUMERIC,
  total_production NUMERIC,
  net_consumption NUMERIC,
  peak_consumption NUMERIC,
  peak_time TEXT,
  cost_estimate NUMERIC,
  hourly_data JSONB, -- {"0": 0.5, "1": 0.3, ...}
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(energy_sensor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_energy_daily_date ON energy_daily_stats(date);

-- ─── Anomaly Alerts Table ───────────────────────────────────────────────────
-- Real-time anomaly detection results
CREATE TYPE anomaly_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE anomaly_status AS ENUM ('active', 'acknowledged', 'resolved', 'dismissed');

CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ha_instances(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  severity anomaly_severity NOT NULL DEFAULT 'info',
  status anomaly_status NOT NULL DEFAULT 'active',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  detected_value TEXT,
  expected_range TEXT,
  deviation_score NUMERIC,
  detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  resolved_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_instance ON anomaly_alerts(instance_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_status ON anomaly_alerts(status);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_severity ON anomaly_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_detected ON anomaly_alerts(detected_at);

-- ─── Blueprints Table ───────────────────────────────────────────────────────
-- AI-generated blueprints (exportable)
CREATE TYPE blueprint_status AS ENUM ('draft', 'active', 'exported', 'archived');

CREATE TABLE IF NOT EXISTS blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ha_instances(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES ai_analyses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL DEFAULT 'automation',
  source_entities JSONB,
  input_schema JSONB, -- Blueprint input definitions
  blueprint_yaml TEXT NOT NULL,
  status blueprint_status NOT NULL DEFAULT 'draft',
  exported_at TIMESTAMP,
  deploy_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blueprints_instance ON blueprints(instance_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_status ON blueprints(status);

-- ─── Pattern Definitions Table ──────────────────────────────────────────────
-- Learned patterns for adaptive analysis
CREATE TYPE pattern_type AS ENUM ('routine', 'correlation', 'threshold', 'sequence', 'seasonal');

CREATE TABLE IF NOT EXISTS learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES ha_instances(id) ON DELETE CASCADE,
  pattern_type pattern_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  entities JSONB NOT NULL, -- Array of entity IDs involved
  conditions JSONB, -- When pattern applies (time, day, season)
  pattern_data JSONB NOT NULL, -- Pattern-specific data
  confidence NUMERIC NOT NULL DEFAULT 0.5,
  occurrence_count INTEGER DEFAULT 1 NOT NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patterns_instance ON learned_patterns(instance_id);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_active ON learned_patterns(is_active);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON learned_patterns(confidence);

-- ─── Update entities table with area reference ──────────────────────────────
-- Add proper area reference if not exists (area_id already exists as TEXT, keep for HA reference)

-- ─── Add labels support to entities ─────────────────────────────────────────
ALTER TABLE entities ADD COLUMN IF NOT EXISTS labels JSONB;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS disabled_by TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS hidden_by TEXT;

-- ─── Dashboard Widgets Table ────────────────────────────────────────────────
-- User-configurable dashboard widgets
CREATE TYPE widget_type AS ENUM (
  'stats', 'entity_list', 'chart', 'insights', 'activity', 
  'health', 'energy', 'heatmap', 'areas', 'quick_actions'
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES ha_instances(id) ON DELETE CASCADE,
  widget_type widget_type NOT NULL,
  title TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 1, -- 1-4 columns
  height INTEGER NOT NULL DEFAULT 1, -- 1-3 rows
  config JSONB, -- Widget-specific configuration
  is_visible BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_widgets_user ON dashboard_widgets(user_id);
CREATE INDEX IF NOT EXISTS idx_widgets_position ON dashboard_widgets(position);
