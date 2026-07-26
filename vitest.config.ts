import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // site/ is a separate package with its own toolchain — never collect from it.
    exclude: ["node_modules/**", "dist/**", "site/**", "demo/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary", "lcov"]
    }
  }
});
