import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "@/server/express-shim";
import type { SalonId } from "./default-services";

const COOKIE_NAME = "ggs_cashier_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = { sub: string; exp: number };
export type CashierAccount = {
  id: string;
  name: string;
  role: "admin" | "owner";
  password: string | null;
};
export type CashierSessionUser = Omit<CashierAccount, "password"> & {
  salonScope: SalonId | null;
};

const normalizeId = (id: string) => id.trim().toLocaleLowerCase("id-ID");

export function getCashierAccounts(): CashierAccount[] {
  const accounts: CashierAccount[] = [];
  const belaPassword = process.env.POS_ADMIN_BELA_PASSWORD;
  const ocaPassword = process.env.POS_ADMIN_OCA_PASSWORD;
  const ownerId = process.env.POS_CASHIER_ID?.trim();
  const ownerPassword = process.env.POS_CASHIER_PASSWORD;
  const addAccount = (account: CashierAccount) => {
    if (!accounts.some((existing) => normalizeId(existing.id) === normalizeId(account.id))) {
      accounts.push(account);
    }
  };

  if (belaPassword) addAccount({ id: "bela", name: "Bela", role: "admin", password: belaPassword });
  if (ocaPassword) addAccount({ id: "oca", name: "Oca", role: "admin", password: ocaPassword });
  addAccount({ id: "belakasir", name: "Bela", role: "admin", password: null });
  addAccount({ id: "ocakasir", name: "Rosa", role: "admin", password: null });
  addAccount({ id: "kasirggs", name: "Bela dan Oca", role: "admin", password: null });
  if (ownerId && ownerPassword && normalizeId(ownerId) !== "ownerggs") {
    addAccount({ id: normalizeId(ownerId), name: "Owner", role: "owner", password: ownerPassword });
  }
  addAccount({ id: "ownerggs", name: "Owner", role: "owner", password: null });
  if (!accounts.some((account) => normalizeId(account.id) === "ggssuksesyuk")) {
    addAccount({
      id: "ggssuksesyuk",
      name: "GGS Sukses Yuk",
      role: "admin",
      password: null,
    });
  }
  return accounts;
}

export function getCashierAccount(id: string): CashierAccount | undefined {
  const normalizedId = normalizeId(id);
  return getCashierAccounts().find((account) => normalizeId(account.id) === normalizedId);
}

export function getCashierSalonScope(accountId: string): SalonId | null {
  switch (normalizeId(accountId)) {
    case "belakasir":
      return "beauty";
    case "ocakasir":
      return "hair-studio";
    default:
      return null;
  }
}

const constantTimeEqual = (left: string, right: string) => {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
};

const getSessionSecret = () =>
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV !== "production" ? "ggs-beauty-pos-local-dev-secret-key-31" : "");

const sign = (payload: string) =>
  createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

const getCookieOptions = (req: Request) => {
  const secure =
    process.env.NODE_ENV === "production" ||
    req.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
  return {
    httpOnly: true,
    secure,
    partitioned: secure,
    sameSite: secure ? "none" as const : "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
};

function readCashierSession(req: Request): SessionPayload | null {
  const token = req.cookies?.[COOKIE_NAME];
  const secret = getSessionSecret();
  if (typeof token !== "string" || !secret) return null;

  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length) return null;
  if (!constantTimeEqual(sign(encodedPayload), signature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (
      typeof payload.sub !== "string" ||
      !getCashierAccount(payload.sub) ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}

export function getCashierSessionUser(req: Request): CashierSessionUser | null {
  const payload = readCashierSession(req);
  if (!payload) return null;
  const account = getCashierAccount(payload.sub);
  if (!account) return null;
  const { password: _password, ...user } = account;
  return { ...user, salonScope: getCashierSalonScope(user.id) };
}

export function hasCashierSession(req: Request): boolean {
  return getCashierSessionUser(req) !== null;
}

export function createCashierSession(req: Request, res: Response, id: string): void {
  const account = getCashierAccount(id);
  if (!account || !process.env.SESSION_SECRET) {
    throw new Error("Cashier session configuration is incomplete.");
  }
  const payload = Buffer.from(
    JSON.stringify({
      sub: account.id,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    } satisfies SessionPayload),
  ).toString("base64url");
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, getCookieOptions(req));
}

export function clearCashierSession(req: Request, res: Response): void {
  const options = getCookieOptions(req);
  res.clearCookie(COOKIE_NAME, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    partitioned: options.partitioned,
    sameSite: options.sameSite,
    path: options.path,
  });
}

export function requireCashierSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!hasCashierSession(req)) {
    res.status(401).json({ error: "Silakan masuk ke web GGS." });
    return;
  }
  next();
}

export function requireCashierSalonScope(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = getCashierSessionUser(req);
  if (!user?.salonScope) {
    next();
    return;
  }

  const requestedSalons = [
    req.query.salon,
    req.body && typeof req.body === "object" ? (req.body as { salon?: unknown }).salon : undefined,
    req.params?.salon,
    ...req.path.split("/").filter((segment) => segment === "beauty" || segment === "hair-studio"),
  ].flatMap((value) => Array.isArray(value) ? value : [value]);
  const hasForeignSalon = requestedSalons.some(
    (salon) => (salon === "beauty" || salon === "hair-studio") && salon !== user.salonScope,
  );

  if (hasForeignSalon) {
    res.status(403).json({ error: "Akun ini hanya dapat mengakses salon yang ditetapkan." });
    return;
  }
  next();
}

export { constantTimeEqual };
