import { z } from "zod";
import { idSchema } from "./common";

export const PASSWORD_MIN_LENGTH = 8;

export const roleSchema = z.enum(["SUPER_ADMIN", "STAFF"]);
export type Role = z.infer<typeof roleSchema>;

// Trim and lowercase before checking the format, so " Demo@Kafe.com " is accepted.
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

// POST /api/auth/login
export const loginRequestSchema = z.object({
  email: emailSchema,
  // No length rule on login: just check it against the stored hash.
  password: z.string().min(1).max(200),
});

// GET /api/auth/me, and the body of a successful login
export const sessionUserSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string(),
  role: roleSchema,
  cafeId: idSchema.nullable(),
});

// POST /api/auth/password
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(200),
  })
  .refine(({ currentPassword, newPassword }) => currentPassword !== newPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
