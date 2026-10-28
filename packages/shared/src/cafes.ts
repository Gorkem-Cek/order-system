import { z } from "zod";
import { emailSchema, newPasswordSchema } from "./auth";
import { idSchema } from "./common";

/** URL-friendly café id, e.g. "demo-kafe". */
export const cafeSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens");

const cafeNameSchema = z.string().trim().min(2).max(100);

// --- Super-admin: /api/admin/cafes ---

// POST /api/admin/cafes — creates the café and its shared staff login.
export const createCafeRequestSchema = z.object({
  name: cafeNameSchema,
  slug: cafeSlugSchema,
  loginEmail: emailSchema,
  loginPassword: newPasswordSchema,
});

// PATCH /api/admin/cafes/:id
export const updateCafeRequestSchema = z
  .object({ name: cafeNameSchema.optional(), isActive: z.boolean().optional() })
  .refine((body) => body.name !== undefined || body.isActive !== undefined, {
    message: "Nothing to update",
  });

// POST /api/admin/cafes/:id/password — resets the café's shared login password.
export const resetCafePasswordRequestSchema = z.object({ newPassword: newPasswordSchema });

export const adminCafeSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  // The café's shared staff login; null only if it was removed by hand.
  loginEmail: z.email().nullable(),
});

export const adminCafesResponseSchema = z.object({ cafes: z.array(adminCafeSchema) });

// --- Staff: the café being managed ---

// GET /api/staff/cafe — for staff it's their own café; a super-admin picks one with X-Cafe-Id.
export const staffCafeSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  primaryColor: z.string(),
  isActive: z.boolean(),
});

/** Header a super-admin sends to act on a specific café's staff endpoints. */
export const CAFE_ID_HEADER = "x-cafe-id";

export type CreateCafeRequest = z.infer<typeof createCafeRequestSchema>;
export type UpdateCafeRequest = z.infer<typeof updateCafeRequestSchema>;
export type ResetCafePasswordRequest = z.infer<typeof resetCafePasswordRequestSchema>;
export type AdminCafe = z.infer<typeof adminCafeSchema>;
export type AdminCafesResponse = z.infer<typeof adminCafesResponseSchema>;
export type StaffCafe = z.infer<typeof staffCafeSchema>;
