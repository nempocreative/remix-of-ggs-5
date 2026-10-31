import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/layanan")({
  head: () => posHead("Layanan", "Daftar layanan dan harga salon."),
  component: PosShell,
});
