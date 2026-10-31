import { createFileRoute } from "@tanstack/react-router";
import { PosShell, posHead } from "@/pos/PosShell";

export const Route = createFileRoute("/poin")({
  head: () => posHead("Poin", "Poin member dan penukaran hadiah."),
  component: PosShell,
});
