import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/notifikasi")({
  head: () => posHead("Notifikasi", "Kampanye dan pengingat WhatsApp pelanggan."),
  component: PosShell,
});
