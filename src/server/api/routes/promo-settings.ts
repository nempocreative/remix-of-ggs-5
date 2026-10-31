import { eq } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  GetPromoSettingsQueryParams,
  GetPromoSettingsResponse,
  DeletePromoSettingsQueryParams,
  DeletePromoSettingsResponse,
  UpdatePromoSettingsBody,
  UpdatePromoSettingsQueryParams,
  UpdatePromoSettingsResponse,
} from "@/lib/api-zod";
import { db, salonPromoSettingsTable } from "@/server/db";

const router: IRouter = Router();

const isValidCalendarDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

router.get("/promo-settings", async (req, res): Promise<void> => {
  const params = GetPromoSettingsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }

  const [settings] = await db
    .select()
    .from(salonPromoSettingsTable)
    .where(eq(salonPromoSettingsTable.salon, params.data.salon))
    .limit(1);

  res.set("Cache-Control", "no-store");
  res.json(GetPromoSettingsResponse.parse(
    settings
      ? {
          salon: settings.salon,
          title: settings.title,
          description: settings.description,
          startDate: settings.startDate,
          endDate: settings.endDate,
          isActive: settings.isActive,
        }
      : {
          salon: params.data.salon,
          title: "",
          description: "",
          startDate: null,
          endDate: null,
          isActive: false,
        },
  ));
});

router.put("/promo-settings", async (req, res): Promise<void> => {
  const params = UpdatePromoSettingsQueryParams.safeParse(req.query);
  const body = UpdatePromoSettingsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Informasi promo belum valid." });
    return;
  }
  if (body.data.isActive && !body.data.title.trim()) {
    res.status(400).json({ error: "Isi judul promo sebelum menampilkannya di kasir." });
    return;
  }
  if (
    (body.data.startDate !== null && !isValidCalendarDate(body.data.startDate)) ||
    (body.data.endDate !== null && !isValidCalendarDate(body.data.endDate))
  ) {
    res.status(400).json({ error: "Tanggal promo belum valid." });
    return;
  }
  if (body.data.isActive && (!body.data.startDate || !body.data.endDate)) {
    res.status(400).json({ error: "Isi tanggal mulai dan berakhir sebelum menampilkan promo." });
    return;
  }
  if (body.data.startDate && body.data.endDate && body.data.startDate > body.data.endDate) {
    res.status(400).json({ error: "Tanggal akhir promo harus sama atau setelah tanggal mulai." });
    return;
  }

  const values = {
    title: body.data.title.trim(),
    description: body.data.description.trim(),
    startDate: body.data.startDate,
    endDate: body.data.endDate,
    isActive: body.data.isActive,
  };
  const [settings] = await db
    .insert(salonPromoSettingsTable)
    .values({
      salon: params.data.salon,
      ...values,
    })
    .onConflictDoUpdate({
      target: salonPromoSettingsTable.salon,
      set: {
        ...values,
        updatedAt: new Date(),
      },
    })
    .returning();

  req.log.info({ salon: settings.salon, isActive: settings.isActive }, "Updated salon cashier promo.");
  res.json(UpdatePromoSettingsResponse.parse({
    salon: settings.salon,
    title: settings.title,
    description: settings.description,
    startDate: settings.startDate,
    endDate: settings.endDate,
    isActive: settings.isActive,
  }));
});

router.delete("/promo-settings", async (req, res): Promise<void> => {
  const params = DeletePromoSettingsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }

  await db
    .delete(salonPromoSettingsTable)
    .where(eq(salonPromoSettingsTable.salon, params.data.salon));

  req.log.info({ salon: params.data.salon }, "Deleted salon cashier promo.");
  res.json(DeletePromoSettingsResponse.parse({
    salon: params.data.salon,
    title: "",
    description: "",
    startDate: null,
    endDate: null,
    isActive: false,
  }));
});

export default router;
