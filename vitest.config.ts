import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    testTimeout: 30000,
    // Run test files sequentially — they share a real database
    fileParallelism: false,
    sequence: {
      // Run pure unit tests first, then integration tests
      files: [
        "**/status-machine*",
        "**/workspace-isolation*",
        "**/visibility-cascade*",
        "**/deal-service*",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
