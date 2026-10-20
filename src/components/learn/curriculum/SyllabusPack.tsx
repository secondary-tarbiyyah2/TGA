"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ui } from "@/components/learn/ui";

const BUCKET = "lesson-decks";
const ROOT = "syllabus-pack";

type Entry = { name: string; path: string };
type Group = { folder: string; subjects: { subject: string; files: Entry[] }[] };

const niceFolder = (n: string) => n.replace(/^\d+_/, "").replace(/_/g, " ").replace(/-/g, " to ");
const niceSubject = (n: string) => n.replace(/_/g, " ");

/**
 * The syllabus and specification pack (decks built from content/syllabus by
 * the "Build syllabus pack" workflow). Staff-only: the lesson-decks bucket is
 * readable by teachers, admins and cover assistants only.
 */
export function SyllabusPack() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const list = async (prefix: string) => {
          const { data, error: e } = await sb.storage.from(BUCKET).list(prefix, { limit: 200, sortBy: { column: "name", order: "asc" } });
          if (e) throw e;
          return data || [];
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
  }, []);

  const open = async (path: string, download: boolean) => {
    setBusy(path);
    try {
      const { data, error: e } = await getSupabaseClient().storage.from(BUCKET).createSignedUrl(path, 600, download ? { download: path.split("/").pop() } : undefined);
      if (e || !data) throw e || new Error("No link");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch {
      setError("Could not open that file. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const btn = `${ui.btnSecondary} ${ui.sm}`;
  return (
    <details className={`${ui.card} mt-6`}>
      <summary className="cursor-pointer text-base font-semibold text-ink">Syllabus and specification pack</summary>
      <p className={`${ui.hint} mt-2`}>
        Official specification content for every subject: Years 10 to 11 specifications, Reception to Year 9 syllabuses, and cross-curricular matrices. Each deck ends with its sources and open items. Staff only.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {!groups && !error && <p className="mt-3 text-sm text-ink/70">Loading…</p>}
      {groups && groups.length === 0 && <p className="mt-3 text-sm text-ink/70">The pack has not been uploaded yet.</p>}
      {groups?.map((g) => (
        <section key={g.folder} className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-900">{niceFolder(g.folder)}</h3>
          <ul className="mt-2 divide-y divide-gold-light rounded-xl border border-gold-light">
            {g.subjects.map((s) => {
              const decks = s.files.filter((f) => f.name.endsWith(".pdf"));
              return decks.map((pdf) => {
                const pptx = s.files.find((f) => f.name === pdf.name.replace(/\.pdf$/, ".pptx"));
                return (
                  <li key={pdf.path} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 text-sm text-ink">
                      <span className="font-medium">{s.subject ? niceSubject(s.subject) : pdf.name.replace(/\.pdf$/, "").replace(/_/g, " ")}</span>
                      {s.subject && <span className="ml-2 text-xs text-ink/60">{pdf.name.replace(/\.pdf$/, "").replace(/_/g, " ")}</span>}
                    </span>
                    <span className="flex gap-2">
                      <button type="button" className={btn} disabled={busy === pdf.path} onClick={() => open(pdf.path, false)}>
                        View PDF
                      </button>
                      {pptx && (
                        <button type="button" className={btn} disabled={busy === pptx.path} onClick={() => open(pptx.path, true)}>
                          Download PowerPoint
                        </button>
                      )}
                    </span>
                  </li>
                );
              });
            })}
          </ul>
        </section>
      ))}
    </details>
  );
}
