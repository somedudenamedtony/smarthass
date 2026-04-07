# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# Clone the full project source (HA Supervisor build context is ha-addon/ only)
ARG SMARTHASS_REPO=https://github.com/somedudenamedtony/smarthass.git
ARG SMARTHASS_REF=main
RUN git clone --depth=1 --branch=${SMARTHASS_REF} ${SMARTHASS_REPO} .

RUN npm ci

ENV NEXT_TELEMETRY_DISABLED=1
ENV DEPLOY_MODE=home-assistant

RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DEPLOY_MODE=home-assistant

# Install PostgreSQL 16
RUN apk add --no-cache postgresql16 postgresql16-contrib su-exec bash

# Create app user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create PostgreSQL data and run directories
RUN mkdir -p /data/postgres /run/postgresql && \
    chown -R nextjs:nodejs /data /run/postgresql

# Copy application files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/db/migrations ./migrations

# Copy add-on entrypoint (from ha-addon/ build context)
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 3000

CMD ["/run.sh"]
