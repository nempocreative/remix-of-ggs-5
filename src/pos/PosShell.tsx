import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

const PosApp = lazy(() => import("@/pos/App"));

const Loading = () => (
  <div className="grid min-h-screen place-items-center bg-background text-sm font-bold text-muted-foreground">Memuat kasir GGS…</div>
);

export function PosShell() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <PosApp />
      </Suspense>
    </ClientOnly>
  );
}

export function posHead(title: string, description: string) {
  const full = `${title} · GGS Beauty POS`;
  return {
    meta: [
      { title: full },
      { name: "description", content: description },
      { property: "og:title", content: full },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
