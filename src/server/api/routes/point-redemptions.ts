import { and, count, desc, eq, gt, gte, ilike, isNotNull, lt, or } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  CreatePointRedemptionBody,
  CreatePointRedemptionResponse,
  GetPointActivityQueryParams,
  GetPointActivityResponse,
  GetPointRedemptionsQueryParams,
  GetPointRedemptionsResponse,
  GetPointRewardsQueryParams,
  GetPointRewardsResponse,
  UpdatePointRewardsBody,
  UpdatePointRewardsResponse,
} from "@/lib/api-zod";
import {
  db,
  salonCustomersTable,
  salonPointRedemptionsTable,
  salonPointRewardsTable,
  salesTable,
} from "@/server/db";
import { getCashierSessionUser } from "../lib/cashier-session";
import { findPointReward, getPointRewards, type SalonId } from "../lib/point-rewards";

const router: IRouter = Router();

function jakartaDayStart(date: Date): Date {
  const dateKey = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return new Date(`${dateKey}T00:00:00.000+07:00`);
}

function nextDate(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  ));
}

router.get("/points/rewards", async (req, res): Promise<void> => {
  const parsed = GetPointRewardsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }

  const rewards = await getPointRewards(parsed.data.salon as SalonId);
  res.json(GetPointRewardsResponse.parse(rewards));
});

router.put("/points/rewards", async (req, res): Promise<void> => {
  const parsed = UpdatePointRewardsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Daftar hadiah poin tidak valid." });
    return;
  }

  const cashier = getCashierSessionUser(req);
  if (!cashier) {
    res.status(401).json({ error: "Silakan masuk ke web GGS." });
    return;
  }
  if (cashier.salonScope) {
    res.status(403).json({ error: "Pengaturan hadiah hanya tersedia untuk pengelola salon." });
    return;
  }

  const { salon, rewards } = parsed.data;
  const uniquePoints = new Set(rewards.map((reward) => reward.points));
  const normalizedRewards = rewards.map(({ points, reward }) => ({
    points,
    reward: reward.trim(),
  }));
  if (uniquePoints.size !== rewards.length || normalizedRewards.some(({ reward }) => !reward)) {
    res.status(400).json({ error: "Setiap hadiah harus memiliki biaya poin berbeda dan nama yang terisi." });
    return;
  }

  const savedRewards = await db.transaction(async (tx) => {
    await tx.delete(salonPointRewardsTable).where(eq(salonPointRewardsTable.salon, salon));
    await tx.insert(salonPointRewardsTable).values(
      normalizedRewards.map((reward) => ({ salon, ...reward })),
    );
    return tx
      .select({ points: salonPointRewardsTable.points, reward: salonPointRewardsTable.reward })
      .from(salonPointRewardsTable)
      .where(eq(salonPointRewardsTable.salon, salon))
      .orderBy(salonPointRewardsTable.points);
  });

  req.log.info({ salon, rewardCount: savedRewards.length }, "Updated salon point rewards.");
  res.json(UpdatePointRewardsResponse.parse(savedRewards));
});

router.get("/points/activity", async (req, res): Promise<void> => {
  const parsed = GetPointActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Salon, rentang tanggal, atau halaman aktivitas tidak valid." });
    return;
  }

  const { salon, startDate, endDate, search, offset, limit } = parsed.data;
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    res.status(400).json({ error: "Tanggal awal tidak boleh melewati tanggal akhir." });
    return;
  }

  const salesDateFilters = [
    ...(startDate ? [gte(salesTable.createdAt, jakartaDayStart(startDate))] : []),
    ...(endDate ? [lt(salesTable.createdAt, jakartaDayStart(nextDate(endDate)))] : []),
  ];
  const redemptionDateFilters = [
    ...(startDate ? [gte(salonPointRedemptionsTable.createdAt, jakartaDayStart(startDate))] : []),
    ...(endDate ? [lt(salonPointRedemptionsTable.createdAt, jakartaDayStart(nextDate(endDate)))] : []),
  ];
  const trimmedSearch = search?.trim();
  const pattern = trimmedSearch ? `%${trimmedSearch}%` : null;

  const salesFilters = [
    eq(salesTable.salon, salon),
    isNotNull(salesTable.customerPhone),
    gt(salesTable.pointsEarned, 0),
    ...salesDateFilters,
    ...(pattern ? [or(
      ilike(salesTable.customerName, pattern),
      ilike(salesTable.customerPhone, pattern),
      ilike(salesTable.invoiceNumber, pattern),
    )!] : []),
  ];
  const redemptionFilters = [
    eq(salonPointRedemptionsTable.salon, salon),
    ...redemptionDateFilters,
    ...(pattern ? [or(
      ilike(salonPointRedemptionsTable.customerName, pattern),
      ilike(salonPointRedemptionsTable.customerPhone, pattern),
      ilike(salonPointRedemptionsTable.rewardName, pattern),
    )!] : []),
  ];

  const [sales, redemptions, [activeCustomersRow]] = await Promise.all([
    db
      .select({
        id: salesTable.id,
        invoiceNumber: salesTable.invoiceNumber,
        createdAt: salesTable.createdAt,
        customerName: salesTable.customerName,
        customerPhone: salesTable.customerPhone,
        cashierName: salesTable.cashierName,
        points: salesTable.pointsEarned,
      })
      .from(salesTable)
      .where(and(...salesFilters))
      .orderBy(desc(salesTable.createdAt), desc(salesTable.id)),
    db
      .select({
        id: salonPointRedemptionsTable.id,
        createdAt: salonPointRedemptionsTable.createdAt,
        customerName: salonPointRedemptionsTable.customerName,
        customerPhone: salonPointRedemptionsTable.customerPhone,
        cashierName: salonPointRedemptionsTable.redeemedBy,
        points: salonPointRedemptionsTable.pointsSpent,
        rewardName: salonPointRedemptionsTable.rewardName,
      })
      .from(salonPointRedemptionsTable)
      .where(and(...redemptionFilters))
      .orderBy(desc(salonPointRedemptionsTable.createdAt), desc(salonPointRedemptionsTable.id)),
    db
      .select({ count: count() })
      .from(salonCustomersTable)
      .where(and(
        eq(salonCustomersTable.salon, salon),
        gt(salonCustomersTable.points, 0),
      )),
  ]);

  const activities = [
    ...sales.flatMap((sale) => sale.customerPhone ? [{
      id: `sale:${sale.id}`,
      salon: salon as SalonId,
      kind: "earned" as const,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      points: sale.points,
      detail: "Poin dari transaksi",
      reference: sale.invoiceNumber,
      cashierName: sale.cashierName,
      createdAt: sale.createdAt,
    }] : []),
    ...redemptions.map((redemption) => ({
      id: `redemption:${redemption.id}`,
      salon: salon as SalonId,
      kind: "redeemed" as const,
      customerName: redemption.customerName,
      customerPhone: redemption.customerPhone,
      points: redemption.points,
      detail: redemption.rewardName,
      reference: null,
      cashierName: redemption.cashierName,
      createdAt: redemption.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

  const activityCount = activities.length;
  const earnedPoints = activities.reduce((total, activity) =>
    activity.kind === "earned" ? total + activity.points : total, 0);
  const redeemedPoints = activities.reduce((total, activity) =>
    activity.kind === "redeemed" ? total + activity.points : total, 0);

  res.set("Cache-Control", "no-store");
  res.json(GetPointActivityResponse.parse({
    salon,
    earnedPoints,
    redeemedPoints,
    activeCustomers: activeCustomersRow?.count ?? 0,
    activityCount,
    hasMore: offset + limit < activityCount,
    activities: activities.slice(offset, offset + limit),
  }));
});

router.get("/points/redemptions", async (req, res): Promise<void> => {
  const parsed = GetPointRedemptionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Salon atau nomor HP pelanggan tidak valid." });
    return;
  }

  const rows = await db
    .select()
    .from(salonPointRedemptionsTable)
    .where(and(
      eq(salonPointRedemptionsTable.salon, parsed.data.salon),
      eq(salonPointRedemptionsTable.customerPhone, parsed.data.phone),
    ))
    .orderBy(desc(salonPointRedemptionsTable.createdAt), desc(salonPointRedemptionsTable.id));

  res.set("Cache-Control", "no-store");
  res.json(GetPointRedemptionsResponse.parse(rows));
});

router.post("/points/redemptions", async (req, res): Promise<void> => {
  const parsed = CreatePointRedemptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data penukaran hadiah tidak valid." });
    return;
  }

  const { salon, customerPhone, rewardPoints } = parsed.data;
  const salonId = salon as SalonId;
  const reward = await findPointReward(salonId, rewardPoints);
  if (!reward) {
    res.status(400).json({ error: "Hadiah tidak tersedia untuk salon ini." });
    return;
  }

  const cashier = getCashierSessionUser(req);
  if (!cashier) {
    res.status(401).json({ error: "Silakan masuk ke web GGS." });
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(salonCustomersTable)
      .where(and(
        eq(salonCustomersTable.salon, salonId),
        eq(salonCustomersTable.phone, customerPhone),
      ))
      .for("update")
      .limit(1);

    if (!customer) return { kind: "not-found" as const };
    if (customer.points < reward.points) return { kind: "insufficient" as const };

    const now = new Date();
    await tx
      .update(salonCustomersTable)
      .set({ points: customer.points - reward.points, updatedAt: now })
      .where(and(
        eq(salonCustomersTable.salon, salonId),
        eq(salonCustomersTable.phone, customerPhone),
      ));

    const [redemption] = await tx
      .insert(salonPointRedemptionsTable)
      .values({
        salon: salonId,
        customerPhone,
        customerName: customer.name,
        pointsSpent: reward.points,
        rewardName: reward.reward,
        redeemedBy: cashier.name,
        createdAt: now,
      })
      .returning();
    return { kind: "created" as const, redemption };
  });

  if (outcome.kind === "not-found") {
    res.status(404).json({ error: "Profil pelanggan tidak ditemukan di salon ini." });
    return;
  }
  if (outcome.kind === "insufficient") {
    res.status(409).json({ error: "Saldo poin pelanggan belum mencukupi untuk hadiah ini." });
    return;
  }

  req.log.info({
    salon: salonId,
    customerPhone,
    pointsSpent: outcome.redemption.pointsSpent,
    redeemedBy: cashier.name,
  }, "Recorded customer point redemption.");
  res.status(201).json(CreatePointRedemptionResponse.parse(outcome.redemption));
});

export default router;
