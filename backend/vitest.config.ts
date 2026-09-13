import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Set here rather than in a setup file so the values exist before any
    // module-level env validation runs.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/ragwiki_test?sslmode=disable",
      REDIS_URL: "redis://localhost:6379",
      OPENROUTER_API_KEY: "test-key",
      APP_URL: "http://localhost:5173",
      CORS_ORIGINS: "http://localhost:4173",
      CHUNK_SIZE: "64",
      CHUNK_OVERLAP: "16",
      TOP_K_RESULTS: "5",
      EMBED_DIMENSIONS: "2000",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/types/**",
        "src/server.ts",
        "src/config/migrate.ts",
        "src/scripts/**",
      ],
    },
  },
});
