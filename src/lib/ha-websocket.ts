import { WebSocket } from "ws";

export interface HAStateChangedEvent {
  entity_id: string;
  old_state: {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
  } | null;
  new_state: {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
  } | null;
}

export type StateChangedCallback = (event: HAStateChangedEvent) => void;

/**
 * Manages a persistent WebSocket connection to Home Assistant.
 * Subscribes to state_changed events for real-time entity updates.
 */
export class HAWebSocketManager {
  private ws: WebSocket | null = null;
  private token: string;
  private wsUrl: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 60000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongReceived = true;
  private msgId = 1;
  private connected = false;
  private destroyed = false;
  private onStateChanged: StateChangedCallback | null = null;

  constructor(haUrl: string, token: string) {
    // Convert HTTP URL to WebSocket URL
    const url = haUrl.replace(/\/+$/, "");
    this.wsUrl = url.replace(/^http/, "ws") + "/api/websocket";
    this.token = token;
  }

  /** Register a callback for state_changed events. */
  onEvent(callback: StateChangedCallback) {
    this.onStateChanged = callback;
  }

  /** Start the WebSocket connection. */
  async connect(): Promise<void> {
    if (this.destroyed) return;
    this.doConnect();
  }

  /** Close the connection and stop all timers. */
  disconnect() {
    this.destroyed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    console.log("[ws] Disconnected");
  }

  /** Whether the WebSocket is currently connected and authenticated. */
  isConnected(): boolean {
    return this.connected;
  }

  private doConnect() {
    if (this.destroyed) return;

    try {
      console.log(`[ws] Connecting to ${this.wsUrl}...`);
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("[ws] Connection opened, waiting for auth_required...");
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (err) {
          console.error("[ws] Failed to parse message:", err);
        }
      });

      this.ws.on("close", (code: number, reason: Buffer) => {
        console.log(`[ws] Connection closed: ${code} ${reason.toString()}`);
        this.connected = false;
        this.clearTimers();
        this.scheduleReconnect();
      });

      this.ws.on("error", (err: Error) => {
        console.error("[ws] Connection error:", err.message);
        // close event will fire after error, triggering reconnect
      });
    } catch (err) {
      console.error("[ws] Failed to create WebSocket:", err);
      this.scheduleReconnect();
    }
  }

  private handleMessage(msg: Record<string, unknown>) {
    const type = msg.type as string;

    switch (type) {
      case "auth_required":
        // Send authentication
        this.send({ type: "auth", access_token: this.token });
        break;

      case "auth_ok":
        console.log("[ws] Authenticated successfully");
        this.connected = true;
        this.reconnectDelay = 1000; // Reset backoff on success
        this.subscribeToStateChanges();
        this.startHeartbeat();
        break;

      case "auth_invalid":
        console.error("[ws] Authentication failed:", msg.message);
        // Don't reconnect on auth failure — token is likely invalid
        this.ws?.close();
        break;

      case "event":
        this.handleEvent(msg);
        break;

      case "pong":
        this.pongReceived = true;
        break;

      case "result":
        // Subscription confirmation or other results
        if (!(msg.success as boolean)) {
          console.error("[ws] Command failed:", msg.error);
        }
        break;
    }
  }

  private handleEvent(msg: Record<string, unknown>) {
    const event = msg.event as Record<string, unknown>;
    if (!event) return;

    const eventType = event.event_type as string;
    if (eventType !== "state_changed") return;

    const data = event.data as HAStateChangedEvent;
    if (!data || !data.new_state) return;

    this.onStateChanged?.(data);
  }

  private subscribeToStateChanges() {
    const id = this.msgId++;
    this.send({
      id,
      type: "subscribe_events",
      event_type: "state_changed",
    });
    console.log("[ws] Subscribed to state_changed events");
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pongReceived = true;

    this.heartbeatTimer = setInterval(() => {
      if (!this.pongReceived) {
        console.warn("[ws] No pong received, forcing reconnect");
        this.ws?.close();
        return;
      }
      this.pongReceived = false;
      this.send({ id: this.msgId++, type: "ping" });
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.destroyed) return;

    console.log(`[ws] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay
    );
  }

  private clearTimers() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
