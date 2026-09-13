import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // The whole workspace shares one .env at the repository root; without this
  // Vite would look only in frontend/ and never see VITE_* set there.
  envDir: "..",

  build: {
    // Sourcemaps make a production stack trace readable without shipping the
    // original source in the bundle itself.
    sourcemap: true,
  },

  server: {
    // Keeps the dev client on the same relative /api/v1 path it uses in
    // production, so no environment variable is needed to run locally.
    proxy: {
      "/api/v1": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/types/**"],
    },
  },
});
