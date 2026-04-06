/**
 * Custom server entry for self-hosted mode.
 * Wraps Next.js with node-cron scheduler startup.
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

  const server = createServer(handle);

  server.listen(port, () => {
    console.log(`> SmartHass ready on http://${hostname}:${port}`);
    console.log(`> Mode: ${process.env.DEPLOY_MODE || "cloud"}`);
  });
});
