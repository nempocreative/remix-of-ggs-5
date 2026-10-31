import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { Router, type IRouter, type Response } from "@/server/express-shim";
import {
  DeleteAttendanceRecordParams,
  GetAttendanceRecordParams,
  GetAttendanceRecordResponse,
  ListAttendanceQueryParams,
  ListAttendanceResponse,
  ListAttendanceStaffQueryParams,
  ListAttendanceStaffResponse,
  RecordAttendancePinActionBody,
  RecordAttendancePinActionResponse,
  SetEmployeeAttendancePinBody,
  SetEmployeeAttendancePinParams,
  SetEmployeeAttendancePinResponse,
  UpdateAttendanceRecordBody,
  UpdateAttendanceRecordParams,
  UpdateAttendanceRecordResponse,
  VerifyAttendanceRecordBody,
  VerifyAttendanceRecordParams,
  VerifyAttendanceRecordResponse,
} from "@/lib/api-zod";
import {
  attendanceRecordsTable,
  db,
  employeeAttendanceAuthTable,
  salonEmployeesTable,
} from "@/server/db";
import { getCashierSessionUser, requireCashierSession } from "../lib/cashier-session";
import {
  AttendanceActionError,
  createAttendancePinSecret,
  getActiveSalonEmployee,
  jakartaWorkDate,
  recordAttendanceAction,
  toAttendanceRecordResponse,
  verifyAttendancePin,
} from "../lib/attendance";

const router: IRouter = Router();

function reportPinResult(result: Awaited<ReturnType<typeof verifyAttendancePin>>, res: Response) {
  if (result === "valid") return false;
  if (result === "locked") {
    res.status(423).json({ error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." });
    return true;
  }
  if (result === "missing") {
    res.status(400).json({ error: "PIN absensi staf ini belum diatur." });
    return true;
  }
  res.status(401).json({ error: "PIN tidak sesuai." });
  return true;
}

function reportAttendanceError(error: unknown, res: Response) {
  if (error instanceof AttendanceActionError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "23505"
  ) {
    res.status(409).json({ error: "Staf sudah mencatat kehadiran hari ini." });
    return;
  }
  throw error;
}

router.put("/employees/:salon/:id/attendance-pin", async (req, res): Promise<void> => {
  const params = SetEmployeeAttendancePinParams.safeParse(req.params);
  const body = SetEmployeeAttendancePinBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "PIN absensi harus terdiri dari 6 angka." });
    return;
  }

  const [employee] = await db
    .select({ id: salonEmployeesTable.id })
    .from(salonEmployeesTable)
    .where(and(
      eq(salonEmployeesTable.salon, params.data.salon),
      eq(salonEmployeesTable.id, params.data.id),
    ))
    .limit(1);
  if (!employee) {
    res.status(404).json({ error: "Karyawan tidak ditemukan di salon yang dipilih." });
    return;
  }

  const pinSecret = await createAttendancePinSecret(body.data.pin);
  await db
    .insert(employeeAttendanceAuthTable)
    .values({
      salon: params.data.salon,
      employeeId: params.data.id,
      ...pinSecret,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [employeeAttendanceAuthTable.salon, employeeAttendanceAuthTable.employeeId],
      set: {
        ...pinSecret,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      },
    });

  req.log.info({ salon: params.data.salon, employeeId: params.data.id }, "Set employee attendance PIN.");
  res.json(SetEmployeeAttendancePinResponse.parse({ configured: true }));
});

router.post("/attendance/pin-action", async (req, res): Promise<void> => {
  const parsed = RecordAttendancePinActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Data absensi atau PIN tidak valid." });
    return;
  }

  const employee = await getActiveSalonEmployee(parsed.data.salon, parsed.data.employeeId);
  if (!employee) {
    res.status(404).json({ error: "Staf aktif tidak ditemukan di salon yang dipilih." });
    return;
  }

  const pinResult = await verifyAttendancePin(
    parsed.data.salon,
    parsed.data.employeeId,
    parsed.data.pin,
  );
  if (reportPinResult(pinResult, res)) return;

  try {
    const record = await recordAttendanceAction(employee, parsed.data.action);
    req.log.info({
      salon: employee.salon,
      employeeId: employee.id,
      action: parsed.data.action,
    }, "Recorded employee attendance with PIN.");
    res.status(201).json(
      RecordAttendancePinActionResponse.parse(toAttendanceRecordResponse(record)),
    );
  } catch (error) {
    reportAttendanceError(error, res);
  }
});

router.get("/attendance/staff", async (req, res): Promise<void> => {
  const parsed = ListAttendanceStaffQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }

  const salon = parsed.data.salon;
  const employees = await db
    .select({ salon: salonEmployeesTable.salon, id: salonEmployeesTable.id, name: salonEmployeesTable.name })
    .from(salonEmployeesTable)
    .where(and(eq(salonEmployeesTable.salon, salon), eq(salonEmployeesTable.active, true)))
    .orderBy(asc(salonEmployeesTable.name));
  if (employees.length === 0) {
    res.json(ListAttendanceStaffResponse.parse([]));
    return;
  }

  const authRows = await db
    .select({ employeeId: employeeAttendanceAuthTable.employeeId })
    .from(employeeAttendanceAuthTable)
    .where(eq(employeeAttendanceAuthTable.salon, salon));
  const employeesWithPin = new Set(authRows.map((row) => row.employeeId));

  res.json(ListAttendanceStaffResponse.parse(employees.map((employee) => ({
    ...employee,
    hasPin: employeesWithPin.has(employee.id),
  }))));
});

router.get("/attendance", async (req, res): Promise<void> => {
  const rawDate = req.query.date;
  const date = typeof rawDate === "string"
    ? new Date(`${rawDate}T00:00:00.000Z`)
    : new Date(Number.NaN);
  const parsed = ListAttendanceQueryParams.safeParse({ ...req.query, date });
  if (!parsed.success) {
    res.status(400).json({ error: "Pilih salon dan tanggal yang valid." });
    return;
  }

  const records = await db
    .select()
    .from(attendanceRecordsTable)
    .where(and(
      eq(attendanceRecordsTable.salon, parsed.data.salon),
      eq(attendanceRecordsTable.workDate, parsed.data.date.toISOString().slice(0, 10)),
    ))
    .orderBy(asc(attendanceRecordsTable.checkInAt));
  res.json(ListAttendanceResponse.parse(records.map(toAttendanceRecordResponse)));
});

router.get("/attendance/:salon/:id", async (req, res): Promise<void> => {
  const params = GetAttendanceRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Data absensi tidak valid." });
    return;
  }

  const [record] = await db
    .select()
    .from(attendanceRecordsTable)
    .where(and(
      eq(attendanceRecordsTable.salon, params.data.salon),
      eq(attendanceRecordsTable.id, params.data.id),
    ))
    .limit(1);
  if (!record) {
    res.status(404).json({ error: "Data absensi tidak ditemukan di salon ini." });
    return;
  }
  res.json(GetAttendanceRecordResponse.parse(toAttendanceRecordResponse(record)));
});

router.put(
  "/attendance/:salon/:id",
  requireCashierSession,
  async (req, res): Promise<void> => {
    const params = UpdateAttendanceRecordParams.safeParse(req.params);
    const body = UpdateAttendanceRecordBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Jam absensi tidak valid." });
      return;
    }

    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(
        eq(attendanceRecordsTable.salon, params.data.salon),
        eq(attendanceRecordsTable.id, params.data.id),
      ))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Data absensi tidak ditemukan di salon ini." });
      return;
    }
    if (
      existing.adminVerifiedAt
      || existing.checkInAdminVerifiedAt
      || existing.checkOutAdminVerifiedAt
    ) {
      res.status(409).json({ error: "Data absensi yang sudah diverifikasi admin tidak bisa diubah." });
      return;
    }

    const checkInAt = new Date(`${existing.workDate}T${body.data.checkInTime}:00+07:00`);
    const checkOutAt = body.data.checkOutTime
      ? new Date(`${existing.workDate}T${body.data.checkOutTime}:00+07:00`)
      : null;
    if (checkOutAt && checkOutAt <= checkInAt) {
      res.status(400).json({ error: "Jam pulang harus setelah jam masuk." });
      return;
    }

    const [updated] = await db
      .update(attendanceRecordsTable)
      .set({ checkInAt, checkOutAt })
      .where(and(
        eq(attendanceRecordsTable.salon, params.data.salon),
        eq(attendanceRecordsTable.id, params.data.id),
        isNull(attendanceRecordsTable.adminVerifiedAt),
        isNull(attendanceRecordsTable.checkInAdminVerifiedAt),
        isNull(attendanceRecordsTable.checkOutAdminVerifiedAt),
      ))
      .returning();
    if (!updated) {
      res.status(409).json({ error: "Data absensi baru saja diverifikasi dan tidak bisa diubah." });
      return;
    }

    req.log.info({ salon: updated.salon, employeeId: updated.employeeId }, "Updated unverified attendance record.");
    res.json(UpdateAttendanceRecordResponse.parse(toAttendanceRecordResponse(updated)));
  },
);

router.post(
  "/attendance/:salon/:id/verify",
  requireCashierSession,
  async (req, res): Promise<void> => {
    const params = VerifyAttendanceRecordParams.safeParse(req.params);
    const body = VerifyAttendanceRecordBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Tahap verifikasi absensi tidak valid." });
      return;
    }

    const [existing] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(and(
        eq(attendanceRecordsTable.salon, params.data.salon),
        eq(attendanceRecordsTable.id, params.data.id),
      ))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Data absensi tidak ditemukan di salon ini." });
      return;
    }
    if (existing.adminVerifiedAt) {
      res.status(409).json({ error: "Data lama sudah diverifikasi admin." });
      return;
    }

    if (body.data.stage === "check-in" && existing.checkInAdminVerifiedAt) {
      res.status(409).json({ error: "Verifikasi jam masuk sudah tercatat." });
      return;
    }
    if (body.data.stage === "check-out") {
      if (!existing.checkOutAt) {
        res.status(409).json({ error: "Staf belum mencatat jam pulang." });
        return;
      }
      if (!existing.checkInAdminVerifiedAt) {
        res.status(409).json({ error: "Verifikasi jam masuk terlebih dahulu." });
        return;
      }
      if (existing.checkOutAdminVerifiedAt) {
        res.status(409).json({ error: "Verifikasi jam pulang sudah tercatat." });
        return;
      }
    }

    const verifiedAt = new Date();
    const verifiedBy = getCashierSessionUser(req)?.name ?? "Admin";
    const verifiedColumn = body.data.stage === "check-in"
      ? attendanceRecordsTable.checkInAdminVerifiedAt
      : attendanceRecordsTable.checkOutAdminVerifiedAt;
    const verification = body.data.stage === "check-in"
      ? { checkInAdminVerifiedAt: verifiedAt, checkInAdminVerifiedBy: verifiedBy }
      : { checkOutAdminVerifiedAt: verifiedAt, checkOutAdminVerifiedBy: verifiedBy };
    const [record] = await db
      .update(attendanceRecordsTable)
      .set(verification)
      .where(and(
        eq(attendanceRecordsTable.salon, params.data.salon),
        eq(attendanceRecordsTable.id, params.data.id),
        isNull(attendanceRecordsTable.adminVerifiedAt),
        isNull(verifiedColumn),
        ...(body.data.stage === "check-out"
          ? [
            isNotNull(attendanceRecordsTable.checkOutAt),
            isNotNull(attendanceRecordsTable.checkInAdminVerifiedAt),
          ]
          : []),
      ))
      .returning();
    if (!record) {
      res.status(409).json({ error: "Absensi berubah sebelum verifikasi tersimpan. Muat ulang lalu coba lagi." });
      return;
    }

    req.log.info({
      salon: record.salon,
      employeeId: record.employeeId,
      stage: body.data.stage,
    }, "Admin verified attendance stage.");
    res.json(VerifyAttendanceRecordResponse.parse(toAttendanceRecordResponse(record)));
  },
);

router.delete(
  "/attendance/:salon/:id",
  requireCashierSession,
  async (req, res): Promise<void> => {
    const params = DeleteAttendanceRecordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Data absensi tidak valid." });
      return;
    }

    const [deleted] = await db
      .delete(attendanceRecordsTable)
      .where(and(
        eq(attendanceRecordsTable.salon, params.data.salon),
        eq(attendanceRecordsTable.id, params.data.id),
        isNull(attendanceRecordsTable.adminVerifiedAt),
        isNull(attendanceRecordsTable.checkInAdminVerifiedAt),
        isNull(attendanceRecordsTable.checkOutAdminVerifiedAt),
      ))
      .returning({ id: attendanceRecordsTable.id });
    if (!deleted) {
      const [existing] = await db
        .select({
          adminVerifiedAt: attendanceRecordsTable.adminVerifiedAt,
          checkInAdminVerifiedAt: attendanceRecordsTable.checkInAdminVerifiedAt,
          checkOutAdminVerifiedAt: attendanceRecordsTable.checkOutAdminVerifiedAt,
        })
        .from(attendanceRecordsTable)
        .where(and(
          eq(attendanceRecordsTable.salon, params.data.salon),
          eq(attendanceRecordsTable.id, params.data.id),
        ))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Data absensi tidak ditemukan di salon ini." });
        return;
      }
      res.status(409).json({ error: "Data absensi yang sudah diverifikasi admin tidak bisa dihapus." });
      return;
    }

    req.log.info({ salon: params.data.salon, attendanceId: deleted.id }, "Deleted unverified attendance record.");
    res.status(204).end();
  },
);

export default router;
