import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Local runs read DATABASE_URL etc. from the root .env; CI sets them directly.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    projects: [
      { root: "packages/shared", test: { name: "shared", environment: "node" } },
      { root: "apps/api", test: { name: "api", environment: "node" } },
      "apps/web",
    ],
  },
});
