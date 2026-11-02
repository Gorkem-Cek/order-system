import { z } from "zod";
import { idSchema } from "./common";
import { menuCategorySchema } from "./menu";

// Staff menu management, mounted at /api/staff. Responses reuse the guest menu shapes;
// order is given by array position.

/** Highest price staff can set: ₺100.000,00. */
export const MAX_PRICE_KURUS = 10_000_000;
export const MAX_OPTION_GROUPS = 10;
export const MAX_OPTIONS_PER_GROUP = 30;

const nameSchema = z.string().trim().min(1).max(100);
const priceSchema = z.int().min(0).max(MAX_PRICE_KURUS);

// GET /api/staff/menu — every category (also empty ones) with its products.
export const staffMenuResponseSchema = z.object({ categories: z.array(menuCategorySchema) });

// POST /api/staff/categories, PATCH /api/staff/categories/:id
export const categoryInputSchema = z.object({ name: nameSchema });

// PUT /api/staff/categories/order and PUT /api/staff/categories/:id/products/order —
// the full list of ids in their new order.
export const reorderRequestSchema = z.object({
  ids: z
    .array(idSchema)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Ids must be unique"),
});

export const optionInputSchema = z.object({
  /** Present for an existing option, so editing keeps its id (and guests' carts valid). */
  id: idSchema.optional(),
  name: nameSchema,
  priceDeltaKurus: priceSchema,
  isAvailable: z.boolean().default(true),
});

export const optionGroupInputSchema = z
  .object({
    id: idSchema.optional(),
    name: nameSchema,
    minSelect: z.int().min(0).max(MAX_OPTIONS_PER_GROUP),
    maxSelect: z.int().min(1).max(MAX_OPTIONS_PER_GROUP),
    options: z.array(optionInputSchema).min(1).max(MAX_OPTIONS_PER_GROUP),
  })
  .refine((g) => g.minSelect <= g.maxSelect, {
    message: "minSelect must not exceed maxSelect",
    path: ["minSelect"],
  })
  .refine((g) => g.maxSelect <= g.options.length, {
    message: "maxSelect can't exceed the number of options",
    path: ["maxSelect"],
  });

// POST /api/staff/products, PUT /api/staff/products/:id — the whole product.
export const productInputSchema = z.object({
  categoryId: idSchema,
  name: nameSchema,
  description: z
    .string()
    .trim()
    .max(500)
    .transform((d) => d || null)
    .nullable()
    .default(null),
  priceKurus: priceSchema,
  isAvailable: z.boolean().default(true),
  optionGroups: z.array(optionGroupInputSchema).max(MAX_OPTION_GROUPS).default([]),
});

// PATCH /api/staff/products/:id/availability — the quick "sold out" switch.
export const availabilityInputSchema = z.object({ isAvailable: z.boolean() });

export type StaffMenuResponse = z.infer<typeof staffMenuResponseSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ReorderRequest = z.infer<typeof reorderRequestSchema>;
export type OptionInput = z.infer<typeof optionInputSchema>;
export type OptionGroupInput = z.infer<typeof optionGroupInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductInputData = z.input<typeof productInputSchema>;
