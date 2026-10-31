import { index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const salonPointRewardsTable = pgTable(
  "pos_salon_point_rewards",
  {
    salon: text("salon").notNull(),
    points: integer("points").notNull(),
    reward: text("reward").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.salon, table.points] }),
    index("pos_salon_point_rewards_salon_idx").on(table.salon),
  ],
);

export type SalonPointReward = typeof salonPointRewardsTable.$inferSelect;
export type InsertSalonPointReward = typeof salonPointRewardsTable.$inferInsert;
