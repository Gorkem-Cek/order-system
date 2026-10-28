// Development seed: a demo café with tables and an example menu, plus a super-admin.
// Re-runnable: the demo café (and everything in it) is deleted and recreated.
import { createPrismaClient } from "../src/db";
import { Role } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";
import { generateQrToken } from "../src/lib/tokens";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed demo data in production.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const DEMO_SLUG = "demo-kafe";
const SUPER_ADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? "admin@siparis.local";
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";
const STAFF_EMAIL = "demo@siparis.local";
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? "demo1234";

/** ₺ → kuruş, for readable seed data. */
const tl = (lira: number) => Math.round(lira * 100);

type SeedOption = [name: string, priceDeltaLira: number];
type SeedGroup = { name: string; min: number; max: number; options: SeedOption[] };
type SeedProduct = {
  name: string;
  price: number;
  description?: string;
  available?: boolean;
  groups?: SeedGroup[];
};

const size: SeedGroup = {
  name: "Boyut",
  min: 1,
  max: 1,
  options: [
    ["Küçük", 0],
    ["Orta", 20],
    ["Büyük", 40],
  ],
};
const milk: SeedGroup = {
  name: "Süt",
  min: 1,
  max: 1,
  options: [
    ["Normal süt", 0],
    ["Laktozsuz süt", 15],
    ["Yulaf sütü", 30],
  ],
};
const coffeeExtras: SeedGroup = {
  name: "Ekstralar",
  min: 0,
  max: 3,
  options: [
    ["Ekstra shot", 35],
    ["Vanilya şurubu", 20],
    ["Karamel şurubu", 20],
  ],
};

const menu: { category: string; products: SeedProduct[] }[] = [
  {
    category: "Sıcak İçecekler",
    products: [
      {
        name: "Türk Kahvesi",
        price: 120,
        description: "Lokum ile servis edilir.",
        groups: [
          {
            name: "Şeker",
            min: 1,
            max: 1,
            options: [
              ["Sade", 0],
              ["Az şekerli", 0],
              ["Orta", 0],
              ["Şekerli", 0],
            ],
          },
        ],
      },
      { name: "Çay", price: 40, description: "İnce belli bardakta." },
      { name: "Americano", price: 140, groups: [size, coffeeExtras] },
      { name: "Latte", price: 160, groups: [size, milk, coffeeExtras] },
      { name: "Cappuccino", price: 160, groups: [size, milk, coffeeExtras] },
      { name: "Sıcak Çikolata", price: 170, groups: [size, milk] },
    ],
  },
  {
    category: "Soğuk İçecekler",
    products: [
      { name: "Ice Latte", price: 175, groups: [size, milk, coffeeExtras] },
      { name: "Frappe", price: 185, groups: [size] },
      { name: "Ev Yapımı Limonata", price: 110 },
      { name: "Taze Portakal Suyu", price: 130, available: false },
      { name: "Soda", price: 40 },
      { name: "Su", price: 25 },
    ],
  },
  {
    category: "Tatlılar",
    products: [
      { name: "San Sebastian Cheesecake", price: 220 },
      {
        name: "Brownie",
        price: 150,
        groups: [{ name: "Ekstra", min: 0, max: 1, options: [["Dondurma", 40]] }],
      },
      { name: "Tiramisu", price: 200 },
    ],
  },
  {
    category: "Atıştırmalıklar",
    products: [
      { name: "Kaşarlı Tost", price: 160, description: "Patates cipsi ile." },
      {
        name: "Kruvasan",
        price: 120,
        groups: [
          {
            name: "Çeşit",
            min: 1,
            max: 1,
            options: [
              ["Sade", 0],
              ["Çikolatalı", 20],
            ],
          },
        ],
      },
      { name: "Simit", price: 40 },
    ],
  },
];

const tableNames = [...Array.from({ length: 8 }, (_, i) => `Masa ${i + 1}`), "Bahçe 1", "Bahçe 2"];

const prisma = createPrismaClient(process.env.DATABASE_URL);

async function main() {
  await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {},
    create: {
      email: SUPER_ADMIN_EMAIL,
      name: "Super Admin",
      role: Role.SUPER_ADMIN,
      passwordHash: await hashPassword(SUPER_ADMIN_PASSWORD),
    },
  });

  await prisma.cafe.deleteMany({ where: { slug: DEMO_SLUG } });
  const cafe = await prisma.cafe.create({
    data: {
      name: "Demo Kafe",
      slug: DEMO_SLUG,
      users: {
        create: {
          email: STAFF_EMAIL,
          name: "Demo Kafe",
          role: Role.STAFF,
          passwordHash: await hashPassword(STAFF_PASSWORD),
        },
      },
      tables: { create: tableNames.map((name) => ({ name, qrToken: generateQrToken() })) },
    },
    include: { tables: true },
  });

  for (const [categoryIndex, { category, products }] of menu.entries()) {
    await prisma.category.create({
      data: {
        cafeId: cafe.id,
        name: category,
        sortOrder: categoryIndex,
        products: {
          create: products.map((product, productIndex) => ({
            cafeId: cafe.id,
            name: product.name,
            description: product.description ?? null,
            priceKurus: tl(product.price),
            isAvailable: product.available ?? true,
            sortOrder: productIndex,
            optionGroups: {
              create: (product.groups ?? []).map((group, groupIndex) => ({
                name: group.name,
                minSelect: group.min,
                maxSelect: group.max,
                sortOrder: groupIndex,
                options: {
                  create: group.options.map(([name, delta], optionIndex) => ({
                    name,
                    priceDeltaKurus: tl(delta),
                    sortOrder: optionIndex,
                  })),
                },
              })),
            },
          })),
        },
      },
    });
  }

  const productCount = await prisma.product.count({ where: { cafeId: cafe.id } });
  console.log(`Seeded "${cafe.name}": ${cafe.tables.length} tables, ${productCount} products.`);
  console.log(`Super-admin: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD} (dev only)`);
  console.log(`Café login:  ${STAFF_EMAIL} / ${STAFF_PASSWORD} (dev only)`);
  console.log("Table menu links:");
  for (const table of cafe.tables) console.log(`  ${table.name.padEnd(8)} /m/${table.qrToken}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
