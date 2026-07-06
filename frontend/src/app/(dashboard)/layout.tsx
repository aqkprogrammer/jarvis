"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DemoBanner } from "@/components/dashboard/DemoBanner";
import { useUIStore } from "@/stores/uiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { usePresence } from "@/hooks/usePresence";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { sidebarOpen } = useUIStore();
  const loadWorkspaces = useWorkspaceStore((s) => s.load);
  const router = useRouter();

  // Presence stays alive across dashboard pages once an active workspace exists
  usePresence();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadWorkspaces().catch(() => {});
    }
  }, [isAuthenticated, loadWorkspaces]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-jarvis-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-jarvis-text-muted text-sm font-mono">Loading JARVIS...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-jarvis-bg flex-col">
      <DemoBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
