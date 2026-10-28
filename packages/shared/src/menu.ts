import { z } from "zod";
import { idSchema, kurusSchema } from "./common";

// GET /api/menu/:qrToken — the public menu a guest sees after scanning a table's QR code.

/** The random token in a table's QR link (/m/<qrToken>). */
export const qrTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const menuOptionSchema = z.object({
  id: idSchema,
  name: z.string(),
  priceDeltaKurus: kurusSchema,
  isAvailable: z.boolean(),
});

export const menuOptionGroupSchema = z.object({
  id: idSchema,
  name: z.string(),
  minSelect: z.int().nonnegative(),
  maxSelect: z.int().positive(),
  options: z.array(menuOptionSchema),
});

export const menuProductSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  priceKurus: kurusSchema,
  imageUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  optionGroups: z.array(menuOptionGroupSchema),
});

export const menuCategorySchema = z.object({
  id: idSchema,
  name: z.string(),
  products: z.array(menuProductSchema),
});

export const menuCafeSchema = z.object({
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  primaryColor: z.string(),
});

export const menuResponseSchema = z.object({
  cafe: menuCafeSchema,
  table: z.object({ name: z.string() }),
  categories: z.array(menuCategorySchema),
});

export type MenuOption = z.infer<typeof menuOptionSchema>;
export type MenuOptionGroup = z.infer<typeof menuOptionGroupSchema>;
export type MenuProduct = z.infer<typeof menuProductSchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type MenuCafe = z.infer<typeof menuCafeSchema>;
export type MenuResponse = z.infer<typeof menuResponseSchema>;
