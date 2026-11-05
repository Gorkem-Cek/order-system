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
      UPLOAD_DIR: "uploads",
      PUBLIC_URL: "http://localhost:5173",
    });
  });

  it("coerces numbers and rejects invalid values", () => {
    expect(loadConfig({ DATABASE_URL, API_PORT: "4000" }).API_PORT).toBe(4000);
    expect(() => loadConfig({ DATABASE_URL, API_PORT: "abc" })).toThrow();
  });

  it("drops a trailing slash from PUBLIC_URL and accepts only web addresses", () => {
    expect(loadConfig({ DATABASE_URL, PUBLIC_URL: "https://siparis.app/" }).PUBLIC_URL).toBe(
      "https://siparis.app",
    );
    expect(() => loadConfig({ DATABASE_URL, PUBLIC_URL: "siparis.app" })).toThrow();
    expect(() => loadConfig({ DATABASE_URL, PUBLIC_URL: "javascript:alert(1)" })).toThrow();
  });

  describe("in production", () => {
    const base = { DATABASE_URL, NODE_ENV: "production" };
    const production = { ...base, PUBLIC_URL: "https://siparis.app", UPLOAD_DIR: "/data/uploads" };

    it("listens publicly, reads the visitor's address from the proxy and serves the web app", () => {
      expect(loadConfig(production)).toMatchObject({
        API_HOST: "0.0.0.0",
        CLIENT_IP_HEADER: "x-real-ip",
        WEB_DIR: "../web/dist",
      });
    });

    it("uses the port and address Railway provides, unless they're set explicitly", () => {
      const railway = {
        ...base,
        UPLOAD_DIR: "/data/uploads",
        PORT: "8080",
        RAILWAY_PUBLIC_DOMAIN: "siparis.up.railway.app",
      };
      expect(loadConfig(railway)).toMatchObject({
        API_PORT: 8080,
        PUBLIC_URL: "https://siparis.up.railway.app",
      });
      expect(loadConfig({ ...railway, PUBLIC_URL: "https://siparis.app" }).PUBLIC_URL).toBe(
        "https://siparis.app",
      );
    });

    it("refuses settings that would print useless QR codes or lose photos", () => {
      expect(() => loadConfig({ ...base, UPLOAD_DIR: "/data" })).toThrow(/PUBLIC_URL/);
      expect(() => loadConfig({ ...base, PUBLIC_URL: "https://siparis.app" })).toThrow(
        /UPLOAD_DIR/,
      );
    });
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
