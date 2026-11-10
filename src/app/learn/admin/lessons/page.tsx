"use client";

import { Loading } from "@/components/learn/kit";
import Link from "next/link";
import { LESSONS_HUB_TITLE, LessonsFrame, LessonsHeader } from "@/components/learn/timetable/LessonsFrame";
import { useTimetableData } from "@/components/learn/timetable/useTimetableData";
import { defaultYearId } from "@/components/learn/timetable/types";
import { Notice, ui } from "@/components/learn/ui";

function HubContent() {
  const { data } = useTimetableData();
  // Everything on this page is for the current academic year (or the next one before term starts).
  const yearId = defaultYearId(data.years);
  const yearLabel = data.years.find((y) => y.id === yearId)?.label || "";
  const published = data.runs.find((r) => r.status === "published" && r.academic_year_id === yearId) || data.runs.find((r) => r.status === "published");
  const drafts = data.runs.filter((r) => (r.status === "draft" || r.status === "review") && r.academic_year_id === yearId).length;
  const yearClasses = data.classes.filter((c) => c.academic_year_id === yearId).length;
  const withAvail = new Set(data.availability.filter((a) => a.academic_year_id === yearId).map((a) => a.teacher_user_id));
  const protectedCount = data.protectedTimes.filter((p) => p.academic_year_id === yearId).length;

  const cards = [
    { href: "/admin/lessons/timetable", title: "Timetable", help: "The weekly grid by class, teacher or session. Move, edit, print and publish.", status: published ? `Live: ${published.label}${drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}` : drafts ? `${drafts} draft${drafts === 1 ? "" : "s"}, none published` : "No timetable yet", ok: Boolean(published) },
    { href: "/admin/lessons/generate", title: "Generate", help: "Build a new draft in four guided steps. Never touches the live timetable.", status: `${yearClasses} class${yearClasses === 1 ? "" : "es"} to place${yearLabel ? ` in ${yearLabel}` : ""}`, ok: yearClasses > 0 },
    { href: "/admin/lessons/availability", title: "Availability", help: "When each teacher can teach.", status: `${withAvail.size} of ${data.teachers.length} teachers set`, ok: data.teachers.length > 0 && withAvail.size === data.teachers.length },
    { href: "/admin/lessons/day", title: "School day", help: "Lesson periods, protected breaks and sessions.", status: `${protectedCount} protected time${protectedCount === 1 ? "" : "s"}`, ok: true },
    { href: "/admin/lessons/list", title: "Lessons", help: "Upcoming dated lessons, join links and cover.", status: published ? "From the published timetable" : "Publish a timetable first", ok: Boolean(published) },
  ];

  return (
    <div>
      <LessonsHeader title={LESSONS_HUB_TITLE} subtitle={`Everything about when lessons happen, split into short pages.${yearLabel ? ` Showing ${yearLabel}.` : ""}`} />
      {!data.loaded ? (
        <Loading label="Loading…" bare />
      ) : (
        <>
          {data.years.length === 0 && (
            <div className="mb-4">
              <Notice tone="warn">
                Set the school up first. <Link href="/admin/academic" className="font-semibold underline">Open Academic setup</Link>.
              </Notice>
            </div>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className="flex h-full flex-col rounded-2xl border border-gold-light bg-white p-4 transition hover:border-gold-500 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                  <h2 className={ui.sectionTitle}>{c.title}</h2>
                  <p className="mt-1 flex-1 text-sm text-ink/65">{c.help}</p>
                  <p className={`mt-3 text-xs font-semibold ${c.ok ? "text-green-800" : "text-amber-800"}`}>{c.status}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function AdminLessonsPage() {
  return (
    <LessonsFrame>
      <HubContent />
    </LessonsFrame>
  );
}
