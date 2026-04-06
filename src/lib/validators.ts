import { z } from "zod";

// ── Shared schemas ──────────────────────────────────────────────────────────

export const uuidSchema = z.string().uuid();

export const instanceIdSchema = z.string().uuid("Invalid instanceId format");

// ── Analysis route ──────────────────────────────────────────────────────────

export const analysisBodySchema = z.object({
  instanceId: instanceIdSchema,
  category: z
    .enum([
      "usage_patterns",
      "anomaly_detection",
      "automation_gaps",
      "efficiency",
      "cross_device_correlation",
      "device_suggestions",
    ])
    .optional(),
});

// ── Deploy automation route ─────────────────────────────────────────────────

export const deployBodySchema = z.object({
  insightId: uuidSchema,
  instanceId: instanceIdSchema,
  yamlOverride: z.string().optional(),
});

// ── Entity tracking toggle ──────────────────────────────────────────────────

export const entityPatchSchema = z.object({
  id: uuidSchema,
  isTracked: z.boolean(),
});

// ── Insight status update ───────────────────────────────────────────────────

export const insightPatchSchema = z.object({
  id: uuidSchema.optional(),
  ids: z.array(uuidSchema).optional(),
  status: z.enum(["new", "viewed", "dismissed", "applied"]),
}).refine((data) => data.id || (data.ids && data.ids.length > 0), {
  message: "Either id or ids must be provided",
});

// ── Setup route ─────────────────────────────────────────────────────────────

export const setupBodySchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// ── Dashboard preferences ───────────────────────────────────────────────────

export const dashboardPreferencesSchema = z.object({
  widgetOrder: z.array(z.string()).optional(),
  hiddenWidgets: z.array(z.string()).optional(),
  pinnedEntityIds: z.array(z.string()).optional(),
});

// ── Helper to format Zod errors ─────────────────────────────────────────────

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
}
