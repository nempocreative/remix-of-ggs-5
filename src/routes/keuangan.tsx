import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/keuangan")({
  head: () => posHead("Keuangan", "Laporan pemasukan dan pengeluaran salon."),
  component: PosShell,
});
