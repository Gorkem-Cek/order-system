// Helpers for API integration tests. Each test file gets a random prefix and only creates
// cafés and users under it, so files can run in parallel and clean up after themselves.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LightMyRequestResponse } from "fastify";
import sharp from "sharp";
import { buildApp, type AppDeps } from "../app";
import { loadConfig, type Config } from "../config";
import { createPrismaClient } from "../db";
import { Role } from "../generated/prisma/client";
import { hashPassword } from "../lib/password";
import { generateQrToken } from "../lib/tokens";
import { SESSION_COOKIE } from "../plugins/auth";

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export const TEST_PASSWORD = "test-password-1";

export function createTestContext(
  overrides: Partial<Config> = {},
  deps: Pick<AppDeps, "payments" | "now" | "iyzicoFetch"> = {},
) {
  const config = {
    ...loadConfig({
      ...process.env,
      LOGIN_RATE_LIMIT: "1000",
      CHECKOUT_RATE_LIMIT: "1000",
      // Each test file stores uploads in its own temporary folder.
      UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), "siparis-uploads-")),
      PAYMENT_SECRET_KEY: randomBytes(32).toString("base64"),
    }),
    ...overrides,
  };
  const prisma = createPrismaClient(config.DATABASE_URL);
  const app = buildApp({ config, prisma, ...deps });
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

    /**
     * A café with a table and a small menu: Çay (₺40, no options) and Latte (₺160) with a
     * required size (Küçük +0 / Büyük +40) and up to 2 extras (shot +35, sold-out caramel).
     */
    async createCafeWithMenu(options: { isActive?: boolean } = {}) {
      const { cafe, loginEmail } = await this.createCafe(options);
      const table = await prisma.table.create({
        data: { cafeId: cafe.id, name: "Masa 7", qrToken: generateQrToken() },
      });
      const category = await prisma.category.create({
        data: { cafeId: cafe.id, name: "İçecekler" },
      });
      const cay = await prisma.product.create({
        data: { cafeId: cafe.id, categoryId: category.id, name: "Çay", priceKurus: 4000 },
      });
      const latte = await prisma.product.create({
        data: {
          cafeId: cafe.id,
          categoryId: category.id,
          name: "Latte",
          priceKurus: 16000,
          optionGroups: {
            create: [
              {
                name: "Boyut",
                minSelect: 1,
                maxSelect: 1,
                sortOrder: 0,
                options: {
                  create: [
                    { name: "Küçük", priceDeltaKurus: 0, sortOrder: 0 },
                    { name: "Büyük", priceDeltaKurus: 4000, sortOrder: 1 },
                  ],
                },
              },
              {
                name: "Ekstralar",
                minSelect: 0,
                maxSelect: 2,
                sortOrder: 1,
                options: {
                  create: [
                    { name: "Ekstra shot", priceDeltaKurus: 3500, sortOrder: 0 },
                    { name: "Karamel", priceDeltaKurus: 2000, sortOrder: 1, isAvailable: false },
                  ],
                },
              },
            ],
          },
        },
        include: { optionGroups: { include: { options: true } } },
      });
      const option = (name: string) => {
        const found = latte.optionGroups.flatMap((g) => g.options).find((o) => o.name === name);
        if (!found) throw new Error(`No option ${name}`);
        return found.id;
      };
      return { cafe, loginEmail, table, category, cay, latte, option };
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
      await rm(config.UPLOAD_DIR, { recursive: true, force: true });
    },
  };
}

export function sessionCookieHeader(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie) throw new Error("No session cookie in response");
  return `${SESSION_COOKIE}=${cookie.value}`;
}

/** Builds a multipart/form-data body with one file field, like a browser upload. */
export function multipart(data: Buffer, filename = "photo.jpg", contentType = "image/jpeg") {
  const boundary = "----siparis-test-boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    payload: body,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/** A plain JPEG photo of the given size. */
export const jpeg = (width = 2400, height = 1600) =>
  sharp({ create: { width, height, channels: 3, background: "#b06030" } })
    .jpeg()
    .toBuffer();
