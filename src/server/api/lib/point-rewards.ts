import { eq } from "drizzle-orm";
import { db, salonPointRewardsTable } from "@/server/db";

export type SalonId = "beauty" | "hair-studio";

export type PointReward = {
  points: number;
  reward: string;
};

export const defaultPointRewards: Record<SalonId, PointReward[]> = {
  beauty: [
    { points: 100, reward: "Minuman gratis" },
    { points: 350, reward: "Nail art polos gratis" },
    { points: 500, reward: "Totok wajah + masker gratis" },
    { points: 600, reward: "Lotion gratis" },
    { points: 700, reward: "Jadi member" },
    { points: 800, reward: "Creambath gratis" },
    { points: 1000, reward: "Undian motor listrik / massage layanan wanita gratis" },
  ],
  "hair-studio": [
    { points: 100, reward: "Minuman gratis" },
    { points: 200, reward: "Diskon 30% untuk semua treatment" },
    { points: 350, reward: "Potong rambut gratis" },
    { points: 500, reward: "Produk clay gratis" },
    { points: 600, reward: "Lotion gratis" },
    { points: 700, reward: "Dapat kartu member" },
    { points: 1000, reward: "Undian motor listrik" },
  ],
};

export async function getPointRewards(salon: SalonId): Promise<PointReward[]> {
  const existing = await db
    .select({ points: salonPointRewardsTable.points, reward: salonPointRewardsTable.reward })
    .from(salonPointRewardsTable)
    .where(eq(salonPointRewardsTable.salon, salon))
    .orderBy(salonPointRewardsTable.points);

  if (existing.length) return existing;

  await db
    .insert(salonPointRewardsTable)
    .values(defaultPointRewards[salon].map((reward) => ({ salon, ...reward })))
    .onConflictDoNothing();

  return db
    .select({ points: salonPointRewardsTable.points, reward: salonPointRewardsTable.reward })
    .from(salonPointRewardsTable)
    .where(eq(salonPointRewardsTable.salon, salon))
    .orderBy(salonPointRewardsTable.points);
}

export async function findPointReward(salon: SalonId, points: number): Promise<PointReward | undefined> {
  const rewards = await getPointRewards(salon);
  return rewards.find((reward) => reward.points === points);
}
