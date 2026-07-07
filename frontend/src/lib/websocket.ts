import { WSEvent, WSEventType } from "@/types";

type EventHandler = (data: unknown) => void;

interface WebSocketConfig {
  url: string;
  token?: string;
  heartbeatInterval?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

/**
 * Stable placeholder id for the assistant message currently being streamed.
 * The backend only reveals the real message id in its final "done" frame,
 * so chunks are attributed to this sentinel until completion.
 */
export const STREAMING_MESSAGE_ID = "streaming-response";

class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private handlers: Map<WSEventType | "connect" | "disconnect" | "error", Set<EventHandler>> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isIntentionalClose = false;
  private messageQueue: string[] = [];
  private conversationId: string | null = null;

  constructor(config: WebSocketConfig) {
    this.config = {
      heartbeatInterval: 30000,
      reconnectDelay: 1000,
      maxReconnectAttempts: 10,
      ...config,
    };
  }

  /** Connect to the per-conversation chat socket: /ws/chat/{conversationId}. */
  connect(token?: string, conversationId?: string): void {
    if (token) {
      this.config.token = token;
    }
    if (conversationId && conversationId !== this.conversationId) {
      // Switching conversations — drop the old socket first.
      this.conversationId = conversationId;
      if (this.ws) {
        this.isIntentionalClose = true;
        this.ws.close(1000, "Switching conversation");
        this.ws = null;
      }
    }

    if (!this.conversationId || !this.config.token) {
      return; // chat socket is per-conversation and authenticated
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isIntentionalClose = false;
    const url = `${this.config.url}/chat/${this.conversationId}?token=${this.config.token}`;

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
        // Backend chat protocol: flat frames {type, ...fields} —
        // translate into the event names the UI subscribes to.
        const frame = JSON.parse(event.data) as Record<string, unknown> & { type: string };
        switch (frame.type) {
          case "pong":
            return;
          case "ping":
            this.sendRaw({ type: "pong" });
            return;
          case "connected":
            return;
          case "delta":
            this.emit("message.chunk", {
              message_id: STREAMING_MESSAGE_ID,
              chunk: frame.delta as string,
            });
            return;
          case "done":
            this.emit("message.complete", frame);
            return;
          case "error":
            this.emit("message.error", {
              message_id: STREAMING_MESSAGE_ID,
              error: (frame.error as string) || "Unknown error",
            });
            return;
          default: {
            // Enveloped events ({type, data}) from other producers
            const wsEvent = frame as unknown as WSEvent;
            this.emit(wsEvent.type, wsEvent.data ?? frame);
          }
        }
      } catch (error) {
        console.error("[WebSocket] Failed to parse message:", error);
      }
    };
  }

  /** Send a frame exactly as given (backend chat WS reads top-level keys). */
  sendRaw(frame: Record<string, unknown>): void {
    const message = JSON.stringify(frame);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
    }
  }

  /** Send a chat message; the reply streams back as message.chunk events. */
  sendChatMessage(content: string, model?: string, documentIds?: string[]): void {
    this.sendRaw({
      type: "message",
      content,
      model,
      document_ids: documentIds,
    });
  }

  private startHeartbeat(): void {
    // The server drives keepalive (it pings every 30s; we reply "pong"
    // in onmessage). No client-initiated heartbeat needed.
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
