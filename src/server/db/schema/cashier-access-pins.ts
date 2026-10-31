import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const cashierAccessPinsTable = pgTable("pos_cashier_access_pins", {
  accountId: text("account_id").primaryKey(),
  pinSalt: text("pin_salt").notNull(),
  pinHash: text("pin_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CashierAccessPin = typeof cashierAccessPinsTable.$inferSelect;
export type InsertCashierAccessPin = typeof cashierAccessPinsTable.$inferInsert;
