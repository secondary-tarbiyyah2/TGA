// learn.tarbiyyah.co.uk (the portal) on Cloudflare Pages: the same rules
// deploy/learn-subdomain.htaccess gives Apache (docs/cloudflare-hosting.md).
import { SUPABASE_FUNCTIONS, STAFF_MAX_AGE, cookies, cookie, redirect, serveAsset, proxy, mutable } from "../../shared.js";

const CSP =
  "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; worker-src 'self' blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src blob:; child-src blob:; object-src blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

function withHeaders(res, path, extraCookies = []) {
  const r = mutable(res);
  const h = r.headers;
  h.set("Cache-Control", path.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-store");
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Strict-Transport-Security", "max-age=31536000");
  h.set("Content-Security-Policy", CSP);
  if (path === "/sw.js") h.set("Service-Worker-Allowed", "/");
  if (path.endsWith(".webmanifest")) h.set("Content-Type", "application/manifest+json");
  for (const c of extraCookies) h.append("Set-Cookie", c);
  return r;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const key = (env.PREVIEW_KEY || "").trim();
  const jar = cookies(request);

  if (/(^|\/)\./.test(path)) return new Response("Not found", { status: 404 });

  // Timetable subscriptions (Outlook, Google, Apple): a private token in the address, no cookie.
  if (path === "/calendar.php") {
    const token = url.searchParams.get("token") || "";
    if (!/^[a-f0-9]{32,128}$/i.test(token)) return new Response(null, { status: 404 });
    const res = await proxy(`${SUPABASE_FUNCTIONS}/timetable-ics?token=${encodeURIComponent(token)}`);
    const ok = res.status >= 200 && res.status < 300;
    return new Response(request.method === "HEAD" ? null : res.body, {
      status: res.status,
      headers: {
        "Content-Type": ok ? "text/calendar; charset=utf-8" : "text/plain; charset=utf-8",
        ...(ok ? { "Content-Disposition": 'inline; filename="tarbiyyah-calendar.ics"' } : {}),
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (/\.php$/.test(path)) return new Response("Not found", { status: 404 });

  // Pre-launch: staff only. ?key=<key> once sets the staff cookie (shared with preview.).
  if (key && url.searchParams.get("key") === key) {
    url.searchParams.delete("key");
    return redirect(url.pathname + (url.search || ""), 302, [cookie("tga_staff", key, host, { maxAge: STAFF_MAX_AGE, shared: true })]);
  }
  const extra = [];
  const staff = key && jar.tga_staff === key;
  if (!staff) {
    if (!/^\/(staff-only\.html|robots\.txt|favicon\.(ico|png|svg)|brand\/ga-wordmark\.png)$/.test(path))
      return withHeaders(await serveAsset(context, "/staff-only.html"), "/staff-only.html");
  } else if (/(\/|\.html)$/.test(path)) {
    extra.push(cookie("tga_staff", key, host, { maxAge: STAFF_MAX_AGE, shared: true }));
  }
  return withHeaders(await context.next(), path, extra);
}
