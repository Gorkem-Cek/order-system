import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const DATABASE_URL = "postgresql://localhost/test";

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      NODE_ENV: "development",
      API_HOST: "localhost",
      API_PORT: 3000,
      LOG_LEVEL: "info",
      DATABASE_URL,
      SESSION_TTL_DAYS: 30,
      LOGIN_RATE_LIMIT: 10,
      CHECKOUT_RATE_LIMIT: 10,
    });
  });

  it("coerces numbers and rejects invalid values", () => {
    expect(loadConfig({ DATABASE_URL, API_PORT: "4000" }).API_PORT).toBe(4000);
    expect(() => loadConfig({ DATABASE_URL, API_PORT: "abc" })).toThrow();
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
