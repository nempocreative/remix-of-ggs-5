import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/antrian")({
  head: () => posHead("Antrian", "Kelola antrian dan booking pelanggan salon."),
  component: PosShell,
});
