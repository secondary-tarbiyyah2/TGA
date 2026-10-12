import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { StarMark } from "@/components/StarMark";

/**
 * Homepage feature for the Weekly Tarbiyah Note (differentiator d6).
 *
 * The note card is an ILLUSTRATIVE EXAMPLE of the format, clearly labelled
 * as such on the card itself (DESIGN.md: never invent testimonials or
 * pupil details; placeholder content must be marked). It mirrors the real
 * note's shape in the portal (week of + a free-text note from the form
 * tutor, see WeeklyTarbiyahNoteForm) so parents see what they will get.
 *
 * Only rendered by the homepage while d6 is a "Confirmed commitment".
 */
export function TarbiyahNoteShowcase() {
  return (
    <section className="section-pad" aria-labelledby="tarbiyah-note-heading">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <Kicker>The Weekly Tarbiyah Note</Kicker>
          <h2 id="tarbiyah-note-heading" className="text-h2 font-serif font-semibold text-ink">
            Every week, a note about <span className="text-gold-700">who your child is becoming.</span>
          </h2>
          <p className="mt-5 max-w-xl text-ink/75">
            Report cards tell you how your child is doing in Maths. The Weekly Tarbiyah Note tells you how they are
            growing in character and <em>akhlaq</em>: a personal update from their form tutor, kept separate from
            academic reports.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-ink/80">
            {[
              "Written personally by your child's form tutor",
              "About character, manners and faith, not marks",
              "Waiting in your parent portal every week",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <StarMark className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" filled />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="relative mx-auto w-full max-w-lg">
          {/* A second sheet behind, for a "letter on the desk" feel. */}
          <div aria-hidden="true" className="absolute inset-0 translate-x-1.5 translate-y-2 rotate-1 rounded-2xl sm:translate-x-3 sm:translate-y-3 sm:rotate-2 border border-gold-300 bg-gold-50" />
          <article className="note-paper relative rounded-2xl border border-gold-300 bg-white p-6 shadow-warm sm:p-8">
            <header className="flex items-start justify-between gap-4 border-b border-gold-light/60 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-700">Weekly Tarbiyah Note</p>
                <p className="mt-1 font-serif text-lg font-semibold text-ink">Week of 18 January 2027</p>
                <p className="text-sm text-ink/70">From Maryam&apos;s form tutor</p>
              </div>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-300 bg-gold-50 text-gold-700">
                <StarMark className="h-7 w-7" />
              </span>
            </header>
            <div className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-ink/85">
              <p>Assalamu alaykum,</p>
              <p>
                Maryam had a lovely week. In Tuesday&apos;s group discussion she made sure a quieter classmate had the
                chance to share first, a beautiful example of <em>adab</em>. She also led our class du&apos;a on
                Thursday with real confidence.
              </p>
              <p>
                Something to encourage at home: she sometimes rushes to answer before others have finished, so we are
                practising <em>sabr</em> in discussions this half-term.
              </p>
              <p>Jazakumullahu khayran for your support.</p>
            </div>
            <figcaption className="mt-5 inline-flex items-center gap-2 rounded-md bg-gold-100 px-3 py-1.5 text-xs font-medium text-gold-900">
              <span aria-hidden="true">✎</span> Illustrative example. Not a real pupil or teacher.
            </figcaption>
          </article>
        </figure>
      </Container>
    </section>
  );
}
