import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/keamanan-staf")({
  head: () => posHead("Keamanan Staf", "Atur PIN absensi staf."),
  component: PosShell,
});
