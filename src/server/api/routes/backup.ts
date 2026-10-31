import { Router, type IRouter } from "@/server/express-shim";
import {
  GetPosBackupResponse,
  RestorePosBackupBody,
  RestorePosBackupResponse,
} from "@/lib/api-zod";
import {
  createPosBackup,
  InvalidPosBackupError,
  restorePosBackup,
} from "../lib/pos-backup";
import { getCashierSessionUser } from "../lib/cashier-session";

const router: IRouter = Router();

router.get("/backup", async (req, res): Promise<void> => {
  const backup = await createPosBackup();
  const salonScope = getCashierSessionUser(req)?.salonScope ?? null;
  const emptySalon = { services: [], customers: [], sales: [], employees: [], pointRedemptions: [] };
  const response = GetPosBackupResponse.parse(salonScope ? {
    ...backup,
    salons: {
      beauty: salonScope === "beauty" ? backup.salons.beauty : emptySalon,
      "hair-studio": salonScope === "hair-studio" ? backup.salons["hair-studio"] : emptySalon,
    },
    legacyCustomers: salonScope === "beauty" ? backup.legacyCustomers : [],
  } : backup);
  req.log.info(
    {
      beautySales: response.salons.beauty.sales.length,
      hairStudioSales: response.salons["hair-studio"].sales.length,
      beautyRedemptions: response.salons.beauty.pointRedemptions?.length ?? 0,
      hairStudioRedemptions: response.salons["hair-studio"].pointRedemptions?.length ?? 0,
      legacyCustomers: response.legacyCustomers.length,
    },
    "Created POS backup.",
  );
  res.json(response);
});

router.post("/backup/restore", async (req, res): Promise<void> => {
  const parsed = RestorePosBackupBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Rejected invalid POS backup.");
    res.status(400).json({
      error: "File backup tidak valid atau tidak didukung. Pilih file backup GGS Beauty POS versi 1.",
    });
    return;
  }

  try {
    const salonScope = getCashierSessionUser(req)?.salonScope ?? null;
    const emptySalon = { services: [], customers: [], sales: [], employees: [], pointRedemptions: [] };
    const scopedBackup = salonScope ? {
      ...parsed.data,
      salons: {
        beauty: salonScope === "beauty" ? parsed.data.salons.beauty : emptySalon,
        "hair-studio": salonScope === "hair-studio" ? parsed.data.salons["hair-studio"] : emptySalon,
      },
      legacyCustomers: salonScope === "beauty" ? parsed.data.legacyCustomers : [],
    } : parsed.data;
    const result = await restorePosBackup(scopedBackup);
    req.log.info(result, "Restored POS backup.");
    res.json(RestorePosBackupResponse.parse(result));
  } catch (error) {
    if (error instanceof InvalidPosBackupError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

export default router;
