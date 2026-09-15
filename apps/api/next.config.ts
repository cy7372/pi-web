import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const configDir = dirname(fileURLToPath(import.meta.url));
let version = "0.0.0";
try {
  version = (
    JSON.parse(readFileSync(join(configDir, "package.json"), "utf8")) as {
      version: string;
    }
  ).version;
} catch {
  /* fall back to a placeholder; NEXT_PUBLIC_APP_VERSION is cosmetic */
}
let piVersion = "unknown";
try {
  // bun workspaces hoist deps to the repo root's node_modules
  const piPkgPath = join(
    configDir,
    "../../node_modules/@earendil-works/pi-coding-agent/package.json",
  );
  piVersion = (
    JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }
  ).version;
} catch {
  /* package not found, use default */
}

const nextConfig: NextConfig = {
  // monorepo (ADR 0005): deps are hoisted to the workspace root, so tracing
  // must walk from the repo root, not from apps/api
  outputFileTracingRoot: resolve(configDir, "../.."),
  // 2026-09-04: separate dev output from the production .next. Sharing one
  // dir let `next dev` clobber the Servy-served production build (and vice
  // versa: a production build breaks a running dev server). start-servy.cmd
  // fail-fasts on a missing .next/BUILD_ID, so dev must never touch .next.
  // Judge by PI_WEB_DEV (set by deploy/dev.mjs), NOT NODE_ENV/argv: config
  // loads in a Turbopack worker where those signals are absent or polluted.
  distDir: process.env.PI_WEB_DEV ? ".next-dev" : ".next",
  serverExternalPackages: [
    "node-pty",
    "undici",
    "web-push",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
  ],
  // Next 16 blocks cross-origin access to dev resources by default. Allow the
  // loopback and the RFC1918 LAN ranges so the dev server stays reachable
  // from other machines on the same LAN.
  allowedDevOrigins: [
    "127.0.0.1",
    "10.*.*.*",
    // 172.16.0.0/12
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    "192.168.*.*",
  ],
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
