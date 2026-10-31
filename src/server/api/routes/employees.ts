import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  CreateEmployeeBody,
  CreateEmployeeParams,
  CreateEmployeeResponse,
  GetEmployeesQueryParams,
  GetEmployeesResponse,
  UpdateEmployeeBody,
  UpdateEmployeeParams,
  UpdateEmployeeResponse,
} from "@/lib/api-zod";
import { db, salonEmployeesTable } from "@/server/db";

const router: IRouter = Router();

function toEmployeeResponse(employee: typeof salonEmployeesTable.$inferSelect) {
  return { ...employee, createdAt: employee.createdAt.toISOString() };
}

router.get("/employees", async (req, res): Promise<void> => {
  const parsed = GetEmployeesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Pilih salon yang valid." });
    return;
  }

  const employees = await db
    .select()
    .from(salonEmployeesTable)
    .where(eq(salonEmployeesTable.salon, parsed.data.salon))
    .orderBy(asc(salonEmployeesTable.name));
  res.json(GetEmployeesResponse.parse(employees.map(toEmployeeResponse)));
});

router.post("/employees/:salon", async (req, res): Promise<void> => {
  const params = CreateEmployeeParams.safeParse(req.params);
  const body = CreateEmployeeBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Nama karyawan dan persentase komisi belum valid." });
    return;
  }

  const [employee] = await db
    .insert(salonEmployeesTable)
    .values({
      salon: params.data.salon,
      id: randomUUID(),
      name: body.data.name.trim(),
      commissionPercent: body.data.commissionPercent,
      active: true,
      isCashier: body.data.isCashier ?? false,
    })
    .returning();
  req.log.info({ salon: employee.salon, employeeId: employee.id }, "Created salon employee.");
  res.status(201).json(CreateEmployeeResponse.parse(toEmployeeResponse(employee)));
});

router.put("/employees/:salon/:id", async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  const body = UpdateEmployeeBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Data karyawan belum lengkap atau tidak valid." });
    return;
  }

  const [employee] = await db
    .update(salonEmployeesTable)
    .set({
      name: body.data.name.trim(),
      commissionPercent: body.data.commissionPercent,
      active: body.data.active,
      isCashier: body.data.isCashier,
    })
    .where(and(
      eq(salonEmployeesTable.salon, params.data.salon),
      eq(salonEmployeesTable.id, params.data.id),
    ))
    .returning();

  if (!employee) {
    res.status(404).json({ error: "Karyawan tidak ditemukan di salon yang dipilih." });
    return;
  }

  req.log.info({ salon: employee.salon, employeeId: employee.id }, "Updated salon employee.");
  res.json(UpdateEmployeeResponse.parse(toEmployeeResponse(employee)));
});

export default router;
