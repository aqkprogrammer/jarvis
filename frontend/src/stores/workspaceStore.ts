import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Workspace, WorkspacePresenceUser } from "@/types";
import { getApi } from "@/lib/api";

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onlineUsers: WorkspacePresenceUser[];
  isLoading: boolean;

  // Actions
  setActive: (id: string | null) => void;
  load: () => Promise<void>;
  setOnlineUsers: (users: WorkspacePresenceUser[]) => void;
}

/** Unwraps list responses that may be a raw array or an {items}/{data} envelope. */
function unwrapList<T>(data: unknown): T[] {
  const d = data as { items?: T[]; data?: T[] } | T[];
  const items = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  return Array.isArray(items) ? items : [];
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: null,
      onlineUsers: [],
      isLoading: false,

      setActive: (id: string | null) => {
        const current = get().activeWorkspaceId;
        if (current === id) return;
        // Presence belongs to the previous workspace — clear until the new channel reports
        set({ activeWorkspaceId: id, onlineUsers: [] });
      },

      load: async () => {
        set({ isLoading: true });
        try {
          const response = await getApi().workspaces.list();
          const workspaces = unwrapList<Workspace>(response.data);
          const { activeWorkspaceId } = get();
          const stillExists = workspaces.some((w) => w.id === activeWorkspaceId);
          set({
            workspaces,
            activeWorkspaceId: stillExists ? activeWorkspaceId : workspaces[0]?.id ?? null,
            isLoading: false,
          });
        } catch {
          set({ isLoading: false });
        }
      },

      setOnlineUsers: (users: WorkspacePresenceUser[]) => set({ onlineUsers: users }),
    }),
    {
      name: "jarvis-workspace",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
);
