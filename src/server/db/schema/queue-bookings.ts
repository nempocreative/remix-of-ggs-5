import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const queueBookingsTable = pgTable(
  "pos_queue_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    salon: text("salon").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    serviceId: text("service_id").notNull(),
    serviceName: text("service_name").notNull(),
    employeeId: text("employee_id").notNull(),
    employeeName: text("employee_name").notNull(),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    scheduledTime: text("scheduled_time").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("waiting"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("pos_queue_bookings_salon_date_time_idx").on(table.salon, table.scheduledDate, table.scheduledTime),
    index("pos_queue_bookings_salon_status_idx").on(table.salon, table.status),
  ],
);

export type QueueBooking = typeof queueBookingsTable.$inferSelect;
export type InsertQueueBooking = typeof queueBookingsTable.$inferInsert;
