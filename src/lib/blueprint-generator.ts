import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import YAML from "yaml";

export interface BlueprintInput {
  name: string;
  description?: string;
  selector: BlueprintSelector;
  default?: unknown;
}

export type BlueprintSelector =
  | { entity: { domain?: string | string[]; device_class?: string } }
  | { device: { integration?: string } }
  | { area: Record<string, never> }
  | { time: Record<string, never> }
  | { number: { min: number; max: number; step?: number; unit_of_measurement?: string } }
  | { boolean: Record<string, never> }
  | { text: { multiline?: boolean } }
  | { select: { options: string[] } };

export interface BlueprintMetadata {
  name: string;
  description: string;
  domain: "automation" | "script";
  source_url?: string;
  author?: string;
  input?: Record<string, BlueprintInput>;
}

export interface GeneratedBlueprint {
  blueprint: BlueprintMetadata;
  trigger?: unknown[];
  condition?: unknown[];
  action: unknown[];
  mode?: "single" | "restart" | "queued" | "parallel";
}

/**
 * Blueprint generator service.
 * Converts automation suggestions into reusable HA blueprints.
 */
export class BlueprintGenerator {
  /**
   * Generate a blueprint from an automation suggestion.
   */
  generateFromAutomation(
    name: string,
    description: string,
    automation: {
      trigger?: unknown[];
      condition?: unknown[];
      action: unknown[];
      mode?: string;
    },
    options: {
      parameterizeEntities?: boolean;
      parameterizeTime?: boolean;
      parameterizeThresholds?: boolean;
    } = {}
  ): GeneratedBlueprint {
    const inputs: Record<string, BlueprintInput> = {};
    let trigger = automation.trigger ? [...automation.trigger] : undefined;
    let condition = automation.condition ? [...automation.condition] : undefined;
    let action = [...automation.action];

    // Extract and parameterize entities
    if (options.parameterizeEntities !== false) {
      const result = this.parameterizeEntities(trigger, condition, action, inputs);
      trigger = result.trigger;
      condition = result.condition;
      action = result.action;
    }

    // Extract and parameterize time values
    if (options.parameterizeTime !== false) {
      const result = this.parameterizeTime(trigger, condition, inputs);
      trigger = result.trigger;
      condition = result.condition;
    }

    // Extract and parameterize numeric thresholds
    if (options.parameterizeThresholds !== false) {
      const result = this.parameterizeThresholds(trigger, condition, inputs);
      trigger = result.trigger;
      condition = result.condition;
    }

    return {
      blueprint: {
        name,
        description,
        domain: "automation",
        input: Object.keys(inputs).length > 0 ? inputs : undefined,
      },
      trigger,
      condition: condition && condition.length > 0 ? condition : undefined,
      action,
      mode: automation.mode as GeneratedBlueprint["mode"],
    };
  }

  /**
   * Convert a GeneratedBlueprint to YAML string.
   */
  toYaml(blueprint: GeneratedBlueprint): string {
    return YAML.stringify(blueprint, {
      indent: 2,
      lineWidth: 0,
      defaultKeyType: "PLAIN",
      defaultStringType: "QUOTE_DOUBLE",
    });
  }

  /**
   * Store a generated blueprint in the database.
   */
  async storeBlueprint(
    instanceId: string,
    analysisId: string | null,
    name: string,
    description: string,
    blueprint: GeneratedBlueprint,
    sourceEntities: string[]
  ): Promise<string> {
    const result = await db
      .insert(schema.blueprints)
      .values({
        instanceId,
        analysisId,
        name,
        description,
        domain: blueprint.blueprint.domain,
        sourceEntities,
        inputSchema: blueprint.blueprint.input,
        blueprintYaml: this.toYaml(blueprint),
        status: "draft",
      })
      .returning();

    return result[0].id;
  }

  /**
   * Get all blueprints for an instance.
   */
  async getBlueprints(instanceId: string) {
    return db
      .select()
      .from(schema.blueprints)
      .where(eq(schema.blueprints.instanceId, instanceId))
      .orderBy(schema.blueprints.createdAt);
  }

  /**
   * Get a single blueprint by ID.
   */
  async getBlueprint(blueprintId: string) {
    const result = await db
      .select()
      .from(schema.blueprints)
      .where(eq(schema.blueprints.id, blueprintId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Update blueprint status.
   */
  async updateStatus(
    blueprintId: string,
    status: "draft" | "active" | "exported" | "archived"
  ) {
    const updates: Partial<typeof schema.blueprints.$inferInsert> = { status };
    if (status === "exported") {
      updates.exportedAt = new Date();
    }
    await db
      .update(schema.blueprints)
      .set(updates)
      .where(eq(schema.blueprints.id, blueprintId));
  }

  /**
   * Increment deploy count for a blueprint.
   */
  async incrementDeployCount(blueprintId: string) {
    await db
      .update(schema.blueprints)
      .set({
        deployCount: (await this.getBlueprint(blueprintId))?.deployCount ?? 0 + 1,
      })
      .where(eq(schema.blueprints.id, blueprintId));
  }

  /**
   * Delete a blueprint.
   */
  async deleteBlueprint(blueprintId: string) {
    await db.delete(schema.blueprints).where(eq(schema.blueprints.id, blueprintId));
  }

  // ─── Private Helper Methods ─────────────────────────────────────────────────

  private parameterizeEntities(
    trigger: unknown[] | undefined,
    condition: unknown[] | undefined,
    action: unknown[],
    inputs: Record<string, BlueprintInput>
  ) {
    const entityCounter: Record<string, number> = {};

    const replaceEntity = (obj: unknown, path: string[] = []): unknown => {
      if (!obj || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) {
        return obj.map((item, i) => replaceEntity(item, [...path, String(i)]));
      }

      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (key === "entity_id" && typeof value === "string") {
          const domain = value.split(".")[0];
          const inputName = this.getInputName(domain, entityCounter);
          
          if (!inputs[inputName]) {
            inputs[inputName] = {
              name: `${this.capitalize(domain)} Entity`,
              description: `Select the ${domain} entity to use`,
              selector: { entity: { domain } },
            };
          }
          
          result[key] = `!input ${inputName}`;
        } else {
          result[key] = replaceEntity(value, [...path, key]);
        }
      }
      return result;
    };

    return {
      trigger: trigger ? replaceEntity(trigger) as unknown[] : undefined,
      condition: condition ? replaceEntity(condition) as unknown[] : undefined,
      action: replaceEntity(action) as unknown[],
    };
  }

  private parameterizeTime(
    trigger: unknown[] | undefined,
    condition: unknown[] | undefined,
    inputs: Record<string, BlueprintInput>
  ) {
    let timeCounter = 0;

    const replaceTime = (obj: unknown): unknown => {
      if (!obj || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) {
        return obj.map((item) => replaceTime(item));
      }

      const result: Record<string, unknown> = {};
      const objRecord = obj as Record<string, unknown>;

      for (const [key, value] of Object.entries(objRecord)) {
        if ((key === "at" || key === "after" || key === "before") && typeof value === "string") {
          // Check if it looks like a time (HH:MM or HH:MM:SS)
          if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
            const inputName = `time_${++timeCounter}`;
            inputs[inputName] = {
              name: `${this.capitalize(key)} Time`,
              description: `Time for ${key} condition`,
              selector: { time: {} },
              default: value,
            };
            result[key] = `!input ${inputName}`;
            continue;
          }
        }
        result[key] = replaceTime(value);
      }
      return result;
    };

    return {
      trigger: trigger ? replaceTime(trigger) as unknown[] : undefined,
      condition: condition ? replaceTime(condition) as unknown[] : undefined,
    };
  }

  private parameterizeThresholds(
    trigger: unknown[] | undefined,
    condition: unknown[] | undefined,
    inputs: Record<string, BlueprintInput>
  ) {
    let thresholdCounter = 0;

    const replaceThreshold = (obj: unknown): unknown => {
      if (!obj || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) {
        return obj.map((item) => replaceThreshold(item));
      }

      const result: Record<string, unknown> = {};
      const objRecord = obj as Record<string, unknown>;

      for (const [key, value] of Object.entries(objRecord)) {
        if ((key === "above" || key === "below") && typeof value === "number") {
          const inputName = `threshold_${++thresholdCounter}`;
          inputs[inputName] = {
            name: `${this.capitalize(key)} Threshold`,
            description: `Numeric threshold for ${key} condition`,
            selector: { 
              number: { 
                min: 0, 
                max: key === "above" ? value * 2 : value * 3,
                step: value >= 10 ? 1 : 0.1,
              } 
            },
            default: value,
          };
          result[key] = `!input ${inputName}`;
        } else {
          result[key] = replaceThreshold(value);
        }
      }
      return result;
    };

    return {
      trigger: trigger ? replaceThreshold(trigger) as unknown[] : undefined,
      condition: condition ? replaceThreshold(condition) as unknown[] : undefined,
    };
  }

  private getInputName(domain: string, counter: Record<string, number>): string {
    counter[domain] = (counter[domain] ?? 0) + 1;
    if (counter[domain] === 1) {
      return `${domain}_entity`;
    }
    return `${domain}_entity_${counter[domain]}`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
  }
}

/**
 * Create a default blueprint generator instance.
 */
export function createBlueprintGenerator() {
  return new BlueprintGenerator();
}
