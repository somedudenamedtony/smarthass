import { isSelfHosted } from "@/lib/config";

type ScheduledJob = {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
};

const jobs: ScheduledJob[] = [];

export function registerJob(
  name: string,
  schedule: string,
  handler: () => Promise<void>
) {
  jobs.push({ name, schedule, handler });
}

export async function startScheduler() {
  if (!isSelfHosted()) {
    // On Vercel, scheduling is handled by Vercel Cron — nothing to start
    return;
  }

  // Dynamic import to avoid bundling node-cron on Vercel
  const { schedule } = await import("node-cron");

  for (const job of jobs) {
    schedule(job.schedule, async () => {
      console.log(`[scheduler] Running job: ${job.name}`);
      try {
        await job.handler();
        console.log(`[scheduler] Job completed: ${job.name}`);
      } catch (error) {
        console.error(`[scheduler] Job failed: ${job.name}`, error);
      }
    });
    console.log(`[scheduler] Registered job: ${job.name} (${job.schedule})`);
  }
}

export function getRegisteredJobs() {
  return jobs.map((j) => ({ name: j.name, schedule: j.schedule }));
}
