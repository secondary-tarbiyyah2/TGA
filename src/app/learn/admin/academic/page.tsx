"use client";

import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { teacherFor, todayIso } from "@/lib/learn/teacherFor";
import { useAcademicData } from "@/components/learn/academic/useAcademicData";

type Card = { href: string; title: string; help: string; count: number; unit: string; done: boolean; blocked?: string };

function AcademicHub() {
  const { data } = useAcademicData();
  const withLink = data.classes.filter((c) => c.meeting_url).length;
  const today = todayIso();
  const withTeacher = data.classes.filter((c) => (c.subject_id && teacherFor(data.subjectTeachers, c.id, c.subject_id, today)) || data.classTeachers.some((t) => t.scope_id === c.id)).length;
  const cards: Card[] = [
    { href: "/admin/academic/years", title: "Years & terms", help: "Academic years and their term dates.", count: data.years.length, unit: "year", done: data.years.length > 0 },
    { href: "/admin/academic/year-groups", title: "Year groups", help: "Groups pupils are placed in.", count: data.yearGroups.length, unit: "year group", done: data.yearGroups.length > 0 },
    { href: "/admin/academic/subjects", title: "Subjects", help: "What the school teaches.", count: data.subjects.length, unit: "subject", done: data.subjects.length > 0 },
    {
      href: "/admin/academic/classes",
      title: "Classes & teachers",
      help: data.classes.length ? `${withTeacher} of ${data.classes.length} have a teacher.` : "Create classes, enrol pupils, name teachers.",
      count: data.classes.length,
      unit: "class",
      done: data.classes.length > 0 && withTeacher === data.classes.length,
    },
    {
      href: "/admin/academic/meeting-links",
      title: "Meeting links",
      help: data.classes.length ? `${withLink} of ${data.classes.length} classes have a link.` : "Add classes first.",
      count: withLink,
      unit: "link",
      done: data.classes.length > 0 && withLink === data.classes.length,
    },
  ];
  const next = !data.loaded ? null : cards.find((c) => !c.done);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Academic setup" }]}
        title="Academic setup"
        subtitle="Set the school up once, in order. Each step has its own page."
      />
      {!data.loaded ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-500/30 bg-teal-100/60 px-4 py-3 text-sm text-teal-900">
            {next ? (
              <Link href={next.href} className="font-medium underline">Next: {next.title.toLowerCase()} &rarr;</Link>
            ) : (
              <span className="font-medium">Setup complete.</span>
            )}
            {!next && <Link href="/admin/lessons" className="font-semibold underline">Next: build the timetable &rarr;</Link>}
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c, i) => (
              <li key={c.href}>
                <Link href={c.href} className="flex h-full flex-col rounded-2xl border border-gold-light/50 bg-white p-4 transition hover:border-gold-500 hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${c.done ? "bg-green-600 text-white" : "bg-gold-100 text-gold-900"}`}>{c.done ? "✓" : i + 1}</span>
                    <h2 className="font-serif text-h3 font-semibold text-ink">{c.title}</h2>
                  </div>
                  <p className="mt-2 flex-1 text-sm text-ink/60">{c.help}</p>
                  <p className="mt-3 text-xs font-semibold text-ink/70">{c.count} {c.count === 1 ? c.unit : c.unit.endsWith("s") ? c.unit + "es" : c.unit + "s"} &middot; {c.done ? "Done" : "To do"}</p>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function AdminAcademicPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <AcademicHub />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
