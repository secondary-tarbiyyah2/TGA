/**
 * Pre-launch gate (October 2026). The website is under development, so the
 * public only sees a holding page with the register-interest form
 * (src/app/(holding)/coming-soon, served at "/"), plus the legal pages.
 *
 * The full site is still built and deployed as normal. The gate itself is the
 * PRE-LAUNCH block in public/.htaccess: visitors without the staff preview
 * cookie get the holding page for every page address. Staff open the private
 * preview link once (https://globalacademy.tarbiyyah.co.uk/?preview=<key>)
 * and then see the full site in that browser for 30 days; no login. The key
 * is in deploy/preview-key.txt (or the PREVIEW_KEY repository secret, which
 * takes priority), written into .htaccess at deploy time
 * (.github/workflows/deploy-site.yml). Change it and redeploy to cut off old links.
 *
 * This flag only limits the sitemap to the public pages. TO OPEN THE FULL
 * SITE: set it to false, delete the PRE-LAUNCH block in public/.htaccess and
 * redeploy.
 */
export const PRELAUNCH = true;
