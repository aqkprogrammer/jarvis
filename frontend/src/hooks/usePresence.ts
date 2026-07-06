"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { DEMO_PRESENCE_USERS } from "@/lib/mockData";
import type { WorkspacePresenceUser } from "@/types";

// Same derivation as src/lib/websocket.ts
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

const PING_INTERVAL_MS = 25_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1_000;

interface PresenceUpdateMessage {
  type?: string;
  users?: WorkspacePresenceUser[];
}

/**
 * Keeps workspaceStore.onlineUsers in sync with the workspace presence channel.
 * - Demo mode: static demo presence (no real WebSocket).
 * - Live mode: WS to /ws/presence with ping heartbeat + bounded reconnect backoff.
 * Mount once (dashboard layout); reconnects when the active workspace changes.
 */
export function usePresence(): void {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setOnlineUsers = useWorkspaceStore((s) => s.setOnlineUsers);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isDemoMode = useUIStore((s) => s.isDemoMode);
  const backendChecked = useUIStore((s) => s.backendChecked);

  useEffect(() => {
    if (!backendChecked || !activeWorkspaceId) {
      setOnlineUsers([]);
      return;
    }

    // Demo mode: simulate presence with a static snapshot — no real WS
    if (isDemoMode) {
      setOnlineUsers(DEMO_PRESENCE_USERS);
      return () => setOnlineUsers([]);
    }

    if (!accessToken) {
      setOnlineUsers([]);
      return;
    }

    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const stopPing = () => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || attempts >= MAX_RECONNECT_ATTEMPTS) return;
      const delay = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts), 30_000);
      attempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      const url =
        `${WS_BASE}/ws/presence` +
        `?token=${encodeURIComponent(accessToken)}` +
        `&workspace_id=${encodeURIComponent(activeWorkspaceId)}`;

      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempts = 0;
        stopPing();
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(String(event.data)) as PresenceUpdateMessage;
          if (message.type === "presence_update" && Array.isArray(message.users)) {
            setOnlineUsers(message.users);
          }
          // {type: "pong"} replies are ignored
        } catch {
          // Malformed frame — ignore
        }
      };

      ws.onclose = () => {
        stopPing();
        if (!disposed) scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose fires afterwards and handles the reconnect
      };
    };

    connect();

    return () => {
      disposed = true;
      stopPing();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close(1000, "Client disconnect");
        ws = null;
      }
      setOnlineUsers([]);
    };
  }, [activeWorkspaceId, isDemoMode, backendChecked, accessToken, setOnlineUsers]);
}
