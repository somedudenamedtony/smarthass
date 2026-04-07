/**
 * Custom server entry for self-hosted and HA add-on modes.
 * Wraps Next.js with node-cron scheduler and WebSocket sync.
 * On Vercel (cloud mode), this file is not used — Next.js runs natively.
 */
import { createServer } from "http";
import next from "next";
import { startScheduler, registerJob } from "./src/lib/scheduler";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Track WebSocket managers for graceful shutdown
let wsManagers: Array<{
  ws: InstanceType<typeof import("./src/lib/ha-websocket").HAWebSocketManager>;
  aggregator: InstanceType<typeof import("./src/lib/state-aggregator").StateAggregator>;
}> = [];

app.prepare().then(async () => {
  // Register scheduled jobs
  const syncSchedule = process.env.SYNC_CRON_SCHEDULE || "0 3 * * *";
  const analysisSchedule =
    process.env.ANALYSIS_CRON_SCHEDULE || "0 4 * * 0";

  registerJob("daily-sync", syncSchedule, async () => {
    // Trigger the daily sync API route internally
    try {
      const res = await fetch(
        `http://localhost:${port}/api/cron/daily-sync`,
        {
          method: "POST",
          headers: { "x-cron-secret": "internal" },
        }
      );
      if (!res.ok) {
        console.error(`[daily-sync] HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("[daily-sync] Failed to trigger:", err);
    }
  });

  registerJob("weekly-analysis", analysisSchedule, async () => {
    try {
      const res = await fetch(
        `http://localhost:${port}/api/cron/weekly-analysis`,
        {
          method: "POST",
          headers: { "x-cron-secret": "internal" },
        }
      );
      if (!res.ok) {
        console.error(`[weekly-analysis] HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("[weekly-analysis] Failed to trigger:", err);
    }
  });

  await startScheduler();

  // Start WebSocket continuous sync for HA add-on mode
  if (process.env.DEPLOY_MODE === "home-assistant") {
    await startContinuousSync();
  }

  const server = createServer(handle);

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    console.log(`> Received ${signal}, shutting down gracefully...`);
    for (const { ws, aggregator } of wsManagers) {
      await aggregator.shutdown();
      ws.disconnect();
    }
    server.close(() => {
      console.log("> Server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  server.listen(port, () => {
    console.log(`> SmartHass ready on http://${hostname}:${port}`);
    console.log(`> Mode: ${process.env.DEPLOY_MODE || "cloud"}`);
  });
});

/**
 * Start WebSocket connections to all connected HA instances
 * for continuous real-time state sync.
 */
async function startContinuousSync() {
  try {
    // Dynamic imports to avoid bundling these in cloud mode
    const { HAWebSocketManager } = await import("./src/lib/ha-websocket");
    const { StateAggregator } = await import("./src/lib/state-aggregator");
    const { db } = await import("./src/db");
    const schema = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { decrypt } = await import("./src/lib/encryption");

    const instances = await db
      .select()
      .from(schema.haInstances)
      .where(eq(schema.haInstances.status, "connected"));

    if (instances.length === 0) {
      console.log("[ws] No connected HA instances found — skipping continuous sync");
      console.log("[ws] Continuous sync will start after setup completes");
      return;
    }

    for (const instance of instances) {
      try {
        const token = decrypt(instance.encryptedToken);
        const wsManager = new HAWebSocketManager(instance.url, token);
        const aggregator = new StateAggregator(instance.id);

        await aggregator.initialize();

        wsManager.onEvent((event) => {
          aggregator.onStateChanged(event);
        });

        await wsManager.connect();

        wsManagers.push({ ws: wsManager, aggregator });

        console.log(`[ws] Started continuous sync for instance: ${instance.name}`);
      } catch (err) {
        console.error(`[ws] Failed to start sync for ${instance.name}:`, err);
      }
    }
  } catch (err) {
    console.error("[ws] Failed to start continuous sync:", err);
  }
}

/**
 * Start continuous sync for a specific instance (called after auto-setup).
 * Exported so the setup API route can trigger it.
 */
export async function startInstanceSync(instanceId: string, url: string, encryptedToken: string, name: string) {
  try {
    const { HAWebSocketManager } = await import("./src/lib/ha-websocket");
    const { StateAggregator } = await import("./src/lib/state-aggregator");
    const { decrypt } = await import("./src/lib/encryption");

    const token = decrypt(encryptedToken);
    const wsManager = new HAWebSocketManager(url, token);
    const aggregator = new StateAggregator(instanceId);

    await aggregator.initialize();

    wsManager.onEvent((event) => {
      aggregator.onStateChanged(event);
    });

    await wsManager.connect();

    wsManagers.push({ ws: wsManager, aggregator });

    console.log(`[ws] Started continuous sync for instance: ${name}`);
  } catch (err) {
    console.error(`[ws] Failed to start sync for ${name}:`, err);
  }
}
