"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export type RosterPupil = { id: string; name: string };

/** The class roster, A to Z (enrolments, read through the viewer's own RLS). */
export function useClassRoster(classId: string): RosterPupil[] | null {
  const [state, setState] = useState<{ classId: string; list: RosterPupil[] } | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !classId) return;
    let alive = true;
    supabase
      .from("enrolments")
      .select("child_id, children(name)")
      .eq("class_id", classId)
      .then(({ data }) => {
        if (!alive) return;
        const rows = ((data as unknown as { child_id: string; children: { name: string } | null }[]) || []).map((r) => ({ id: r.child_id, name: r.children?.name || "Pupil" }));
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setState({ classId, list: rows });
      });
    return () => {
      alive = false;
    };
  }, [classId]);
  return state && state.classId === classId ? state.list : null;
}

/**
 * "For: All pupils / Selected pupils", like Google Classroom's audience
 * picker. Selected pupils shows the chosen pupils as chips (each removable)
 * and a searchable list of the class to tick from. `value` null means the
 * whole class.
 */
export function PupilPicker({ classId, value, onChange, label = "For" }: { classId: string; value: string[] | null; onChange: (v: string[] | null) => void; label?: string }) {
  const roster = useClassRoster(classId);
  const id = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = useMemo(() => new Set(value || []), [value]);
  const mode = value === null ? "all" : "selected";

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (roster || []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [roster, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the highlighted row in range as the search changes
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const toggle = (pid: string) => {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    // Keep the roster's order, so the chips read A to Z.
    onChange((roster || []).filter((p) => next.has(p.id)).map((p) => p.id));
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (shown.length) setActive((a) => (a + 1) % shown.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) setActive((a) => (a - 1 + shown.length) % shown.length);
    } else if (e.key === "Enter" || (e.key === " " && e.currentTarget.tagName !== "INPUT")) {
      e.preventDefault();
      const p = shown[active];
      if (p) toggle(p.id);
    }
  };

  const name = (pid: string) => roster?.find((p) => p.id === pid)?.name || "Pupil";
  const seg = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 ${on ? "bg-white text-ink shadow-sm ring-1 ring-gold-light" : "text-ink/65 hover:text-ink"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span id={`${id}-label`} className="text-sm font-medium text-ink">
          {label}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          className="inline-flex min-w-[16rem] rounded-xl bg-cream p-1"
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
            e.preventDefault();
            const toAll = mode === "selected";
            onChange(toAll ? null : []);
            (e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[toAll ? 0 : 1])?.focus();
          }}
        >
          <button type="button" role="radio" aria-checked={mode === "all"} tabIndex={mode === "all" ? 0 : -1} className={seg(mode === "all")} onClick={() => onChange(null)}>
            All pupils{roster ? ` (${roster.length})` : ""}
          </button>
          <button type="button" role="radio" aria-checked={mode === "selected"} tabIndex={mode === "selected" ? 0 : -1} className={seg(mode === "selected")} onClick={() => mode === "all" && onChange([])}>
            Selected pupils
          </button>
        </div>
      </div>

      {mode === "selected" && (
        <div className="mt-3 rounded-xl border border-gold-light bg-white">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-gold-light/70 p-2.5">
            {selected.size === 0 ? (
              <span className="px-1 text-sm text-ink/65">No pupils chosen yet. Tick them below.</span>
            ) : (
              [...selected].map((pid) => (
                <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-teal-100 py-0.5 pl-2.5 pr-1 text-sm font-medium text-teal-900">
                  {name(pid)}
                  <button type="button" onClick={() => toggle(pid)} aria-label={`Remove ${name(pid)}`} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-teal-700 hover:text-white">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6l-12 12" />
                    </svg>
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-2.5 pt-2.5">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onListKey}
              placeholder="Search pupils"
              aria-label="Search pupils in this class"
              aria-controls={`${id}-list`}
              aria-activedescendant={shown[active] ? `${id}-opt-${active}` : undefined}
              className="min-w-0 flex-1 rounded-lg border border-gold-light/70 px-3 py-1.5 text-sm"
            />
            <span className="text-xs tabular-nums text-ink/65">
              {selected.size} of {roster?.length ?? "…"}
            </span>
            <button type="button" onClick={() => onChange((roster || []).map((p) => p.id))} className="text-xs font-medium text-teal-800 hover:underline">
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} disabled={selected.size === 0} className="text-xs font-medium text-teal-800 hover:underline disabled:text-ink/40 disabled:no-underline">
              Clear
            </button>
          </div>
          <ul ref={listRef} id={`${id}-list`} role="listbox" aria-multiselectable="true" aria-label="Pupils" className="mt-2 max-h-52 overflow-y-auto px-1.5 pb-1.5">
            {roster === null && <li className="px-2 py-2 text-sm text-ink/65">Loading pupils…</li>}
            {roster && shown.length === 0 && <li className="px-2 py-2 text-sm text-ink/65">{roster.length === 0 ? "No pupils are enrolled in this class yet." : `No pupil matches "${query.trim()}".`}</li>}
            {shown.map((p, i) => {
              const on = selected.has(p.id);
              return (
                <li
                  key={p.id}
                  id={`${id}-opt-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={on}
                  onMouseMove={() => setActive(i)}
                  onClick={() => toggle(p.id)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${i === active ? "bg-cream" : ""} ${on ? "font-medium text-ink" : "text-ink/80"}`}
                >
                  <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-teal-700 bg-teal-700 text-white" : "border-ink/30 bg-white"}`}>
                    {on && (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  {p.name}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
