import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// SECTION: Test-runner configuration
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
// End of section: the "@" alias mirrors tsconfig.json's paths mapping; tsc resolves it for type-checking,
// but Vitest needs its own resolver config or route-handler tests that import via "@/..." fail at runtime.
