import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/absensi")({
  head: () => posHead("Absensi", "Absensi staf dengan PIN."),
  component: PosShell,
});
