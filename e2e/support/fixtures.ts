import { randomUUID } from "node:crypto";
import { test as base, devices, expect, type Page } from "@playwright/test";
import { createPrismaClient, type PrismaClient } from "../../apps/api/src/db";
import { Role } from "../../apps/api/src/generated/prisma/client";
import { hashPassword } from "../../apps/api/src/lib/password";
import { generateQrToken } from "../../apps/api/src/lib/tokens";

const PASSWORD = "e2e-test-password";

/** A café of its own for one test: table "Masa 7", Çay (₺40) and Latte (₺160, with options). */
async function createCafe(prisma: PrismaClient, id: string) {
  const loginEmail = `cafe-${id}@e2e.test`;
  const cafe = await prisma.cafe.create({
    data: {
      name: `E2E Kafe ${id}`,
      slug: `e2e-${id}`,
      users: {
        create: {
          email: loginEmail,
          name: "E2E Kafe",
          role: Role.STAFF,
          passwordHash: await hashPassword(PASSWORD),
        },
      },
    },
  });
  const table = await prisma.table.create({
    data: { cafeId: cafe.id, name: "Masa 7", qrToken: generateQrToken() },
  });
  const category = await prisma.category.create({ data: { cafeId: cafe.id, name: "İçecekler" } });
  await prisma.product.create({
    data: { cafeId: cafe.id, categoryId: category.id, name: "Çay", priceKurus: 4000 },
  });
  await prisma.product.create({
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
            maxSelect: 1,
            sortOrder: 1,
            options: { create: [{ name: "Ekstra shot", priceDeltaKurus: 3500, sortOrder: 0 }] },
          },
        ],
      },
    },
  });
  return { id: cafe.id, name: cafe.name, loginEmail, qrToken: table.qrToken };
}

export type TestCafe = Awaited<ReturnType<typeof createCafe>>;

export const test = base.extend<
  { cafe: TestCafe; adminEmail: string; guest: Page },
  { prisma: PrismaClient }
>({
  prisma: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern here
    async ({}, use) => {
      const prisma = createPrismaClient(process.env.DATABASE_URL ?? "");
      await use(prisma);
      await prisma.$disconnect();
    },
    { scope: "worker" },
  ],
  cafe: async ({ prisma }, use) => {
    const cafe = await createCafe(prisma, randomUUID().slice(0, 8));
    await use(cafe);
    await prisma.cafe.delete({ where: { id: cafe.id } });
  },
  adminEmail: async ({ prisma }, use) => {
    const email = `admin-${randomUUID().slice(0, 8)}@e2e.test`;
    await prisma.user.create({
      data: {
        email,
        name: "E2E Admin",
        role: Role.SUPER_ADMIN,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    await use(email);
    await prisma.user.delete({ where: { email } });
  },
  /** A guest's phone: a separate browser session with a mobile screen. */
  guest: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({
      ...devices["Pixel 7"],
      ...(baseURL && { baseURL }),
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
    });
    await use(await context.newPage());
    await context.close();
  },
});

export async function login(page: Page, email: string) {
  await page.goto("/staff/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

/** Logs in as the café's staff and waits until the board receives live updates. */
export async function openBoard(page: Page, cafe: TestCafe) {
  await login(page, cafe.loginEmail);
  await expect(page.getByRole("heading", { name: "Siparişler", level: 1 })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Canlı" })).toBeVisible();
}

export async function payWith(guest: Page, cardNumber: string) {
  await guest.getByLabel("Kart üzerindeki isim").fill("Test Misafir");
  await guest.getByLabel("Kart numarası").fill(cardNumber);
  await guest.getByLabel("Son kullanma").fill("12/35");
  await guest.getByLabel("Güvenlik kodu").fill("123");
  await guest.getByRole("button", { name: /öde$/ }).click();
}

/** Orders one Çay from the guest's phone and pays. */
export async function orderTea(guest: Page, cafe: TestCafe) {
  await guest.goto(`/m/${cafe.qrToken}`);
  await guest.getByRole("button", { name: /^Çay,/ }).click();
  await guest.getByRole("button", { name: /Sepete ekle/ }).click();
  await guest.getByRole("button", { name: /Sepeti gör/ }).click();
  await guest.getByRole("button", { name: "Ödemeye geç" }).click();
  await payWith(guest, "4242 4242 4242 4242");
  await expect(guest.getByRole("heading", { name: "Siparişiniz alındı!" })).toBeVisible();
}

export { expect };
