import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  customersTable,
  db,
  saleItemsTable,
  salonCustomersTable,
  salonEmployeesTable,
  salonPointRedemptionsTable,
  salonServicesTable,
  salesTable,
} from "@/server/db";
import type { BackupRestoreResult, PosBackup } from "@/lib/api-zod";
import type { SalonId } from "./default-services";
import { rebuildSalonCustomerSummary } from "./points-ledger";

const SALONS: SalonId[] = ["beauty", "hair-studio"];
const INSERT_BATCH_SIZE = 500;
const SALE_ITEM_BATCH_SIZE = 2_000;

export class InvalidPosBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPosBackupError";
  }
}

function toIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

async function getSalonBackup(salon: SalonId) {
  const [services, customers, employees, sales, pointRedemptions] = await Promise.all([
    db
      .select()
      .from(salonServicesTable)
      .where(eq(salonServicesTable.salon, salon))
      .orderBy(asc(salonServicesTable.sortOrder)),
    db
      .select()
      .from(salonCustomersTable)
      .where(eq(salonCustomersTable.salon, salon))
      .orderBy(asc(salonCustomersTable.name)),
    db
      .select()
      .from(salonEmployeesTable)
      .where(eq(salonEmployeesTable.salon, salon))
      .orderBy(asc(salonEmployeesTable.name)),
    db
      .select()
      .from(salesTable)
      .where(eq(salesTable.salon, salon))
      .orderBy(desc(salesTable.createdAt), desc(salesTable.id)),
    db
      .select()
      .from(salonPointRedemptionsTable)
      .where(eq(salonPointRedemptionsTable.salon, salon))
      .orderBy(desc(salonPointRedemptionsTable.createdAt), desc(salonPointRedemptionsTable.id)),
  ]);
  const itemRows = sales.length
    ? await db
        .select()
        .from(saleItemsTable)
        .where(inArray(saleItemsTable.saleId, sales.map((sale) => sale.id)))
        .orderBy(asc(saleItemsTable.lineIndex))
    : [];
  const itemsBySale = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    itemsBySale.set(item.saleId, [...(itemsBySale.get(item.saleId) ?? []), item]);
  }

  return {
    services: services.map(({ id, name, category, sortOrder, minPrice, maxPrice, priceType, commissionPercent }) => ({
      id,
      name,
      category,
      sortOrder,
      minPrice,
      maxPrice,
      priceType,
      commissionPercent,
    })),
    customers: customers.map((customer) => ({
      salon,
      phone: customer.phone,
      memberCode: customer.memberCode,
      name: customer.name,
      points: customer.points,
      transactionCount: customer.transactionCount,
      totalSpent: customer.totalSpent,
      lastTransactionAt: toIso(customer.lastTransactionAt),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    })),
    employees: employees.map((employee) => ({
      salon,
      id: employee.id,
      name: employee.name,
      commissionPercent: employee.commissionPercent,
      active: employee.active,
      isCashier: employee.isCashier,
      createdAt: employee.createdAt.toISOString(),
    })),
    sales: sales.map((sale) => ({
      salon,
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      createdAt: sale.createdAt.toISOString(),
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      cashierName: sale.cashierName,
      paymentMethod: sale.paymentMethod,
      discountMode: sale.discountMode as "nominal" | "percent",
      discountValue: sale.discountValue,
      items: (itemsBySale.get(sale.id) ?? []).map((item) => ({
        serviceId: item.serviceId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        employeeId: item.employeeId,
        employeeName: item.employeeName,
        commissionPercent: item.commissionPercent,
        commissionBase: item.commissionBase,
        commissionAmount: item.commissionAmount,
      })),
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      amountReceived: sale.amountReceived,
      change: sale.change,
      pointsEarned: sale.pointsEarned,
      pointsBalance: sale.pointsBalance,
    })),
    pointRedemptions: pointRedemptions.map((redemption) => ({
      id: redemption.id,
      salon,
      customerPhone: redemption.customerPhone,
      customerName: redemption.customerName,
      pointsSpent: redemption.pointsSpent,
      rewardName: redemption.rewardName,
      redeemedBy: redemption.redeemedBy,
      createdAt: redemption.createdAt.toISOString(),
    })),
  };
}

export async function createPosBackup() {
  const [beauty, hairStudio, legacyCustomers] = await Promise.all([
    getSalonBackup("beauty"),
    getSalonBackup("hair-studio"),
    db.select().from(customersTable).orderBy(asc(customersTable.name)),
  ]);

  return {
    format: "ggs-beauty-pos-backup" as const,
    version: 1 as const,
    createdAt: new Date().toISOString(),
    salons: { beauty, "hair-studio": hairStudio },
    legacyCustomers: legacyCustomers.map((customer) => ({
      phone: customer.phone,
      name: customer.name,
      points: customer.points,
      transactionCount: customer.transactionCount,
      totalSpent: customer.totalSpent,
      lastTransactionAt: toIso(customer.lastTransactionAt),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    })),
  };
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function validateBackupRelationships(backup: PosBackup) {
  const allSaleIds = new Set<string>();
  const allRedemptionIds = new Set<string>();
  for (const salon of SALONS) {
    const data = backup.salons[salon];
    const employeeIds = new Set<string>();
    for (const employee of data.employees ?? []) {
      if (
        employee.salon !== salon ||
        employeeIds.has(employee.id) ||
        employee.commissionPercent < 0 ||
        employee.commissionPercent > 100
      ) {
        throw new InvalidPosBackupError(`Data karyawan dalam file backup tidak sesuai salon ${salon}.`);
      }
      employeeIds.add(employee.id);
    }

    const serviceIds = new Set<string>();
    for (const service of data.services) {
      if (serviceIds.has(service.id)) {
        throw new InvalidPosBackupError(`File backup memiliki ID layanan duplikat untuk ${salon}.`);
      }
      serviceIds.add(service.id);
      if (
        (service.priceType === "range" && (service.maxPrice === null || service.maxPrice <= service.minPrice)) ||
        (service.priceType !== "range" && service.maxPrice !== null) ||
        (service.commissionPercent != null && (service.commissionPercent < 0 || service.commissionPercent > 100))
      ) {
        throw new InvalidPosBackupError(`Data harga atau komisi layanan di ${salon} tidak valid.`);
      }
    }

    const phones = new Set<string>();
    for (const customer of data.customers) {
      if (customer.salon !== salon || phones.has(customer.phone)) {
        throw new InvalidPosBackupError(`Data pelanggan dalam file backup tidak sesuai salon ${salon}.`);
      }
      phones.add(customer.phone);
    }

    for (const sale of data.sales) {
      if (sale.salon !== salon || allSaleIds.has(sale.id)) {
        throw new InvalidPosBackupError(`Data transaksi dalam file backup tidak sesuai salon ${salon}.`);
      }
      allSaleIds.add(sale.id);
    }

    for (const redemption of data.pointRedemptions ?? []) {
      if (
        redemption.salon !== salon ||
        allRedemptionIds.has(redemption.id) ||
        redemption.pointsSpent < 1
      ) {
        throw new InvalidPosBackupError(`Data penukaran poin dalam file backup tidak sesuai salon ${salon}.`);
      }
      allRedemptionIds.add(redemption.id);
    }
  }

  const legacyPhones = new Set<string>();
  for (const customer of backup.legacyCustomers) {
    if (legacyPhones.has(customer.phone)) {
      throw new InvalidPosBackupError("File backup memiliki profil pelanggan lama yang duplikat.");
    }
    legacyPhones.add(customer.phone);
  }
}

export async function restorePosBackup(backup: PosBackup): Promise<BackupRestoreResult> {
  validateBackupRelationships(backup);

  return db.transaction(async (tx) => {
    const result: BackupRestoreResult = {
      employeesAdded: 0,
      employeesUpdated: 0,
      servicesAdded: 0,
      servicesUpdated: 0,
      customersAdded: 0,
      legacyCustomersAdded: 0,
      salesAdded: 0,
      salesSkipped: 0,
      redemptionsAdded: 0,
    };
    const customerPhonesWithLedgerChanges: Record<SalonId, Set<string>> = {
      beauty: new Set(),
      "hair-studio": new Set(),
    };

    for (const salon of SALONS) {
      const data = backup.salons[salon];
      const importedEmployees = data.employees ?? [];
      const employeeIds = importedEmployees.map((employee) => employee.id);
      const existingEmployees = employeeIds.length
        ? await tx
            .select({ id: salonEmployeesTable.id })
            .from(salonEmployeesTable)
            .where(and(
              eq(salonEmployeesTable.salon, salon),
              inArray(salonEmployeesTable.id, employeeIds),
            ))
        : [];
      const existingEmployeeIds = new Set(existingEmployees.map((employee) => employee.id));
      result.employeesAdded += importedEmployees.filter((employee) => !existingEmployeeIds.has(employee.id)).length;
      result.employeesUpdated += importedEmployees.filter((employee) => existingEmployeeIds.has(employee.id)).length;
      for (const batch of chunks(importedEmployees, INSERT_BATCH_SIZE)) {
        await tx
          .insert(salonEmployeesTable)
          .values(batch.map((employee) => ({
            salon,
            id: employee.id,
            name: employee.name,
            commissionPercent: employee.commissionPercent,
            active: employee.active,
            isCashier: (employee as { isCashier?: boolean }).isCashier ?? false,
            createdAt: new Date(employee.createdAt),
          })))
          .onConflictDoUpdate({
            target: [salonEmployeesTable.salon, salonEmployeesTable.id],
            set: {
              name: sql.raw("excluded.name"),
              commissionPercent: sql.raw("excluded.commission_percent"),
              active: sql.raw("excluded.active"),
              isCashier: sql.raw("excluded.is_cashier"),
            },
          });
      }

      const ids = data.services.map((service) => service.id);
      const existing = ids.length
        ? await tx
            .select({ id: salonServicesTable.id })
            .from(salonServicesTable)
            .where(and(eq(salonServicesTable.salon, salon), inArray(salonServicesTable.id, ids)))
        : [];
      const existingIds = new Set(existing.map((service) => service.id));
      result.servicesAdded += data.services.filter((service) => !existingIds.has(service.id)).length;
      result.servicesUpdated += data.services.filter((service) => existingIds.has(service.id)).length;

      for (const batch of chunks(data.services, INSERT_BATCH_SIZE)) {
        await tx
          .insert(salonServicesTable)
          .values(batch.map((service) => ({ salon, ...service, commissionPercent: service.commissionPercent ?? null })))
          .onConflictDoUpdate({
            target: [salonServicesTable.salon, salonServicesTable.id],
            set: {
              name: sql.raw("excluded.name"),
              category: sql.raw("excluded.category"),
              sortOrder: sql.raw("excluded.sort_order"),
              minPrice: sql.raw("excluded.min_price"),
              maxPrice: sql.raw("excluded.max_price"),
              priceType: sql.raw("excluded.price_type"),
              commissionPercent: sql.raw("excluded.commission_percent"),
            },
          });
      }

      const importedCustomers = [...data.customers];
      if (salon === "beauty") {
        const includedPhones = new Set(importedCustomers.map((customer) => customer.phone));
        for (const customer of backup.legacyCustomers) {
          if (!includedPhones.has(customer.phone)) {
            importedCustomers.push({
              salon: "beauty",
              phone: customer.phone,
              name: customer.name,
              points: customer.points,
              transactionCount: customer.transactionCount,
              totalSpent: customer.totalSpent,
              lastTransactionAt: customer.lastTransactionAt,
              createdAt: customer.createdAt,
              updatedAt: customer.updatedAt,
            });
            includedPhones.add(customer.phone);
          }
        }
      }

      const importedPhones = importedCustomers.map((customer) => customer.phone);
      const candidatePhones = [...new Set([
        ...importedPhones,
        ...data.sales.flatMap((sale) => sale.customerPhone ? [sale.customerPhone] : []),
        ...(data.pointRedemptions ?? []).map((redemption) => redemption.customerPhone),
      ])];
      const existingCustomerPhones = new Set<string>();
      for (const batch of chunks(candidatePhones, INSERT_BATCH_SIZE)) {
        const existingCustomers = await tx
          .select({ phone: salonCustomersTable.phone })
          .from(salonCustomersTable)
          .where(and(eq(salonCustomersTable.salon, salon), inArray(salonCustomersTable.phone, batch)));
        for (const customer of existingCustomers) existingCustomerPhones.add(customer.phone);
      }
      result.customersAdded += importedCustomers.filter((customer) => !existingCustomerPhones.has(customer.phone)).length;
      for (const batch of chunks(importedCustomers, INSERT_BATCH_SIZE)) {
        await tx
          .insert(salonCustomersTable)
          .values(batch.map((customer) => ({
            salon,
            phone: customer.phone,
             memberCode: customer.memberCode ?? undefined,
            name: customer.name,
            points: customer.points,
            transactionCount: customer.transactionCount,
            totalSpent: customer.totalSpent,
            lastTransactionAt: customer.lastTransactionAt ? new Date(customer.lastTransactionAt) : null,
            createdAt: new Date(customer.createdAt),
            updatedAt: new Date(customer.updatedAt),
          })))
          .onConflictDoNothing({
            target: [salonCustomersTable.salon, salonCustomersTable.phone],
          });
      }

      const pointDeltas = new Map<string, number>();
      for (const batch of chunks(data.sales, INSERT_BATCH_SIZE)) {
        const inserted = await tx
          .insert(salesTable)
          .values(batch.map((sale) => ({
            id: sale.id,
            salon,
            invoiceNumber: sale.invoiceNumber,
            createdAt: new Date(sale.createdAt),
            customerName: sale.customerName,
            customerPhone: sale.customerPhone,
            cashierName: sale.cashierName,
            paymentMethod: sale.paymentMethod,
            discountMode: sale.discountMode,
            discountValue: sale.discountValue,
            subtotal: sale.subtotal,
            discount: sale.discount,
            total: sale.total,
            amountReceived: sale.amountReceived,
            change: sale.change,
            pointsEarned: sale.pointsEarned,
            pointsBalance: sale.pointsBalance,
          })))
          .onConflictDoNothing({ target: salesTable.id })
          .returning({ id: salesTable.id });

        const insertedIds = new Set(inserted.map((sale) => sale.id));
        result.salesAdded += inserted.length;
        for (const sale of batch) {
          if (!insertedIds.has(sale.id)) continue;
          if (sale.customerPhone) {
            customerPhonesWithLedgerChanges[salon].add(sale.customerPhone);
            if (existingCustomerPhones.has(sale.customerPhone)) {
              pointDeltas.set(
                sale.customerPhone,
                (pointDeltas.get(sale.customerPhone) ?? 0) + sale.pointsEarned,
              );
            }
          }
        }
        const itemValues = batch
          .filter((sale) => insertedIds.has(sale.id))
          .flatMap((sale) => sale.items.map((item, lineIndex) => ({
            saleId: sale.id,
            lineIndex,
            serviceId: item.serviceId,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            employeeId: item.employeeId ?? null,
            employeeName: item.employeeName ?? null,
            commissionPercent: item.commissionPercent ?? 0,
            commissionBase: item.commissionBase ?? 0,
            commissionAmount: item.commissionAmount ?? 0,
          })));
        for (const itemBatch of chunks(itemValues, SALE_ITEM_BATCH_SIZE)) {
          await tx.insert(saleItemsTable).values(itemBatch);
        }
      }

      const pointRedemptions = data.pointRedemptions ?? [];
      for (const batch of chunks(pointRedemptions, INSERT_BATCH_SIZE)) {
        const inserted = await tx
          .insert(salonPointRedemptionsTable)
          .values(batch.map((redemption) => ({
            id: redemption.id,
            salon,
            customerPhone: redemption.customerPhone,
            customerName: redemption.customerName,
            pointsSpent: redemption.pointsSpent,
            rewardName: redemption.rewardName,
            redeemedBy: redemption.redeemedBy,
            createdAt: new Date(redemption.createdAt),
          })))
          .onConflictDoNothing({ target: salonPointRedemptionsTable.id })
          .returning({
            id: salonPointRedemptionsTable.id,
            customerPhone: salonPointRedemptionsTable.customerPhone,
            pointsSpent: salonPointRedemptionsTable.pointsSpent,
          });
        result.redemptionsAdded += inserted.length;
        for (const redemption of inserted) {
          customerPhonesWithLedgerChanges[salon].add(redemption.customerPhone);
          if (existingCustomerPhones.has(redemption.customerPhone)) {
            pointDeltas.set(
              redemption.customerPhone,
              (pointDeltas.get(redemption.customerPhone) ?? 0) - redemption.pointsSpent,
            );
          }
        }
      }

      for (const [phone, delta] of pointDeltas) {
        if (!delta) continue;
        const [updated] = await tx
          .update(salonCustomersTable)
          .set({
            points: sql`${salonCustomersTable.points} + ${delta}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(salonCustomersTable.salon, salon),
            eq(salonCustomersTable.phone, phone),
            sql`${salonCustomersTable.points} + ${delta} >= 0`,
          ))
          .returning({ phone: salonCustomersTable.phone });
        if (!updated) {
          throw new InvalidPosBackupError("Backup menghasilkan saldo poin negatif untuk pelanggan yang sudah ada.");
        }
      }
    }

    for (const batch of chunks(backup.legacyCustomers, INSERT_BATCH_SIZE)) {
      const existing = await tx
        .select({ phone: customersTable.phone })
        .from(customersTable)
        .where(inArray(customersTable.phone, batch.map((customer) => customer.phone)));
      const existingPhones = new Set(existing.map((customer) => customer.phone));
      result.legacyCustomersAdded += batch.filter((customer) => !existingPhones.has(customer.phone)).length;
      await tx
        .insert(customersTable)
        .values(batch.map((customer) => ({
          phone: customer.phone,
          name: customer.name,
          points: customer.points,
          transactionCount: customer.transactionCount,
          totalSpent: customer.totalSpent,
          lastTransactionAt: customer.lastTransactionAt ? new Date(customer.lastTransactionAt) : null,
          createdAt: new Date(customer.createdAt),
          updatedAt: new Date(customer.updatedAt),
        })))
        .onConflictDoNothing({ target: customersTable.phone });
    }

    for (const salon of SALONS) {
      for (const phone of customerPhonesWithLedgerChanges[salon]) {
        await rebuildSalonCustomerSummary(tx, salon, phone);
      }
    }
    result.salesSkipped =
      backup.salons.beauty.sales.length +
      backup.salons["hair-studio"].sales.length -
      result.salesAdded;
    return result;
  });
}
