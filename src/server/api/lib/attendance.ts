import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  attendanceRecordsTable,
  db,
  employeeAttendanceAuthTable,
  salonEmployeesTable,
  type AttendanceRecord,
  type SalonEmployee,
} from "@/server/db";

const PIN_LENGTH = 6;
const PIN_LOCK_THRESHOLD = 5;
const PIN_LOCK_MINUTES = 15;
const scryptKeyLength = 64;

export class AttendanceActionError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "AttendanceActionError";
    this.status = status;
  }
}

function derivePinHash(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, scryptKeyLength, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function createAttendancePinSecret(pin: string) {
  if (!new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin)) {
    throw new AttendanceActionError("PIN absensi harus terdiri dari 6 angka.", 400);
  }

  const salt = randomBytes(16);
  const hash = await derivePinHash(pin, salt);
  return {
    pinSalt: salt.toString("base64url"),
    pinHash: hash.toString("base64url"),
  };
}

export async function verifyAttendancePin(salon: string, employeeId: string, pin: string) {
  const [auth] = await db
    .select()
    .from(employeeAttendanceAuthTable)
    .where(and(
      eq(employeeAttendanceAuthTable.salon, salon),
      eq(employeeAttendanceAuthTable.employeeId, employeeId),
    ))
    .limit(1);

  if (!auth) return "missing" as const;
  const now = new Date();
  if (auth.lockedUntil && auth.lockedUntil > now) return "locked" as const;

  const actualHash = await derivePinHash(pin, Buffer.from(auth.pinSalt, "base64url"));
  const expectedHash = Buffer.from(auth.pinHash, "base64url");
  const valid = actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);

  if (!valid) {
    const failedAttempts = auth.failedAttempts + 1;
    const lockedUntil = failedAttempts >= PIN_LOCK_THRESHOLD
      ? new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000)
      : null;
    await db
      .update(employeeAttendanceAuthTable)
      .set({ failedAttempts, lockedUntil, updatedAt: now })
      .where(and(
        eq(employeeAttendanceAuthTable.salon, salon),
        eq(employeeAttendanceAuthTable.employeeId, employeeId),
      ));
    return lockedUntil ? "locked" as const : "invalid" as const;
  }

  if (auth.failedAttempts || auth.lockedUntil) {
    await db
      .update(employeeAttendanceAuthTable)
      .set({ failedAttempts: 0, lockedUntil: null, updatedAt: now })
      .where(and(
        eq(employeeAttendanceAuthTable.salon, salon),
        eq(employeeAttendanceAuthTable.employeeId, employeeId),
      ));
  }
  return "valid" as const;
}

export async function getActiveSalonEmployee(salon: string, employeeId: string): Promise<SalonEmployee | undefined> {
  const [employee] = await db
    .select()
    .from(salonEmployeesTable)
    .where(and(
      eq(salonEmployeesTable.salon, salon),
      eq(salonEmployeesTable.id, employeeId),
      eq(salonEmployeesTable.active, true),
    ))
    .limit(1);
  return employee;
}

export function jakartaWorkDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function toAttendanceRecordResponse(record: AttendanceRecord) {
  const legacyCheckInVerifiedAt = record.adminVerifiedAt;
  const legacyCheckInVerifiedBy = record.adminVerifiedAt ? record.adminVerifiedBy : null;
  return {
    ...record,
    checkInAt: record.checkInAt.toISOString(),
    checkOutAt: record.checkOutAt?.toISOString() ?? null,
    adminVerifiedAt: record.adminVerifiedAt?.toISOString() ?? null,
    adminVerifiedBy: record.adminVerifiedBy ?? null,
    checkInAdminVerifiedAt: (record.checkInAdminVerifiedAt ?? legacyCheckInVerifiedAt)?.toISOString() ?? null,
    checkInAdminVerifiedBy: record.checkInAdminVerifiedBy ?? legacyCheckInVerifiedBy,
    checkOutAdminVerifiedAt: (record.checkOutAdminVerifiedAt ?? legacyCheckInVerifiedAt)?.toISOString() ?? null,
    checkOutAdminVerifiedBy: record.checkOutAdminVerifiedBy ?? legacyCheckInVerifiedBy,
  };
}

export async function recordAttendanceAction(
  employee: SalonEmployee,
  action: "check-in" | "check-out",
  now = new Date(),
): Promise<AttendanceRecord> {
  const workDate = jakartaWorkDate(now);
  const [existing] = await db
    .select()
    .from(attendanceRecordsTable)
    .where(and(
      eq(attendanceRecordsTable.salon, employee.salon),
      eq(attendanceRecordsTable.employeeId, employee.id),
      eq(attendanceRecordsTable.workDate, workDate),
    ))
    .limit(1);

  if (action === "check-in") {
    if (existing) {
      throw new AttendanceActionError("Staf sudah mencatat kehadiran hari ini.");
    }
    const [record] = await db
      .insert(attendanceRecordsTable)
      .values({
        id: randomUUID(),
        salon: employee.salon,
        employeeId: employee.id,
        employeeName: employee.name,
        workDate,
        checkInAt: now,
      })
      .returning();
    return record;
  }

  if (!existing) {
    throw new AttendanceActionError("Staf belum mencatat Masuk hari ini.");
  }
  if (existing.checkOutAt) {
    throw new AttendanceActionError("Staf sudah mencatat Pulang hari ini.");
  }

  const [record] = await db
    .update(attendanceRecordsTable)
    .set({ checkOutAt: now })
    .where(and(
      eq(attendanceRecordsTable.id, existing.id),
      isNull(attendanceRecordsTable.checkOutAt),
    ))
    .returning();

  if (!record) {
    throw new AttendanceActionError("Absensi sudah diperbarui dari perangkat lain.");
  }
  return record;
}
