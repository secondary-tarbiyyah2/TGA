/** Policy PDFs live on the main website, not the learn subdomain. */
const MAIN_SITE = "https://globalacademy.tarbiyyah.co.uk";

export function absoluteFileUrl(url: string | null | undefined): string {
  if (!url) return "#";
  return url.startsWith("/") ? `${MAIN_SITE}${url}` : url;
}
