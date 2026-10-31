import { describe, expect, it } from "vitest";
import { getCashierAccount, getCashierSalonScope } from "../server/api/lib/cashier-session";

describe("requested cashier login accounts", () => {
  it("maps ownerggs to owner privileges", () => {
    expect(getCashierAccount("ownerggs")?.role).toBe("owner");
  });

  it("maps Bela and Oca's shared kasirggs account to admin, not owner", () => {
    const account = getCashierAccount("kasirggs");
    expect(account?.role).toBe("admin");
    expect(account?.password).toBeNull();
    expect(getCashierSalonScope("kasirggs")).toBeNull();
  });
});