/**
 * Pre-launch (October 2026). Two separate sites from the same deployed files,
 * chosen by address in the PRE-LAUNCH block of public/.htaccess:
 *
 *  - https://globalacademy.tarbiyyah.co.uk: the public holding site for
 *    everyone (src/app/(holding): register interest, term dates, fees,
 *    subjects).
 *  - https://preview.tarbiyyah.co.uk: the full website for staff, opened once
 *    with ?key=<key> (deploy/preview-key.txt); noindex, robots disallow all.
 *
 * This flag only limits the public sitemap. TO OPEN THE FULL SITE: set it to
 * false, delete the PRE-LAUNCH block in public/.htaccess and redeploy.
 */
export const PRELAUNCH = true;
