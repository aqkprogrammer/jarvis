/** @type {import('next').NextConfig} */

// Two build modes:
//   default        -> `output: standalone`, the server build the Docker image runs
//   STATIC_EXPORT=1 -> `output: export`, a pure-static bundle for GitHub Pages
// The static bundle has no Node server, so rewrites/headers/image optimisation
// are dropped and the app runs in demo mode against src/lib/mockApi.ts.
const isStaticExport = process.env.STATIC_EXPORT === "1";

// Served from https://<user>.github.io/<repo>, so every asset needs the prefix.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  output: isStaticExport ? "export" : "standalone",
  reactStrictMode: true,
  swcMinify: true,

  ...(isStaticExport
    ? {
        basePath,
        assetPrefix: basePath || undefined,
        // Emit `chat/index.html` instead of `chat.html` so Pages serves
        // nested routes without relying on its .html fallback.
        trailingSlash: true,
        // No optimisation server exists in a static bundle.
        images: { unoptimized: true },
      }
    : {
        images: {
          domains: ["localhost", "avatars.githubusercontent.com", "lh3.googleusercontent.com"],
        },
      }),

  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000",
    NEXT_PUBLIC_APP_NAME: "JARVIS",
    NEXT_PUBLIC_APP_VERSION: "1.0.0",
    NEXT_PUBLIC_BASE_PATH: basePath,
    // "true" skips the backend probe and boots straight into demo mode.
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE || "",
  },

  // Both are no-ops under `output: export` — only define them for the server build.
  ...(isStaticExport
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/:path*`,
            },
          ];
        },
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                {
                  key: "X-Frame-Options",
                  value: "DENY",
                },
                {
                  key: "X-Content-Type-Options",
                  value: "nosniff",
                },
                {
                  key: "Referrer-Policy",
                  value: "origin-when-cross-origin",
                },
              ],
            },
          ];
        },
      }),
};

module.exports = nextConfig;
