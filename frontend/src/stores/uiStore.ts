import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Notification, NotificationType } from "@/types";

interface UIState {
  sidebarOpen: boolean;
  voiceModeActive: boolean;
  notifications: Notification[];
  unreadNotifications: number;
  theme: "dark" | "light" | "system";
  commandPaletteOpen: boolean;
  settingsPanelOpen: boolean;
  isOnline: boolean;
  isDemoMode: boolean;
  backendChecked: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleVoiceMode: () => void;
  setVoiceModeActive: (active: boolean) => void;
  addNotification: (type: NotificationType, title: string, message: string, actionUrl?: string) => void;
  removeNotification: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleSettingsPanel: () => void;
  setIsOnline: (online: boolean) => void;
  setDemoMode: (demo: boolean) => void;
  setBackendChecked: (checked: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      voiceModeActive: false,
      notifications: [],
      unreadNotifications: 0,
      theme: "dark",
      commandPaletteOpen: false,
      settingsPanelOpen: false,
      isOnline: true,
      isDemoMode: false,
      backendChecked: false,

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

      toggleVoiceMode: () => set((state) => ({ voiceModeActive: !state.voiceModeActive })),
      setVoiceModeActive: (active: boolean) => set({ voiceModeActive: active }),

      addNotification: (type, title, message, actionUrl) => {
        const notification: Notification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type,
          title,
          message,
          read: false,
          action_url: actionUrl,
          created_at: new Date().toISOString(),
        };
        set((state) => ({
          notifications: [notification, ...state.notifications].slice(0, 50),
          unreadNotifications: state.unreadNotifications + 1,
        }));
      },

      removeNotification: (id: string) =>
        set((state) => {
          const notif = state.notifications.find((n) => n.id === id);
          return {
            notifications: state.notifications.filter((n) => n.id !== id),
            unreadNotifications: Math.max(
              0,
              state.unreadNotifications - (notif && !notif.read ? 1 : 0)
            ),
          };
        }),

      markNotificationRead: (id: string) =>
        set((state) => {
          const notif = state.notifications.find((n) => n.id === id);
          if (!notif || notif.read) return state;
          return {
            notifications: state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unreadNotifications: Math.max(0, state.unreadNotifications - 1),
          };
        }),

      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadNotifications: 0,
        })),

      clearNotifications: () => set({ notifications: [], unreadNotifications: 0 }),

      setTheme: (theme) => set({ theme }),

      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),

      toggleSettingsPanel: () =>
        set((state) => ({ settingsPanelOpen: !state.settingsPanelOpen })),

      setIsOnline: (online: boolean) => set({ isOnline: online }),
      setDemoMode: (demo: boolean) => set({ isDemoMode: demo }),
      setBackendChecked: (checked: boolean) => set({ backendChecked: checked }),
    }),
    {
      name: "jarvis-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
      }),
    }
  )
);
