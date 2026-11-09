"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/Dropdown";
import { DateOfBirthField } from "@/components/learn/DateOfBirthField";
import { Button, Notice, ui } from "@/components/learn/ui";
import { ncYearFromDob, ncYearLabel, suggestYearGroup, yearsAheadOfAge } from "@/lib/learn/yearGroup";

type YearGroup = { id: string; name: string };
type ClassRow = { id: string; name: string; year_group_id: string | null };

/**
 * Edit a pupil's core record: name, date of birth, year group (suggested from
 * the date of birth), "working ahead" and classes (owner, Nov 2026: "I should
 * be able to add and edit students on Pupils", Tafweed T26/T27). Family-held
 * details (address, medical, contacts) stay on the profile tabs.
 *
 * The database only lets staff with manage_people_accounts change the year
 * group or the working-ahead flag (migration 0184).
 */
export function EditPupilDialog({ childId, onClose, onSaved }: { childId: string; onClose: () => void; onSaved: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [yearGroupId, setYearGroupId] = useState("");
  const [ahead, setAhead] = useState(false);
  const [aheadNote, setAheadNote] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [allClasses, setAllClasses] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [c, yg, cl, en] = await Promise.all([
        supabase.from("children").select("*").eq("id", childId).maybeSingle(),
        supabase.from("year_groups").select("id, name").order("sort_order"),
        supabase.from("classes").select("id, name, year_group_id").order("name"),
        supabase.from("enrolments").select("class_id").eq("child_id", childId),
      ]);
      if (cancelled) return;
      const row = c.data as { name: string; dob: string | null; year_group_id: string | null; working_ahead?: boolean; working_ahead_note?: string | null } | null;
      if (!row) {
        setError(c.error?.message || "Couldn't load this pupil.");
        return;
      }
      setName(row.name);
      setDob(row.dob || "");
      setYearGroupId(row.year_group_id || "");
      setAhead(Boolean(row.working_ahead));
      setAheadNote(row.working_ahead_note || "");
      setYearGroups((yg.data as YearGroup[]) || []);
      setClasses((cl.data as ClassRow[]) || []);
      setClassIds(((en.data as { class_id: string }[]) || []).map((e) => e.class_id));
      setAllClasses(Boolean(row.working_ahead));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const suggested = suggestYearGroup(dob, yearGroups);
  const chosenName = yearGroups.find((y) => y.id === yearGroupId)?.name || null;
  const diff = yearsAheadOfAge(dob, chosenName);
  const dobYear = ncYearFromDob(dob);

  const shownClasses = useMemo(
    () => classes.filter((c) => allClasses || !yearGroupId || c.year_group_id === yearGroupId || classIds.includes(c.id)),
    [classes, allClasses, yearGroupId, classIds]
  );

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: upErr } = await supabase
      .from("children")
      .update({
        name: name.trim(),
        dob,
        year_group_id: yearGroupId || null,
        working_ahead: ahead,
        working_ahead_note: ahead && aheadNote.trim() ? aheadNote.trim().slice(0, 300) : null,
      })
      .eq("id", childId);
    if (upErr) {
      setBusy(false);
      setError(upErr.code === "42501" ? "Only the office (Headteacher or Admin) can change a pupil's year group." : `Couldn't save: ${upErr.message}`);
      return;
    }
    const { error: enErr } = await supabase.rpc("set_child_classes", { p_child_id: childId, p_class_ids: classIds });
    setBusy(false);
    if (enErr) {
      setError(`Details saved, but the classes couldn't be updated: ${enErr.message}`);
      return;
    }
    onSaved();
    onClose();
  };

  const valid = name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dob);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-pupil-title">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gold-light px-5 py-4">
          <h2 id="edit-pupil-title" className="text-lg font-semibold text-ink">
            Edit pupil
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-ink/65 hover:bg-cream">
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {error && <Notice tone="bad">{error}</Notice>}
          {!loaded ? (
            <div className="h-48 animate-pulse rounded-xl bg-cream" />
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/60">Basics</h3>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-ink">Full name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} className={ui.input} autoComplete="off" />
                </label>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <DateOfBirthField value={dob} onChange={setDob} />
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-ink">Year group</span>
                    <Select allowEmpty value={yearGroupId} onChange={(e) => setYearGroupId(e.target.value)} className={ui.input}>
                      <option value="">Not set</option>
                      {yearGroups.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                          {suggested?.id === y.id ? " (by date of birth)" : ""}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <p className={`text-xs ${diff ? "text-amber-900" : "text-ink/70"}`} aria-live="polite">
                  {dobYear === null
                    ? "Date of birth is outside school age, or not set."
                    : diff === null
                      ? `By date of birth: ${ncYearLabel(dobYear)}.`
                      : diff === 0
                        ? `Matches the date of birth (${ncYearLabel(dobYear)}).`
                        : `By date of birth: ${ncYearLabel(dobYear)}. Chosen year is ${Math.abs(diff)} ${diff > 0 ? "ahead" : "behind"}.`}
                  {suggested && suggested.id !== yearGroupId && (
                    <>
                      {" "}
                      <button type="button" onClick={() => setYearGroupId(suggested.id)} className="font-semibold text-teal-800 underline underline-offset-2">
                        Use {suggested.name}
                      </button>
                    </>
                  )}
                </p>
              </section>

              <section className="space-y-2 rounded-xl border border-gold-light/70 p-3">
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={ahead} onChange={(e) => setAhead(e.target.checked)} />
                  <span>
                    <span className="font-medium">Working ahead of their age</span>
                    <span className="block text-xs text-ink/65">For example GCSE at 12. Shown on their record and the pupils list.</span>
                  </span>
                </label>
                {ahead && (
                  <input
                    value={aheadNote}
                    maxLength={300}
                    onChange={(e) => setAheadNote(e.target.value)}
                    placeholder="What they're doing ahead, e.g. GCSE Maths with Year 10"
                    aria-label="What they're doing ahead"
                    className={ui.input}
                  />
                )}
              </section>

              <section className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/60">Classes</h3>
                  {yearGroupId && (
                    <button type="button" onClick={() => setAllClasses((v) => !v)} aria-pressed={allClasses} className="text-xs font-semibold text-teal-800 underline underline-offset-2">
                      {allClasses ? `Only ${chosenName}` : "Show all classes"}
                    </button>
                  )}
                </div>
                {shownClasses.length === 0 ? (
                  <p className="text-xs text-ink/65">No classes for {chosenName || "this year"} yet.</p>
                ) : (
                  <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-gold-light/70 p-2 sm:grid-cols-2">
                    {shownClasses.map((c) => (
                      <li key={c.id}>
                        <label className="flex min-h-9 items-center gap-2 rounded-md px-1 text-sm text-ink hover:bg-cream">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={classIds.includes(c.id)}
                            onChange={(e) => setClassIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id)))}
                          />
                          <span className="min-w-0 break-words">{c.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gold-light px-5 py-3">
          <button type="button" onClick={onClose} className={ui.btnSecondary}>
            Cancel
          </button>
          <Button variant="primary" onClick={save} disabled={!loaded || busy || !valid}>
            {busy ? "Saving…" : "Save pupil"}
          </Button>
        </div>
      </div>
    </div>
  );
}
