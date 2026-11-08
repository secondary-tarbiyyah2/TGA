import { Container } from "@/components/Container";
import { RegisterInterestForm } from "@/components/RegisterInterestForm";

const POINTS = [
  { title: "Live lessons", body: "Taught in real time by qualified teachers, Year 1 to Year 11." },
  { title: "Faith at the heart", body: "Qur'an, Arabic and Islamic Studies every week, alongside the national curriculum." },
  { title: "Small classes", body: "No more than 15 pupils, so every child is known." },
];

// Dates match the term dates and open evening pages (src/content/seed.ts).
const KEY_DATES = [
  { when: "Thu 26 Nov, 7:30pm", what: "Online open evening (UK time)" },
  { when: "Sun 6 Dec, 4:00pm", what: "Online open evening (UK time)" },
  { when: "Sat 12 Dec", what: "Taster morning: join a real live lesson" },
  { when: "Fri 18 Dec", what: "Application deadline for the founding cohort" },
  { when: "Fri 1 Jan 2027", what: "The Academy opens with induction day" },
  { when: "Mon 11 Jan 2027", what: "First live lessons" },
];

export function PrelaunchHome() {
  return (
    <section className="geo-texture bg-cream pb-20">
      {/* Mobile order: intro, form, then the three points; desktop puts the form beside both. */}
      <Container className="grid gap-10 pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-x-16 lg:gap-y-10 lg:pt-16">
        <div className="text-center lg:col-start-1 lg:row-start-1 lg:self-end lg:text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-700">Opening January 2027</p>
          <h1 className="mt-4 text-display font-serif font-semibold text-ink">
            A live online Islamic school <span className="text-gold-700">for homeschooling families.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-ink/75 lg:mx-0">
            A full school day taught live by qualified teachers, from Year 1 to Year 11, so your child learns at home with a
            proper timetable, classmates and teachers. Tarbiyyah Global Academy joins Tarbiyyah Primary, Tarbiyyah Secondary School for Boys and Tarbiyyah Al-Banaat,
            bringing more than ten years of Islamic and academic education to families anywhere in the world.
          </p>
        </div>

        <div id="register" className="scroll-mt-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <div className="mb-5 text-center lg:text-left">
            <h2 className="font-serif text-2xl font-semibold text-ink">Register your interest</h2>
            <p className="mt-2 text-ink/70">Founding places are limited. Register to receive admissions updates and invitations to our online open evenings.</p>
          </div>
          <RegisterInterestForm />
        </div>

        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <dl className="grid gap-6 text-left sm:grid-cols-3">
            {POINTS.map((p) => (
              <div key={p.title} className="border-t-2 border-gold-500 pt-3">
                <dt className="font-semibold text-ink">{p.title}</dt>
                <dd className="mt-1 text-sm text-ink/70">{p.body}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 rounded-2xl border border-gold-light/60 bg-white/80 p-5 text-left">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Key dates</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[auto_1fr]">
              {KEY_DATES.map((d) => (
                <div key={d.what} className="contents">
                  <dt className="font-semibold text-ink">{d.when}</dt>
                  <dd className="-mt-2 text-ink/70 sm:mt-0">{d.what}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm">
              {/* A plain link: holding pages are full page loads (src/lib/prelaunch.ts). */}
              <a href="/term-dates/" className="font-semibold text-gold-700 underline">All term dates</a>
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
