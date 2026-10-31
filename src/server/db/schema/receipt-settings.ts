import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const salonReceiptSettingsTable = pgTable("pos_salon_receipt_settings", {
  salon: text("salon").primaryKey(),
  thankYouText: text("thank_you_text").notNull(),
  taglineText: text("tagline_text").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SalonReceiptSettings = typeof salonReceiptSettingsTable.$inferSelect;
export type InsertSalonReceiptSettings = typeof salonReceiptSettingsTable.$inferInsert;
