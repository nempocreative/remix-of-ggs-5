import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/pengeluaran")({
  head: () => posHead("Pengeluaran", "Catat pengeluaran operasional salon."),
  component: PosShell,
});
