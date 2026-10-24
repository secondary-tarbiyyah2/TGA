import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getSiteSettings } from "@/lib/content";

// Hidden page: not in the nav, the sitemap or search engines (robots.ts
// disallows it and the metadata below asks crawlers not to index it). The
// link is sent to families after they register for an open evening, and
// shown on screen during the evening itself.
export const metadata: Metadata = {
  title: "Sample live lesson",
  description: "A recording of a real live lesson at Tarbiyyah Global Academy, for families who have registered for an open evening.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/** Turns a YouTube watch/share link into an embed URL; passes anything else through. */
function toEmbed(url: string): string {
  const m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1`;
  return url;
}

const LESSON_SHAPE: { step: string; what: string; mins: string }[] = [
  { step: "Register and retrieval", what: "Camera on, quick register, then three or four questions on last lesson's learning in the chat or on mini-whiteboards.", mins: "0–7 min" },
  { step: "Short explanation", what: "The teacher teaches one idea clearly, with worked examples on the shared screen.", mins: "7–17 min" },
  { step: "Guided practice", what: "Pupils try it together: cold-calling, polls and hands up, with the teacher correcting misunderstandings straight away.", mins: "17–32 min" },
  { step: "Independent practice", what: "Pupils work on their own in the Class Notebook while the teacher drops in to check progress.", mins: "32–45 min" },
  { step: "Closing check and homework", what: "An exit question to show what has been learned, and the homework set in Teams Assignments.", mins: "45–50 min" },
];

export default async function SampleLessonPage() {
  const settings = await getSiteSettings();
  const video = settings.sampleLessonVideoUrl ? toEmbed(settings.sampleLessonVideoUrl) : null;

  return (
    <>
      <section className="geo-texture bg-cream section-pad">
        <Container className="max-w-3xl">
          <Kicker>For families who have registered</Kicker>
          <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Watch a real live lesson.</h1>
          <p className="mt-6 text-lg text-ink/75">
            This is what a lesson at Tarbiyyah Global Academy looks like from your child&apos;s seat: a qualified teacher,
            a class of no more than 15, cameras on, and a clear rhythm from retrieval practice to independent work.
          </p>
          {settings.sampleLessonNote && <p className="mt-3 text-sm font-medium text-gold-700">{settings.sampleLessonNote}</p>}
        </Container>
      </section>

      <section className="section-pad">
        <Container className="max-w-3xl">
          {video ? (
            <div className="aspect-video overflow-hidden rounded-2xl border border-gold-light/50 bg-ink shadow-md">
              <iframe
                src={video}
                title="Sample live lesson at Tarbiyyah Global Academy"
                className="h-full w-full"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-gold-light/50 bg-cream p-6 text-ink/75">
              <p className="font-semibold text-ink">The recording is being prepared.</p>
              <p className="mt-2 text-sm">
                We will email it to everyone who has registered for an open evening as soon as it is ready. In the meantime,
                the lesson structure below is exactly what you will see.
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-ink/60">
            Please keep this link within your family. The pupils in the recording and their parents have given permission for it to be shared with prospective families only.
          </p>

          <h2 className="mt-12 font-serif text-2xl font-semibold text-ink">How every lesson runs</h2>
          <p className="mt-2 text-ink/70">A 50-minute lesson for Years 7–11 (lessons are 45 minutes in Years 3–6 and 30 minutes in Years 1–2, with the same shape).</p>
          <ol className="mt-4 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
            {LESSON_SHAPE.map((s, i) => (
              <li key={s.step} className="flex gap-4 px-5 py-4">
                <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-semibold text-gold-900">{i + 1}</span>
                <div>
                  <p className="font-medium text-ink">
                    {s.step} <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-ink/55">{s.mins}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink/70">{s.what}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Link href="/curriculum" className="rounded-2xl border border-gold-light/50 bg-white p-5 hover:border-gold-500">
              <p className="font-semibold text-ink">Subjects and lessons a week →</p>
              <p className="mt-1 text-sm text-ink/70">The timetable for each key stage.</p>
            </Link>
            <a href="/policies/03-live-lesson-protocols.pdf" className="rounded-2xl border border-gold-light/50 bg-white p-5 hover:border-gold-500" target="_blank" rel="noopener noreferrer">
              <p className="font-semibold text-ink">The school day, minute by minute →</p>
              <p className="mt-1 text-sm text-ink/70">Live Lesson Protocols (PDF): times, breaks, prayer, cameras and chat.</p>
            </a>
          </div>

          <p className="mt-10 text-ink/75">
            Questions after watching? <Link href="/book-a-call" className="font-semibold text-gold-700 underline">Book a call</Link> with the admissions team, or{" "}
            <Link href="/admissions/apply" className="font-semibold text-gold-700 underline">start an application</Link> for the December 2026 founding cohort.
          </p>
        </Container>
      </section>
    </>
  );
}
