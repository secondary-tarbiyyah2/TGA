// Shared helpers for the Cloudflare Pages Functions (docs/cloudflare-hosting.md).
export const SUPABASE_FUNCTIONS = "https://bgtspjhdajqheaktudip.supabase.co/functions/v1";
export const STAFF_MAX_AGE = 34560000; // 400 days, the longest browsers allow

export function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Set-Cookie value. On the real domain the staff cookie is shared by preview. and learn. (Domain=.tarbiyyah.co.uk). */
export function cookie(name, value, host, { maxAge, httpOnly = true, shared = false } = {}) {
  const parts = [`${name}=${value}`, "Path=/", "Secure", "SameSite=Lax"];
  if (shared && host.endsWith(".tarbiyyah.co.uk")) parts.push("Domain=.tarbiyyah.co.uk");
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

export function redirect(location, status = 302, setCookies = []) {
  const h = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of setCookies) h.append("Set-Cookie", c);
  return new Response(null, { status, headers: h });
}

/** Serve another static file in place of the requested one (an internal rewrite). */
export async function serveAsset(context, pathname) {
  const url = new URL(context.request.url);
  // Pages serves "x.html" at "/x" and "x/index.html" at "/x/" (and redirects the .html form), so ask for those.
  url.pathname = pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  url.search = "";
  return context.env.ASSETS.fetch(new Request(url.toString(), { method: "GET", headers: context.request.headers }));
}

/** Pass a request through to a Supabase Edge Function. */
export async function proxy(target, init = {}) {
  try {
    return await fetch(target, init);
  } catch {
    return new Response("Bad gateway", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

/** A mutable copy of a response, so headers can be added. */
export function mutable(res) {
  return new Response(res.body, res);
}
