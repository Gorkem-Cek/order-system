import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = buildApp({ logger: { level: config.LOG_LEVEL } });

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
