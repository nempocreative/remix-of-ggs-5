import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { Router, type IRouter } from "@/server/express-shim";
import {
  GetFinanceIncomeQueryParams,
  GetFinanceIncomeResponse,
  GetFinanceReportQueryParams,
  GetFinanceReportResponse,
} from "@/lib/api-zod";
import { db, expensesTable, salesTable } from "@/server/db";

const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 3660;
const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(value: string, days: number) {
  return new Date(Date.parse(`${value}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function jakartaDate(value: Date) {
  const parts = jakartaDateFormatter.formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function emptyDay(date: string) {
  return {
    date,
    revenue: 0,
    expenses: 0,
    cashRevenue: 0,
    transferRevenue: 0,
    otherRevenue: 0,
    cashExpenses: 0,
    transferExpenses: 0,
    unclassifiedExpenses: 0,
    netCashFlow: 0,
  };
}

router.get("/finance/report", async (req, res): Promise<void> => {
  const parsed = GetFinanceReportQueryParams.safeParse(req.query);
  if (
    !parsed.success
    || !isCalendarDate(parsed.data.from)
    || !isCalendarDate(parsed.data.to)
    || parsed.data.from > parsed.data.to
  ) {
    res.status(400).json({ error: "Pilih salon dan rentang tanggal laporan yang valid." });
    return;
  }

  const { salon, from, to } = parsed.data;
  const rangeDays = Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    res.status(400).json({ error: "Rentang laporan maksimal 10 tahun." });
    return;
  }

  const start = new Date(`${from}T00:00:00.000+07:00`);
  const end = new Date(`${addDays(to, 1)}T00:00:00.000+07:00`);
  const [sales, expenses] = await Promise.all([
    db.select({
      createdAt: salesTable.createdAt,
      paymentMethod: salesTable.paymentMethod,
      total: salesTable.total,
    })
      .from(salesTable)
      .where(and(
        eq(salesTable.salon, salon),
        gte(salesTable.createdAt, start),
        lt(salesTable.createdAt, end),
      )),
    db.select({
      category: expensesTable.category,
      amount: expensesTable.amount,
      expenseDate: expensesTable.expenseDate,
      paymentMethod: expensesTable.paymentMethod,
    })
      .from(expensesTable)
      .where(and(
        eq(expensesTable.salon, salon),
        gte(expensesTable.expenseDate, from),
        lte(expensesTable.expenseDate, to),
      )),
  ]);

  const daily = new Map<string, ReturnType<typeof emptyDay>>();
  for (let day = 0; day < rangeDays; day += 1) {
    const date = addDays(from, day);
    daily.set(date, emptyDay(date));
  }

  let revenue = 0;
  let cashRevenue = 0;
  let transferRevenue = 0;
  let otherRevenue = 0;
  for (const sale of sales) {
    const date = jakartaDate(sale.createdAt);
    const totals = daily.get(date);
    if (!totals) continue;
    revenue += sale.total;
    totals.revenue += sale.total;
    if (sale.paymentMethod === "Tunai") {
      cashRevenue += sale.total;
      totals.cashRevenue += sale.total;
    } else if (sale.paymentMethod === "Transfer / QRIS") {
      transferRevenue += sale.total;
      totals.transferRevenue += sale.total;
    } else {
      otherRevenue += sale.total;
      totals.otherRevenue += sale.total;
    }
  }

  let expenseTotal = 0;
  let cashExpenses = 0;
  let transferExpenses = 0;
  let unclassifiedExpenses = 0;
  const categories = new Map<string, { category: string; amount: number; count: number }>();
  for (const expense of expenses) {
    const totals = daily.get(expense.expenseDate);
    if (!totals) continue;
    expenseTotal += expense.amount;
    totals.expenses += expense.amount;
    const category = categories.get(expense.category) ?? { category: expense.category, amount: 0, count: 0 };
    category.amount += expense.amount;
    category.count += 1;
    categories.set(expense.category, category);
    if (expense.paymentMethod === "Tunai") {
      cashExpenses += expense.amount;
      totals.cashExpenses += expense.amount;
    } else if (expense.paymentMethod === "Transfer / QRIS") {
      transferExpenses += expense.amount;
      totals.transferExpenses += expense.amount;
    } else {
      unclassifiedExpenses += expense.amount;
      totals.unclassifiedExpenses += expense.amount;
    }
  }

  for (const totals of daily.values()) {
    totals.netCashFlow = totals.revenue - totals.expenses;
  }

  const report = GetFinanceReportResponse.parse({
    salon,
    from,
    to,
    revenue,
    salesCount: sales.length,
    cashRevenue,
    transferRevenue,
    otherRevenue,
    expenses: expenseTotal,
    expenseCount: expenses.length,
    cashExpenses,
    transferExpenses,
    unclassifiedExpenses,
    netProfit: revenue - expenseTotal,
    netCashFlow: revenue - expenseTotal,
    categories: [...categories.values()].sort((a, b) => b.amount - a.amount),
    daily: [...daily.values()],
  });

  req.log.info({ salon, from, to, salesCount: sales.length, expenseCount: expenses.length }, "Generated salon finance report.");
  res.json(report);
});

router.get("/finance/income", async (req, res): Promise<void> => {
  const parsed = GetFinanceIncomeQueryParams.safeParse(req.query);
  if (
    !parsed.success
    || !isCalendarDate(parsed.data.from)
    || !isCalendarDate(parsed.data.to)
    || parsed.data.from > parsed.data.to
  ) {
    res.status(400).json({ error: "Pilih salon dan rentang tanggal pemasukan yang valid." });
    return;
  }

  const { salon, from, to } = parsed.data;
  const rangeDays = Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    res.status(400).json({ error: "Rentang unduhan maksimal 10 tahun." });
    return;
  }

  const start = new Date(`${from}T00:00:00.000+07:00`);
  const end = new Date(`${addDays(to, 1)}T00:00:00.000+07:00`);
  const sales = await db.select({
    invoiceNumber: salesTable.invoiceNumber,
    createdAt: salesTable.createdAt,
    paymentMethod: salesTable.paymentMethod,
    subtotal: salesTable.subtotal,
    discount: salesTable.discount,
    revenue: salesTable.total,
  })
    .from(salesTable)
    .where(and(
      eq(salesTable.salon, salon),
      gte(salesTable.createdAt, start),
      lt(salesTable.createdAt, end),
    ))
    .orderBy(desc(salesTable.createdAt), desc(salesTable.id));

  const rows = sales.map((sale) => ({
    invoiceNumber: sale.invoiceNumber,
    date: jakartaDate(sale.createdAt),
    paymentMethod: sale.paymentMethod,
    subtotal: sale.subtotal,
    discount: sale.discount,
    revenue: sale.revenue,
  }));
  const result = GetFinanceIncomeResponse.parse({
    salon,
    from,
    to,
    totalRevenue: rows.reduce((sum, sale) => sum + sale.revenue, 0),
    count: rows.length,
    rows,
  });

  req.log.info({ salon, from, to, salesCount: rows.length }, "Fetched salon income details for export.");
  res.json(result);
});

export default router;
