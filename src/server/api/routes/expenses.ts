import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  CreateExpenseBody,
  CreateExpenseParams,
  CreateExpenseResponse,
  DeleteExpenseParams,
  ListExpensesQueryParams,
  ListExpensesResponse,
  UpdateExpenseBody,
  UpdateExpenseParams,
  UpdateExpenseResponse,
} from "@/lib/api-zod";
import { db, expensesTable } from "@/server/db";

const router: IRouter = Router();

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function toExpenseResponse(expense: typeof expensesTable.$inferSelect) {
  return { ...expense, createdAt: expense.createdAt.toISOString() };
}

function validateExpenseInput(value: { category: string; description: string; expenseDate: string; paymentMethod: "Tunai" | "Transfer / QRIS" }) {
  return value.category.trim().length > 0
    && value.description.trim().length > 0
    && (value.paymentMethod === "Tunai" || value.paymentMethod === "Transfer / QRIS")
    && isCalendarDate(value.expenseDate);
}

router.get("/expenses", async (req, res): Promise<void> => {
  const parsed = ListExpensesQueryParams.safeParse(req.query);
  if (
    !parsed.success
    || !isCalendarDate(parsed.data.from)
    || !isCalendarDate(parsed.data.to)
    || parsed.data.from > parsed.data.to
  ) {
    res.status(400).json({ error: "Pilih salon dan rentang tanggal yang valid." });
    return;
  }

  const expenses = await db
    .select()
    .from(expensesTable)
    .where(and(
      eq(expensesTable.salon, parsed.data.salon),
      gte(expensesTable.expenseDate, parsed.data.from),
      lte(expensesTable.expenseDate, parsed.data.to),
    ))
    .orderBy(desc(expensesTable.expenseDate), desc(expensesTable.createdAt));
  const totalAmount = expenses.reduce((total, expense) => total + expense.amount, 0);

  req.log.info({ salon: parsed.data.salon, count: expenses.length }, "Fetched salon expenses.");
  res.json(ListExpensesResponse.parse({
    expenses: expenses.map(toExpenseResponse),
    totalAmount,
    count: expenses.length,
  }));
});

router.post("/expenses/:salon", async (req, res): Promise<void> => {
  const params = CreateExpenseParams.safeParse(req.params);
  const body = CreateExpenseBody.safeParse(req.body);
  if (!params.success || !body.success || !validateExpenseInput(body.data)) {
    res.status(400).json({ error: "Data pengeluaran belum lengkap atau tidak valid." });
    return;
  }

  const [expense] = await db
    .insert(expensesTable)
    .values({
      salon: params.data.salon,
      category: body.data.category.trim(),
      description: body.data.description.trim(),
      amount: body.data.amount,
      expenseDate: body.data.expenseDate,
      paymentMethod: body.data.paymentMethod,
    })
    .returning();

  req.log.info({ salon: expense.salon, expenseId: expense.id }, "Created salon expense.");
  res.status(201).json(CreateExpenseResponse.parse(toExpenseResponse(expense)));
});

router.put("/expenses/:salon/:id", async (req, res): Promise<void> => {
  const params = UpdateExpenseParams.safeParse(req.params);
  const body = UpdateExpenseBody.safeParse(req.body);
  if (!params.success || !body.success || !validateExpenseInput(body.data)) {
    res.status(400).json({ error: "Data pengeluaran belum lengkap atau tidak valid." });
    return;
  }

  const [expense] = await db
    .update(expensesTable)
    .set({
      category: body.data.category.trim(),
      description: body.data.description.trim(),
      amount: body.data.amount,
      expenseDate: body.data.expenseDate,
      paymentMethod: body.data.paymentMethod,
    })
    .where(and(
      eq(expensesTable.salon, params.data.salon),
      eq(expensesTable.id, params.data.id),
    ))
    .returning();

  if (!expense) {
    res.status(404).json({ error: "Catatan pengeluaran tidak ditemukan di salon yang dipilih." });
    return;
  }

  req.log.info({ salon: expense.salon, expenseId: expense.id }, "Updated salon expense.");
  res.json(UpdateExpenseResponse.parse(toExpenseResponse(expense)));
});

router.delete("/expenses/:salon/:id", async (req, res): Promise<void> => {
  const params = DeleteExpenseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Data pengeluaran tidak valid." });
    return;
  }

  const [expense] = await db
    .delete(expensesTable)
    .where(and(
      eq(expensesTable.salon, params.data.salon),
      eq(expensesTable.id, params.data.id),
    ))
    .returning({ id: expensesTable.id });

  if (!expense) {
    res.status(404).json({ error: "Catatan pengeluaran tidak ditemukan di salon yang dipilih." });
    return;
  }

  req.log.info({ salon: params.data.salon, expenseId: expense.id }, "Deleted salon expense.");
  res.status(204).send();
});

export default router;
