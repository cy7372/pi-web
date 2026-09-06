import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Global ignores — must be a standalone entry. Covers Next.js build outputs,
  // including .next-dev/ introduced by the 2026-09-04 dev/build split.
  {
    ignores: [
      ".next/**",
      ".next-dev/**",
      ".build-home/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "logs/**",
      ".ruff_cache/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
