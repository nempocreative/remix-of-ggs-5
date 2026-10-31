import { afterEach, describe, expect, it, vi } from "vitest";
import { createCashierSession, clearCashierSession } from "../server/api/lib/cashier-session";
import { Response, Router, dispatch, type Request } from "../server/express-shim";

const httpsRequest = { get: (name: string) => name === "x-forwarded-proto" ? "https" : undefined } as Request;

afterEach(() => vi.unstubAllEnvs());

describe("embedded cashier sessions", () => {
  it("sets a secure partitioned cookie for HTTPS login", () => {
    vi.stubEnv("SESSION_SECRET", "test-only-session-signing-key");
    const response = new Response();
    createCashierSession(httpsRequest, response, "kasirggs");
    const cookie = response.headers.get("Set-Cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Partitioned");
  });

  it("clears the same partitioned cookie on logout", () => {
    const response = new Response();
    clearCashierSession(httpsRequest, response);
    expect(response.headers.get("Set-Cookie")).toContain("Partitioned");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("rejects cross-site browser mutations before handlers run", async () => {
    const router = Router();
    const handler = vi.fn();
    router.post("/sales", handler);
    const response = await dispatch(router, new globalThis.Request("https://example.test/api/sales", {
      method: "POST", headers: { "sec-fetch-site": "cross-site" },
    }), "/api");
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});