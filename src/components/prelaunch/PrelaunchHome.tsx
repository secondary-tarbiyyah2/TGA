import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { RegisterInterestForm } from "@/components/RegisterInterestForm";

const POINTS = [
  "Live, timetabled lessons with qualified teachers, Year 1 to Year 11",
  "Qur'an, Arabic and Islamic Studies every week, alongside the national curriculum",
  "Small classes of no more than 15 pupils",
  "Part of the Tarbiyyah family of schools: Tarbiyyah Primary, Tarbiyyah Secondary School for Boys and Tarbiyyah Al-Banaat",
];

const EVENTS = [
  { when: "Thursday 26 November", what: "Open evening, 7:30pm UK time" },
  { when: "Sunday 6 December", what: "Open evening, 4:00pm UK time" },
  { when: "Saturday 12 December", what: "Taster morning: Years 1–6 at 10:00, Years 7–11 at 11:15 UK time" },
];

export function PrelaunchHome() {
  return (
    <>
      <section className="geo-texture bg-cream">
        <Container className="max-w-3xl py-16 text-center sm:py-20">
          <Kicker>Tarbiyyah Global Academy · Opening January 2027</Kicker>
          <h1 className="text-display font-serif font-semibold text-ink">
            Our website is <span className="text-gold-700">under development.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink/75">
            Tarbiyyah Global Academy is a new live online school, nurturing faith and character alongside an excellent
            education. We are still building this website, so for now it only has the essentials. The full site, with
            curriculum, fees and admissions details, will open soon.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-ink/75">
            The Academy opens in January 2027 and places in our founding cohort are limited. Register your interest below
            and we will keep you updated, including when applications open.
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

            <div className="mt-10 rounded-2xl border border-gold-light/50 bg-white p-6">
              <h2 className="font-serif text-xl font-semibold text-ink">Meet us online</h2>
              <ul className="mt-4 divide-y divide-gold-light/40">
                {EVENTS.map((e) => (
                  <li key={e.when} className="py-3 text-sm">
                    <p className="font-semibold text-ink">{e.when}</p>
                    <p className="text-ink/70">{e.what}</p>
                  </li>
                ))}
              </ul>
              <Link href="/open-evening/" className="mt-4 inline-block font-semibold text-gold-700 underline">
                Book a place at an open evening or the taster morning
              </Link>
            </div>
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
