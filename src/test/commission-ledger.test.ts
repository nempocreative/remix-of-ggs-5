import { describe, expect, it } from "vitest";
import { lastCutoff, savingsBalance } from "@/server/api/lib/commission-ledger";

const rows = [
  { employeeId: "a", action: "save", amount: 30000, periodEnd: "2026-10-30T10:00:00Z" },
  { employeeId: "a", action: "withdraw", amount: 20000, periodEnd: "2026-10-31T10:00:00Z" },
  { employeeId: "a", action: "savings_withdraw", amount: 10000, periodEnd: "2026-10-31T10:00:00Z" },
  { employeeId: "b", action: "save", amount: 5000, periodEnd: "2026-10-29T10:00:00Z" },
];

describe("commission ledger", () => {
  it("withdrawn or saved commission is excluded after the latest cutoff", () => {
    expect(lastCutoff(rows, "a")?.toISOString()).toBe("2026-10-31T10:00:00.000Z");
    expect(lastCutoff(rows, "c")).toBeNull();
  });
  it("saved commission goes into savings, payouts reduce it", () => {
    expect(savingsBalance(rows, "a")).toBe(20000);
    expect(savingsBalance(rows, "b")).toBe(5000);
  });
});
