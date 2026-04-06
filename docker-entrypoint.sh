#!/bin/sh
set -e

# Auto-generate AUTH_SECRET if not set
if [ -z "$AUTH_SECRET" ]; then
  SECRETS_FILE="/app/data/.secrets"
  mkdir -p /app/data

  if [ -f "$SECRETS_FILE" ]; then
    . "$SECRETS_FILE"
    export AUTH_SECRET ENCRYPTION_KEY
  else
    AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "AUTH_SECRET=$AUTH_SECRET" > "$SECRETS_FILE"
    echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> "$SECRETS_FILE"
    chmod 600 "$SECRETS_FILE"
    export AUTH_SECRET ENCRYPTION_KEY
    echo "> Generated AUTH_SECRET and ENCRYPTION_KEY (persisted to $SECRETS_FILE)"
  fi
fi

# Auto-generate ENCRYPTION_KEY if not set (but AUTH_SECRET was set externally)
if [ -z "$ENCRYPTION_KEY" ]; then
  SECRETS_FILE="/app/data/.secrets"
  mkdir -p /app/data

  if [ -f "$SECRETS_FILE" ] && grep -q ENCRYPTION_KEY "$SECRETS_FILE"; then
    . "$SECRETS_FILE"
    export ENCRYPTION_KEY
  else
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> "$SECRETS_FILE"
    chmod 600 "$SECRETS_FILE"
    export ENCRYPTION_KEY
    echo "> Generated ENCRYPTION_KEY (persisted to $SECRETS_FILE)"
  fi
fi

exec "$@"
