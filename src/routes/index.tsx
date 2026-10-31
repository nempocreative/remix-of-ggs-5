import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/")({
  head: () => posHead("Kasir", "Kasir GGS Beauty Salon & GGS Hair Studio: transaksi, pelanggan, dan poin member."),
  component: PosShell,
});
