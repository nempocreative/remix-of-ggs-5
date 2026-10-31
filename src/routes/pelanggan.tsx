import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/pelanggan")({
  head: () => posHead("Pelanggan", "Data pelanggan dan kartu member GGS."),
  component: PosShell,
});
