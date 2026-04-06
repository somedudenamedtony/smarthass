import { stringify, parse } from "yaml";

/**
 * Validates and formats a Home Assistant automation YAML string.
 * Returns { valid, yaml, error }.
 */
export function formatAutomationYaml(input: string): {
  valid: boolean;
  yaml: string;
  error?: string;
} {
  try {
    // Parse the input to validate it's proper YAML
    const parsed = parse(input);

    if (!parsed || typeof parsed !== "object") {
      return { valid: false, yaml: input, error: "Not a valid YAML object" };
    }

    // Basic structural validation for HA automation
    const auto = parsed as Record<string, unknown>;

    // Must have at minimum a trigger and action (alias is optional)
    const hasTrigger =
      "trigger" in auto || "triggers" in auto;
    const hasAction =
      "action" in auto || "actions" in auto;

    if (!hasTrigger) {
      return {
        valid: false,
        yaml: stringify(parsed, { lineWidth: 120 }),
        error: "Missing trigger/triggers field",
      };
    }

    if (!hasAction) {
      return {
        valid: false,
        yaml: stringify(parsed, { lineWidth: 120 }),
        error: "Missing action/actions field",
      };
    }

    // Re-serialize with clean formatting
    const formatted = stringify(parsed, { lineWidth: 120 });
    return { valid: true, yaml: formatted };
  } catch (e) {
    return {
      valid: false,
      yaml: input,
      error: e instanceof Error ? e.message : "Invalid YAML",
    };
  }
}
