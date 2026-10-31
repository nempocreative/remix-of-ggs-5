import { and, asc, eq } from "drizzle-orm";
import {
  db,
  salonCustomersTable,
  salonPointRedemptionsTable,
  salesTable,
} from "@/server/db";
import type { SalonId } from "./point-rewards";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function rebuildSalonCustomerSummary(
  tx: Transaction,
  salon: SalonId,
  phone: string,
) {
  const [sales, redemptions, profile] = await Promise.all([
    tx
      .select()
      .from(salesTable)
      .where(and(eq(salesTable.salon, salon), eq(salesTable.customerPhone, phone)))
      .orderBy(asc(salesTable.createdAt), asc(salesTable.id)),
    tx
      .select()
      .from(salonPointRedemptionsTable)
      .where(and(
        eq(salonPointRedemptionsTable.salon, salon),
        eq(salonPointRedemptionsTable.customerPhone, phone),
      ))
      .orderBy(asc(salonPointRedemptionsTable.createdAt), asc(salonPointRedemptionsTable.id)),
    tx
      .select()
      .from(salonCustomersTable)
      .where(and(eq(salonCustomersTable.salon, salon), eq(salonCustomersTable.phone, phone)))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const earned = sales.reduce((sum, sale) => sum + sale.pointsEarned, 0);
  const spent = redemptions.reduce((sum, redemption) => sum + redemption.pointsSpent, 0);
  const currentPoints = profile?.points ?? earned - spent;
  const openingPoints = currentPoints - earned + spent;
  if (openingPoints < 0) {
    throw new Error(`Point ledger is inconsistent for ${salon} customer ${phone}.`);
  }

  const events = [
    ...sales.map((sale) => ({
      kind: "sale" as const,
      id: sale.id,
      createdAt: sale.createdAt,
      points: sale.pointsEarned,
      saleId: sale.id,
    })),
    ...redemptions.map((redemption) => ({
      kind: "redemption" as const,
      id: redemption.id,
      createdAt: redemption.createdAt,
      points: redemption.pointsSpent,
      saleId: null,
    })),
  ].sort((left, right) =>
    left.createdAt.getTime() - right.createdAt.getTime()
    || (left.kind === right.kind ? 0 : left.kind === "sale" ? -1 : 1)
    || left.id.localeCompare(right.id),
  );

  let balance = openingPoints;
  for (const event of events) {
    balance += event.kind === "sale" ? event.points : -event.points;
    if (balance < 0) {
      throw new Error(`Point ledger becomes negative for ${salon} customer ${phone}.`);
    }
    if (event.kind === "sale" && event.saleId) {
      await tx
        .update(salesTable)
        .set({ pointsBalance: balance })
        .where(eq(salesTable.id, event.saleId));
    }
  }

  const latestSale = sales.at(-1);
  const summary = {
    points: balance,
    transactionCount: sales.length,
    totalSpent: sales.reduce((sum, sale) => sum + sale.total, 0),
    lastTransactionAt: latestSale?.createdAt ?? null,
    updatedAt: new Date(),
  };

  if (profile) {
    await tx
      .update(salonCustomersTable)
      .set({
        ...summary,
        ...(latestSale ? { name: latestSale.customerName } : {}),
      })
      .where(and(
        eq(salonCustomersTable.salon, salon),
        eq(salonCustomersTable.phone, phone),
      ));
  } else if (latestSale) {
    await tx.insert(salonCustomersTable).values({
      salon,
      phone,
      name: latestSale.customerName,
      ...summary,
      createdAt: latestSale.createdAt,
    });
  }

  return summary;
}
