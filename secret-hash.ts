import { createHash, pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Cb);

export async function hashSecret(secret: string, salt: string): Promise<string> {
  const buf = (await pbkdf2(secret, salt, 100_000, 32, "sha256")) as Buffer;
  return buf.toString("hex");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function secretsMatch(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function newPermissionCode(): string {
  return `PNT-${randomBytes(4).toString("hex").toUpperCase()}`;
}
