// Production build wrapper — ALWAYS builds with an isolated HOME.
//
// Why (2026-09-04 incident): Next 16 in --webpack mode walks USERPROFILE during
// dependency tracing. The real profile has legacy junctions ("Application
// Data", ...) under Deny-List ACLs plus a huge AppData tree → EPERM failures,
// or runaway memory growth (8 GB heap OOM observed after ~400 s of scanning).
// Pointing HOME/USERPROFILE at a clean empty dir sidesteps both failure modes.
//
// Wired via package.json "build": "node deploy/build.mjs" so EVERY entrypoint
// (bun run build, npm run build, CI, deploy.cmd) gets the isolation — the
// knowledge no longer depends on remembering to use deploy/build.ps1.
// Exit code propagates so Servy/CI see real failures.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildHome = resolve(root, ".build-home");
mkdirSync(buildHome, { recursive: true });

const env = { ...process.env, USERPROFILE: buildHome, HOME: buildHome };
const nextBin = resolve(root, "node_modules", "next", "dist", "bin", "next");

console.log(`[build] isolated HOME -> ${buildHome}`);
const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  stdio: "inherit",
  cwd: root,
  env,
});
process.exit(result.status ?? 1);
