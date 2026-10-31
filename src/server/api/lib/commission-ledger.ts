export type SettlementAction = "withdraw" | "save" | "savings_withdraw";
export type SettlementRow = { employeeId: string; action: string; amount: number; periodEnd: Date | string };

/** Latest point in time up to which an employee's commission was already withdrawn or saved. */
export function lastCutoff(rows: SettlementRow[], employeeId: string): Date | null {
  let latest: Date | null = null;
  for (const row of rows) {
    if (row.employeeId !== employeeId || (row.action !== "withdraw" && row.action !== "save")) continue;
    const end = new Date(row.periodEnd);
    if (!latest || end > latest) latest = end;
  }
  return latest;
}

/** Savings balance: saved commission minus savings already paid out. */
export function savingsBalance(rows: SettlementRow[], employeeId: string): number {
  return rows.reduce((sum, row) => row.employeeId !== employeeId ? sum
    : row.action === "save" ? sum + row.amount
    : row.action === "savings_withdraw" ? sum - row.amount : sum, 0);
}
