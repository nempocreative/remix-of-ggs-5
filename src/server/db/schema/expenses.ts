import { createInsertSchema } from "drizzle-zod";
import { index, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const expensesTable = pgTable(
  "pos_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    salon: text("salon").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    paymentMethod: text("payment_method"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pos_expenses_salon_date_idx").on(table.salon, table.expenseDate),
  ],
);

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
