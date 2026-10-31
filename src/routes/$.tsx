import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/$")({
  head: () => posHead("Halaman tidak ditemukan", "Halaman tidak tersedia."),
  component: PosShell,
});
