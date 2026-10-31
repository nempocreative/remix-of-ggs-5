import { boolean, date, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const salonPromoSettingsTable = pgTable("pos_salon_promo_settings", {
  salon: text("salon").primaryKey(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  isActive: boolean("is_active").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SalonPromoSettings = typeof salonPromoSettingsTable.$inferSelect;
export type InsertSalonPromoSettings = typeof salonPromoSettingsTable.$inferInsert;
