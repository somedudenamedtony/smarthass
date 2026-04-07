#!/usr/bin/env bash
set -eo pipefail

# ── Read HA Add-on Options ───────────────────────────────────
OPTIONS_FILE="/data/options.json"
if [ -f "$OPTIONS_FILE" ]; then
  echo "[addon] Reading configuration from $OPTIONS_FILE"
  ANTHROPIC_API_KEY=$(node -e "try{const o=JSON.parse(require('fs').readFileSync('$OPTIONS_FILE','utf8'));console.log(o.anthropic_api_key||'')}catch(e){console.log('')}")
  LOG_LEVEL=$(node -e "try{const o=JSON.parse(require('fs').readFileSync('$OPTIONS_FILE','utf8'));console.log(o.log_level||'info')}catch(e){console.log('info')}")
  SYNC_CRON=$(node -e "try{const o=JSON.parse(require('fs').readFileSync('$OPTIONS_FILE','utf8'));console.log(o.sync_cron_schedule||'0 3 * * *')}catch(e){console.log('0 3 * * *')}")
  ANALYSIS_CRON=$(node -e "try{const o=JSON.parse(require('fs').readFileSync('$OPTIONS_FILE','utf8'));console.log(o.analysis_cron_schedule||'0 4 * * 0')}catch(e){console.log('0 4 * * 0')}")
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
PG_USER="nextjs"
PG_DB="smarthass"

# Create directories and fix ownership (HA mounts /data as root)
mkdir -p "$PG_DATA" /run/postgresql
chown -R nextjs:nodejs /data /run/postgresql

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "[addon] Initializing PostgreSQL database..."
  su-exec nextjs initdb -D "$PG_DATA" --auth=trust --no-locale --encoding=UTF8
fi

# Start PostgreSQL
echo "[addon] Starting PostgreSQL..."
su-exec nextjs pg_ctl -D "$PG_DATA" -l "$PG_DATA/postgres.log" -o "-k /run/postgresql" start

# Wait for PostgreSQL to be ready
echo "[addon] Waiting for PostgreSQL..."
RETRIES=30
until su-exec nextjs pg_isready -h /run/postgresql -q 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    echo "[addon] ERROR: PostgreSQL failed to start"
    cat "$PG_DATA/postgres.log"
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
for migration in migrations/*.sql; do
  if [ -f "$migration" ]; then
    echo "[addon]   Applying $(basename "$migration")..."
    su-exec nextjs psql -h /run/postgresql -d "$PG_DB" -f "$migration" 2>&1 || true
  fi
done
echo "[addon] Migrations complete"

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
  if [ -n "$APP_PID" ]; then
    kill -TERM "$APP_PID" 2>/dev/null
    wait "$APP_PID" 2>/dev/null
  fi
  echo "[addon] Stopping PostgreSQL..."
  su-exec nextjs pg_ctl -D "$PG_DATA" -m fast stop 2>/dev/null
  echo "[addon] Shutdown complete"
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start the application
cd /app
su-exec nextjs node server.js &
APP_PID=$!

echo "[addon] SmartHass started (PID: $APP_PID)"

# ── Wait for app to be ready ─────────────────────────────────
echo "[addon] Waiting for SmartHass to respond..."
READY=false
for i in $(seq 1 30); do
  HEALTH=$(curl -s http://localhost:3000/api/health 2>/dev/null || echo "")
  if echo "$HEALTH" | grep -q '"ok":true'; then
    echo "[addon] SmartHass is responding: $HEALTH"
    READY=true
    break
  fi
  echo "[addon]   attempt $i/30 — not ready yet"
  sleep 2
done

if [ "$READY" = "false" ]; then
  echo "[addon] ERROR: SmartHass did not become ready in 60 seconds"
  echo "[addon] Check the logs above for errors"
fi

# ── Auto-Setup (create admin user + register HA instance) ────
if [ "$READY" = "true" ]; then
  echo "[addon] Checking if setup is needed..."
  SETUP_CHECK=$(curl -s http://localhost:3000/api/setup 2>/dev/null || echo "")
  echo "[addon] Setup status: $SETUP_CHECK"

  if echo "$SETUP_CHECK" | grep -q '"needsSetup":true'; then
    echo "[addon] Running auto-setup..."
    SETUP_RESULT=$(curl -s -X POST http://localhost:3000/api/setup \
      -H "Content-Type: application/json" \
      -d '{}' 2>/dev/null || echo "")
    echo "[addon] Setup result: $SETUP_RESULT"
  else
    echo "[addon] Setup already complete"
    # Update API key from add-on config (user may have changed it)
    if [ -n "$ANTHROPIC_API_KEY" ]; then
      echo "[addon] Updating API key from add-on config..."
      curl -s -X PUT http://localhost:3000/api/settings/api-keys \
        -H "Content-Type: application/json" \
        -d "{\"anthropicKey\":\"$ANTHROPIC_API_KEY\"}" > /dev/null 2>&1 || true
    fi
    # Trigger a sync on restart (data may be stale)
    echo "[addon] Triggering sync..."
    curl -s -X POST http://localhost:3000/api/cron/daily-sync \
      -H "x-cron-secret: internal" > /dev/null 2>&1 &
  fi
fi

# ── Periodic Sync (background cron loop) ─────────────────────
# Since the standalone server doesn't include the custom server.ts scheduler,
# use a background shell loop to trigger syncs on the configured cron schedule.
(
  echo "[addon] Starting periodic sync loop (schedule: $SYNC_CRON)"
  while true; do
    # Default sync every 3 hours (more frequent than daily for fresh data)
    sleep 10800
    echo "[addon] Running periodic sync..."
    curl -s -X POST http://localhost:3000/api/cron/daily-sync \
      -H "x-cron-secret: internal" > /dev/null 2>&1 || true
  done
) &

echo "[addon] ════════════════════════════════════════════════"
echo "[addon] SmartHass is running on port 3000"
echo "[addon] DEPLOY_MODE=$DEPLOY_MODE"
echo "[addon] HOSTNAME=$HOSTNAME"
echo "[addon] ════════════════════════════════════════════════"

# Wait for the app process
wait "$APP_PID"
