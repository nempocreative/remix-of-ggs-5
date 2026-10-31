import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/keamanan-sistem")({
  head: () => posHead("Keamanan Sistem", "Atur PIN akses akun kasir dan owner."),
  component: PosShell,
});
