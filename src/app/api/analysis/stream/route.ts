import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { runAllAnalyses } from "@/lib/ai/analysis-service";
import { rateLimit } from "@/lib/rate-limit";
import { hasConfig } from "@/lib/app-config";
import { NextRequest } from "next/server";

/**
 * GET /api/analysis/stream?instanceId=xxx — SSE streaming analysis
 * Streams progress events as each category completes.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const instanceId = request.nextUrl.searchParams.get("instanceId");
  if (!instanceId) {
    return new Response(JSON.stringify({ error: "instanceId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit: 5 analysis runs per user per 10 minutes
  const { allowed } = await rateLimit(
    `analysis:${session.user.id}`,
    5,
    600_000
  );
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please wait before running another analysis." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // Verify ownership
  const instance = await db
    .select({ id: schema.haInstances.id })
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance[0]) {
    return new Response(JSON.stringify({ error: "Instance not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!(await hasConfig("ANTHROPIC_API_KEY"))) {
    return new Response(
      JSON.stringify({ error: "Anthropic API key is not configured." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        send("progress", { step: "starting", status: "running" });

        const results = await runAllAnalyses(instanceId, (event) => {
          send("progress", event);
        });

        const totalInsights = Object.values(results).reduce((a, b) => a + b, 0);
        send("complete", { success: true, totalInsights, results });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Analysis failed";
        console.error("[analysis/stream] Error:", msg);
        send("error", { error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
