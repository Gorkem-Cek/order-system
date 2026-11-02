/** Largest image a café can upload (product photos, later logo and cover). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Formats accepted for upload; everything is stored as WebP. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;
