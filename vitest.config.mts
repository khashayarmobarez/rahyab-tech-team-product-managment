import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Picks up TEST_DATABASE_URL for the database tests, if you have set it.
loadEnv({ path: ".env.local", quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // The real package throws outside a React Server Components build.
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests share one database, so run files one after another.
    fileParallelism: false,
  },
});
