"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { Toast } from "@/components/ui/toast";
import { isBackendAvailable } from "@/lib/backendCheck";
import { setDemoMode } from "@/lib/api";

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { loadUser, accessToken } = useAuthStore();
  const { setDemoMode: storeDemoMode, setBackendChecked } = useUIStore();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      // 1. Check if backend is reachable (3s timeout)
      const backendUp = await isBackendAvailable();
      const demo = !backendUp;
      setDemoMode(demo);        // update api.ts module-level flag
      storeDemoMode(demo);      // update UI store for components to read
      setBackendChecked(true);

      // 2. Load user (uses real or mock api depending on demo flag)
      if (accessToken) {
        await loadUser().catch(() => {});
      }
      setInitialized(true);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-jarvis-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-jarvis-text-muted text-sm font-mono animate-pulse">
            CONNECTING TO BACKEND...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        {children}
        <Toast />
      </AuthInitializer>
    </QueryClientProvider>
  );
}
