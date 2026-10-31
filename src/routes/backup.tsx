import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/backup")({
  head: () => posHead("Backup", "Cadangkan dan pulihkan data kasir."),
  component: PosShell,
});
