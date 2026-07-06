"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Search, Zap, Wifi, WifiOff, User, Settings, LogOut } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const MAX_PRESENCE_AVATARS = 4;

/** Overlapping avatar circles of workspace members currently online. */
function PresenceStrip() {
  const onlineUsers = useWorkspaceStore((s) => s.onlineUsers);

  if (onlineUsers.length === 0) return null;

  const visible = onlineUsers.slice(0, MAX_PRESENCE_AVATARS);
  const overflow = onlineUsers.length - visible.length;
  const names = onlineUsers.map((u) => u.username).join(", ");

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded-lg glass border border-jarvis-border"
      title={`Online: ${names}`}
    >
      <div className="flex items-center -space-x-2">
        {visible.map((u) => (
          <div
            key={u.user_id}
            className="w-6 h-6 rounded-full bg-primary/15 border-2 border-jarvis-surface ring-1 ring-primary/40 flex items-center justify-center"
          >
            <span className="text-[10px] font-mono font-bold text-primary uppercase leading-none">
              {u.username.charAt(0)}
            </span>
          </div>
        ))}
        {overflow > 0 && (
          <div className="w-6 h-6 rounded-full bg-jarvis-surface border-2 border-jarvis-surface ring-1 ring-jarvis-border flex items-center justify-center">
            <span className="text-[9px] font-mono text-jarvis-text-muted leading-none">
              +{overflow}
            </span>
          </div>
        )}
      </div>
      <span className="w-1.5 h-1.5 rounded-full bg-jarvis-success animate-pulse" />
    </div>
  );
}

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const { notifications, unreadNotifications, markAllNotificationsRead, isOnline } = useUIStore();
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    router.push("/");
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-jarvis-border bg-jarvis-surface/80 backdrop-blur-sm">
      {/* Title */}
      <div>
        <h1 className="text-lg font-bold font-mono text-jarvis-text tracking-wider uppercase">{title}</h1>
        {subtitle && (
          <p className="text-xs text-jarvis-text-muted font-mono mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className={cn(
          "relative transition-all duration-300",
          searchFocused ? "w-64" : "w-48"
        )}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-jarvis-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="jarvis-input w-full pl-9 py-2 text-sm"
          />
        </div>

        {/* Workspace presence */}
        <PresenceStrip />

        {/* Connection status */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass border border-jarvis-border">
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-success" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-red-400" />
          )}
          <span className={cn(
            "text-xs font-mono",
            isOnline ? "text-success" : "text-red-400"
          )}>
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
            className="relative p-2 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
          >
            <Bell className="w-4.5 h-4.5" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-jarvis-bg text-[10px] font-bold font-mono rounded-full flex items-center justify-center">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </button>

          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute right-0 top-full mt-2 w-80 glass-strong rounded-xl border border-jarvis-border shadow-jarvis-md z-50"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-jarvis-border">
                <span className="text-sm font-mono font-semibold text-jarvis-text">Notifications</span>
                {unreadNotifications > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-xs text-primary font-mono hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-jarvis-text-muted text-sm font-mono">
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className={cn(
                      "px-4 py-3 border-b border-jarvis-border last:border-0 hover:bg-primary/5 transition-colors",
                      !n.read && "bg-primary/3"
                    )}>
                      <div className="flex items-start gap-2">
                        {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                        <div className={cn(!n.read ? "" : "ml-3.5")}>
                          <p className="text-xs font-semibold text-jarvis-text font-mono">{n.title}</p>
                          <p className="text-xs text-jarvis-text-muted mt-0.5">{n.message}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg glass border border-jarvis-border hover:border-primary/30 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-mono text-jarvis-text hidden sm:block">
              {user?.display_name || user?.username || "User"}
            </span>
          </button>

          {showUserMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="absolute right-0 top-full mt-2 w-48 glass-strong rounded-xl border border-jarvis-border shadow-jarvis-md z-50"
            >
              <div className="px-4 py-3 border-b border-jarvis-border">
                <p className="text-sm font-mono font-semibold text-jarvis-text">{user?.display_name}</p>
                <p className="text-xs text-jarvis-text-muted font-mono truncate">{user?.email}</p>
              </div>
              <div className="p-1">
                <button
                  onClick={() => { router.push("/settings"); setShowUserMenu(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-mono text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-mono text-red-400 hover:bg-red-500/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </header>
  );
}
