"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const HEALTH_ENDPOINT = `${API_URL}/api/v1/health`;
const TIMEOUT_MS = 3000;

// The static GitHub Pages bundle ships without a backend. Probing one would
// only burn the 3s timeout (and log a mixed-content error on https), so the
// build pins demo mode on instead.
const FORCED_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

let _cachedResult: boolean | null = null;
let _checking: Promise<boolean> | null = null;

/** True when this build can never reach a backend, so the retry UI is pointless. */
export function isDemoModeForced(): boolean {
  return FORCED_DEMO;
}

/**
 * Returns true if the backend is reachable.
 * Result is cached for the lifetime of the page.
 */
export async function isBackendAvailable(): Promise<boolean> {
  if (FORCED_DEMO) return false;
  if (_cachedResult !== null) return _cachedResult;
  if (_checking) return _checking;

  _checking = (async () => {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(HEALTH_ENDPOINT, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(id);
      _cachedResult = res.ok;
    } catch {
      _cachedResult = false;
    }
    _checking = null;
    return _cachedResult!;
  })();

  return _checking;
}

/** Force-reset the cache (e.g. after network change). */
export function resetBackendCache() {
  _cachedResult = null;
  _checking = null;
}
