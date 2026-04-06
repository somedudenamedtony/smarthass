CREATE TABLE IF NOT EXISTS rate_limit_entries (
  key TEXT PRIMARY KEY,
  timestamps JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_updated_at ON rate_limit_entries (updated_at);
