"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds.
 * Skipped in development so the SW cache never fights HMR; errors are silent —
 * the app must work identically without a service worker.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failed (unsupported/blocked) — app works without it
    });
  }, []);

  return null;
}
