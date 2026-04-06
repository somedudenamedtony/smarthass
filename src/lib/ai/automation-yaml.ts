import { stringify, parse } from "yaml";

export interface ValidationResult {
  valid: boolean;
  yaml: string;
  errors: string[];
  warnings: string[];
}

const KNOWN_TRIGGER_PLATFORMS = new Set([
  "state", "numeric_state", "time", "time_pattern", "sun",
  "zone", "event", "mqtt", "webhook", "template",
  "homeassistant", "device", "tag", "geo_location",
  "calendar", "conversation",
]);

/**
 * Extract all entity_id references from an automation config object.
 */
function extractEntityIds(obj: unknown): string[] {
  const ids: string[] = [];
  if (typeof obj === "string" && obj.includes(".") && !obj.includes(" ")) {
    // Looks like an entity_id (e.g., "light.kitchen")
    const parts = obj.split(".");
    if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
      ids.push(obj);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      ids.push(...extractEntityIds(item));
    }
  } else if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "entity_id" || key === "entity") {
        if (typeof value === "string") ids.push(value);
        if (Array.isArray(value)) ids.push(...value.filter((v): v is string => typeof v === "string"));
      } else {
        ids.push(...extractEntityIds(value));
      }
    }
  }
  return [...new Set(ids)];
}

/**
 * Extract all service calls (domain.service) from an automation config.
 */
function extractServiceCalls(obj: unknown): string[] {
  const services: string[] = [];
  if (Array.isArray(obj)) {
    for (const item of obj) {
      services.push(...extractServiceCalls(item));
    }
  } else if (obj && typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    if (typeof record.service === "string") {
      services.push(record.service);
    }
    // Also check "action" format used in newer HA versions
    if (typeof record.action === "string" && record.action.includes(".")) {
      services.push(record.action);
    }
    for (const value of Object.values(record)) {
      services.push(...extractServiceCalls(value));
    }
  }
  return [...new Set(services)];
}

/**
 * Validates and formats a Home Assistant automation YAML string.
 * Returns structured validation result with errors and warnings.
 */
export function formatAutomationYaml(input: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = parse(input);
  } catch (e) {
    return {
      valid: false,
      yaml: input,
      errors: [e instanceof Error ? e.message : "Invalid YAML"],
      warnings: [],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { valid: false, yaml: input, errors: ["Not a valid YAML object"], warnings: [] };
  }

  const auto = parsed as Record<string, unknown>;

  // Must have trigger and action
  const hasTrigger = "trigger" in auto || "triggers" in auto;
  const hasAction = "action" in auto || "actions" in auto;

  if (!hasTrigger) errors.push("Missing trigger/triggers field");
  if (!hasAction) errors.push("Missing action/actions field");

  // Validate trigger platforms
  const triggers = (auto.trigger ?? auto.triggers) as unknown;
  if (triggers) {
    const triggerList = Array.isArray(triggers) ? triggers : [triggers];
    for (const t of triggerList) {
      if (t && typeof t === "object" && "platform" in (t as Record<string, unknown>)) {
        const platform = (t as Record<string, unknown>).platform as string;
        if (!KNOWN_TRIGGER_PLATFORMS.has(platform)) {
          warnings.push(`Unknown trigger platform: "${platform}"`);
        }
      }
    }
  }

  // Check for alias (recommended but not required)
  if (!auto.alias) {
    warnings.push("No alias specified — the automation will have no friendly name in HA");
  }

  const yaml = stringify(parsed, { lineWidth: 120 });
  return { valid: errors.length === 0, yaml, errors, warnings };
}

/**
 * Validate automation YAML against a live HA instance.
 * Checks entity_ids and service calls actually exist.
 */
export async function validateAgainstHA(
  yamlString: string,
  knownEntityIds: Set<string>,
  knownServices: Set<string>
): Promise<{ errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = parse(yamlString);
  } catch {
    return { errors: ["Invalid YAML"], warnings: [] };
  }

  if (!parsed || typeof parsed !== "object") {
    return { errors: ["Not a valid YAML object"], warnings: [] };
  }

  // Check entity IDs
  const referencedEntities = extractEntityIds(parsed);
  const missingEntities = referencedEntities.filter((id) => !knownEntityIds.has(id));
  if (missingEntities.length > 0) {
    errors.push(`Entity IDs not found on HA instance: ${missingEntities.join(", ")}`);
  }

  // Check service calls
  const referencedServices = extractServiceCalls(parsed);
  for (const svc of referencedServices) {
    const [domain] = svc.split(".");
    // Check if the domain at least exists in known services
    if (knownServices.size > 0 && !knownServices.has(domain)) {
      warnings.push(`Service domain "${domain}" not found on HA instance (from "${svc}")`);
    }
  }

  return { errors, warnings };
}

/**
 * Helper to collect known services as a Set of domain names from HAClient.getServices() result.
 */
export function buildServiceDomainSet(
  services: { domain: string }[]
): Set<string> {
  return new Set(services.map((s) => s.domain));
}
