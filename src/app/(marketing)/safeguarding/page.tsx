import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";
import { getPolicyLinks, getSiteSettings } from "@/lib/content";
import { ROLE_EMAILS } from "@/content/contacts";

export const metadata: Metadata = pageMetadata({
  title: "Safeguarding",
  description: "How Tarbiyyah Global Academy keeps children safe: our Designated Safeguarding Lead, how to raise a concern, and our Child Protection and Safeguarding Policy.",
  path: "/safeguarding",
});

// Fallbacks for when the site settings leave the DSL empty: the same people and
// routes as section 2 of the published Child Protection and Safeguarding
// Policy (content/policies/01-child-protection-and-safeguarding.md). Keep the
// two in step.
const DSL_FALLBACK = { name: "Ustadh Abu Zayn Haneef Sandhar, Headteacher", phone: "020 3719 8697" };
const DEPUTY_DSL = "Skander Ahmed";

// Home filtering help the Online Safety and Acceptable Use Policy (02,
// section 4) promises families (owner, Tafweed 3: "ensure that the filtering
// at home with router level filtering, device parental controls etc are offered").
const HOME_FILTERING = [
  {
    title: "Router-level filtering",
    body: "Most broadband providers offer a free family filter that blocks harmful and adult sites on every device in your home. Switch it on in your provider's account or app, or in your router's settings.",
  },
  {
    title: "Parental controls on each device",
    body: "Microsoft Family Safety on Windows, Screen Time on iPad and Mac, and Google Family Link on Android and Chromebook let you filter websites, limit apps and set screen-time limits.",
  },
  {
    title: "Safe search and restricted modes",
    body: "Turn on safe search in search engines and restricted mode on video sites, on every browser and account your child uses.",
  },
  {
    title: "Devices in shared spaces",
    body: "Younger children learn best with the device in a family room. For all ages, phones and tablets are best charged outside bedrooms overnight.",
  },
];

const RELATED_POLICIES = [
  { slug: "02-online-safety-and-acceptable-use", label: "Online Safety and Acceptable Use" },
  { slug: "03-live-lesson-protocols", label: "Live Lesson Protocols" },
  { slug: "06-anti-bullying-and-cyberbullying", label: "Anti-Bullying and Cyberbullying" },
  { slug: "05-safeguarding-extremism-and-radicalisation", label: "Extremism and radicalisation" },
];

export default async function SafeguardingPage() {
  const [settings, policies] = await Promise.all([getSiteSettings(), getPolicyLinks()]);
  const safeguardingPolicy = policies.find((p) => p.number === "01");
  // Matched by title, not number: policy 27 is the Parent Communication Charter.
  const complaintsPolicy = policies.find((p) => /complaints/i.test(p.title));
  const email = ROLE_EMAILS.safeguarding;
  const dslName = settings.safeguardingLeadName || DSL_FALLBACK.name;
  const dslContact = settings.safeguardingLeadContact;
  const policyHref = (p: { readUrl?: string; fileUrl: string }) => p.readUrl || p.fileUrl;

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Safeguarding</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Keeping every child safe.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            The safety and wellbeing of every child is our first responsibility. We follow the same safeguarding standards as
            Tarbiyyah Primary, Tarbiyyah Secondary and Tarbiyyah Al-Banaat: vetted staff (enhanced DBS in the UK, overseas checks
            for staff abroad), a named Designated Safeguarding Lead, and clear routes for raising any concern.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container className="max-w-3xl space-y-12">
          <div role="note" aria-labelledby="danger-heading" className="rounded-2xl border-2 border-ink/80 bg-white p-6">
            <h2 id="danger-heading" className="font-serif text-xl font-semibold text-ink">If a child is in immediate danger</h2>
            <p className="mt-2 text-ink/80">
              Contact the emergency services first: <a href="tel:999" className="font-semibold text-ink underline">999</a> in the UK,
              or the emergency number in your country. Then let us know so we can follow up.
            </p>
          </div>

          <div>
            <Kicker>How to raise a concern</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">If you&apos;re worried about a child.</h2>
            <p className="mt-4 text-ink/75">
              Whether it is something a child has told you or something you have noticed yourself, contact our Designated
              Safeguarding Lead straight away.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-gold-light/50 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Designated Safeguarding Lead</p>
                <p className="mt-2 font-semibold text-ink">{dslName}</p>
                <ul className="mt-2 space-y-1 text-sm text-ink/75">
                  {dslContact && !dslContact.includes("@") ? (
                    <li>{dslContact}</li>
                  ) : (
                    <>
                      <li>
                        Email{" "}
                        <a href={`mailto:${dslContact || email}?subject=Safeguarding`} className="font-semibold text-gold-700 underline">{dslContact || email}</a>
                        , with &ldquo;Safeguarding&rdquo; as the subject
                      </li>
                      <li>
                        Phone the Academy office on{" "}
                        <a href={`tel:+44${DSL_FALLBACK.phone.replace(/\s/g, "").slice(1)}`} className="font-semibold text-gold-700 underline">{DSL_FALLBACK.phone}</a>
                      </li>
                    </>
                  )}
                </ul>
              </div>
              <div className="rounded-2xl border border-gold-light/50 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Deputy Designated Safeguarding Lead</p>
                <p className="mt-2 font-semibold text-ink">{DEPUTY_DSL}</p>
                <p className="mt-2 text-sm text-ink/75">
                  If the Designated Safeguarding Lead is unavailable, or your concern is about how they have handled a case.
                </p>
              </div>
            </div>

            <p className="mt-6 text-sm text-ink/70">
              In the UK you can also speak to the NSPCC helpline on{" "}
              <a href="tel:08088005000" className="font-semibold text-gold-700 underline">0808 800 5000</a>, and children can call
              Childline free on <a href="tel:08001111" className="font-semibold text-gold-700 underline">0800 1111</a>.
            </p>
          </div>

          <div>
            <Kicker>What happens next</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">Every concern is taken seriously.</h2>
            <p className="mt-4 text-ink/75">
              Every concern is recorded and handled in line with our Child Protection and Safeguarding Policy. If you are not
              satisfied with how a concern has been handled, our{" "}
              {complaintsPolicy ? (
                <Link href={policyHref(complaintsPolicy)} className="font-semibold text-gold-700 underline">Concerns and Complaints Policy</Link>
              ) : (
                "Concerns and Complaints Policy"
              )}{" "}
              sets out what happens next.
            </p>
          </div>

          {safeguardingPolicy && (
            <div className="rounded-2xl border border-gold-500/60 bg-gold-100/40 p-6">
              <p className="font-serif text-xl font-semibold text-ink">{safeguardingPolicy.title}</p>
              <p className="mt-1 text-sm text-ink/75">Our full policy, covering reporting procedures, staff training and recruitment checks.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {safeguardingPolicy.readUrl && (
                  <Link href={safeguardingPolicy.readUrl} className="inline-flex min-h-11 items-center rounded-full bg-gold-500 px-5 text-sm font-semibold text-ink-900 hover:brightness-95">
                    Read the policy
                  </Link>
                )}
                <a
                  href={safeguardingPolicy.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-gold-500 px-5 text-sm font-semibold text-ink-900 hover:bg-gold-100"
                >
                  Download PDF<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </div>
          )}

          <div id="filtering-at-home">
            <Kicker>Online safety at home</Kicker>
            <h2 className="text-h2 font-serif font-semibold text-ink">Filtering at home.</h2>
            <p className="mt-4 text-ink/75">
              We keep our own platforms locked down, but we do not control the internet in your home. These four steps make the
              biggest difference. We go through them in the parents&apos; induction session, and if you would like help setting
              any of them up, email{" "}
              <a href={`mailto:${email}`} className="font-semibold text-gold-700 underline">{email}</a> and our Digital Lead will
              help.
            </p>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {HOME_FILTERING.map((h) => (
                <li key={h.title} className="rounded-xl border border-gold-light/60 bg-white p-5">
                  <h3 className="font-semibold text-ink">{h.title}</h3>
                  <p className="mt-2 text-sm text-ink/75">{h.body}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-serif text-xl font-semibold text-ink">Keeping children safe online</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {RELATED_POLICIES.map((p) => (
                <li key={p.slug}>
                  <Link href={`/policies/${p.slug}/`} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gold-light/60 bg-white px-4 py-3 text-sm font-semibold text-ink hover:border-gold-500">
                    {p.label}
                    <span aria-hidden="true" className="text-gold-700">→</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink/70">
              See every policy on the <Link href="/policies" className="font-semibold text-gold-700 underline">Policies page</Link>.
            </p>
          </div>
        </Container>
      </section>

      <CtaBand heading="Have a question first?" body="Get in touch and we will point you to the right person." ctaLabel="Contact us" ctaHref="/contact" />
    </>
  );
}
