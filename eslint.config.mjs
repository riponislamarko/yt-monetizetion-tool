import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Lenient shared flat config for the monorepo. Catches real mistakes (unused vars, obvious
 * bugs) without blocking on style. The YouTube scraping libs legitimately operate on untyped
 * 3rd-party JSON, so `no-explicit-any` is off (those files also carry local disable comments).
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/drizzle/**",
      "legacy/**",
      "**/*.config.*",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
