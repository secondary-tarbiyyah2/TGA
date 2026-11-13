// Worker on the route globalacademy.tarbiyyah.co.uk/* (docs/cloudflare-hosting.md).
// That address keeps its email (MX) records, so it cannot be a CNAME to Pages;
// this forwards each request to the tga-site Pages project and tells it which
// address the visitor used (the Pages middleware reads x-tga-host).
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, "https://tga-site.pages.dev");
    const headers = new Headers(request.headers);
    headers.set("x-tga-host", url.hostname);
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
    // Keep any redirect on the real address.
    const loc = res.headers.get("Location");
    if (loc && loc.startsWith("https://tga-site.pages.dev")) {
      const out = new Response(res.body, res);
      out.headers.set("Location", loc.replace("https://tga-site.pages.dev", `https://${url.hostname}`));
      return out;
    }
    return res;
  },
};
