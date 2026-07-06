"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, RefreshCw, Server } from "lucide-react";
import { useState } from "react";
import { useUIStore } from "@/stores/uiStore";
import { resetBackendCache } from "@/lib/backendCheck";
import { setDemoMode } from "@/lib/api";

export function DemoBanner() {
  const { isDemoMode, setDemoMode: storeDemoMode } = useUIStore();
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    resetBackendCache();
    const { isBackendAvailable } = await import("@/lib/backendCheck");
    const up = await isBackendAvailable();
    if (up) {
      setDemoMode(false);
      storeDemoMode(false);
      // Reload to re-initialize with real backend
      window.location.reload();
    } else {
      setRetrying(false);
    }
  };

  return (
    <AnimatePresence>
      {isDemoMode && !dismissed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
            <div className="flex items-center gap-2.5 text-amber-400">
              <Server size={14} className="shrink-0" />
              <span className="text-xs font-mono">
                <span className="font-semibold">DEMO MODE</span>
                {" — "}
                Backend unavailable. Running with static demo data.
                {" "}
                <span className="opacity-70">Login: demo@jarvis.ai / jarvis2025</span>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={retrying ? "animate-spin" : ""} />
                {retrying ? "Connecting..." : "Retry backend"}
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-amber-400/60 hover:text-amber-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
