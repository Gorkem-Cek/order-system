import { createHash, randomBytes } from "node:crypto";

/** 128 random bits, URL-safe — used in table QR links (/m/<token>). */
export function generateQrToken(): string {
  return randomBytes(16).toString("base64url");
}

/** 256 random bits, URL-safe — the value stored in the session cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 of a token; the database stores this instead of the token itself. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
