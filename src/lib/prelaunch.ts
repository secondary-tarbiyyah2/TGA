/**
 * Pre-launch mode (October 2026). While true, the public site shows only a
 * short holding page with the register-interest form, the open evenings and
 * the legal pages; every other marketing page is redirected to the homepage
 * by the PRE-LAUNCH block in public/.htaccess. The /learn portal, staff pages
 * and policy PDFs are unaffected.
 *
 * To open the full site: set this to false AND delete the PRE-LAUNCH block in
 * public/.htaccess, then redeploy.
 */
export const PRELAUNCH = true;
