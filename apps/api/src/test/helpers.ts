// Helpers for API integration tests. Each test file gets a random prefix and only creates
// cafés and users under it, so files can run in parallel and clean up after themselves.
import { randomUUID } from "node:crypto";
import type { LightMyRequestResponse } from "fastify";
import { buildApp } from "../app";
import { loadConfig, type Config } from "../config";
import { createPrismaClient } from "../db";
import { Role } from "../generated/prisma/client";
import { hashPassword } from "../lib/password";
import { SESSION_COOKIE } from "../plugins/auth";

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export const TEST_PASSWORD = "test-password-1";

export function createTestContext(overrides: Partial<Config> = {}) {
  const config = { ...loadConfig({ ...process.env, LOGIN_RATE_LIMIT: "1000" }), ...overrides };
  const prisma = createPrismaClient(config.DATABASE_URL);
  const app = buildApp({ config, prisma });
  const prefix = `test-${randomUUID().slice(0, 8)}`;
  let counter = 0;
  const email = (name: string) => `${name}-${++counter}@${prefix}.test`;

  return {
    app,
    prisma,
    prefix,
    email,

    async createCafe(options: { isActive?: boolean } = {}) {
      const loginEmail = email("cafe");
      const cafe = await prisma.cafe.create({
        data: {
          name: "Test Kafe",
          slug: `${prefix}-${++counter}`,
          isActive: options.isActive ?? true,
          users: {
            create: {
              email: loginEmail,
              name: "Test Kafe",
              role: Role.STAFF,
              passwordHash: await hashPassword(TEST_PASSWORD),
            },
          },
        },
      });
      return { cafe, loginEmail };
    },

    async createSuperAdmin() {
      return prisma.user.create({
        data: {
          email: email("admin"),
          name: "Admin",
          role: Role.SUPER_ADMIN,
          passwordHash: await hashPassword(TEST_PASSWORD),
        },
      });
    },

    /** Logs in and returns the Cookie header value for later requests. */
    async login(loginEmail: string, password = TEST_PASSWORD) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: loginEmail, password },
      });
      if (res.statusCode !== 200) throw new Error(`Login failed: ${res.statusCode} ${res.body}`);
      return sessionCookieHeader(res);
    },

    async cleanup() {
      await app.close();
      await prisma.cafe.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.user.deleteMany({ where: { email: { endsWith: `@${prefix}.test` } } });
      await prisma.$disconnect();
    },
  };
}

export function sessionCookieHeader(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("No session cookie in response");
  return `${SESSION_COOKIE}=${cookie.value}`;
}
