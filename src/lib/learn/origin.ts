// Canonical origin for the authenticated /learn portal, which lives on its
// OWN subdomain (learn.globalacademy.tarbiyyah.co.uk) rather than under a
// path on the main domain — a deliberate browser-origin split so an XSS bug
// on the public marketing site can never read the portal's session/
// localStorage or make credentialed requests against it (see
// public/.htaccess and SETUP.md, "Moving /learn to its own subdomain", for
// the full reasoning and the still-manual DNS/subdomain step).
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
export const LEARN_ORIGIN = process.env.NEXT_PUBLIC_LEARN_ORIGIN || "https://learn.globalacademy.tarbiyyah.co.uk";
