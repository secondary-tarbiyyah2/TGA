// CORS for every Edge Function.
//
// Security audit L2 (docs/security-audit-2026-11.md): browsers may call these
// functions only from the school's own sites. Every function imports this
// file, so the check is made once here: Deno.serve is wrapped so that each
// response carries Access-Control-Allow-Origin for an allowed Origin only.
// Calls with no Origin (scheduled jobs, server to server, webhooks) are not
// affected. Extra origins (e.g. a new subdomain) can be added without a code
// change through the EXTRA_CORS_ORIGINS secret, comma-separated.

const SITE_ORIGINS = [
  "https://globalacademy.tarbiyyah.co.uk",
  "https://preview.tarbiyyah.co.uk",
  "https://learn.tarbiyyah.co.uk",
];

function extraOrigins(): string[] {
  try {
    return (Deno.env.get("EXTRA_CORS_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const ALLOWED = new Set([...SITE_ORIGINS, ...extraOrigins()]);

/** True for the school's sites and for local development. */
export function originAllowed(origin: string): boolean {
  return ALLOWED.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// Kept as before so existing `new Response(null, { headers: corsHeaders })`
// calls still work; the wrapper below replaces "*" with the caller's origin
// (or removes it for an origin that isn't allowed).
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
  return res;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return withCors(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

function applyOrigin(req: Request, res: Response): Response {
  const origin = req.headers.get("origin");
  if (!origin) return res;
  let out = res;
  try {
    out.headers.set("Vary", "Origin");
  } catch {
    // Headers of some responses (e.g. a proxied fetch) are read-only: copy them.
    out = new Response(res.body, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
    out.headers.set("Vary", "Origin");
  }
  if (originAllowed(origin)) out.headers.set("Access-Control-Allow-Origin", origin);
  else out.headers.delete("Access-Control-Allow-Origin");
  return out;
}

type Handler = (req: Request, info: unknown) => Response | Promise<Response>;

// Wrap Deno.serve once per function process.
const g = globalThis as unknown as { __tgaCorsWrapped?: boolean };
if (!g.__tgaCorsWrapped && typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  g.__tgaCorsWrapped = true;
  const original = Deno.serve.bind(Deno) as (...args: unknown[]) => unknown;
  const wrap = (h: Handler): Handler => async (req, info) => applyOrigin(req, await h(req, info));
  (Deno as unknown as { serve: (...args: unknown[]) => unknown }).serve = (...args: unknown[]) => {
    const next = args.map((a) => {
      if (typeof a === "function") return wrap(a as Handler);
      if (a && typeof a === "object" && typeof (a as { handler?: unknown }).handler === "function") {
        return { ...(a as object), handler: wrap((a as { handler: Handler }).handler) };
      }
      return a;
    });
    return original(...next);
  };
}
