import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { ApplyForm } from "@/components/admissions/ApplyForm";
import { FALLBACK_ADMISSIONS_EMAIL } from "@/components/admissions/applicationShared";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = {
  title: "Apply online",
  description: "Apply for a place at Tarbiyyah Global Academy — our online application form and what happens next.",
};

export default async function ApplyPage() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || FALLBACK_ADMISSIONS_EMAIL;

  const steps = [
    {
      title: "Application",
      body: (
        <>
          Complete the online form below, then email your child&apos;s latest school report to{" "}
          <a href={`mailto:${email}`} className="font-semibold text-gold-700 underline">{email}</a>.
        </>
      ),
    },
    {
      title: "Assessment & interview",
      body: "A short, age-appropriate assessment, then a conversation with you and your child to confirm that we are the right fit.",
    },
    {
      title: "Acceptance",
      body: (
        <>
          Accepted families provide a deposit and ID documents to secure the place. See our{" "}
          <Link href="/fees" className="font-semibold text-gold-700 underline">fees page</Link> for details.
        </>
      ),
    },
  ];

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container>
          <Kicker>Admissions</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Apply online.</h1>
          <p className="mt-6 max-w-2xl text-lg text-ink/75">
            Three simple steps. The form below takes about ten minutes — you only need your details and your child&apos;s.
          </p>
          <p className="mt-4 text-sm text-ink/70">
            <Link href="/admissions" className="font-semibold text-gold-700 underline">Back to admissions</Link>
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-gold-light/50 bg-white p-6">
              <span className="font-serif text-2xl font-bold text-gold">{i + 1}</span>
              <h2 className="mt-2 font-semibold text-ink">{s.title}</h2>
              <p className="mt-1 text-sm text-ink/70">{s.body}</p>
            </div>
          ))}
        </Container>
      </section>

      <section className="geo-texture bg-cream section-pad" id="application-form">
        <Container className="max-w-3xl">
          <Kicker>Step 1 · Application</Kicker>
          <h2 className="font-serif text-3xl font-semibold text-ink">Your child&apos;s application.</h2>
          <div className="mt-8">
            <ApplyForm admissionsEmail={email} />
          </div>
        </Container>
      </section>
    </>
  );
}
