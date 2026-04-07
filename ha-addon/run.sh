#!/usr/bin/env bash
set -eo pipefail

# ── Read HA Add-on Options ───────────────────────────────────
OPTIONS_FILE="/data/options.json"
if [ -f "$OPTIONS_FILE" ]; then
  echo "[addon] Reading configuration from $OPTIONS_FILE"
  ANTHROPIC_API_KEY=$(cat "$OPTIONS_FILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('anthropic_api_key',''))" 2>/dev/null || echo "")
  LOG_LEVEL=$(cat "$OPTIONS_FILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('log_level','info'))" 2>/dev/null || echo "info")
  SYNC_CRON=$(cat "$OPTIONS_FILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sync_cron_schedule','0 3 * * *'))" 2>/dev/null || echo "0 3 * * *")
  ANALYSIS_CRON=$(cat "$OPTIONS_FILE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('analysis_cron_schedule','0 4 * * 0'))" 2>/dev/null || echo "0 4 * * 0")
else
  echo "[addon] No options file found, using defaults"
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
  LOG_LEVEL="${LOG_LEVEL:-info}"
  SYNC_CRON="${SYNC_CRON_SCHEDULE:-0 3 * * *}"
  ANALYSIS_CRON="${ANALYSIS_CRON_SCHEDULE:-0 4 * * 0}"
fi

export ANTHROPIC_API_KEY
export LOG_LEVEL
export SYNC_CRON_SCHEDULE="$SYNC_CRON"
export ANALYSIS_CRON_SCHEDULE="$ANALYSIS_CRON"
export DEPLOY_MODE=home-assistant
export PORT=3000
export HOSTNAME=0.0.0.0

# ── Generate Secrets ─────────────────────────────────────────
SECRETS_FILE="/data/.secrets"
if [ -f "$SECRETS_FILE" ]; then
  echo "[addon] Loading existing secrets"
  . "$SECRETS_FILE"
else
  echo "[addon] Generating new secrets..."
  AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "AUTH_SECRET=$AUTH_SECRET" > "$SECRETS_FILE"
  echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
  echo "[addon] Secrets generated and saved"
fi
export AUTH_SECRET
export ENCRYPTION_KEY

# ── Initialize PostgreSQL ────────────────────────────────────
PG_DATA="/data/postgres"
PG_USER="smarthass"
PG_DB="smarthass"

# Ensure correct ownership
chown -R nextjs:nodejs /data/postgres 2>/dev/null || true
chown -R nextjs:nodejs /run/postgresql 2>/dev/null || true

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "[addon] Initializing PostgreSQL database..."
  su-exec nextjs initdb -D "$PG_DATA" --auth=trust --no-locale --encoding=UTF8
fi

# Start PostgreSQL
echo "[addon] Starting PostgreSQL..."
su-exec nextjs pg_ctl -D "$PG_DATA" -l /data/postgres.log -o "-k /run/postgresql" start

# Wait for PostgreSQL to be ready
echo "[addon] Waiting for PostgreSQL..."
RETRIES=30
until su-exec nextjs pg_isready -h /run/postgresql -q 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    echo "[addon] ERROR: PostgreSQL failed to start"
    cat /data/postgres.log
    exit 1
  fi
  sleep 1
done
echo "[addon] PostgreSQL is ready"

# Create database if it doesn't exist
su-exec nextjs createdb -h /run/postgresql "$PG_DB" 2>/dev/null || true

export DATABASE_URL="postgresql://$PG_USER:@localhost:5432/$PG_DB?host=/run/postgresql"

# ── Run Database Migrations ──────────────────────────────────
echo "[addon] Running database migrations..."
cd /app
su-exec nextjs npx drizzle-kit migrate 2>&1 || {
  echo "[addon] WARNING: Migrations may have failed, continuing anyway..."
}

# ── Supervisor Token ─────────────────────────────────────────
# SUPERVISOR_TOKEN is automatically injected by HA Supervisor
if [ -n "$SUPERVISOR_TOKEN" ]; then
  echo "[addon] Supervisor token available"
else
  echo "[addon] WARNING: No SUPERVISOR_TOKEN found — HA integration will be limited"
fi

# ── Start SmartHass ──────────────────────────────────────────
echo "[addon] Starting SmartHass..."

# Graceful shutdown handler
cleanup() {
  echo "[addon] Shutting down..."
  # Send SIGTERM to the Node.js process (handled by server.ts)
  if [ -n "$APP_PID" ]; then
    kill -TERM "$APP_PID" 2>/dev/null
    wait "$APP_PID" 2>/dev/null
  fi
  # Stop PostgreSQL
  echo "[addon] Stopping PostgreSQL..."
  su-exec nextjs pg_ctl -D "$PG_DATA" -m fast stop 2>/dev/null
  echo "[addon] Shutdown complete"
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start the application
su-exec nextjs node server.js &
APP_PID=$!

echo "[addon] SmartHass is running (PID: $APP_PID)"

# Wait for the app process
wait "$APP_PID"
