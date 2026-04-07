-- Add hourly activity breakdown to daily stats for time-of-day pattern analysis
ALTER TABLE "entity_daily_stats" ADD COLUMN "hourly_activity" jsonb;

-- This stores a map of hour (0-23) to state change count, e.g.:
-- {"0": 0, "1": 0, ..., "7": 5, "8": 12, ..., "22": 3, "23": 1}
-- Enables the AI to find temporal correlations between devices
