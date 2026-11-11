"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Button, EmptyState, ui } from "@/components/learn/ui";
import { Icon } from "@/components/learn/Icon";
import { askConfirm } from "@/components/learn/kit";
import { SettingsPage } from "@/components/learn/templates/SettingsPage";
import { Pagination, Panel, toast } from "@/components/learn/templates/parts";

// Report settings (head teacher and office): the comment bank teachers draw on, assessment
// types, and per-subject mark schemes with their grade boundaries. Owner brief 11 Nov 2026:
// comment bank and assessment types side by side; grading as its own section; much less
// scrolling. Same tables, same permissions (RLS in 0011 and 0012) as before.

type AssessmentType = { id: string; name: string };
type Comment = { id: string; text: string; subject_id: string | null };
type Subject = { id: string; name: string };
type MarkScheme = { id: string; scale_name: string; subject_id: string };
type Boundary = { id: string; label: string; min_percent: number };

const problem = (msg?: string) => toast(msg ? `That did not save: ${msg}` : "That did not save. Try again.", "bad");

function AddRow({ value, onChange, onAdd, placeholder, label, busy }: { value: string; onChange: (v: string) => void; onAdd: () => void; placeholder: string; label: string; busy?: boolean }) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd();
      }}
    >
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} className={`min-w-0 flex-1 ${ui.input}`} />
      <Button type="submit" variant="primary" icon="plus" disabled={!value.trim() || busy}>
        Add
      </Button>
    </form>
  );
}

function CommentBank() {
  const supabase = getSupabaseClient();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const SIZE = 8;

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("comment_bank").select("id, text, subject_id").order("created_at", { ascending: false }).limit(200);
    setComments((data as Comment[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const add = async () => {
    if (!supabase || !text.trim()) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("comment_bank").insert({ text: text.trim(), created_by: user?.id });
    setBusy(false);
    if (error) return problem(error.message);
    setText("");
    toast("Added to the comment bank");
    setPage(0);
    await load();
  };

  const remove = async (id: string) => {
    if (!supabase || !(await askConfirm("Remove this sentence from the comment bank?", { danger: true, confirmLabel: "Remove" }))) return;
    const { error } = await supabase.from("comment_bank").delete().eq("id", id);
    if (error) return problem(error.message);
    toast("Removed");
    await load();
  };

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (comments || []).filter((c) => !n || c.text.toLowerCase().includes(n));
  }, [comments, q]);
  const pageRows = shown.slice(page * SIZE, page * SIZE + SIZE);

  return (
    <Panel title="Comment bank" description={<>Sentences teachers can add to a report comment. Write {"{name}"} where the pupil&apos;s first name goes.</>} guide="report-comment-bank" className="flex flex-col">
      <AddRow value={text} onChange={setText} onAdd={add} busy={busy} label="New sentence" placeholder="{name} makes a positive contribution in class discussions." />
      {comments && comments.length > SIZE && (
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Search the comment bank"
          aria-label="Search the comment bank"
          className={`${ui.input} mt-3`}
        />
      )}
      {comments === null ? (
        <p className="t-meta mt-4">Loading</p>
      ) : comments.length === 0 ? (
        <p className="t-meta mt-4">No sentences yet. Add the first above.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-gold-light/70 border-y border-gold-light/70">
            {pageRows.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-1.5 text-sm text-ink-700">
                <span className="min-w-0 leading-relaxed">{c.text}</span>
                <button type="button" onClick={() => remove(c.id)} aria-label={`Remove: ${c.text}`} title="Remove" className={`${ui.btnIcon} -my-1 !h-8 !w-8 hover:!text-red-700`}>
                  <Icon name="trash" size="sm" />
                </button>
              </li>
            ))}
            {pageRows.length === 0 && <li className="t-meta py-3">Nothing matches that search.</li>}
          </ul>
          {shown.length > SIZE && (
            <div className="mt-3">
              <Pagination page={page} size={SIZE} total={shown.length} filteredFrom={comments.length} onPage={setPage} />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function AssessmentTypes() {
  const supabase = getSupabaseClient();
  const [types, setTypes] = useState<AssessmentType[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("assessment_types").select("id, name").order("name");
    setTypes((data as AssessmentType[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const add = async () => {
    if (!supabase || !name.trim()) return;
    if ((types || []).some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) return toast(`"${name.trim()}" is already a type`, "info");
    setBusy(true);
    const { error } = await supabase.from("assessment_types").insert({ name: name.trim() });
    setBusy(false);
    if (error) return problem(error.message);
    setName("");
    toast("Assessment type added");
    await load();
  };

  return (
    <Panel title="Assessment types" description="The kinds of assessment a teacher can record in the gradebook." guide="report-assessment-types">
      <AddRow value={name} onChange={setName} onAdd={add} busy={busy} label="New assessment type" placeholder="e.g. Spelling test" />
      {types === null ? (
        <p className="t-meta mt-4">Loading</p>
      ) : types.length === 0 ? (
        <p className="t-meta mt-4">No types yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gold-light/70 border-y border-gold-light/70">
          {types.map((t) => (
            <li key={t.id} className="py-2 text-sm text-ink-700">
              {t.name}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Subject, then its scales, then the chosen scale's boundaries: three columns on wide screens. */
function Grading() {
  const supabase = getSupabaseClient();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [schemes, setSchemes] = useState<MarkScheme[]>([]);
  const [schemeName, setSchemeName] = useState("");
  const [selectedScheme, setSelectedScheme] = useState("");
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [label, setLabel] = useState("");
  const [minPercent, setMinPercent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("subjects")
      .select("id, name")
      .order("name")
      .then(({ data }) => setSubjects((data as Subject[]) || []));
  }, [supabase]);

  const loadSchemes = async (sid: string) => {
    if (!supabase || !sid) return;
    const { data } = await supabase.from("mark_schemes").select("id, scale_name, subject_id").eq("subject_id", sid);
    setSchemes((data as MarkScheme[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load when the subject changes
    loadSchemes(subjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, subjectId]);

  const loadBoundaries = async (sid: string) => {
    if (!supabase || !sid) return;
    const { data } = await supabase.from("grade_boundaries").select("id, label, min_percent").eq("mark_scheme_id", sid).order("min_percent", { ascending: false });
    setBoundaries((data as Boundary[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data load when the scale changes
    loadBoundaries(selectedScheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, selectedScheme]);

  const pickSubject = (id: string) => {
    setSubjectId(id);
    setSelectedScheme("");
    setSchemes([]);
    setBoundaries([]);
  };

  const addScheme = async () => {
    if (!supabase || !subjectId || !schemeName.trim()) return;
    const { data, error: err } = await supabase.from("mark_schemes").insert({ subject_id: subjectId, scale_name: schemeName.trim() }).select("id").maybeSingle();
    if (err) return problem(err.message);
    setSchemeName("");
    toast("Scale added");
    await loadSchemes(subjectId);
    if (data && (data as { id: string }).id) setSelectedScheme((data as { id: string }).id);
  };

  const addBoundary = async () => {
    setError("");
    if (!supabase || !selectedScheme) return;
    const pct = Number(minPercent);
    if (!label.trim()) return setError("Give the grade a label, for example B.");
    if (minPercent.trim() === "" || !Number.isFinite(pct) || pct < 0 || pct > 100) return setError("The lowest mark must be a number from 0 to 100.");
    if (boundaries.some((b) => b.label.toLowerCase() === label.trim().toLowerCase())) return setError(`This scale already has a grade ${label.trim()}.`);
    if (boundaries.some((b) => Number(b.min_percent) === pct)) return setError(`Another grade already starts at ${pct}%.`);
    const { error: err } = await supabase.from("grade_boundaries").insert({ mark_scheme_id: selectedScheme, label: label.trim(), min_percent: pct });
    if (err) return problem(err.message);
    setLabel("");
    setMinPercent("");
    toast("Grade boundary added");
    await loadBoundaries(selectedScheme);
  };

  const removeBoundary = async (b: Boundary) => {
    if (!supabase || !(await askConfirm(`Remove grade ${b.label} (from ${b.min_percent}%) from this scale?`, { danger: true, confirmLabel: "Remove" }))) return;
    const { error: err } = await supabase.from("grade_boundaries").delete().eq("id", b.id);
    if (err) return problem(err.message);
    toast("Removed");
    await loadBoundaries(selectedScheme);
  };

  const subject = (subjects || []).find((s) => s.id === subjectId);
  const scheme = schemes.find((s) => s.id === selectedScheme);
  const pickCls = (on: boolean) => `flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm sm:min-h-9 ${on ? "bg-forest-50 font-semibold text-forest-900" : "text-ink-700 hover:bg-[var(--portal-hover)]"}`;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,16rem)_minmax(0,1fr)]" data-guide="report-grading">
      <Panel title="1. Subject" flush>
        {subjects === null ? (
          <p className="t-meta p-4">Loading</p>
        ) : subjects.length === 0 ? (
          <p className="t-meta p-4">No subjects yet. Add them in Academic setup.</p>
        ) : (
          <ul className="max-h-[22rem] overflow-y-auto p-1.5" aria-label="Subjects">
            {subjects.map((s) => (
              <li key={s.id}>
                <button type="button" aria-pressed={s.id === subjectId} onClick={() => pickSubject(s.id)} className={pickCls(s.id === subjectId)}>
                  <span className="truncate">{s.name}</span>
                  {s.id === subjectId && <Icon name="chevronRight" size="sm" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="2. Scale" description={subject ? `Grade scales for ${subject.name}.` : "Choose a subject first."}>
        {subject ? (
          <>
            <AddRow value={schemeName} onChange={setSchemeName} onAdd={addScheme} label="New scale name" placeholder="e.g. 9 to 1" />
            {schemes.length === 0 ? (
              <p className="t-meta mt-3">No scales for {subject.name} yet.</p>
            ) : (
              <ul className="mt-3 space-y-0.5" aria-label="Scales">
                {schemes.map((s) => (
                  <li key={s.id}>
                    <button type="button" aria-pressed={s.id === selectedScheme} onClick={() => setSelectedScheme(s.id)} className={pickCls(s.id === selectedScheme)}>
                      <span className="truncate">{s.scale_name}</span>
                      {s.id === selectedScheme && <Icon name="chevronRight" size="sm" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="t-meta">Grades are worked out from these bands, never typed by hand.</p>
        )}
      </Panel>

      <Panel title="3. Grade boundaries" description={scheme ? `${subject?.name}, ${scheme.scale_name}: a mark at or above a grade's lowest mark gets that grade.` : "Choose a scale to see and set its grades."}>
        {scheme ? (
          <>
            <form
              className="flex flex-wrap items-start gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addBoundary();
              }}
            >
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Grade (e.g. B)" aria-label="Grade label" className={`${ui.input} !w-36`} />
              <input value={minPercent} onChange={(e) => setMinPercent(e.target.value)} inputMode="decimal" placeholder="Lowest mark %" aria-label="Lowest mark in per cent" className={`${ui.input} !w-36`} />
              <Button type="submit" variant="primary" icon="plus">
                Add grade
              </Button>
            </form>
            {error && (
              <p role="alert" className={`${ui.error} mt-2`}>
                {error}
              </p>
            )}
            {boundaries.length === 0 ? (
              <p className="t-meta mt-3">No grades on this scale yet.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">Grade boundaries</caption>
                <thead>
                  <tr className="border-b border-gold-light text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <th scope="col" className="py-2 pr-3">
                      Grade
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      From
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Up to
                    </th>
                    <th scope="col" className="py-2">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {boundaries.map((b, i) => (
                    <tr key={b.id} className="border-b border-gold-light/60">
                      <td className="py-1.5 pr-3 font-semibold text-ink">{b.label}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-ink-700">{b.min_percent}%</td>
                      <td className="py-1.5 pr-3 tabular-nums text-ink-500">{i === 0 ? "100%" : `under ${boundaries[i - 1].min_percent}%`}</td>
                      <td className="py-1 text-right">
                        <button type="button" onClick={() => removeBoundary(b)} aria-label={`Remove grade ${b.label}`} title="Remove" className={`${ui.btnIcon} !h-8 !w-8 hover:!text-red-700`}>
                          <Icon name="trash" size="sm" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <EmptyState title="No scale chosen" icon="listChecks">
            Pick a subject, then one of its scales.
          </EmptyState>
        )}
      </Panel>
    </div>
  );
}

type Key = "comments" | "grading";

/** Everything that shapes how reports are written, as two sections chosen down the left. */
export function ReportSettings() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("section");
  const value: Key = raw === "grading" ? "grading" : "comments";
  const go = (k: Key) => {
    const next = new URLSearchParams(params.toString());
    next.set("section", k);
    router.replace(`?${next.toString()}`, { scroll: false });
  };
  return (
    <SettingsPage<Key>
      embedded
      guide="report-settings"
      navLabel="Report settings"
      value={value}
      onChange={go}
      sections={[
        {
          key: "comments",
          label: "Comments and assessments",
          description: "What teachers pick from while writing reports and recording marks. Changes save as you add them.",
          content: (
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
              <CommentBank />
              <AssessmentTypes />
            </div>
          ),
        },
        {
          key: "grading",
          label: "Grading",
          description: "Mark schemes and grade boundaries per subject: the one place grades are worked out from.",
          content: <Grading />,
        },
      ]}
    />
  );
}
