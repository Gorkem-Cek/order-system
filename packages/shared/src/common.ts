import { z } from "zod";

/** Database ids (Prisma cuid). */
export const idSchema = z.cuid();

/** Integer kuruş amount; never a float. */
export const kurusSchema = z.int().nonnegative();

/** Optional free-text note: trimmed, blank becomes undefined. */
export const noteSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((note) => note || undefined)
    .optional();
