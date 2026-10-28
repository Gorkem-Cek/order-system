import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// .env lives at the repo root; CI and production set variables directly.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not needed for `prisma generate`, so don't fail when it's unset (e.g. CI install).
    url: process.env.DATABASE_URL ?? "",
  },
});
