import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CareersLive } from "@/components/careers/CareersLive";
import { FALLBACK_ADMISSIONS_EMAIL } from "@/components/admissions/applicationShared";
import { getSiteSettings } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Careers: teach with us",
  description: "Teaching and support roles at Tarbiyyah Global Academy, a live online Islamic school for Year 1 to Year 11. See the current vacancies and apply online.",
  path: "/careers",
});

const WHY = [
  { title: "Small classes", body: "No more than 15 pupils in a class, so you know every child and have time to teach." },
  { title: "Teach live, from home", body: "Every lesson is taught live in real time on Microsoft Teams, from wherever you work best." },
  { title: "Faith at the heart", body: "The national curriculum taught with tarbiyyah, with Qur'an, Arabic and Islamic Studies every week." },
  { title: "A founding team", body: "Help shape a new school, backed by more than ten years of the Tarbiyyah family of schools." },
];

const STEPS = [
  { title: "Apply online", body: "Tell us about yourself, your qualifications and your experience, and attach your CV. It takes about 20 minutes, and your answers are saved on your device as you go." },
  { title: "We review", body: "We read every application carefully against the role and let you know the outcome." },
  { title: "Interview", body: "Shortlisted candidates meet us online and, for teaching roles, teach a short sample lesson." },
  { title: "Checks and offer", body: "Before an offer is confirmed we take up references and make the safer recruitment checks every school must make." },
];

export default async function CareersPage() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || FALLBACK_ADMISSIONS_EMAIL;

  return (
    <>
      <section className="geo-texture bg-cream hero-pad">
        <Container className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-16">
          <div>
            <Kicker>Careers</Kicker>
            <h1 className="text-h1 font-serif font-semibold text-ink">Teach with purpose.</h1>
            <p className="mt-5 max-w-xl text-lg text-ink/75">
              Tarbiyyah Global Academy is a live online Islamic school for Year 1 to Year 11, opening in January 2027. We are looking for teachers who love their subject, care about every child, and want to teach pupils wherever home is.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#vacancies" className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
                See the vacancies
              </a>
              <Link href="/careers/apply/?role=general" className="inline-flex min-h-11 items-center justify-center rounded-full border border-gold-500 bg-white px-6 py-3 text-sm font-semibold text-ink hover:bg-cream">
                Send a general application
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {WHY.map((w) => (
              <li key={w.title} className="rounded-2xl border border-gold-light/60 bg-white p-5">
                <h2 className="font-serif text-lg font-semibold text-ink">{w.title}</h2>
                <p className="mt-1 text-sm text-ink/75">{w.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section id="vacancies" className="section-pad scroll-mt-20" aria-labelledby="vacancies-heading">
        <Container className="max-w-4xl">
          <h2 id="vacancies-heading" className="text-h2 font-serif font-semibold text-ink">Current vacancies</h2>
          <p className="mt-3 max-w-prose text-ink/75">Choose a role to read the full details, then apply online. Pay and hours are shown on each role where they are set.</p>
          <div className="mt-8">
            <CareersLive email={email} />
          </div>
        </Container>
      </section>

      <section className="section-pad bg-cream" aria-labelledby="process-heading">
        <Container>
          <h2 id="process-heading" className="text-h2 font-serif font-semibold text-ink">How applying works</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex h-full flex-col rounded-2xl border border-gold-light/50 bg-white p-5">
                <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-500 font-serif text-lg font-bold text-ink-900">{i + 1}</span>
                <h3 className="mt-3 font-serif text-lg font-semibold text-ink">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-1 text-sm text-ink/75">{s.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="section-pad" aria-labelledby="safeguarding-heading">
        <Container className="max-w-3xl">
          <h2 id="safeguarding-heading" className="font-serif text-xl font-semibold text-ink">Our commitment to safeguarding</h2>
          <p className="mt-3 text-ink/80">
            Tarbiyyah Global Academy is committed to safeguarding and promoting the welfare of children and expects all staff to share this commitment. All posts are subject to safer recruitment checks, including references, identity and qualification checks, and an enhanced DBS check with a barred list check (or an overseas criminal record check for candidates outside the UK).
          </p>
          <p className="mt-3 text-ink/80">
            Questions about a role? Email{" "}
            <a href={`mailto:${email}`} className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">{email}</a>. Read our{" "}
            <Link href="/safeguarding" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">safeguarding approach</Link>.
          </p>
        </Container>
      </section>
    </>
  );
}
