import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { root: "packages/shared", test: { name: "shared", environment: "node" } },
      { root: "apps/api", test: { name: "api", environment: "node" } },
      "apps/web",
    ],
  },
});
