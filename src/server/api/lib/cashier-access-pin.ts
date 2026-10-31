import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cashierAccessPinsTable, db } from "@/server/db";

const PIN_LENGTH = 6;
const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;
const KEY_LENGTH = 64;

type PinResult = "valid" | "invalid" | "missing" | "locked";

function derivePinHash(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function createCashierAccessPinSecret(pin: string) {
  if (!new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin)) {
    throw new Error("PIN akses harus terdiri dari 6 angka.");
  }
  const salt = randomBytes(16);
  const hash = await derivePinHash(pin, salt);
  return {
    pinSalt: salt.toString("base64url"),
    pinHash: hash.toString("base64url"),
  };
}

export async function verifyCashierAccessPin(accountId: string, pin: string): Promise<PinResult> {
  const [storedPin] = await db
    .select()
    .from(cashierAccessPinsTable)
    .where(eq(cashierAccessPinsTable.accountId, accountId))
    .limit(1);

  if (!storedPin) {
    return "missing";
  }
  const now = new Date();
  if (storedPin.lockedUntil && storedPin.lockedUntil > now) return "locked";

  const actualHash = await derivePinHash(pin, Buffer.from(storedPin.pinSalt, "base64url"));
  const expectedHash = Buffer.from(storedPin.pinHash, "base64url");
  const valid = actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);

  if (!valid) {
    const failedAttempts = storedPin.failedAttempts + 1;
    const lockedUntil = failedAttempts >= LOCK_THRESHOLD
      ? new Date(now.getTime() + LOCK_MINUTES * 60_000)
      : null;
    await db
      .update(cashierAccessPinsTable)
      .set({ failedAttempts, lockedUntil, updatedAt: now })
      .where(eq(cashierAccessPinsTable.accountId, accountId));
    return lockedUntil ? "locked" : "invalid";
  }

  if (storedPin.failedAttempts || storedPin.lockedUntil) {
    await db
      .update(cashierAccessPinsTable)
      .set({ failedAttempts: 0, lockedUntil: null, updatedAt: now })
      .where(eq(cashierAccessPinsTable.accountId, accountId));
  }
  return "valid";
}
