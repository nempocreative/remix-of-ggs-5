import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/kinerja")({
  head: () => posHead("Kinerja Staf", "Kinerja dan komisi staf salon."),
  component: PosShell,
});
