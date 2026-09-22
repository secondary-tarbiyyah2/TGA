import Script from "next/script";

/**
 * Plausible is cookieless (no personal data, no consent banner required under UK GDPR),
 * which is why it's the default here over GA4. Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN to enable.
 */
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  return <Script defer data-domain={domain} src="https://plausible.io/js/script.js" strategy="afterInteractive" />;
}
