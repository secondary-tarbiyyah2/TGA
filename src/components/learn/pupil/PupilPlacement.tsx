"use client";

import { useMemo, useRef, useState } from "react";
import { DatePicker } from "@/components/learn/DatePicker";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";
import { Dropdown } from "@/components/ui/Dropdown";
import { academicYearLabel, academicYearStart, findYearGroup, yearLabel, yearNumberForDob, yearNumberFromName } from "@/lib/learn/yearGroup";

type Group = { id: string; name: string };
type ClassOpt = { id: string; name: string; yearGroupId: string | null };

/**
 * Date of birth, year group and classes for a pupil, used by "Add pupil" and
 * "Edit pupil". The date of birth suggests the year group (England: the
 * school year runs 1 September to 31 August); staff can choose another. A
 * year above the suggested one ticks "Working above year group", which staff
 * can also tick or untick themselves. Classes are offered for the chosen year
 * group first, with a switch to show every class.
 */
export function PupilPlacement({
  dob,
  setDob,
  yearGroupId,
  setYearGroupId,
  above,
  setAbove,
  yearGroups,
  classes,
  classIds,
  setClassIds,
  idPrefix = "pp",
}: {
  dob: string;
  setDob: (v: string) => void;
  yearGroupId: string;
  setYearGroupId: (v: string) => void;
  above: boolean;
  setAbove: (v: boolean) => void;
  yearGroups: Group[];
  /** Leave out to hide the class picker. */
  classes?: ClassOpt[];
  classIds?: string[];
  setClassIds?: (ids: string[]) => void;
  idPrefix?: string;
}) {
  const start = academicYearStart();
  const suggestedNumber = dob ? yearNumberForDob(dob, start) : null;
  const suggested = findYearGroup(yearGroups, suggestedNumber);
  // The year group follows the date of birth until staff pick one themselves.
  const picked = useRef(!!yearGroupId);
  const [showAll, setShowAll] = useState(false);

  const numberOf = (id: string) => yearNumberFromName(yearGroups.find((g) => g.id === id)?.name);
  const chosenNumber = yearGroupId ? numberOf(yearGroupId) : null;
  const diff = chosenNumber !== null && suggestedNumber !== null ? chosenNumber - suggestedNumber : null;

  const onDob = (v: string) => {
    setDob(v);
    if (picked.current || !v) return;
    const g = findYearGroup(yearGroups, yearNumberForDob(v, start));
    if (g) {
      setYearGroupId(g.id);
      setAbove(false);
    }
  };

  const onYear = (id: string) => {
    picked.current = true;
    setYearGroupId(id);
    const n = numberOf(id);
    // Above the age group: tick the flag (staff can untick). Back at or below it: untick.
    if (n !== null && suggestedNumber !== null) setAbove(n > suggestedNumber);
  };

  const shownClasses = useMemo(() => {
    if (!classes) return [];
    const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true }));
    if (showAll || !yearGroupId) return sorted;
    // This year group's classes, classes for any year, and anything already ticked.
    return sorted.filter((c) => c.yearGroupId === yearGroupId || c.yearGroupId === null || classIds?.includes(c.id));
  }, [classes, showAll, yearGroupId, classIds]);
  const hiddenCount = (classes?.length || 0) - shownClasses.length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <DatePicker
          id={`${idPrefix}-dob`}
          label="Date of birth"
          value={dob}
          onChange={onDob}
          required
          min="1990-01-01"
          max={new Date().toISOString().slice(0, 10)}
          defaultView={`${start - 10}-09-01`}
        />
        <div>
          <span id={`${idPrefix}-yg`} className={`${ui.label} mb-1 block`}>
            Year group
          </span>
          <Dropdown
            value={yearGroupId}
            aria-labelledby={`${idPrefix}-yg`}
            aria-describedby={`${idPrefix}-yg-hint`}
            className={ui.select}
            placeholder="Not set"
            onChange={onYear}
            options={yearGroups.map((g) => ({ value: g.id, label: g.name, aside: suggested?.id === g.id ? "Suggested" : undefined }))}
          />
          <p id={`${idPrefix}-yg-hint`} className={`mt-1 ${ui.hint}`} aria-live="polite">
            {suggestedNumber === null
              ? `Enter the date of birth and the year group is suggested for ${academicYearLabel(start)}.`
              : suggested
                ? diff === 0 || diff === null
                  ? `${yearLabel(suggestedNumber)} by date of birth (${academicYearLabel(start)}).`
                  : `By date of birth: ${yearLabel(suggestedNumber)}. ${Math.abs(diff)} year${Math.abs(diff) === 1 ? "" : "s"} ${diff > 0 ? "above" : "below"} that.`
                : `By date of birth: ${yearLabel(suggestedNumber)}, which isn't set up as a year group yet.`}
          </p>
        </div>
      </div>

      <label className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${above ? "border-teal-700/40 bg-teal-100/50" : "border-gold-light bg-white"}`}>
        <input type="checkbox" checked={above} onChange={(e) => setAbove(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-teal-700)]" />
        <span>
          <span className="block font-medium text-ink">Working above year group</span>
          <span className="block text-xs text-ink/70">For a pupil placed in, or working at, a higher year than their age, for example sitting GCSEs at 12. Shown on their record and in the Pupils list.</span>
        </span>
      </label>

      {classes && setClassIds && (
        <fieldset>
          <legend className={`${ui.label} mb-1`}>Classes (optional)</legend>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className={ui.hint}>{yearGroupId && !showAll ? "Classes for this year group. A pupil can be in one class per subject." : "Every class. A pupil can be in one class per subject."}</p>
            {yearGroupId && (hiddenCount > 0 || showAll) && (
              <button type="button" onClick={() => setShowAll((s) => !s)} aria-pressed={showAll} className={`${ui.btnLink} !min-h-0 text-xs`}>
                {showAll ? "Only this year group" : `Show all classes (${hiddenCount} more)`}
              </button>
            )}
          </div>
          {classes.length === 0 ? (
            <p className={ui.hint}>No classes have been set up yet.</p>
          ) : shownClasses.length === 0 ? (
            <p className={ui.hint}>No classes for this year group yet.</p>
          ) : (
            <ul className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-gold-light p-2 sm:grid-cols-2">
              {shownClasses.map((c) => {
                const on = !!classIds?.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm ${on ? "bg-teal-100/70 text-ink" : "text-ink hover:bg-cream"}`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[var(--color-teal-700)]"
                        checked={on}
                        onChange={(e) => setClassIds(e.target.checked ? [...(classIds || []), c.id] : (classIds || []).filter((x) => x !== c.id))}
                      />
                      <span className="min-w-0 break-words">{c.name}</span>
                      {showAll && c.yearGroupId && c.yearGroupId !== yearGroupId && (
                        <span className="ml-auto shrink-0 text-xs text-ink/60">{yearGroups.find((g) => g.id === c.yearGroupId)?.name}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {(classIds?.length || 0) > 0 && (
            <p className={`mt-1 inline-flex items-center gap-1 ${ui.hint}`}>
              <Icon name="check" size="sm" />
              {classIds!.length} class{classIds!.length === 1 ? "" : "es"} chosen
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}
