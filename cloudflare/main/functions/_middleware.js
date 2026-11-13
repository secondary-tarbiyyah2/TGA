// globalacademy.tarbiyyah.co.uk and preview.tarbiyyah.co.uk on Cloudflare
// Pages: the same rules public/.htaccess gives Apache (docs/cloudflare-hosting.md).
// Keep the two in step until the old host is retired.
import { SUPABASE_FUNCTIONS, STAFF_MAX_AGE, cookies, cookie, redirect, serveAsset, proxy, mutable } from "../../shared.js";

const PUBLIC_ORIGIN = "https://globalacademy.tarbiyyah.co.uk";

// Permanent redirects (old addresses).
const MOVED = [
  [/^\/portal(\/.*)?$/, () => "https://learn.tarbiyyah.co.uk/login/"],
  [/^\/policies\/05-no-platform-for-extremism-prevent\/?$/, () => "/policies/05-safeguarding-extremism-and-radicalisation/"],
  [/^\/policies\/05-no-platform-for-extremism-prevent\.pdf$/, () => "/policies/05-safeguarding-extremism-and-radicalisation.pdf"],
  [/^\/curriculum\/reception-year-2\/?$/, () => "/curriculum/year-1-2/"],
  [/^\/faq\.html$/, () => "/faqs/"],
  [/^\/(admissions|register)\.html$/, () => "/admissions/"],
  [/^\/offer\.html$/, () => "/curriculum/"],
  [/^\/(why|trust)\.html$/, () => "/about/"],
  [/^\/team\/?$/, () => "/about/"],
  [/^\/policies\/17-(rshe|relationships-sex-and-health-education)\.pdf$/, () => "/policies/17-pshe.pdf"],
  [/^\/policies\/19-careers\.pdf$/, () => "/policies/18-careers-education-and-guidance.pdf"],
  [/^\/policies\/25-admissions\.pdf$/, () => "/policies/24-admissions.pdf"],
  [/^\/policies\/26-fees\.pdf$/, () => "/policies/25-fees.pdf"],
  [/^\/policies\/27-concerns-and-complaints\.pdf$/, () => "/policies/26-concerns-and-complaints.pdf"],
  [/^\/policies\/29-data-protection\.pdf$/, () => "/policies/28-data-protection.pdf"],
  [/^\/policies\/30-equality-diversity-and-accessibility\.pdf$/, () => "/policies/29-equality-diversity-and-accessibility.pdf"],
];

// Pre-launch holding site: what the public address may show (everything else goes to "/").
function holdingAllows(path) {
  if (path === "/") return true;
  if (/^\/(coming-soon|legal|manage-booking)(\/|$)/.test(path)) return true;
  if (/^\/(term-dates|fees|curriculum)\/?$/.test(path)) return true;
  if (/^\/careers(\/apply)?\/?$/.test(path)) return true;
  if (/^\/(_next|brand|learn|studio|staff|policies|prospectus)\//.test(path)) return true;
  if (/\.(php|png|jpe?g|webp|gif|svg|ico|webmanifest|xml|ics|js|css|woff2?|json|pdf|docx|map|txt)$/.test(path)) return true;
  return false;
}
const HOLDING_PAGES = {
  "/": "/coming-soon/",
  "/index.html": "/coming-soon/",
  "/term-dates/": "/coming-soon/term-dates/",
  "/fees/": "/coming-soon/fees/",
  "/curriculum/": "/coming-soon/subjects/",
  "/careers/": "/coming-soon/careers/",
  "/careers/apply/": "/coming-soon/careers/apply/",
};

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io https://static.cloudflareinsights.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.postcodes.io https://photon.komoot.io https://places.googleapis.com https://plausible.io https://cloudflareinsights.com https://*.sanity.io https://cdn.sanity.io https://cdnjs.cloudflare.com; frame-src 'self' https:; worker-src 'self' blob: https://cdnjs.cloudflare.com; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://*.supabase.co; upgrade-insecure-requests";

function withHeaders(res, path, isPreview, extraCookies = []) {
  const r = mutable(res);
  const h = r.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "SAMEORIGIN");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  h.set("Strict-Transport-Security", "max-age=31536000");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Content-Security-Policy", path.startsWith("/studio") ? "frame-ancestors 'self'; base-uri 'self'" : CSP);
  if (isPreview) h.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (path.startsWith("/learn")) {
    h.set("Cache-Control", "no-store");
    h.set("X-Robots-Tag", "noindex, nofollow");
  } else if (/(\/|\.html|\.txt)$/.test(path)) h.set("Cache-Control", "no-store");
  else if (path.startsWith("/_next/static/")) h.set("Cache-Control", "public, max-age=31536000, immutable");
  else if (/\.(jpe?g|png|webp|gif|svg|ico|woff2?|ttf|otf)$/.test(path)) h.set("Cache-Control", "public, max-age=86400, must-revalidate");
  for (const c of extraCookies) h.append("Set-Cookie", c);
  return r;
}

async function policyFile(context, slug, ext) {
  const types = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  const live = await proxy(`${SUPABASE_FUNCTIONS}/policy-file?slug=${encodeURIComponent(slug)}&ext=${ext}`);
  let body = live.status === 200 ? live.body : null;
  if (!body) {
    const local = await serveAsset(context, `/policies/${slug}.${ext}`);
    if (local.status === 200 && !(local.headers.get("content-type") || "").includes("text/html")) body = local.body;
  }
  if (!body) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(body, {
    headers: {
      "Content-Type": types[ext],
      "Content-Disposition": `inline; filename="${slug}.${ext}"`,
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  // globalacademy.tarbiyyah.co.uk also has email (MX) records, so it cannot be a
  // CNAME to Pages: a small Worker on that address (cloudflare/router-worker.js)
  // forwards here and says which address the visitor used.
  const forwarded = (request.headers.get("x-tga-host") || "").toLowerCase();
  const host = url.hostname.endsWith(".pages.dev") && /^(globalacademy|preview)\.tarbiyyah\.co\.uk$/.test(forwarded) ? forwarded : url.hostname.toLowerCase();
  const path = url.pathname;
  const isPreview = host.startsWith("preview.");
  const key = (env.PREVIEW_KEY || "").trim();
  const jar = cookies(request);

  // Dotfiles and server-only files are never served.
  if (/(^|\/)\./.test(path) || /\/(register\.config\.php|_mailer\.php|register\.log)$/.test(path)) return new Response("Not found", { status: 404 });

  for (const [re, to] of MOVED) if (re.test(path)) return redirect(to(), 301);

  // The enquiry form posts here (the PHP version is public/register.php).
  if (path === "/register.php") {
    if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: { Allow: "POST", "Content-Type": "application/json" } });
    const res = await proxy(`${SUPABASE_FUNCTIONS}/website-enquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tga-client-ip": request.headers.get("cf-connecting-ip") || "" },
      body: await request.text(),
    });
    return new Response(res.body, { status: res.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (/\.php$/.test(path)) return new Response("Not found", { status: 404 });

  const pol = path.match(/^\/policies\/([a-z0-9][a-z0-9-]{0,118})\.(pdf|docx)$/);
  if (pol) return policyFile(context, pol[1], pol[2]);

  const extra = [];
  if (isPreview) {
    // Staff preview: ?key=<key> once sets the staff cookie; without it, the "staff only" page.
    if (key && url.searchParams.get("key") === key) {
      url.searchParams.delete("key");
      return redirect(url.pathname + (url.search || ""), 302, [
        cookie("tga_staff", key, host, { maxAge: STAFF_MAX_AGE, shared: true }),
        cookie("tga_preview_ui", "1", host, { maxAge: STAFF_MAX_AGE, httpOnly: false }),
      ]);
    }
    if (path === "/robots.txt") return withHeaders(await serveAsset(context, "/robots-preview.txt"), path, true);
    const staff = key && jar.tga_staff === key;
    if (!staff) {
      if (!/^\/(staff-only\.html|robots-preview\.txt|favicon\.(ico|png|svg)|brand\/ga-wordmark\.png)$/.test(path))
        return withHeaders(await serveAsset(context, "/staff-only.html"), "/staff-only.html", true);
    } else if (/(\/|\.html)$/.test(path)) {
      extra.push(cookie("tga_staff", key, host, { maxAge: STAFF_MAX_AGE, shared: true }), cookie("tga_preview_ui", "1", host, { maxAge: STAFF_MAX_AGE, httpOnly: false }));
    }
  } else {
    // Old ?preview= links on the public address just clear the old cookies.
    if (url.searchParams.has("preview")) {
      url.searchParams.delete("preview");
      return redirect(url.pathname + (url.search || ""), 302, [cookie("tga_preview", "off", host, { maxAge: 0 }), cookie("tga_preview_ui", "0", host, { maxAge: 0, httpOnly: false })]);
    }
    if (!holdingAllows(path)) return redirect(host.endsWith("pages.dev") ? "/" : `${PUBLIC_ORIGIN}/`, 302);
    const page = HOLDING_PAGES[path.endsWith("/") || path.endsWith(".html") ? path : `${path}/`];
    if (page) return withHeaders(await serveAsset(context, page), path, false);
  }

  let res = await context.next();
  // /learn/* on this domain is only the bridge page that forwards old invite links to learn.tarbiyyah.co.uk.
  if (res.status === 404 && path.startsWith("/learn")) res = await serveAsset(context, "/learn/");
  // Sanity Studio is a single-page app.
  if (res.status === 404 && path.startsWith("/studio/")) res = await serveAsset(context, "/studio/");
  return withHeaders(res, path, isPreview, extra);
}
