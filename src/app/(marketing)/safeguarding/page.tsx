import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getPolicyLinks, getSiteSettings } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Safeguarding",
  description: "How Tarbiyyah Global Academy keeps children safe: our Designated Safeguarding Lead, how to raise a concern, and our Child Protection and Safeguarding Policy.",
  path: "/safeguarding",
});

export default async function SafeguardingPage() {
  const [settings, policies] = await Promise.all([getSiteSettings(), getPolicyLinks()]);
  const safeguardingPolicy = policies.find((p) => p.number === "01");
  const complaintsPolicy = policies.find((p) => p.number === "26");
  const email = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container className="max-w-2xl">
          <Kicker>Safeguarding</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Keeping every child safe.</h1>
          <p className="mt-6 text-lg text-ink/75">
            The safety and wellbeing of every child is our first responsibility. Tarbiyyah Global Academy follows the
            same safeguarding standards as Tarbiyyah Primary, Tarbiyyah Secondary and Tarbiyyah Al-Banaat, including
            vetted staff (enhanced DBS in the UK, overseas checks for staff abroad), a named Designated Safeguarding Lead, and clear reporting routes for any
            concern.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container className="max-w-2xl space-y-12">
          {(settings.safeguardingLeadName || settings.safeguardingLeadContact) && (
            <div>
              <Kicker>Our Designated Safeguarding Lead</Kicker>
              <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
                {settings.safeguardingLeadName && <p className="font-semibold text-ink">{settings.safeguardingLeadName}</p>}
                {settings.safeguardingLeadContact && (
                  <p className="mt-1 text-sm text-ink/75">
                    {settings.safeguardingLeadContact.includes("@") ? (
                      <a href={`mailto:${settings.safeguardingLeadContact}`} className="underline">{settings.safeguardingLeadContact}</a>
                    ) : (
                      settings.safeguardingLeadContact
                    )}
                  </p>
                )}
                <p className="mt-2 text-sm text-ink/70">
                  The Designated Safeguarding Lead (DSL) takes lead responsibility for safeguarding across the Academy,
                  and is the first point of contact for any child protection concern.
                </p>
              </div>
            </div>
          )}

          <div>
            <Kicker>How to raise a concern</Kicker>
            <h2 className="font-serif text-2xl font-semibold text-ink">If you&apos;re worried about a child.</h2>
            <div className="mt-4 space-y-3 text-ink/75">
              <p>
                If you have any concern about a child&apos;s safety or wellbeing, including something a child has
                told you, or something you&apos;ve noticed yourself, please contact our Designated Safeguarding Lead
                directly, or email{" "}
                <a href={`mailto:${email}`} className="font-semibold text-gold-700 underline">{email}</a>{" "}
                marking your message &ldquo;Safeguarding&rdquo; so it reaches the right person without delay.
              </p>
              <p>
                If a child is in immediate danger, contact the emergency services in your country first, then let us
                know so we can follow up on our end.
              </p>
              <p>
                Every concern is taken seriously, recorded, and handled in line with our Child Protection and
                Safeguarding Policy below. If you&apos;re not satisfied with how a concern has been handled, our{" "}
                {complaintsPolicy ? (
                  <a href={complaintsPolicy.fileUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-gold-700 underline">
                    Concerns and Complaints Policy
                  </a>
                ) : (
                  "Concerns and Complaints Policy"
                )}{" "}
                sets out what happens next.
              </p>
            </div>
          </div>

          {safeguardingPolicy && (
            <div>
              <Kicker>Full policy</Kicker>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold-500/60 bg-gold-100/40 px-6 py-5">
                <div>
                  <p className="font-semibold text-ink">{safeguardingPolicy.title}</p>
                  <p className="mt-0.5 text-xs text-ink/70">Our full statutory policy, covering reporting procedures, staff training and recruitment checks.</p>
                </div>
                <a
                  href={safeguardingPolicy.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95"
                >
                  View PDF
                </a>
              </div>
            </div>
          )}

          <p className="text-sm text-ink/70">
            See all of our policies, including Anti-Bullying, Behaviour and Online Conduct, on the{" "}
            <Link href="/policies" className="font-semibold text-gold-700 underline">Policies page</Link>.
          </p>
        </Container>
      </section>
      <CtaBand heading="Have a question first?" body="Get in touch and we'll point you to the right person." ctaLabel="Contact us" ctaHref="/contact" />
    </>
  );
}
