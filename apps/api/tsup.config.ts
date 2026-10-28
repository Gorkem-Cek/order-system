import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: "esm",
  target: "node22",
  platform: "node",
  clean: true,
  // Workspace packages ship TypeScript source, so bundle them into the build.
  noExternal: [/^@siparis\//],
});
