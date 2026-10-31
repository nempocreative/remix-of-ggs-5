import { eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  GetAuthStatusResponse,
  LoginCashierBody,
  LoginCashierResponse,
  LogoutCashierResponse,
  ListCashierAccessPinsResponse,
  SetCashierAccessPinBody,
  SetCashierAccessPinParams,
  SetCashierAccessPinResponse,
} from "@/lib/api-zod";
import type { CashierAccessPinAccount } from "@/lib/api-zod";
import { cashierAccessPinsTable, db } from "@/server/db";
import {
  clearCashierSession,
  getCashierSalonScope,
  getCashierAccounts,
  getCashierAccount,
  getCashierSessionUser,
  constantTimeEqual,
  createCashierSession,
  requireCashierSession,
} from "../lib/cashier-session";
import { createCashierAccessPinSecret, verifyCashierAccessPin } from "../lib/cashier-access-pin";

const router: IRouter = Router();
const FAILED_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map<string, { count: number; startedAt: number; blockedUntil: number }>();

function clientKey(address: string | undefined) {
  return address || "unknown";
}

function isBlocked(key: string, now: number) {
  const attempt = failedLogins.get(key);
  if (!attempt) return false;
  if (attempt.blockedUntil > now) return true;
  if (now - attempt.startedAt >= FAILURE_WINDOW_MS) failedLogins.delete(key);
  return false;
}

function recordFailure(key: string, now: number) {
  const previous = failedLogins.get(key);
  const current =
    !previous || now - previous.startedAt >= FAILURE_WINDOW_MS
      ? { count: 1, startedAt: now, blockedUntil: 0 }
      : { ...previous, count: previous.count + 1 };
  if (current.count >= FAILED_LIMIT) current.blockedUntil = now + FAILURE_WINDOW_MS;
  failedLogins.set(key, current);
}

router.get("/auth/status", (req, res): void => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  const user = getCashierSessionUser(req);
  res.json(GetAuthStatusResponse.parse({
    authenticated: user !== null,
    salonScope: user?.salonScope ?? null,
  }));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginCashierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Periksa ID dan kata sandi atau PIN." });
    return;
  }
  const hasPassword = typeof parsed.data.password === "string";
  const hasPin = typeof parsed.data.pin === "string";
  if (hasPassword === hasPin) {
    res.status(400).json({ error: "Pilih satu metode masuk: kata sandi atau PIN." });
    return;
  }

  const key = clientKey(req.ip);
  const now = Date.now();
  if (isBlocked(key, now)) {
    res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit." });
    return;
  }

  const sessionSecret =
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV !== "production" ? "ggs-beauty-pos-local-dev-secret-key-31" : null);

  if (!sessionSecret) {
    req.log.error("Application login session secret is not configured.");
    res.status(503).json({ error: "Login aplikasi belum dikonfigurasi." });
    return;
  }

  const account = getCashierAccount(parsed.data.id);
  if (!account) {
    recordFailure(key, now);
    res.status(401).json({ error: "ID atau kredensial tidak sesuai." });
    return;
  }

  if (hasPin) {
    const pinResult = await verifyCashierAccessPin(account.id, parsed.data.pin!);
    if (pinResult !== "valid") {
      if (pinResult === "locked") {
        res.status(423).json({ error: "Terlalu banyak percobaan PIN. Coba lagi dalam 15 menit." });
        return;
      }
      if (pinResult === "missing" && account.id === "ownerggs") {
        res.status(401).json({
          error: "PIN Owner belum diatur. Masuk dengan akun Owner lama, lalu atur PIN Owner di Keamanan Sistem.",
        });
        return;
      }
      recordFailure(key, now);
      res.status(401).json({ error: "ID atau kredensial tidak sesuai." });
      return;
    }
  } else {
    const passwordMatches = constantTimeEqual(
      parsed.data.password!,
      account.password ?? "pin-only-account-placeholder",
    );
    if (!account.password || !passwordMatches) {
      recordFailure(key, now);
      res.status(401).json({ error: "ID atau kredensial tidak sesuai." });
      return;
    }
  }

  if (hasPassword && account.role === "admin" && account.password && account.password.length < 12) {
    req.log.error({ accountId: account.id }, "Admin login password must contain at least 12 characters.");
    res.status(503).json({ error: "Kata sandi admin belum memenuhi panjang minimum 12 karakter." });
    return;
  }

  failedLogins.delete(key);
  try {
    createCashierSession(req, res, account.id);
  } catch (error) {
    req.log.error({ err: error }, "Unable to create cashier session.");
    res.status(503).json({ error: "Sesi kasir tidak dapat dibuat." });
    return;
  }
  req.log.info({ accountId: account.id, role: account.role }, "Application user signed in.");
  res.json(LoginCashierResponse.parse({
    authenticated: true,
    salonScope: getCashierSalonScope(account.id),
  }));
});

router.get("/auth/access-pins", requireCashierSession, async (req, res): Promise<void> => {
  const currentUser = getCashierSessionUser(req);
  const accounts = getCashierAccounts().filter(
    (account) =>
      (account.id !== "ownerggs" || currentUser?.role === "owner") &&
      (!currentUser?.salonScope || getCashierSalonScope(account.id) === currentUser.salonScope),
  );
  const pinRows = accounts.length
    ? await db
      .select({ accountId: cashierAccessPinsTable.accountId })
      .from(cashierAccessPinsTable)
      .where(inArray(cashierAccessPinsTable.accountId, accounts.map((account) => account.id)))
    : [];
  const configuredIds = new Set(pinRows.map((row) => row.accountId));

  res.set("Cache-Control", "no-store");
  res.json(ListCashierAccessPinsResponse.parse(accounts.map((account) => ({
    id: account.id,
    name: account.name,
    role: account.role,
    hasPin: configuredIds.has(account.id),
  } satisfies CashierAccessPinAccount))));
});

router.put("/auth/access-pins/:id", requireCashierSession, async (req, res): Promise<void> => {
  const params = SetCashierAccessPinParams.safeParse(req.params);
  const body = SetCashierAccessPinBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "PIN akses harus terdiri dari 6 angka." });
    return;
  }

  const account = getCashierAccount(params.data.id);
  if (!account) {
    res.status(404).json({ error: "Akun kasir tidak ditemukan." });
    return;
  }
  const currentUser = getCashierSessionUser(req);
  if (currentUser?.salonScope && getCashierSalonScope(account.id) !== currentUser.salonScope) {
    res.status(403).json({ error: "Akun ini hanya dapat mengubah PIN di salon yang ditetapkan." });
    return;
  }
  if (account.id === "ownerggs" && currentUser?.role !== "owner") {
    res.status(403).json({ error: "Hanya akun Owner yang dapat mengatur PIN Owner Global." });
    return;
  }

  const pinSecret = await createCashierAccessPinSecret(body.data.pin);
  await db
    .insert(cashierAccessPinsTable)
    .values({
      accountId: account.id,
      ...pinSecret,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: cashierAccessPinsTable.accountId,
      set: {
        ...pinSecret,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      },
    });

  req.log.info({ accountId: account.id }, "Set cashier account access PIN.");
  res.json(SetCashierAccessPinResponse.parse({ configured: true }));
});

router.post("/auth/logout", (req, res): void => {
  clearCashierSession(req, res);
  res.json(LogoutCashierResponse.parse({ authenticated: false, salonScope: null }));
});

export default router;
