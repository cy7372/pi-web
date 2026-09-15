// One-off generator: writes packages/shared/src/public/theme-init.js from
// lib/theme.ts's THEME_INIT_SCRIPT so the two can never drift silently
// (theme.test.mjs asserts parity).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { THEME_INIT_SCRIPT } from "../src/lib/theme.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "src", "public", "theme-init.js");
const banner = "// AUTO-GENERATED from lib/theme.ts THEME_INIT_SCRIPT — do not edit by hand.\n// Loaded synchronously (render-blocking) by app-src/layout to avoid theme flash.\n";
writeFileSync(out, banner + THEME_INIT_SCRIPT + "\n", "utf8");
console.log("wrote", out, THEME_INIT_SCRIPT.length, "bytes of script");
