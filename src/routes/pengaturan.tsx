import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/pengaturan")({
  head: () => posHead("Pengaturan", "Pengaturan struk dan promo salon."),
  component: PosShell,
});
