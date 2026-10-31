import { describe, expect, it } from "vitest";
import { getCashierAccount, getCashierSalonScope } from "../server/api/lib/cashier-session";

describe("requested cashier login accounts", () => {
  it("restricts ocakasir to the men's hair studio with admin privileges", () => {
    expect(getCashierAccount("ocakasir")?.role).toBe("admin");
    expect(getCashierAccount("ocakasir")?.password).toBeNull();
    expect(getCashierSalonScope("ocakasir")).toBe("hair-studio");
  });

  it("restricts belakasir to the women's beauty salon with admin privileges", () => {
    expect(getCashierAccount("belakasir")?.role).toBe("admin");
    expect(getCashierAccount("belakasir")?.password).toBeNull();
    expect(getCashierSalonScope("belakasir")).toBe("beauty");
  });

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