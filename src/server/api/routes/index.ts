import { Router, type IRouter } from "@/server/express-shim";
import { requireCashierSalonScope, requireCashierSession } from "../lib/cashier-session";
import authRouter from "./auth";
import attendanceRouter from "./attendance";
import backupRouter from "./backup";
import employeesRouter from "./employees";
import expensesRouter from "./expenses";
import financeRouter from "./finance";
import healthRouter from "./health";
import posRouter from "./pos";
import pointRedemptionsRouter from "./point-redemptions";
import promoSettingsRouter from "./promo-settings";
import queueBookingsRouter from "./queue-bookings";
import receiptSettingsRouter from "./receipt-settings";
import servicesRouter from "./services";
import whatsAppCampaignsRouter from "./whatsapp-campaigns";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(requireCashierSession);
router.use(requireCashierSalonScope);
router.use(attendanceRouter);
router.use(backupRouter);
router.use(employeesRouter);
router.use(expensesRouter);
router.use(financeRouter);
router.use(servicesRouter);
router.use(posRouter);
router.use(pointRedemptionsRouter);
router.use(promoSettingsRouter);
router.use(queueBookingsRouter);
router.use(receiptSettingsRouter);
router.use(whatsAppCampaignsRouter);

export default router;
