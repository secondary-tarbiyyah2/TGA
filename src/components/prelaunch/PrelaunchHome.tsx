import { Container } from "@/components/Container";
import { RegisterInterestForm } from "@/components/RegisterInterestForm";

const POINTS = [
  { title: "Live lessons", body: "Taught in real time by qualified teachers, Year 1 to Year 11." },
  { title: "Faith at the heart", body: "Qur'an, Arabic and Islamic Studies every week, alongside the national curriculum." },
  { title: "Small classes", body: "No more than 15 pupils, so every child is known." },
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
            <p className="mt-2 text-ink/70">Founding places are limited. Be the first to hear when admissions open and to receive invitations to our online open evenings.</p>
          </div>
          <RegisterInterestForm />
          <p className="mt-4 text-center text-sm text-ink/60 lg:text-left">Our full website launches soon.</p>
        </div>

        <dl className="grid gap-6 text-left sm:grid-cols-3 lg:col-start-1 lg:row-start-2 lg:self-start">
          {POINTS.map((p) => (
            <div key={p.title} className="border-t-2 border-gold-500 pt-3">
              <dt className="font-semibold text-ink">{p.title}</dt>
              <dd className="mt-1 text-sm text-ink/70">{p.body}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
