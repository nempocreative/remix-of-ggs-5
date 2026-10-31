import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  CreateQueueBookingBody,
  CreateQueueBookingQueryParams,
  CreateQueueBookingResponse,
  DeleteQueueBookingParams,
  GetQueueBookingsQueryParams,
  GetQueueBookingsResponse,
  UpdateQueueBookingStatusBody,
  UpdateQueueBookingStatusParams,
  UpdateQueueBookingStatusResponse,
} from "@/lib/api-zod";
import {
  db,
  queueBookingsTable,
  salonEmployeesTable,
  salonServicesTable,
} from "@/server/db";

const router: IRouter = Router();
const deletableQueueBookingStatuses = ["called", "completed"] as const;

function isValidDateKey(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function toQueueBookingResponse(booking: typeof queueBookingsTable.$inferSelect) {
  return {
    ...booking,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}

router.get("/queue-bookings", async (req, res): Promise<void> => {
  const params = GetQueueBookingsQueryParams.safeParse(req.query);
  if (!params.success || !isValidDateKey(params.data.date)) {
    res.status(400).json({ error: "Pilih salon dan tanggal booking yang valid." });
    return;
  }

  const bookings = await db
    .select()
    .from(queueBookingsTable)
    .where(and(
      eq(queueBookingsTable.salon, params.data.salon),
      eq(queueBookingsTable.scheduledDate, params.data.date),
    ))
    .orderBy(asc(queueBookingsTable.scheduledTime), asc(queueBookingsTable.createdAt));

  res.json(GetQueueBookingsResponse.parse(bookings.map(toQueueBookingResponse)));
});

router.post("/queue-bookings", async (req, res): Promise<void> => {
  const params = CreateQueueBookingQueryParams.safeParse(req.query);
  const body = CreateQueueBookingBody.safeParse(req.body);
  if (
    !params.success
    || !body.success
    || !body.data.customerName.trim()
    || !isValidDateKey(body.data.scheduledDate)
  ) {
    res.status(400).json({ error: "Lengkapi nama pelanggan, layanan, staf, tanggal, dan jam booking." });
    return;
  }

  const [employee] = await db
    .select({ id: salonEmployeesTable.id, name: salonEmployeesTable.name })
    .from(salonEmployeesTable)
    .where(and(
      eq(salonEmployeesTable.salon, params.data.salon),
      eq(salonEmployeesTable.id, body.data.employeeId),
      eq(salonEmployeesTable.active, true),
    ))
    .limit(1);
  const [service] = await db
    .select({ id: salonServicesTable.id, name: salonServicesTable.name })
    .from(salonServicesTable)
    .where(and(
      eq(salonServicesTable.salon, params.data.salon),
      eq(salonServicesTable.id, body.data.serviceId),
    ))
    .limit(1);

  if (!employee || !service) {
    res.status(404).json({ error: "Staf atau layanan tidak tersedia di salon yang dipilih." });
    return;
  }

  const [booking] = await db
    .insert(queueBookingsTable)
    .values({
      id: randomUUID(),
      salon: params.data.salon,
      customerName: body.data.customerName.trim(),
      customerPhone: body.data.customerPhone?.trim() || null,
      serviceId: service.id,
      serviceName: service.name,
      employeeId: employee.id,
      employeeName: employee.name,
      scheduledDate: body.data.scheduledDate,
      scheduledTime: body.data.scheduledTime,
      notes: body.data.notes?.trim() || null,
      status: "waiting",
    })
    .returning();

  req.log.info({ salon: booking.salon, bookingId: booking.id }, "Created salon queue booking.");
  res.status(201).json(CreateQueueBookingResponse.parse(toQueueBookingResponse(booking)));
});

router.patch("/queue-bookings/:salon/:id/status", async (req, res): Promise<void> => {
  const params = UpdateQueueBookingStatusParams.safeParse(req.params);
  const body = UpdateQueueBookingStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Status antrian belum valid." });
    return;
  }

  const [booking] = await db
    .update(queueBookingsTable)
    .set({ status: body.data.status, updatedAt: new Date() })
    .where(and(
      eq(queueBookingsTable.salon, params.data.salon),
      eq(queueBookingsTable.id, params.data.id),
    ))
    .returning();

  if (!booking) {
    res.status(404).json({ error: "Booking tidak ditemukan di salon yang dipilih." });
    return;
  }

  req.log.info({ salon: booking.salon, bookingId: booking.id, status: booking.status }, "Updated salon queue status.");
  res.json(UpdateQueueBookingStatusResponse.parse(toQueueBookingResponse(booking)));
});

router.delete("/queue-bookings/:salon/:id", async (req, res): Promise<void> => {
  const params = DeleteQueueBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Parameter booking belum valid." });
    return;
  }

  const [booking] = await db
    .select({ id: queueBookingsTable.id, status: queueBookingsTable.status })
    .from(queueBookingsTable)
    .where(and(
      eq(queueBookingsTable.salon, params.data.salon),
      eq(queueBookingsTable.id, params.data.id),
    ))
    .limit(1);

  if (!booking) {
    res.status(404).json({ error: "Booking tidak ditemukan di salon yang dipilih." });
    return;
  }
  if (booking.status !== "called" && booking.status !== "completed") {
    res.status(409).json({ error: "Booking hanya dapat dihapus setelah dipanggil atau selesai." });
    return;
  }

  const [deleted] = await db
    .delete(queueBookingsTable)
    .where(and(
      eq(queueBookingsTable.salon, params.data.salon),
      eq(queueBookingsTable.id, params.data.id),
      inArray(queueBookingsTable.status, deletableQueueBookingStatuses),
    ))
    .returning({ id: queueBookingsTable.id });

  if (!deleted) {
    res.status(409).json({ error: "Status booking berubah. Muat ulang antrean lalu coba lagi." });
    return;
  }

  req.log.info({ salon: params.data.salon, bookingId: deleted.id }, "Deleted terminal salon queue booking.");
  res.sendStatus(204);
});

export default router;
