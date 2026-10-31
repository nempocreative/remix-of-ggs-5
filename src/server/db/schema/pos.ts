import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const customersTable = pgTable(
  "pos_customers",
  {
    phone: text("phone").primaryKey(),
    name: text("name").notNull(),
    points: integer("points").notNull().default(0),
    transactionCount: integer("transaction_count").notNull().default(0),
    totalSpent: bigint("total_spent", { mode: "number" }).notNull().default(0),
    lastTransactionAt: timestamp("last_transaction_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
);

export const salonCustomersTable = pgTable(
  "pos_salon_customers",
  {
    salon: text("salon").notNull(),
    phone: text("phone").notNull(),
    memberCode: uuid("member_code").notNull().defaultRandom(),
    name: text("name").notNull(),
    points: integer("points").notNull().default(0),
    transactionCount: integer("transaction_count").notNull().default(0),
    totalSpent: bigint("total_spent", { mode: "number" }).notNull().default(0),
    lastTransactionAt: timestamp("last_transaction_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.salon, table.phone] }),
    index("pos_salon_customers_salon_points_idx").on(table.salon, table.points),
    uniqueIndex("pos_salon_customers_member_code_idx").on(table.memberCode),
  ],
);

export const salonServicesTable = pgTable(
  "pos_services",
  {
    salon: text("salon").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    minPrice: integer("min_price").notNull(),
    maxPrice: integer("max_price"),
    priceType: text("price_type").notNull(),
    commissionPercent: doublePrecision("commission_percent"),
  },
  (table) => [
    primaryKey({ columns: [table.salon, table.id] }),
    index("pos_services_salon_category_idx").on(table.salon, table.category),
  ],
);

export const salonEmployeesTable = pgTable(
  "pos_salon_employees",
  {
    salon: text("salon").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    commissionPercent: doublePrecision("commission_percent").notNull(),
    active: boolean("active").notNull().default(true),
    isCashier: boolean("is_cashier").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.salon, table.id] }),
    index("pos_salon_employees_salon_active_idx").on(table.salon, table.active),
  ],
);

export const employeeAttendanceAuthTable = pgTable(
  "pos_employee_attendance_auth",
  {
    salon: text("salon").notNull(),
    employeeId: text("employee_id").notNull(),
    pinSalt: text("pin_salt").notNull(),
    pinHash: text("pin_hash").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.salon, table.employeeId] }),
    index("pos_employee_attendance_auth_salon_employee_idx").on(table.salon, table.employeeId),
  ],
);

export const employeeAttendancePasskeysTable = pgTable(
  "pos_employee_attendance_passkeys",
  {
    id: text("id").primaryKey(),
    salon: text("salon").notNull(),
    employeeId: text("employee_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: text("transports").array().notNull().default([]),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pos_employee_attendance_passkeys_employee_idx").on(table.salon, table.employeeId),
  ],
);

export const attendanceChallengesTable = pgTable(
  "pos_attendance_challenges",
  {
    id: uuid("id").primaryKey(),
    salon: text("salon").notNull(),
    employeeId: text("employee_id").notNull(),
    purpose: text("purpose").notNull(),
    action: text("action"),
    challenge: text("challenge").notNull(),
    origin: text("origin").notNull(),
    rpId: text("rp_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pos_attendance_challenges_expiry_idx").on(table.expiresAt),
    index("pos_attendance_challenges_employee_idx").on(table.salon, table.employeeId),
  ],
);

export const attendanceRecordsTable = pgTable(
  "pos_attendance_records",
  {
    id: uuid("id").primaryKey(),
    salon: text("salon").notNull(),
    employeeId: text("employee_id").notNull(),
    employeeName: text("employee_name").notNull(),
    workDate: text("work_date").notNull(),
    checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull(),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    adminVerifiedAt: timestamp("admin_verified_at", { withTimezone: true }),
    adminVerifiedBy: text("admin_verified_by"),
    checkInAdminVerifiedAt: timestamp("check_in_admin_verified_at", { withTimezone: true }),
    checkInAdminVerifiedBy: text("check_in_admin_verified_by"),
    checkOutAdminVerifiedAt: timestamp("check_out_admin_verified_at", { withTimezone: true }),
    checkOutAdminVerifiedBy: text("check_out_admin_verified_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pos_attendance_records_employee_date_uidx").on(table.salon, table.employeeId, table.workDate),
    index("pos_attendance_records_salon_date_idx").on(table.salon, table.workDate),
  ],
);

export const salesTable = pgTable(
  "pos_sales",
  {
    id: uuid("id").primaryKey(),
    salon: text("salon").notNull().default("beauty"),
    invoiceNumber: text("invoice_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    cashierName: text("cashier_name"),
    paymentMethod: text("payment_method").notNull(),
    discountMode: text("discount_mode").notNull().default("nominal"),
    discountValue: doublePrecision("discount_value").notNull().default(0),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull(),
    amountReceived: integer("amount_received").notNull(),
    change: integer("change_amount").notNull().default(0),
    pointsEarned: integer("points_earned").notNull().default(0),
    pointsBalance: integer("points_balance").notNull().default(0),
  },
  (table) => [index("pos_sales_created_at_idx").on(table.createdAt), index("pos_sales_customer_phone_idx").on(table.customerPhone)],
);

export const salonPointRedemptionsTable = pgTable(
  "pos_salon_point_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    salon: text("salon").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerName: text("customer_name").notNull(),
    pointsSpent: integer("points_spent").notNull(),
    rewardName: text("reward_name").notNull(),
    redeemedBy: text("redeemed_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pos_salon_point_redemptions_customer_idx").on(table.salon, table.customerPhone, table.createdAt),
    index("pos_salon_point_redemptions_created_at_idx").on(table.salon, table.createdAt),
  ],
);

export const saleItemsTable = pgTable(
  "pos_sale_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    saleId: uuid("sale_id").notNull().references(() => salesTable.id, { onDelete: "cascade" }),
    lineIndex: integer("line_index").notNull(),
    serviceId: text("service_id").notNull(),
    name: text("name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    discount: integer("discount").notNull().default(0),
    employeeId: text("employee_id"),
    employeeName: text("employee_name"),
    commissionPercent: doublePrecision("commission_percent").notNull().default(0),
    commissionBase: integer("commission_base").notNull().default(0),
    commissionAmount: integer("commission_amount").notNull().default(0),
  },
  (table) => [index("pos_sale_items_sale_id_idx").on(table.saleId)],
);

export const salesRelations = relations(salesTable, ({ many }) => ({
  items: many(saleItemsTable),
}));

export const saleItemsRelations = relations(saleItemsTable, ({ one }) => ({
  sale: one(salesTable, {
    fields: [saleItemsTable.saleId],
    references: [salesTable.id],
  }),
}));

export type Customer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
export type SalonCustomer = typeof salonCustomersTable.$inferSelect;
export type InsertSalonCustomer = typeof salonCustomersTable.$inferInsert;
export type SalonService = typeof salonServicesTable.$inferSelect;
export type InsertSalonService = typeof salonServicesTable.$inferInsert;
export type SalonEmployee = typeof salonEmployeesTable.$inferSelect;
export type InsertSalonEmployee = typeof salonEmployeesTable.$inferInsert;
export type EmployeeAttendanceAuth = typeof employeeAttendanceAuthTable.$inferSelect;
export type InsertEmployeeAttendanceAuth = typeof employeeAttendanceAuthTable.$inferInsert;
export type EmployeeAttendancePasskey = typeof employeeAttendancePasskeysTable.$inferSelect;
export type InsertEmployeeAttendancePasskey = typeof employeeAttendancePasskeysTable.$inferInsert;
export type AttendanceChallenge = typeof attendanceChallengesTable.$inferSelect;
export type InsertAttendanceChallenge = typeof attendanceChallengesTable.$inferInsert;
export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;
export type InsertAttendanceRecord = typeof attendanceRecordsTable.$inferInsert;
export type Sale = typeof salesTable.$inferSelect;
export type InsertSale = typeof salesTable.$inferInsert;
export type SalonPointRedemption = typeof salonPointRedemptionsTable.$inferSelect;
export type InsertSalonPointRedemption = typeof salonPointRedemptionsTable.$inferInsert;
export type SaleItem = typeof saleItemsTable.$inferSelect;
export type InsertSaleItem = typeof saleItemsTable.$inferInsert;
