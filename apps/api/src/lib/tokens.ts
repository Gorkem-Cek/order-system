import { randomBytes } from "node:crypto";

/** 128 random bits, URL-safe — used in table QR links (/m/<token>). */
export function generateQrToken(): string {
  return randomBytes(16).toString("base64url");
}
