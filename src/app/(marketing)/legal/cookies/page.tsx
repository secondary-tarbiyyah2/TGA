import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";

export const metadata: Metadata = pageMetadata({
  title: "Cookie Policy",
  description: "How Tarbiyyah Global Academy uses essential and analytics cookies, and how to change your choice.",
  path: "/legal/cookies",
});

export default function CookiePolicyPage() {
  return (
    <section className="section-pad">
      <Container className="max-w-2xl">
        <Kicker>Legal</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink">Cookie Policy</h1>

        <div className="mt-8 space-y-6 text-ink/75">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">Essential cookies</h2>
            <p className="mt-1 text-sm">
              Strictly necessary for the site to function (e.g. remembering your cookie choice). These cannot be
              switched off.
            </p>
          </div>
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink">Analytics</h2>
            <p className="mt-1 text-sm">
              We use Plausible Analytics, a cookieless, privacy-friendly analytics tool that does not track
              individuals or store personal data — no consent is required for it under UK GDPR, but you can find out
              more at{" "}
              <a href="https://plausible.io/data-policy" target="_blank" rel="noopener" className="underline">
                plausible.io/data-policy
              </a>
              .
            </p>
          </div>
        </div>

        <p className="mt-8 text-sm text-ink/70">
          You can change your cookie choice at any time by clearing your browser&apos;s local storage for this site.
        </p>
      </Container>
    </section>
  );
}
