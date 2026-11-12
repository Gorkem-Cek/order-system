import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts secrets stored in the database (cafés' iyzico secret keys) with AES-256-GCM, so a
// database leak alone doesn't reveal them. The key lives only in the server's environment.

const VERSION = "v1";

/** Reads a base64-encoded 32-byte key, e.g. from `openssl rand -base64 32`. */
export function parseSecretKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("The encryption key must be 32 bytes, base64-encoded");
  return key;
}

export function createSecretBox(key: Buffer) {
  if (key.length !== 32) throw new Error("The encryption key must be 32 bytes");
  return {
    seal(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const parts = [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url"));
      return [VERSION, ...parts].join(".");
    },

    /** Throws if the value was altered or sealed with another key. */
    open(sealed: string): string {
      const [version, iv, tag, data] = sealed.split(".");
      if (version !== VERSION || !iv || !tag || data === undefined) {
        throw new Error("Not a sealed value");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(data, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

export type SecretBox = ReturnType<typeof createSecretBox>;
