import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const [{ dispatch }, { default: router }] = await Promise.all([
    import("@/server/express-shim"),
    import("@/server/api/routes"),
  ]);
  return dispatch(router, request, "/api");
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle },
  },
});
