// Canonical origin for the authenticated /learn portal, which lives on its
// OWN subdomain (learn.tarbiyyah.co.uk) rather than under a path on the main
// domain — a deliberate browser-origin split so an XSS bug on the public
// marketing site can never read the portal's session/localStorage or make
// credentialed requests against it (see public/.htaccess and SETUP.md,
// "Moving /learn to its own subdomain", for the full reasoning).
//
// This is ONE LEVEL below the registered apex (tarbiyyah.co.uk), not two —
// it used to be learn.globalacademy.tarbiyyah.co.uk, but Cloudflare's free
// Universal SSL certificate only covers the apex plus one level of wildcard
// (tarbiyyah.co.uk + *.tarbiyyah.co.uk), so a second-level hostname got no
// certificate at all (ERR_SSL_VERSION_OR_CIPHER_MISMATCH), confirmed via a
// direct certificate inspection. Do not renest this under globalacademy.* —
// it will break TLS again unless a paid Advanced Certificate Manager add-on
// is bought to cover it.
//
// This is the ONE place that string lives in the frontend — every marketing
// page linking into the portal (header "Log in", the footer's staff-login
// link, etc.) imports this constant rather than repeating the URL. Portal
// pages themselves link to each other with root-relative paths instead
// (e.g. "/admin/dashboard"), since once deployed they live AT this origin's
// root — see the pages under src/app/learn/ for that.
//
// Overridable at build time via NEXT_PUBLIC_LEARN_ORIGIN (baked in the same
// way NEXT_PUBLIC_SUPABASE_URL is — see deploy-site.yml) purely so a
// preview/staging build could point elsewhere; production always builds
// with the real subdomain, which is why a hardcoded fallback is safe here.
export const LEARN_ORIGIN = process.env.NEXT_PUBLIC_LEARN_ORIGIN || "https://learn.tarbiyyah.co.uk";

// The main marketing domain, where Sanity Studio (/studio) lives — needed
// from within /learn (e.g. the admin "Website content" page linking out to
// Studio) since /learn is now on its own separate origin and can't reach
// /studio with a root-relative path. A plain cross-origin link like this is
// fine even from the portal's stricter origin: it carries no session data,
// just a same-tab/new-tab navigation.
export const MAIN_SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://globalacademy.tarbiyyah.co.uk";
