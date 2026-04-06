import { decrypt } from "@/lib/encryption";

export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

export interface HAConfig {
  location_name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  unit_system: Record<string, string>;
  time_zone: string;
  version: string;
  components: string[];
}

export interface HAService {
  domain: string;
  services: Record<
    string,
    {
      description: string;
      fields: Record<string, unknown>;
    }
  >;
}

export interface HALogEntry {
  name: string;
  message: string;
  entity_id?: string;
  when: string;
  domain?: string;
  state?: string;
}

export class HAClientError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "HAClientError";
  }
}

export class HAClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, encryptedToken: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = decrypt(encryptedToken);
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new HAClientError(
        `HA API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    return response.json() as Promise<T>;
  }

  /** Check if the HA instance is reachable and the token is valid. */
  async healthCheck(): Promise<{ ok: boolean; version?: string }> {
    try {
      const config = await this.getConfig();
      return { ok: true, version: config.version };
    } catch {
      return { ok: false };
    }
  }

  /** Get HA configuration. */
  async getConfig(): Promise<HAConfig> {
    return this.request<HAConfig>("/api/config");
  }

  /** Get all current entity states. */
  async getStates(): Promise<HAState[]> {
    return this.request<HAState[]>("/api/states");
  }

  /** Get a single entity state. */
  async getState(entityId: string): Promise<HAState> {
    return this.request<HAState>(`/api/states/${encodeURIComponent(entityId)}`);
  }

  /**
   * Get historical state changes for entities.
   * @param start ISO timestamp for the start of the period
   * @param entityIds Optional entity IDs to filter
   * @param end Optional ISO timestamp for end of the period
   */
  async getHistory(
    start: string,
    entityIds?: string[],
    end?: string
  ): Promise<HAState[][]> {
    const params = new URLSearchParams();
    if (entityIds?.length) {
      params.set("filter_entity_id", entityIds.join(","));
    }
    if (end) {
      params.set("end_time", end);
    }
    const query = params.toString();
    const path = `/api/history/period/${encodeURIComponent(start)}${query ? `?${query}` : ""}`;
    return this.request<HAState[][]>(path);
  }

  /**
   * Get logbook entries.
   * @param start ISO timestamp for the start of the period
   * @param entityId Optional single entity filter
   * @param end Optional ISO timestamp for end
   */
  async getLogbook(
    start: string,
    entityId?: string,
    end?: string
  ): Promise<HALogEntry[]> {
    const params = new URLSearchParams();
    if (entityId) {
      params.set("entity", entityId);
    }
    if (end) {
      params.set("end_time", end);
    }
    const query = params.toString();
    const path = `/api/logbook/${encodeURIComponent(start)}${query ? `?${query}` : ""}`;
    return this.request<HALogEntry[]>(path);
  }

  /** Get available services. */
  async getServices(): Promise<HAService[]> {
    return this.request<HAService[]>("/api/services");
  }

  /** Get the error log. */
  async getErrorLog(): Promise<string> {
    const url = `${this.baseUrl}/api/error_log`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    if (!response.ok) {
      throw new HAClientError(
        `HA API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }
    return response.text();
  }

  /** Call a service on HA. */
  async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ): Promise<HAState[]> {
    return this.request<HAState[]>(
      `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
      {
        method: "POST",
        body: data ? JSON.stringify(data) : undefined,
      }
    );
  }

  /** Render a Jinja2 template on HA. */
  async renderTemplate(template: string): Promise<string> {
    const url = `${this.baseUrl}/api/template`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ template }),
    });
    if (!response.ok) {
      throw new HAClientError(
        `HA API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }
    return response.text();
  }
}
