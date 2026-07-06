"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Brain, CheckSquare, BarChart3, Settings,
  ChevronLeft, ChevronRight, Cpu, Zap, User, LogOut, Bot, FileText,
  Workflow, Clock, Plug, Users
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/components/ui/button";

const navItems = [
  { href: "/chat", icon: MessageSquare, label: "Chat" },
  { href: "/memory", icon: Brain, label: "Memory" },
  { href: "/documents", icon: FileText, label: "Documents" },
  { href: "/workflows", icon: Workflow, label: "Workflows" },
  { href: "/schedules", icon: Clock, label: "Schedules" },
  { href: "/integrations", icon: Plug, label: "Integrations" },
  { href: "/workspace", icon: Users, label: "Workspace" },
  { href: "/tasks", icon: CheckSquare, label: "Tasks" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <motion.aside
      animate={{ width: sidebarOpen ? 240 : 64 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col h-full bg-jarvis-surface border-r border-jarvis-border overflow-hidden"
    >
      {/* Top header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-jarvis-border">
        <AnimatePresence mode="wait">
          {sidebarOpen ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center animate-pulse-glow">
                <Cpu className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-primary font-mono font-bold text-sm tracking-wider">JARVIS</p>
                <p className="text-jarvis-text-muted text-xs font-mono">AI System</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center animate-pulse-glow mx-auto"
            >
              <Cpu className="w-4 h-4 text-primary" />
            </motion.div>
          )}
        </AnimatePresence>

        {sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                isActive
                  ? "bg-primary/10 border border-primary/20 text-primary shadow-jarvis-sm"
                  : "text-jarvis-text-muted hover:text-primary hover:bg-primary/5 border border-transparent"
              )}
            >
              <item.icon className={cn(
                "w-4 h-4 shrink-0 transition-transform",
                isActive ? "text-primary" : "group-hover:scale-110"
              )} />
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="text-sm font-mono font-medium whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {isActive && (
                <motion.div
                  layoutId="active-indicator"
                  className="absolute right-2 w-1.5 h-1.5 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Status indicator */}
      <div className="px-3 py-2 border-t border-b border-jarvis-border">
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          sidebarOpen ? "justify-start" : "justify-center"
        )}>
          <div className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs font-mono text-success"
              >
                All Systems Online
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* User profile */}
      <div className="p-3 space-y-1">
        <div className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg",
          sidebarOpen ? "" : "justify-center"
        )}>
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 min-w-0"
              >
                <p className="text-sm font-mono text-jarvis-text truncate">
                  {user?.display_name || user?.username || "User"}
                </p>
                <p className="text-xs font-mono text-jarvis-text-muted truncate">
                  {user?.email || ""}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-jarvis-text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors",
            !sidebarOpen && "justify-center"
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm font-mono"
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Expand button when collapsed */}
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-2 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.aside>
  );
}
