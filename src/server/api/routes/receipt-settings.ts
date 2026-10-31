import { eq } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  GetReceiptSettingsQueryParams,
  GetReceiptSettingsResponse,
  UpdateReceiptSettingsBody,
  UpdateReceiptSettingsQueryParams,
  UpdateReceiptSettingsResponse,
} from "@/lib/api-zod";
import { db, salonReceiptSettingsTable } from "@/server/db";

const router: IRouter = Router();

function defaultReceiptSettings(salon: "beauty" | "hair-studio") {
  const salonName = salon === "beauty" ? "GGS Beauty" : "GGS Hair Studio";
  return {
    salon,
    thankYouText: `Terima kasih telah mempercayakan perawatan dan penampilan Anda kepada ${salonName}.`,
    taglineText: "Cantik atau tampan, tampil percaya diri dengan gaya terbaikmu.",
  };
}

router.get("/receipt-settings", async (req, res): Promise<void> => {
  const params = GetReceiptSettingsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }

  const [settings] = await db
    .select()
    .from(salonReceiptSettingsTable)
    .where(eq(salonReceiptSettingsTable.salon, params.data.salon))
    .limit(1);

  res.set("Cache-Control", "no-store");
  res.json(GetReceiptSettingsResponse.parse(
    settings
      ? {
          salon: settings.salon,
          thankYouText: settings.thankYouText,
          taglineText: settings.taglineText,
        }
      : defaultReceiptSettings(params.data.salon),
  ));
});

router.put("/receipt-settings", async (req, res): Promise<void> => {
  const params = UpdateReceiptSettingsQueryParams.safeParse(req.query);
  const body = UpdateReceiptSettingsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Teks struk belum valid." });
    return;
  }

  const [settings] = await db
    .insert(salonReceiptSettingsTable)
    .values({
      salon: params.data.salon,
      ...body.data,
    })
    .onConflictDoUpdate({
      target: salonReceiptSettingsTable.salon,
      set: {
        ...body.data,
        updatedAt: new Date(),
      },
    })
    .returning();

  req.log.info({ salon: settings.salon }, "Updated salon receipt text.");
  res.json(UpdateReceiptSettingsResponse.parse({
    salon: settings.salon,
    thankYouText: settings.thankYouText,
    taglineText: settings.taglineText,
  }));
});

export default router;
