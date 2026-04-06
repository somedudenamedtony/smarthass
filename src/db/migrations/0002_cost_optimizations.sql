ALTER TABLE ha_instances ALTER COLUMN analysis_window_days SET DEFAULT 7;
ALTER TABLE ha_instances ADD COLUMN IF NOT EXISTS last_analysis_hash TEXT;
