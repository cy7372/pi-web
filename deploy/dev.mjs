// Dev server wrapper — sets PI_WEB_DEV=1 before spawning `next dev`.
//
// next.config.ts keys distDir off this flag (dev -> .next-dev, build -> .next)
// so the Servy-served production .next is never touched by a dev server (and
// vice versa). The flag must come from an explicit env var: NODE_ENV is set
// too late (config loads first), argv is unreliable (Turbopack loads the
// config inside a worker process), and agent shells may export a polluted
// NODE_ENV into this repo.
//
// Usage: bun run dev [-p port] — extra args pass through to `next dev`.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = resolve(root, "apps/api");
const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");

const env = { ...process.env, PI_WEB_DEV: "1" };
const result = spawnSync(
  process.execPath,
  [nextBin, "dev", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    cwd: appDir,
    env,
  },
);
process.exit(result.status ?? 1);
