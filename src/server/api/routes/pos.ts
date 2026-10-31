import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  CreateCustomerBody,
  CreateCustomerResponse,
  CreateSaleBody,
  CreateSaleResponse,
  GetCustomersQueryParams,
  GetCustomersResponse,
  GetSalesQueryParams,
  GetSalesResponse,
  ImportLegacyDataBody,
  ImportLegacyDataResponse,
} from "@/lib/api-zod";
import { db, customersTable, queueBookingsTable, saleItemsTable, salonCustomersTable, salonEmployeesTable, salonPointRedemptionsTable, salonServicesTable, salesTable } from "@/server/db";
import { getCashierSessionUser, requireCashierSession } from "../lib/cashier-session";
import { rebuildSalonCustomerSummary } from "../lib/points-ledger";

import { calculateSaleDiscounts } from "@/lib/sale-discounts";

const router: IRouter = Router();
const RUPIAH_PER_POINT = 1_000;
const MAX_AMOUNT = 2_000_000_000;
const queueNameList = new Intl.ListFormat("id-ID", { style: "long", type: "conjunction" });

function jakartaQueueSchedule(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    scheduledDate: `${values.year}-${values.month}-${values.day}`,
    scheduledTime: `${values.hour}:${values.minute}`,
  };
}

function allocateCommissionBases(
  items: { unitPrice: number; quantity: number }[],
  total: number,
  subtotal: number,
) {
  if (subtotal <= 0 || total <= 0) return items.map(() => 0);

  const allocations = items.map((item, index) => {
    const gross = item.unitPrice * item.quantity;
    const numerator = BigInt(total) * BigInt(gross);
    return {
      index,
      amount: Number(numerator / BigInt(subtotal)),
      remainder: numerator % BigInt(subtotal),
    };
  });
  let remainder = total - allocations.reduce((sum, item) => sum + item.amount, 0);
  const byRemainder = [...allocations].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    byRemainder[index].amount += 1;
  }
  return allocations.sort((a, b) => a.index - b.index).map((item) => item.amount);
}

type SaleRow = typeof salesTable.$inferSelect;
type SaleItemRow = typeof saleItemsTable.$inferSelect;
type SalonId = "beauty" | "hair-studio";

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0062")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith("8")) digits = `0${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function isMemberPromoWeekday(date: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
  }).format(date);
  return ["Mon", "Tue", "Wed", "Thu"].includes(weekday);
}

function toSaleResponse(row: SaleRow, items: SaleItemRow[]) {
  return {
    salon: row.salon as "beauty" | "hair-studio",
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    createdAt: row.createdAt,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    cashierName: row.cashierName,
    paymentMethod: row.paymentMethod,
    discountMode: row.discountMode as "nominal" | "percent",
    discountValue: row.discountValue,
    items: items
      .sort((a, b) => a.lineIndex - b.lineIndex)
      .map(({ serviceId, name, unitPrice, quantity, employeeId, employeeName, commissionPercent, commissionBase, commissionAmount, discount, discountType }) => ({
        serviceId,
        discount,
        discountType: discountType as "nominal" | "percent",
        name,
        unitPrice,
        quantity,
        employeeId,
        employeeName,
        commissionPercent,
        commissionBase,
        commissionAmount,
      })),
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    amountReceived: row.amountReceived,
    change: row.change,
    pointsEarned: row.pointsEarned,
    pointsBalance: row.pointsBalance,
  };
}

async function getSaleById(id: string) {
  const [row] = await db.select().from(salesTable).where(eq(salesTable.id, id)).limit(1);
  if (!row) return null;
  const items = await db
    .select()
    .from(saleItemsTable)
    .where(eq(saleItemsTable.saleId, id))
    .orderBy(asc(saleItemsTable.lineIndex));
  return toSaleResponse(row, items);
}

async function addSaleCustomer(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  salon: SalonId,
  phone: string,
  name: string,
  total: number,
  pointsEarned: number,
  createdAt: Date,
) {
  const [customer] = await tx
    .insert(salonCustomersTable)
    .values({
      salon,
      phone,
      name,
      points: pointsEarned,
      transactionCount: 1,
      totalSpent: total,
      lastTransactionAt: createdAt,
      updatedAt: createdAt,
    })
    .onConflictDoUpdate({
      target: [salonCustomersTable.salon, salonCustomersTable.phone],
      set: {
        name,
        points: sql`${salonCustomersTable.points} + ${pointsEarned}`,
        transactionCount: sql`${salonCustomersTable.transactionCount} + 1`,
        totalSpent: sql`${salonCustomersTable.totalSpent} + ${total}`,
        lastTransactionAt: sql`GREATEST(${salonCustomersTable.lastTransactionAt}, ${createdAt})`,
        updatedAt: createdAt,
      },
    })
    .returning();
  return customer;
}

async function rebuildCustomerSummary(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  salon: SalonId,
  phone: string,
) {
  await rebuildSalonCustomerSummary(tx, salon, phone);
}

router.get("/sales", async (req, res): Promise<void> => {
  const parsed = GetSalesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }
  const rows = await db
    .select()
    .from(salesTable)
    .where(eq(salesTable.salon, parsed.data.salon))
    .orderBy(desc(salesTable.createdAt));
  const itemRows = rows.length
    ? await db
        .select()
        .from(saleItemsTable)
        .where(inArray(saleItemsTable.saleId, rows.map((row) => row.id)))
        .orderBy(asc(saleItemsTable.lineIndex))
    : [];
  const itemsBySale = new Map<string, SaleItemRow[]>();
  for (const item of itemRows) {
    const existing = itemsBySale.get(item.saleId) ?? [];
    existing.push(item);
    itemsBySale.set(item.saleId, existing);
  }
  const response = rows.map((row) => toSaleResponse(row, itemsBySale.get(row.id) ?? []));
  req.log.info({ salon: parsed.data.salon, count: response.length }, "Fetched POS transaction history.");
  res.json(GetSalesResponse.parse(response));
});

router.delete("/sales/:id", requireCashierSession, async (req, res): Promise<void> => {
  const id = String(req.params.id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    res.status(400).json({ error: "ID transaksi tidak valid." });
    return;
  }

  const salonScope = getCashierSessionUser(req)?.salonScope ?? null;
  const deleted = await db.transaction(async (tx) => {
    const [sale] = await tx
      .select()
      .from(salesTable)
      .where(eq(salesTable.id, id))
      .limit(1);
    if (!sale) return null;
    if (salonScope && sale.salon !== salonScope) return "forbidden" as const;

    if (sale.customerPhone) {
      const [customer] = await tx
        .select()
        .from(salonCustomersTable)
        .where(and(
          eq(salonCustomersTable.salon, sale.salon),
          eq(salonCustomersTable.phone, sale.customerPhone),
        ))
        .for("update")
        .limit(1);
      if (customer && customer.points < sale.pointsEarned) return "points-spent" as const;
      if (customer) {
        await tx
          .update(salonCustomersTable)
          .set({ points: customer.points - sale.pointsEarned, updatedAt: new Date() })
          .where(and(
            eq(salonCustomersTable.salon, sale.salon),
            eq(salonCustomersTable.phone, sale.customerPhone),
          ));
      }
    }

    await tx.delete(salesTable).where(eq(salesTable.id, id));
    if (sale.customerPhone) {
      await rebuildCustomerSummary(tx, sale.salon as SalonId, sale.customerPhone);
    }
    return sale;
  });

  if (deleted === "forbidden") {
    res.status(403).json({ error: "Akun ini hanya dapat mengakses salon yang ditetapkan." });
    return;
  }
  if (deleted === "points-spent") {
    res.status(409).json({ error: "Transaksi tidak dapat dihapus karena sebagian poinnya sudah ditukar." });
    return;
  }
  if (!deleted) {
    res.status(404).json({ error: "Transaksi tidak ditemukan." });
    return;
  }

  req.log.info({ saleId: deleted.id }, "Deleted POS transaction.");
  res.status(204).end();
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data transaksi belum lengkap atau tidak valid." });
    return;
  }

  const input = parsed.data;
  const phone = normalizePhone(input.customerPhone);
  if (!phone) {
    res.status(400).json({ error: "Nomor HP pelanggan tidak valid." });
    return;
  }
  const subtotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > MAX_AMOUNT) {
    res.status(400).json({ error: "Total transaksi melebihi batas yang didukung." });
    return;
  }
  const createdAt = new Date();
  const [memberProfile] = await db
    .select({ phone: salonCustomersTable.phone })
    .from(salonCustomersTable)
    .where(and(
      eq(salonCustomersTable.salon, input.salon),
      eq(salonCustomersTable.phone, phone),
    ))
    .limit(1);
  const memberPromoActive = Boolean(memberProfile) && isMemberPromoWeekday(createdAt);
  if (input.discountMode === "percent" && input.discountValue > 100) {
    res.status(400).json({ error: "Diskon tidak boleh melebihi 100%." });
    return;
  }
  if (input.items.some(item => item.discountType === "percent" ? (item.discount ?? 0) > 100 : (item.discount ?? 0) > item.unitPrice * item.quantity)) {
    res.status(400).json({ error: "Diskon layanan tidak boleh melebihi harga layanan." });
    return;
  }
  const calculated = calculateSaleDiscounts(input.items, input.discountMode, input.discountValue, memberPromoActive);
  const requestedManual = input.discountMode === "percent"
    ? Math.round(calculated.remaining * input.discountValue / 100)
    : Math.round(input.discountValue);
  if (requestedManual > calculated.remaining) {
    res.status(400).json({ error: "Diskon struk tidak boleh melebihi sisa subtotal." });
    return;
  }
  const { discount, total, appliedDiscountMode, appliedDiscountValue } = calculated;
  if (
    input.paymentMethod === "Tunai"
      ? input.amountReceived < total
      : input.amountReceived !== total
  ) {
    res.status(400).json({ error: "Nominal pembayaran tidak sesuai dengan total transaksi." });
    return;
  }

  const pointsEarned = Math.floor(total / RUPIAH_PER_POINT);
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(createdAt)
    .replaceAll("-", "");
  const invoiceNumber = `GGS-${dateKey}-${input.id.slice(0, 8).toUpperCase()}`;
  const change = input.paymentMethod === "Tunai" ? input.amountReceived - total : 0;
  const employeeIds = [...new Set(input.items.map((item) => item.employeeId))];
  const serviceIds = [...new Set(input.items.map((item) => item.serviceId))];
  const services = await db
    .select()
    .from(salonServicesTable)
    .where(and(
      eq(salonServicesTable.salon, input.salon),
      inArray(salonServicesTable.id, serviceIds),
    ));
  if (services.length !== serviceIds.length) {
    res.status(400).json({ error: "Pilih layanan yang tersedia di salon aktif." });
    return;
  }
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const employees = await db
    .select()
    .from(salonEmployeesTable)
    .where(and(
      eq(salonEmployeesTable.salon, input.salon),
      eq(salonEmployeesTable.active, true),
      inArray(salonEmployeesTable.id, employeeIds),
    ));
  if (employees.length !== employeeIds.length) {
    res.status(400).json({ error: "Pilih karyawan aktif yang sesuai untuk setiap layanan." });
    return;
  }
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const commissionBases = allocateCommissionBases(input.items.map(item => ({ unitPrice: item.unitPrice * item.quantity - serviceDiscount(item), quantity: 1 })), total, calculated.remaining);

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(salesTable)
      .values({
        id: input.id,
        salon: input.salon,
        invoiceNumber,
        createdAt,
        customerName: input.customerName.trim(),
        customerPhone: phone,
        cashierName: input.cashierName.trim(),
        paymentMethod: input.paymentMethod,
        discountMode: appliedDiscountMode,
        discountValue: appliedDiscountValue,
        subtotal,
        discount,
        total,
        amountReceived: input.amountReceived,
        change,
        pointsEarned,
        pointsBalance: 0,
      })
      .onConflictDoNothing({ target: salesTable.id })
      .returning();

    if (!inserted) return null;

    const customer = await addSaleCustomer(
      tx,
      input.salon,
      phone,
      input.customerName.trim(),
      total,
      pointsEarned,
      createdAt,
    );
    const [updatedSale] = await tx
      .update(salesTable)
      .set({ pointsBalance: customer.points })
      .where(eq(salesTable.id, inserted.id))
      .returning();
    const items = await tx
      .insert(saleItemsTable)
      .values(
        input.items.map((item, lineIndex) => {
          const employee = employeeById.get(item.employeeId);
          const service = serviceById.get(item.serviceId);
          if (!employee || !service) throw new Error("Layanan atau staf tidak tersedia.");
          const commissionPercent = service.commissionPercent ?? employee.commissionPercent;
          return {
          saleId: inserted.id,
          lineIndex,
          serviceId: item.serviceId,
          name: item.name.trim(),
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          discount: item.discount ?? 0,
          discountType: item.discountType ?? "nominal",
          employeeId: employee.id,
          employeeName: employee.name,
          commissionPercent,
          commissionBase: commissionBases[lineIndex],
          commissionAmount: Math.round(
            (commissionBases[lineIndex] * commissionPercent) / 100,
          ),
          };
        }),
      )
      .returning();
    if (input.serviceFlow === "queue") {
      const firstItem = input.items[0];
      const serviceNames = [...new Set(input.items.map((item) => serviceById.get(item.serviceId)!.name))];
      const employeeNames = [...new Set(input.items.map((item) => employeeById.get(item.employeeId)!.name))];
      const { scheduledDate, scheduledTime } = jakartaQueueSchedule(createdAt);
      await tx.insert(queueBookingsTable).values({
        id: randomUUID(),
        salon: input.salon,
        customerName: input.customerName.trim(),
        customerPhone: phone,
        serviceId: firstItem.serviceId,
        serviceName: queueNameList.format(serviceNames),
        employeeId: firstItem.employeeId,
        employeeName: queueNameList.format(employeeNames),
        scheduledDate,
        scheduledTime,
        notes: null,
        status: "waiting",
      });
    }
    return toSaleResponse(updatedSale, items);
  });

  if (!created) {
    const existing = await getSaleById(input.id);
    if (!existing) {
      res.status(409).json({ error: "Transaksi dengan ID ini sedang diproses." });
      return;
    }
    res.json(CreateSaleResponse.parse(existing));
    return;
  }

  req.log.info({ saleId: created.id, pointsEarned }, "Saved POS transaction.");
  res.status(201).json(CreateSaleResponse.parse(created));
});

router.post("/sales/import", async (req, res): Promise<void> => {
  if (getCashierSessionUser(req)?.salonScope) {
    res.status(403).json({ error: "Pemindahan data lama hanya tersedia untuk akun dengan akses semua salon." });
    return;
  }
  const parsed = ImportLegacyDataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data lama tidak lengkap atau tidak valid." });
    return;
  }

  const input = parsed.data;
  const result = await db.transaction(async (tx) => {
    let importedSales = 0;
    let importedCustomers = 0;
    let skippedSales = 0;
    const orderedSales = [...input.sales].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    for (const sale of orderedSales) {
      const createdAt = new Date(sale.createdAt);
      if (!Number.isFinite(createdAt.getTime())) {
        throw new Error("Tanggal pada riwayat transaksi lama tidak valid.");
      }
      const phone = normalizePhone(sale.customerPhone ?? sale.customerWhatsapp ?? "");
      const pointsEarned = phone ? Math.floor(sale.total / RUPIAH_PER_POINT) : 0;
      const discountMode = sale.discountMode ?? "nominal";
      const discountValue =
        sale.discountValue ?? (discountMode === "nominal" ? sale.discount : 0);
      const [inserted] = await tx
        .insert(salesTable)
        .values({
          id: sale.id,
          salon: sale.salon ?? "beauty",
          invoiceNumber: sale.invoiceNumber,
          createdAt,
          customerName: sale.customerName.trim() || "Pelanggan umum",
          customerPhone: phone,
          cashierName: sale.cashierName?.trim() || null,
          paymentMethod: sale.paymentMethod,
          discountMode,
          discountValue,
          subtotal: sale.subtotal,
          discount: sale.discount,
          total: sale.total,
          amountReceived: sale.amountReceived,
          change: sale.change,
          pointsEarned,
          pointsBalance: 0,
        })
        .onConflictDoNothing({ target: salesTable.id })
        .returning();

      if (!inserted) {
        skippedSales += 1;
        continue;
      }

      let pointsBalance = 0;
      if (phone) {
        const customer = await addSaleCustomer(
          tx,
          sale.salon ?? "beauty",
          phone,
          sale.customerName.trim() || "Pelanggan",
          sale.total,
          pointsEarned,
          createdAt,
        );
        pointsBalance = customer.points;
      }
      await tx
        .update(salesTable)
        .set({ pointsBalance })
        .where(eq(salesTable.id, inserted.id));
      if (sale.items.length) {
        await tx.insert(saleItemsTable).values(
          sale.items.map((item, lineIndex) => ({
            saleId: inserted.id,
            lineIndex,
            serviceId: item.serviceId,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          discount: item.discount ?? 0,
          discountType: item.discountType ?? "nominal",
            employeeId: null,
            employeeName: null,
            commissionPercent: 0,
            commissionBase: 0,
            commissionAmount: 0,
          })),
        );
      }
      importedSales += 1;
    }

    for (const profile of input.customers) {
      const phone = normalizePhone(profile.phone);
      if (!phone) continue;
      const lastTransactionAt = new Date(profile.lastTransactionAt);
      const [inserted] = await tx
        .insert(salonCustomersTable)
        .values({
          salon: profile.salon ?? "beauty",
          phone,
          name: profile.name,
          points: profile.points,
          transactionCount: profile.transactionCount,
          totalSpent: profile.totalSpent,
          lastTransactionAt: Number.isFinite(lastTransactionAt.getTime())
            ? lastTransactionAt
            : null,
        })
        .onConflictDoNothing({ target: [salonCustomersTable.salon, salonCustomersTable.phone] })
        .returning({ phone: salonCustomersTable.phone });
      if (inserted) importedCustomers += 1;
    }
    return { importedSales, importedCustomers, skippedSales };
  });

  req.log.info(result, "Imported legacy POS data.");
  res.json(ImportLegacyDataResponse.parse(result));
});

router.get("/customers", async (req, res): Promise<void> => {
  const parsed = GetCustomersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }
  if (parsed.data.salon === "beauty") {
    const legacyProfiles = await db.select().from(customersTable);
    if (legacyProfiles.length) {
      await db
        .insert(salonCustomersTable)
        .values(legacyProfiles.map((profile) => ({ salon: "beauty", ...profile })))
        .onConflictDoNothing({ target: [salonCustomersTable.salon, salonCustomersTable.phone] });
    }
  }
  const customers = await db
    .select()
    .from(salonCustomersTable)
    .where(eq(salonCustomersTable.salon, parsed.data.salon))
    .orderBy(desc(salonCustomersTable.points), asc(salonCustomersTable.name));
  const response = customers.map((customer) => ({
    salon: customer.salon as SalonId,
    phone: customer.phone,
    memberCode: customer.memberCode,
    name: customer.name,
    points: customer.points,
    transactionCount: customer.transactionCount,
    totalSpent: customer.totalSpent,
    lastTransactionAt: customer.lastTransactionAt,
  }));
  req.log.info({ salon: parsed.data.salon, count: response.length }, "Fetched POS customers.");
  res.json(GetCustomersResponse.parse(response));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Lengkapi nama, nomor HP, dan salon yang valid." });
    return;
  }

  const name = parsed.data.name.trim();
  const phone = normalizePhone(parsed.data.phone);
  if (!name || name.length > 120 || !phone) {
    res.status(400).json({ error: "Nama atau nomor HP pelanggan tidak valid." });
    return;
  }

  const customer = await db.transaction(async (tx) => {
    if (parsed.data.salon === "beauty") {
      const [legacyProfile] = await tx
        .select()
        .from(customersTable)
        .where(eq(customersTable.phone, phone))
        .limit(1);
      if (legacyProfile) {
        await tx
          .insert(salonCustomersTable)
          .values({ salon: "beauty", ...legacyProfile })
          .onConflictDoNothing({ target: [salonCustomersTable.salon, salonCustomersTable.phone] });
      }
    }

    const [created] = await tx
      .insert(salonCustomersTable)
      .values({
        salon: parsed.data.salon,
        phone,
        name,
      })
      .onConflictDoNothing({ target: [salonCustomersTable.salon, salonCustomersTable.phone] })
      .returning();
    return created ?? null;
  });

  if (!customer) {
    res.status(409).json({ error: "Nomor HP ini sudah terdaftar sebagai member di salon ini." });
    return;
  }

  req.log.info({ salon: customer.salon }, "Registered POS member.");
  res.status(201).json(CreateCustomerResponse.parse({
    salon: customer.salon as SalonId,
    phone: customer.phone,
    memberCode: customer.memberCode,
    name: customer.name,
    points: customer.points,
    transactionCount: customer.transactionCount,
    totalSpent: customer.totalSpent,
    lastTransactionAt: customer.lastTransactionAt,
  }));
});

router.delete("/customers/:salon/:phone", requireCashierSession, async (req, res): Promise<void> => {
  const parsedSalon = GetCustomersQueryParams.safeParse({ salon: req.params.salon });
  if (!parsedSalon.success) {
    res.status(400).json({ error: "Salon tidak valid." });
    return;
  }
  const phone = normalizePhone(String(req.params.phone ?? ""));
  if (!phone) {
    res.status(400).json({ error: "Nomor HP pelanggan tidak valid." });
    return;
  }

  const deleted = await db.transaction(async (tx) => {
    const [redemption] = await tx
      .select({ id: salonPointRedemptionsTable.id })
      .from(salonPointRedemptionsTable)
      .where(and(
        eq(salonPointRedemptionsTable.salon, parsedSalon.data.salon),
        eq(salonPointRedemptionsTable.customerPhone, phone),
      ))
      .limit(1);
    if (redemption) return "has-redemptions" as const;

    const [row] = await tx
      .delete(salonCustomersTable)
      .where(and(eq(salonCustomersTable.salon, parsedSalon.data.salon), eq(salonCustomersTable.phone, phone)))
      .returning({ phone: salonCustomersTable.phone });
    if (row && parsedSalon.data.salon === "beauty") {
      await tx.delete(customersTable).where(eq(customersTable.phone, phone));
    }
    return row;
  });
  if (deleted === "has-redemptions") {
    res.status(409).json({ error: "Profil memiliki riwayat penukaran hadiah dan tidak dapat dihapus." });
    return;
  }
  if (!deleted) {
    res.status(404).json({ error: "Profil pelanggan tidak ditemukan." });
    return;
  }

  req.log.info("Deleted POS customer profile.");
  res.status(204).end();
});

export default router;
