import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which sets root: "client" for the app build);
// tests live in server/ and shared/ and run in the node environment.
export default defineConfig({
  test: {
    include: ["server/src/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
