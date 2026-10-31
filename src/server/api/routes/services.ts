import { randomUUID } from "node:crypto";
import { and, eq, max } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  CreateSalonServiceBody,
  CreateSalonServiceParams,
  CreateSalonServiceResponse,
  GetServicesQueryParams,
  GetServicesResponse,
  UpdateSalonServiceBody,
  UpdateSalonServiceParams,
  UpdateSalonServiceResponse,
} from "@/lib/api-zod";
import { db, salonServicesTable } from "@/server/db";
import { getSalonServices } from "../lib/salon-services";

const router: IRouter = Router();

router.get("/services", async (req, res): Promise<void> => {
  const parsed = GetServicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Pilih kasir salon yang valid." });
    return;
  }

  const services = await getSalonServices(parsed.data.salon);
  req.log.info({ salon: parsed.data.salon, count: services.length }, "Fetched salon service menu.");
  res.json(GetServicesResponse.parse(services));
});

router.post("/services/:salon", async (req, res): Promise<void> => {
  const params = CreateSalonServiceParams.safeParse(req.params);
  const body = CreateSalonServiceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Data layanan dan harga belum lengkap atau tidak valid." });
    return;
  }

  const input = body.data;
  if (input.commissionPercent === null) {
    res.status(400).json({ error: "Persentase komisi wajib diisi saat membuat layanan." });
    return;
  }
  if (
    (input.priceType === "range" && (input.maxPrice === null || input.maxPrice <= input.minPrice)) ||
    (input.priceType !== "range" && input.maxPrice !== null)
  ) {
    res.status(400).json({ error: "Rentang harga harus memiliki harga maksimum lebih besar dari minimum." });
    return;
  }

  const [sortState] = await db
    .select({ maxSortOrder: max(salonServicesTable.sortOrder) })
    .from(salonServicesTable)
    .where(eq(salonServicesTable.salon, params.data.salon));

  const [service] = await db
    .insert(salonServicesTable)
    .values({
      salon: params.data.salon,
      id: randomUUID(),
      ...input,
      sortOrder: (sortState?.maxSortOrder ?? -1) + 1,
    })
    .returning();

  req.log.info({ salon: service.salon, serviceId: service.id }, "Created salon service.");
  res.status(201).json(CreateSalonServiceResponse.parse(service));
});

router.put("/services/:salon/:id", async (req, res): Promise<void> => {
  const params = UpdateSalonServiceParams.safeParse(req.params);
  const body = UpdateSalonServiceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Data layanan dan harga belum lengkap atau tidak valid." });
    return;
  }

  const input = body.data;
  if (
    (input.priceType === "range" && (input.maxPrice === null || input.maxPrice <= input.minPrice)) ||
    (input.priceType !== "range" && input.maxPrice !== null)
  ) {
    res.status(400).json({ error: "Rentang harga harus memiliki harga maksimum lebih besar dari minimum." });
    return;
  }

  const [service] = await db
    .update(salonServicesTable)
    .set(input)
    .where(and(
      eq(salonServicesTable.salon, params.data.salon),
      eq(salonServicesTable.id, params.data.id),
    ))
    .returning();

  if (!service) {
    res.status(404).json({ error: "Layanan tidak ditemukan di salon yang dipilih." });
    return;
  }

  req.log.info({ salon: service.salon, serviceId: service.id }, "Updated salon service.");
  res.json(UpdateSalonServiceResponse.parse(service));
});

export default router;
