import { and, desc, eq, gt, lte } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import { commissionSettlementsTable, db, saleItemsTable, salesTable, salonEmployeesTable } from "@/server/db";
import { getCashierSessionUser } from "../lib/cashier-session";
import { lastCutoff, savingsBalance, type SettlementAction } from "../lib/commission-ledger";

const router: IRouter = Router();
const isSalon = (value: unknown): value is "beauty" | "hair-studio" => value === "beauty" || value === "hair-studio";
const toResponse = (row: typeof commissionSettlementsTable.$inferSelect) => ({
  ...row,
  periodStart: row.periodStart ? row.periodStart.toISOString() : null,
  periodEnd: new Date(row.periodEnd).toISOString(),
  createdAt: new Date(row.createdAt).toISOString(),
});

async function loadSettlements(salon: string) {
  return db.select().from(commissionSettlementsTable).where(eq(commissionSettlementsTable.salon, salon)).orderBy(desc(commissionSettlementsTable.createdAt));
}

router.get("/commissions/:salon", async (req, res): Promise<void> => {
  const salon = req.params.salon;
  if (!isSalon(salon)) { res.status(400).json({ error: "Salon tidak valid." }); return; }
  const rows = await loadSettlements(salon);
  const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
  res.json({
    settlements: rows.map(toResponse),
    employees: Object.fromEntries(employeeIds.map((id) => [id, {
      cutoff: lastCutoff(rows, id)?.toISOString() ?? null,
      savings: savingsBalance(rows, id),
    }])),
  });
});

router.post("/commissions/:salon/:employeeId", async (req, res): Promise<void> => {
  const { salon, employeeId } = req.params;
  const action = (req.body as { action?: unknown } | undefined)?.action as SettlementAction;
  if (!isSalon(salon) || !["withdraw", "save", "savings_withdraw"].includes(action)) {
    res.status(400).json({ error: "Pilihan komisi tidak valid." }); return;
  }
  const [employee] = await db.select().from(salonEmployeesTable)
    .where(and(eq(salonEmployeesTable.salon, salon), eq(salonEmployeesTable.id, employeeId)));
  if (!employee) { res.status(404).json({ error: "Staf tidak ditemukan." }); return; }

  const rows = await loadSettlements(salon);
  const now = new Date();
  const cutoff = lastCutoff(rows, employeeId);
  let amount: number;
  if (action === "savings_withdraw") {
    amount = savingsBalance(rows, employeeId);
    if (amount <= 0) { res.status(400).json({ error: "Tabungan komisi staf ini masih kosong." }); return; }
  } else {
    const items = await db.select({ amount: saleItemsTable.commissionAmount })
      .from(saleItemsTable)
      .innerJoin(salesTable, eq(saleItemsTable.saleId, salesTable.id))
      .where(and(
        eq(salesTable.salon, salon),
        eq(saleItemsTable.employeeId, employeeId),
        lte(salesTable.createdAt, now),
        ...(cutoff ? [gt(salesTable.createdAt, cutoff)] : []),
      ));
    amount = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    if (amount <= 0) { res.status(400).json({ error: "Belum ada komisi baru untuk staf ini." }); return; }
  }

  const [created] = await db.insert(commissionSettlementsTable).values({
    salon,
    employeeId,
    employeeName: employee.name,
    action,
    amount,
    periodStart: action === "savings_withdraw" ? null : cutoff,
    periodEnd: action === "savings_withdraw" ? (cutoff ?? now) : now,
    createdBy: getCashierSessionUser(req)?.name ?? null,
  }).returning();
  res.status(201).json(toResponse(created));
});

export default router;
