import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts", "create-super-admin": "scripts/create-super-admin.ts" },
  format: "esm",
  target: "node22",
  platform: "node",
  clean: true,
  // Workspace packages ship TypeScript source, so bundle them into the build.
  noExternal: [/^@siparis\//],
});
