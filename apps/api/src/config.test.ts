import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig({})).toEqual({
      NODE_ENV: "development",
      API_HOST: "localhost",
      API_PORT: 3000,
      LOG_LEVEL: "info",
    });
  });

  it("coerces the port and rejects invalid values", () => {
    expect(loadConfig({ API_PORT: "4000" }).API_PORT).toBe(4000);
    expect(() => loadConfig({ API_PORT: "abc" })).toThrow();
  });
});
