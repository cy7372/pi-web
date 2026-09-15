import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  THEME_INIT_SCRIPT,
  THEME_OPTIONS,
  isDarkTheme,
  isThemePreference,
} from "./theme.ts";

test("first paint restores every palette and falls back to the system for invalid or blocked storage", () => {
  for (const systemDark of [false, true]) {
    for (const stored of [
      ...THEME_OPTIONS.map(({ id }) => id),
      null,
      "",
      "unknown",
      new Error("Blocked"),
    ]) {
      const root = {
        dataset: {},
        classList: {
          toggle: (name, value) => {
            root[name] = value;
          },
        },
      };
      runInNewContext(THEME_INIT_SCRIPT, {
        localStorage: {
          getItem: () => {
            if (stored instanceof Error) throw stored;
            return stored;
          },
        },
        window: { matchMedia: () => ({ matches: systemDark }) },
        document: { documentElement: root },
      });
      const expected =
        isThemePreference(stored) && stored !== "auto"
          ? stored
          : systemDark
            ? "dark"
            : "light";
      assert.equal(root.dataset.theme, expected);
      assert.equal(root.dark, isDarkTheme(expected));
    }
  }
});

test("public/theme-init.js mirrors THEME_INIT_SCRIPT (layout loads it as the render-blocking theme initializer)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = readFileSync(join(here, "../public/theme-init.js"), "utf8");
  // The generated file may be reformatted by autofix (e.g. (function(){})() -> (()=>{})()),
  // so guard the semantics via markers instead of exact string equality.
  const themeIds = JSON.stringify(THEME_OPTIONS.map((option) => option.id));
  for (const source of [file, THEME_INIT_SCRIPT]) {
    assert.ok(
      source.includes('localStorage.getItem("pi-theme")'),
      "reads the stored theme preference",
    );
    assert.ok(
      source.includes(themeIds),
      "validates the stored id against THEME_OPTIONS",
    );
    assert.ok(
      source.includes("prefers-color-scheme: dark"),
      "falls back to the system preference",
    );
    assert.ok(
      source.includes("dataset.theme"),
      "sets data-theme before first paint",
    );
    assert.ok(
      source.includes('classList.toggle("dark"'),
      "toggles the dark class",
    );
  }
  assert.ok(
    file.startsWith("// AUTO-GENERATED from lib/theme.ts"),
    "generated banner intact",
  );
});
