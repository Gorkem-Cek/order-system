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

/** Which iyzico environment a café's keys belong to: test (sandbox) or real payments. */
export const IYZICO_MODES = ["SANDBOX", "LIVE"] as const;
export const iyzicoModeSchema = z.enum(IYZICO_MODES);
export type IyzicoMode = z.infer<typeof iyzicoModeSchema>;

export const adminCafeSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  // The café's shared staff login; null only if it was removed by hand.
  loginEmail: z.email().nullable(),
  // Null until the café's iyzico keys are saved.
  paymentMode: iyzicoModeSchema.nullable(),
});

export const adminCafesResponseSchema = z.object({ cafes: z.array(adminCafeSchema) });

// GET / PUT /api/admin/cafes/:id/payment — keys are write-only: only the API key's last
// characters come back, the secret key never does.
export const cafePaymentSettingsSchema = z.object({
  mode: iyzicoModeSchema.nullable(),
  apiKeyEnding: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
});

const iyzicoKeySchema = z.string().trim().min(10).max(200);

export const updateCafePaymentRequestSchema = z
  .object({
    mode: iyzicoModeSchema,
    address: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(50),
    // Leave both out to keep the saved keys.
    apiKey: iyzicoKeySchema.optional(),
    secretKey: iyzicoKeySchema.optional(),
  })
  .refine((body) => (body.apiKey === undefined) === (body.secretKey === undefined), {
    message: "Send both keys or neither",
    path: ["secretKey"],
  });

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
export type CafePaymentSettings = z.infer<typeof cafePaymentSettingsSchema>;
export type UpdateCafePaymentRequest = z.infer<typeof updateCafePaymentRequestSchema>;
export type AdminCafesResponse = z.infer<typeof adminCafesResponseSchema>;
export type StaffCafe = z.infer<typeof staffCafeSchema>;

/** A #rrggbb colour; stored lowercase. */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb colour")
  .transform((color) => color.toLowerCase());

// PATCH /api/staff/cafe — branding the café's staff can change themselves.
export const updateCafeSettingsRequestSchema = z
  .object({ name: cafeNameSchema.optional(), primaryColor: hexColorSchema.optional() })
  .refine((body) => body.name !== undefined || body.primaryColor !== undefined, {
    message: "Nothing to update",
  });
export type UpdateCafeSettingsRequest = z.infer<typeof updateCafeSettingsRequestSchema>;

// POST (multipart, one file) and DELETE /api/staff/cafe/images/:kind — both return the StaffCafe.
export const CAFE_IMAGE_KINDS = ["logo", "cover"] as const;
export const cafeImageKindSchema = z.enum(CAFE_IMAGE_KINDS);
export type CafeImageKind = z.infer<typeof cafeImageKindSchema>;
