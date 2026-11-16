import { defineConfig } from "vitest/config";

// Pure-logic tests (no browser needed). Run with: npm test
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.js"], testTimeout: 60000 },
});
