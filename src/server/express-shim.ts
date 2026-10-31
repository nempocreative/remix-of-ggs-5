// Minimal Express-compatible router so the original kasir API handlers run unchanged
// inside a TanStack server route (Worker runtime has no Express).

type Dict = Record<string, any>;

export interface Request {
  method: string;
  url: string;
  path: string;
  params: Dict;
  query: Dict;
  body: any;
  cookies: Record<string, string>;
  headers: Record<string, string>;
  ip: string;
  id: string;
  log: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void; debug: (...a: any[]) => void };
  get(name: string): string | undefined;
}

type CookieOpts = { httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none"; path?: string; maxAge?: number };

export class Response {
  statusCode = 200;
  headers = new Headers();
  body: BodyInit | null = null;
  finished = false;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  set(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }
  setHeader(name: string, value: string) {
    return this.set(name, value);
  }
  json(data: unknown) {
    this.headers.set("Content-Type", "application/json");
    this.body = JSON.stringify(data);
    this.finished = true;
    return this;
  }
  send(data?: unknown) {
    if (data !== undefined && typeof data === "object" && !(data instanceof ArrayBuffer)) return this.json(data);
    this.body = data === undefined ? null : String(data);
    this.finished = true;
    return this;
  }
  end() {
    this.finished = true;
    return this;
  }
  sendStatus(code: number) {
    this.statusCode = code;
    this.finished = true;
    return this;
  }
  cookie(name: string, value: string, o: CookieOpts = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? "/"}`];
    if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge / 1000)}`);
    if (o.httpOnly) parts.push("HttpOnly");
    if (o.secure) parts.push("Secure");
    if (o.sameSite) parts.push(`SameSite=${o.sameSite[0]!.toUpperCase()}${o.sameSite.slice(1)}`);
    this.headers.append("Set-Cookie", parts.join("; "));
    return this;
  }
  clearCookie(name: string, o: CookieOpts = {}) {
    return this.cookie(name, "", { ...o, maxAge: 0 });
  }
}

export type NextFunction = (err?: unknown) => void;
type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
type Layer =
  | { kind: "use"; handlers: (Handler | Router)[] }
  | { kind: "route"; method: string; regex: RegExp; keys: string[]; handlers: Handler[] };

function compile(path: string) {
  const keys: string[] = [];
  const pattern = path.replace(/\/:([A-Za-z0-9_]+)/g, (_m, k) => {
    keys.push(k);
    return "/([^/]+)";
  });
  return { regex: new RegExp(`^${pattern}/?$`), keys };
}

export class Router {
  layers: Layer[] = [];
  use(...handlers: (Handler | Router)[]) {
    this.layers.push({ kind: "use", handlers });
    return this;
  }
  private add(method: string, path: string, handlers: Handler[]) {
    const { regex, keys } = compile(path);
    this.layers.push({ kind: "route", method, regex, keys, handlers });
    return this;
  }
  get(p: string, ...h: Handler[]) { return this.add("GET", p, h); }
  post(p: string, ...h: Handler[]) { return this.add("POST", p, h); }
  put(p: string, ...h: Handler[]) { return this.add("PUT", p, h); }
  patch(p: string, ...h: Handler[]) { return this.add("PATCH", p, h); }
  delete(p: string, ...h: Handler[]) { return this.add("DELETE", p, h); }

  /** Returns true when a handler finished the response. */
  async handle(req: Request, res: Response): Promise<boolean> {
    for (const layer of this.layers) {
      if (layer.kind === "use") {
        for (const h of layer.handlers) {
          if (h instanceof Router) {
            if (await h.handle(req, res)) return true;
          } else {
            const proceed = await runChain([h], req, res);
            if (!proceed) return true;
          }
        }
        continue;
      }
      if (layer.method !== req.method) continue;
      const m = layer.regex.exec(req.path);
      if (!m) continue;
      req.params = {};
      layer.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1]!)));
      await runChain(layer.handlers, req, res);
      return true;
    }
    return false;
  }
}

async function runChain(handlers: Handler[], req: Request, res: Response): Promise<boolean> {
  for (const h of handlers) {
    let nextCalled = false;
    let nextErr: unknown;
    await h(req, res, (err) => {
      nextCalled = true;
      nextErr = err;
    });
    if (nextErr) throw nextErr;
    if (!nextCalled) return false;
  }
  return true;
}

export type IRouter = Router;
export type Express = Router;

function parseQuery(sp: URLSearchParams) {
  const q: Dict = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    q[key] = all.length > 1 ? all : all[0];
  }
  return q;
}

function parseCookies(header: string | null) {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const logger = {
  info: (...a: any[]) => console.log(...a),
  warn: (...a: any[]) => console.warn(...a),
  error: (...a: any[]) => console.error(...a),
  debug: () => {},
};

export async function dispatch(router: Router, request: globalThis.Request, prefix: string) {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k] = v));
  let body: any = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
  }
  const req: Request = {
    method: request.method,
    url: url.pathname.slice(prefix.length) + url.search,
    path: url.pathname.slice(prefix.length) || "/",
    params: {},
    query: parseQuery(url.searchParams),
    body,
    cookies: parseCookies(request.headers.get("cookie")),
    headers,
    ip: headers["cf-connecting-ip"] ?? headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? "local",
    id: crypto.randomUUID(),
    log: logger,
    get: (n) => headers[n.toLowerCase()],
  };
  const res = new Response();
  try {
    const handled = await router.handle(req, res);
    if (!handled && !res.finished) res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error("API error", err);
    res.status(500).json({ error: "Terjadi kesalahan server." });
  }
  return new globalThis.Response(res.statusCode === 204 ? null : res.body, { status: res.statusCode, headers: res.headers });
}

export default { Router };
