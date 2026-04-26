# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# Clone the full project source (HA Supervisor build context is ha-addon/ only)
ARG SMARTHASS_REPO=https://github.com/somedudenamedtony/smarthass.git
ARG SMARTHASS_REF=main
# Version tag forces Docker to invalidate cache and re-clone on each release
RUN echo "SmartHass v1.5.2" && git clone --depth=1 --branch=${SMARTHASS_REF} ${SMARTHASS_REPO} .

RUN npm ci

ENV NEXT_TELEMETRY_DISABLED=1
ENV DEPLOY_MODE=home-assistant

# Dummy DATABASE_URL for build — Next.js static page collection imports db module
# The lazy proxy in db/index.ts prevents actual connections at build time
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

RUN npm run build

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DEPLOY_MODE=home-assistant
# Bind to all interfaces — Docker sets HOSTNAME to the container ID by default,
# which can prevent the Supervisor Ingress proxy from reaching the server
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Install PostgreSQL 16
RUN apk add --no-cache postgresql16 postgresql16-contrib su-exec bash curl

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
COPY --from=builder /app/src/db/migrations ./migrations

# Copy add-on entrypoint (from ha-addon/ build context)
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 3000

CMD ["/run.sh"]
