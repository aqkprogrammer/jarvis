import { WSEvent, WSEventType } from "@/types";

type EventHandler = (data: unknown) => void;

interface WebSocketConfig {
  url: string;
  token?: string;
  heartbeatInterval?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private handlers: Map<WSEventType | "connect" | "disconnect" | "error", Set<EventHandler>> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isIntentionalClose = false;
  private messageQueue: string[] = [];

  constructor(config: WebSocketConfig) {
    this.config = {
      heartbeatInterval: 30000,
      reconnectDelay: 1000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  connect(token?: string): void {
    if (token) {
      this.config.token = token;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isIntentionalClose = false;
    const url = this.config.token
      ? `${this.config.url}?token=${this.config.token}`
      : this.config.url;

    try {
      this.ws = new WebSocket(url);
      this.setupEventListeners();
    } catch (error) {
      console.error("[WebSocket] Connection error:", error);
      this.scheduleReconnect();
    }
  }

  private setupEventListeners(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log("[WebSocket] Connected");
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.flushMessageQueue();
      this.emit("connect", { connected: true });
    };

    this.ws.onclose = (event) => {
      console.log("[WebSocket] Disconnected:", event.code, event.reason);
      this.stopHeartbeat();
      this.emit("disconnect", { code: event.code, reason: event.reason });

      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      this.emit("error", { error });
    };

    this.ws.onmessage = (event) => {
      try {
        const wsEvent: WSEvent = JSON.parse(event.data);
        if (wsEvent.type === "pong") return;
        this.emit(wsEvent.type, wsEvent.data);
      } catch (error) {
        console.error("[WebSocket] Failed to parse message:", error);
      }
    };
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send("ping", {});
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 10)) {
      console.error("[WebSocket] Max reconnect attempts reached");
      return;
    }

    const delay = Math.min(
      (this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts),
      30000
    );

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(message);
      }
    }
  }

  send(type: string, data: unknown): void {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
    }
  }

  on(event: WSEventType | "connect" | "disconnect" | "error", handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off(event: WSEventType | "connect" | "disconnect" | "error", handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, data: unknown): void {
    this.handlers.get(event as WSEventType)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[WebSocket] Handler error for ${event}:`, error);
      }
    });
  }

  disconnect(): void {
    this.isIntentionalClose = true;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    wsManager = new WebSocketManager({
      url: `${wsUrl}/ws`,
    });
  }
  return wsManager;
}

export default WebSocketManager;
