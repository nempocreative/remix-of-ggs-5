import { Router, type IRouter } from "@/server/express-shim";
import { HealthCheckResponse } from "@/lib/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
