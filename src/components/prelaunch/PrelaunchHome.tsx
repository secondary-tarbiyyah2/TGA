import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { RegisterInterestForm } from "@/components/RegisterInterestForm";

const POINTS = [
  "Live, timetabled lessons with qualified teachers, Year 1 to Year 11",
  "Qur'an, Arabic and Islamic Studies every week, alongside the national curriculum",
  "Small classes of no more than 15 pupils",
  "Part of the Tarbiyyah family of schools: Tarbiyyah Primary, Tarbiyyah Secondary School for Boys and Tarbiyyah Al-Banaat",
];

export function PrelaunchHome() {
  return (
    <>
      <section className="geo-texture bg-cream">
        <Container className="max-w-3xl py-16 text-center sm:py-20">
          <Kicker>Opening January 2027</Kicker>
          <h1 className="text-display font-serif font-semibold text-ink">
            Our website is <span className="text-gold-700">under development.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink/75">
            Tarbiyyah Global Academy is a new live online school, nurturing faith and character alongside an excellent
            education. We are still building our website. The Academy opens in January 2027 and places in our founding
            cohort will be limited, so register your interest below and we will be in touch with dates and next steps.
          </p>
        </Container>
      </section>

      <section className="section-pad">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-start">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-ink">What to expect</h2>
            <ul className="mt-4 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-ink/80">
                  <span aria-hidden="true" className="mt-1 text-gold">◆</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div id="register" className="scroll-mt-24">
            <h2 className="font-serif text-2xl font-semibold text-ink">Register your interest</h2>
            <p className="mt-2 mb-5 text-ink/70">It takes a minute and there is no obligation.</p>
            <RegisterInterestForm />
          </div>
        </Container>
      </section>
    </>
  );
}
