"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";
import { Icon, type IconName } from "@/components/learn/Icon";

const BUCKET = "lesson-decks";
const ROOT = "syllabus-pack";

type Entry = { name: string; path: string };
type Group = { folder: string; subjects: { subject: string; files: Entry[] }[] };

const niceFolder = (n: string) => n.replace(/^\d+_/, "").replace(/_/g, " ").replace(/-/g, " to ");
const niceSubject = (n: string) => n.replace(/_/g, " ");

/** One tile per subject: related documents are merged (Computer Science with Computing, the English parts together). */
const CANON: Record<string, string> = { "computer science": "Computing", computing: "Computing", english: "English", "english language": "English", "english literature": "English" };
const canon = (n: string) => CANON[niceSubject(n).toLowerCase()] || niceSubject(n);
const SUBJECT_ICON: Record<string, IconName> = {
  Arabic: "languages", "Art and Design": "palette", Business: "briefcase", Computing: "monitor", English: "notebookPen", Geography: "globe", History: "hourglass",
  "Islamic Studies": "moon", Mathematics: "calculator", "Physical Education": "activity", "PSHE RSHE and Citizenship": "heartHandshake", "PSHE RSE and Citizenship": "heartHandshake", "Quran and Tajweed": "bookMarked", Science: "flask",
};
const iconFor = (n: string): IconName => SUBJECT_ICON[n] || "bookOpen";
const fileKind = (name: string) => (name.split(".").pop() || "").toUpperCase();

const FILTER_KEY = "tga-syllabus-filter";
const FILE_LABEL: Record<string, string> = { pptx: "Download PowerPoint", docx: "Download Word", xlsx: "Download spreadsheet" };

/**
 * The syllabus and specification pack, on its own page. Built from content/syllabus by the
 * "Build syllabus pack" workflow. Staff-only: the lesson-decks bucket is readable by teachers,
 * admins and cover assistants only. Nothing is listed until a subject is picked, so staff see
 * one subject's documents at a time (the last choice is remembered).
 */
export function SyllabusPack() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [subject, setSubject] = useState<string>("");
  const [level, setLevel] = useState<string>("all");

  useEffect(() => {
    try {
      const f = JSON.parse(window.localStorage.getItem(FILTER_KEY) || "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved filter once after mount
      if (typeof f.subject === "string") setSubject(canon(f.subject));
      if (typeof f.level === "string") setLevel(f.level);
    } catch {
      /* private mode: start unfiltered */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_KEY, JSON.stringify({ subject, level }));
    } catch {
      /* ignore */
    }
  }, [subject, level]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        if (!sb) throw new Error("Not connected.");
        const list = async (prefix: string) => {
          // The database sometimes refuses a burst of connections ("too many connections"); wait and try again.
          for (let tries = 0; ; tries++) {
            const { data, error: e } = await sb.storage.from(BUCKET).list(prefix, { limit: 200, sortBy: { column: "name", order: "asc" } });
            if (!e) return data || [];
            if (tries >= 4) throw e;
            await new Promise((r) => setTimeout(r, 800 * (tries + 1)));
          }
        };
        const top = (await list(ROOT)).filter((x) => !x.id);
        const out: Group[] = [];
        for (const t of top) {
          const items = await list(`${ROOT}/${t.name}`);
          const subjects: Group["subjects"] = [];
          const loose: Entry[] = items.filter((i) => i.id).map((i) => ({ name: i.name, path: `${ROOT}/${t.name}/${i.name}` }));
          if (loose.length) subjects.push({ subject: "", files: loose });
          for (const sub of items.filter((i) => !i.id)) {
            const files = (await list(`${ROOT}/${t.name}/${sub.name}`)).filter((i) => i.id).map((i) => ({ name: i.name, path: `${ROOT}/${t.name}/${sub.name}/${i.name}` }));
            subjects.push({ subject: sub.name, files });
          }
          out.push({ folder: t.name, subjects });
        }
        if (live) setGroups(out);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not load the syllabus pack.");
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  const open = async (path: string, download: boolean) => {
    setBusy(path);
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error("Not connected.");
      const { data, error: e } = await sb.storage.from(BUCKET).createSignedUrl(path, 600, download ? { download: path.split("/").pop() } : undefined);
      if (e || !data) throw e || new Error("No link");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch {
      setError("Could not open that file. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const subjects = useMemo(() => [...new Set((groups || []).flatMap((g) => g.subjects.map((s) => s.subject)).filter(Boolean).map(canon))].sort((a, b) => a.localeCompare(b)), [groups]);
  const countFor = (sb: string) => (groups || []).reduce((n, g) => n + g.subjects.filter((x) => x.subject && canon(x.subject) === sb).reduce((m, x) => m + x.files.filter((f) => f.name.endsWith(".pdf")).length, 0), 0);
  const levels = useMemo(() => (groups || []).filter((g) => g.subjects.some((s) => s.subject)).map((g) => g.folder), [groups]);
  const intro = (groups || []).filter((g) => g.subjects.some((s) => !s.subject));
  const btn = `${ui.btnSecondary} ${ui.sm}`;
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-teal-700 bg-teal-700 font-semibold text-white" : "border-gold-light bg-white text-ink hover:border-teal-700"}`;

  const row = (name: string, label: string, sub: string, files: Entry[]) => {
    const pdf = files.find((f) => f.name.endsWith(".pdf"));
    const editable = files.find((f) => /\.(pptx|docx|xlsx)$/.test(f.name));
    const ext = editable ? editable.name.split(".").pop() || "" : "";
    return (
      <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="min-w-0 text-sm text-ink">
          <span className="mr-2 inline-flex items-center rounded bg-cream px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-ink/65">{fileKind(files.find((f) => /\.(pptx|docx|xlsx)$/.test(f.name))?.name || files[0]?.name || "")}</span>
          <span className="font-medium">{label}</span>
          {sub && <span className="ml-2 text-xs text-ink/65">{sub}</span>}
        </span>
        <span className="flex gap-2">
          {pdf && (
            <button type="button" className={btn} disabled={busy === pdf.path} onClick={() => open(pdf.path, false)}>
              <Icon name="file" className="h-3.5 w-3.5" /> View PDF
            </button>
          )}
          {editable && (
            <button type="button" className={btn} disabled={busy === editable.path} onClick={() => open(editable.path, true)}>
              <Icon name="download" className="h-3.5 w-3.5" /> {FILE_LABEL[ext] || "Download"}
            </button>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}{" "}
          {!groups && (
            <button type="button" className="font-semibold underline" onClick={() => { setError(null); setAttempt((n) => n + 1); }}>
              Try again
            </button>
          )}
        </p>
      )}
      {!groups && !error && <p className="text-sm text-ink/70">Loading…</p>}
      {groups && groups.length === 0 && <p className="text-sm text-ink/70">The pack has not been uploaded yet.</p>}

      {intro.map((g) => (
        <section key={g.folder} aria-label={niceFolder(g.folder)} className="rounded-2xl border border-gold-light bg-white">
          <h2 className="border-b border-gold-light px-4 py-2 text-xs font-semibold uppercase tracking-wide text-teal-900">{niceFolder(g.folder)}</h2>
          <ul className="divide-y divide-gold-light">
            {g.subjects
              .filter((s) => !s.subject)
              .flatMap((s) => s.files.filter((f) => f.name.endsWith(".pdf")).map((pdf) => row(pdf.path, pdf.name.replace(/\.pdf$/, "").replace(/_/g, " "), "", s.files.filter((f) => f.name.replace(/\.[^.]+$/, "") === pdf.name.replace(/\.pdf$/, "")))))}
          </ul>
        </section>
      ))}

      {groups && subjects.length > 0 && (
        <div className="rounded-2xl border border-gold-light bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">Choose a subject</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {subjects.map((sb) => (
              <button
                key={sb}
                type="button"
                aria-pressed={subject === sb}
                onClick={() => setSubject(subject === sb ? "" : sb)}
                className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${subject === sb ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink hover:border-teal-700 hover:bg-cream"}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${subject === sb ? "bg-white/15 text-white" : "bg-teal-100 text-teal-700"}`}>
                  <Icon name={iconFor(sb)} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{sb}</span>
                  <span className={`block text-xs ${subject === sb ? "text-white/80" : "text-ink/60"}`}>{countFor(sb)} document{countFor(sb) === 1 ? "" : "s"}</span>
                </span>
              </button>
            ))}
          </div>
          {levels.length > 1 && (
            <>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink/65">Show</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" aria-pressed={level === "all"} onClick={() => setLevel("all")} className={chip(level === "all")}>
                  All levels
                </button>
                {levels.map((l) => (
                  <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(level === l ? "all" : l)} className={chip(level === l)}>
                    {niceFolder(l)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {groups && subjects.length > 0 && !subject && (
        <p className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center text-sm text-ink/70">Pick a subject above to see its specification and syllabus documents.</p>
      )}

      {subject &&
        (groups || [])
          .filter((g) => level === "all" || g.folder === level)
          .map((g) => ({ g, subs: g.subjects.filter((s) => s.subject && canon(s.subject) === subject) }))
          .filter((x) => x.subs.length > 0)
          .map(({ g, subs }) => (
            <section key={g.folder} aria-label={niceFolder(g.folder)} className="rounded-2xl border border-gold-light bg-white">
              <h2 className="border-b border-gold-light px-4 py-2 text-xs font-semibold uppercase tracking-wide text-teal-900">{niceFolder(g.folder)}</h2>
              <ul className="divide-y divide-gold-light">
                {subs.flatMap((s) => s.files.filter((f) => f.name.endsWith(".pdf")).map((pdf) => row(pdf.path, niceSubject(s.subject), pdf.name.replace(/\.pdf$/, "").replace(/_/g, " "), s.files.filter((f) => f.name.replace(/\.[^.]+$/, "") === pdf.name.replace(/\.pdf$/, "")))))}
              </ul>
            </section>
          ))}
    </div>
  );
}
