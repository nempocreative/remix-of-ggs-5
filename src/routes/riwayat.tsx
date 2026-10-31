import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/riwayat")({
  head: () => posHead("Riwayat", "Riwayat transaksi kasir GGS."),
  component: PosShell,
});
