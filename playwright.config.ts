import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local runs read DATABASE_URL from the root .env; CI sets it directly.
if (existsSync(".env")) process.loadEnvFile(".env");

// Its own ports, so the tests can run while `npm run dev` is open. Every test creates its own
// café in the DATABASE_URL database and deletes it afterwards, so existing data stays untouched.
const API_PORT = "3100";
const WEB_PORT = "5199";
const baseURL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    env: {
      API_PORT,
      WEB_PORT,
      PUBLIC_URL: baseURL,
      LOG_LEVEL: "warn",
      LOGIN_RATE_LIMIT: "1000",
      CHECKOUT_RATE_LIMIT: "1000",
    },
  },
});
