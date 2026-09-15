import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { dirname, join } from "path";
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
  /* cosmetic only */
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
  // ADR 0005 unit 1: static SPA export served directly by nginx.
  // Same-origin is preserved by nginx path routing (/api/* -> :30141),
  // so the client keeps relative fetch("/api/...") with zero CORS work.
  output: "export",
  // no server-side image optimizer in a static export
  images: { unoptimized: true },
  // headers()/middleware are not supported with output:export — the
  // no-cache rules for /, /sw.js (Service-Worker-Allowed), and the
  // manifest move to the nginx location blocks (see 10-pi.cyyu.me.conf).
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
