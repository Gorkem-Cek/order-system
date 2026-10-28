import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createPrismaClient } from "./db";

const config = loadConfig();
const prisma = createPrismaClient(config.DATABASE_URL);
const app = buildApp({ config, prisma }, { logger: { level: config.LOG_LEVEL } });

async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
