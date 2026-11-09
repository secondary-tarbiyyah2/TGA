import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CtaBand } from "@/components/CtaBand";

export const metadata: Metadata = pageMetadata({
  title: "Pastoral Care & SEND Support",
  description: "How we support every child's wellbeing, character and additional needs, including the form tutor and the Weekly Tarbiyah Note.",
  path: "/pastoral-care",
});

// Everything here is either in the FAQs, the curriculum or the policies; no
// named staff, ratios or services beyond those, so nothing to go out of date.
const CARE = [
  {
    title: "A form tutor who knows your child",
    body: "Every pupil has a form tutor who knows them well, as a learner and as a person. Form time runs alongside lessons each week.",
  },
  {
    title: "The Weekly Tarbiyah Note",
    body: "A personal note from the form tutor every week on your child's character and akhlaq, how they have been with their peers, their effort and attitude, and anything worth celebrating or working on.",
  },
  {
    title: "Small classes, cameras on",
    body: "Classes of no more than 15, taught live, so teachers notice when a child is quiet, struggling or not themselves, and can follow it up.",
  },
  {
    title: "Character, taught by name",
    body: "Prayer built into the day, our Tarbiyyah Compass values taught explicitly, and PSHE in every year group, so pupils grow in character and faith as well as knowledge.",
  },
];

// From the SEND and Inclusion Policy (16): the graduated approach and the
// online adaptations table.
const SEND_STEPS = [
  { title: "Assess", body: "Information from you and from admission, baseline assessments, teacher observations and any professional reports." },
  { title: "Plan", body: "A SEND Support Plan with clear outcomes, strategies and adjustments, agreed with you and your child." },
  { title: "Do", body: "Teachers deliver the plan in live lessons, supported by our SENCO, who leads SEND provision." },
  { title: "Review", body: "Progress is reviewed with you and your child at least once a term." },
];

const ADAPTATIONS = [
  "Shorter tasks, movement breaks and visual timers",
  "Chat as an alternative to speaking",
  "Chunked instructions and recorded explanations",
  "Agreed camera arrangements and a trusted adult check-in",
  "Captions, adjustable text size and contrast",
  "Small-group and one-to-one intervention sessions",
];

const POLICIES = [
  { href: "/policies/16-send-and-inclusion/", label: "SEND and Inclusion Policy" },
  { href: "/policies/06-anti-bullying-and-cyberbullying/", label: "Anti-Bullying and Cyberbullying Policy" },
  { href: "/policies/09-supporting-pupils-with-medical-conditions/", label: "Supporting Pupils with Medical Conditions Policy" },
  { href: "/policies/23-tarbiyyah-compass-character-framework/", label: "Tarbiyyah Compass Character Framework" },
];

export default function PastoralCarePage() {
  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Pastoral care &amp; SEND</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Every child known, every child supported.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            An online school still means real relationships. Here is how we look after your child&apos;s wellbeing and character,
            and how we work with you on any additional needs.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <Kicker>Pastoral care</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Known as a person, not just a set of grades.</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {CARE.map((c) => (
              <div key={c.title} className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm">
                <h3 className="font-serif text-xl font-semibold text-ink">{c.title}</h3>
                <p className="mt-2 text-sm text-ink/75">{c.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm text-ink/70">
            Alongside this you receive a written report each term and are invited to two parents&apos; evenings a year. Concerns
            about a child&apos;s safety are handled under our{" "}
            <Link href="/safeguarding" className="font-semibold text-gold-700 underline">safeguarding procedures</Link>.
          </p>
        </Container>
      </section>

      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>SEND support</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Support for a range of additional needs.</h2>
          <p className="mt-4 max-w-2xl text-ink/75">
            We welcome pupils with special educational needs and disabilities. Tell us about your child&apos;s needs when you apply,
            and we will talk with you about the reasonable, practical support we can put in place online. We follow the
            assess, plan, do, review cycle.
          </p>
          <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SEND_STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-gold-light/50 bg-white p-6 shadow-sm">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 text-sm font-semibold text-gold-900">{i + 1}</span>
                <h3 className="mt-3 font-semibold text-ink">{s.title}</h3>
                <p className="mt-1 text-sm text-ink/75">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 rounded-2xl border border-gold-light/50 bg-white p-6">
            <h3 className="font-semibold text-ink">Examples of how lessons are adapted online</h3>
            <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm text-ink/80 sm:grid-cols-2">
              {ADAPTATIONS.map((a) => (
                <li key={a} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-0.5 text-gold">◆</span>
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink/70">
              If your child has an Education, Health and Care plan (EHCP), we work with you and the local authority named on the plan,
              which decides whether online provision is suitable to meet it.
            </p>
          </div>
        </Container>
      </section>

      <section className="section-pad">
        <Container>
          <Kicker>The detail</Kicker>
          <h2 className="text-h2 font-serif font-semibold text-ink">Read the policies.</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {POLICIES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gold-light/60 bg-white px-4 py-3 text-sm font-semibold text-ink hover:border-gold-500">
                  {p.label}
                  <span aria-hidden="true" className="text-gold-700">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink/70">
            All our policies are on the <Link href="/policies" className="font-semibold text-gold-700 underline">Policies page</Link>.
          </p>
        </Container>
      </section>

      <CtaBand heading="Questions about pastoral or SEND support?" body="We are happy to talk it through before you apply." ctaLabel="Book a free call" ctaHref="/book-a-call#book" />
    </>
  );
}
