"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Directory } from "./useCalendarData";
import { CHILD_COLOURS, type CalView } from "./calendarUtils";

const chip = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm";
const chipOff = "border-gold-light bg-white text-ink/75 hover:bg-cream";
const chipOn = "border-green-700 bg-green-700 text-white";

function Chip({ active, onClick, children, colour }: { active: boolean; onClick: () => void; children: ReactNode; colour?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`${chip} ${active ? chipOn : chipOff}`}>
      {colour && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full ring-1 ring-white/70" style={{ backgroundColor: colour }} />}
      {children}
    </button>
  );
}

/** A chip that opens a small search box + short result list (no giant dropdown). */
function SearchChip({
  label,
  placeholder,
  options,
  selectedId,
  onPick,
}: {
  label: string;
  placeholder: string;
  options: { id: string; name: string; hint?: string }[];
  selectedId: string | null;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === selectedId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return options.filter((o) => !needle || o.name.toLowerCase().includes(needle) || (o.hint || "").toLowerCase().includes(needle)).slice(0, 40);
  }, [options, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((o) => !o);
          setQ("");
        }}
        className={`${chip} ${selected ? chipOn : chipOff}`}
      >
        {selected ? `${label}: ${selected.name}` : `${label}…`}
        {selected && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label.toLowerCase()} filter`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(null);
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onPick(null);
              }
            }}
            className="ml-0.5 rounded-full px-1 leading-none hover:bg-white/20"
          >
            ×
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gold-light bg-white p-2 shadow-lg">
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full rounded-lg border border-gold-light px-3 py-2 text-sm outline-none focus:border-green-600"
          />
          <ul role="listbox" aria-label={label} className="mt-1 max-h-56 overflow-y-auto">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-ink/55">No matches.</li>}
            {shown.map((o) => (
              <li key={o.id} role="option" aria-selected={o.id === selectedId}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(o.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-baseline justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-cream"
                >
                  <span className="truncate text-ink">{o.name}</span>
                  {o.hint && <span className="shrink-0 text-xs text-ink/65">{o.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
          {options.length > 40 && !q && <p className="px-3 pt-1 text-[11px] text-ink/65">Type to search all {options.length}.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Role-aware "whose calendar" filter:
 *  parent  -> All children + one coloured chip per child
 *  teacher -> All my classes + class chips
 *  staff   -> Whole school + searchable child / class / teacher pickers
 */
export function ViewFilter({
  role,
  directory,
  view,
  onChange,
}: {
  role: "parent" | "teacher" | "staff";
  directory: Directory;
  view: CalView;
  onChange: (v: CalView) => void;
}) {
  if (role === "parent") {
    if (directory.children.length < 2) return null;
    return (
      <div role="group" aria-label="Filter by child" className="flex flex-wrap gap-2">
        <Chip active={view.kind === "all"} onClick={() => onChange({ kind: "all" })}>
          All children
        </Chip>
        {directory.children.map((c, i) => (
          <Chip key={c.id} active={view.kind === "child" && view.id === c.id} onClick={() => onChange({ kind: "child", id: c.id })} colour={CHILD_COLOURS[i % CHILD_COLOURS.length]}>
            {c.name}
          </Chip>
        ))}
      </div>
    );
  }
  if (role === "teacher") {
    if (directory.classes.length < 2) return null;
    return (
      <div role="group" aria-label="Filter by class" className="flex flex-wrap gap-2">
        <Chip active={view.kind === "all"} onClick={() => onChange({ kind: "all" })}>
          All my classes
        </Chip>
        {directory.classes.length <= 8 ? (
          directory.classes.map((c) => (
            <Chip key={c.id} active={view.kind === "class" && view.id === c.id} onClick={() => onChange({ kind: "class", id: c.id })}>
              {c.name}
            </Chip>
          ))
        ) : (
          <SearchChip
            label="Class"
            placeholder="Search your classes"
            options={directory.classes.map((c) => ({ id: c.id, name: c.name, hint: c.yearGroup || undefined }))}
            selectedId={view.kind === "class" ? view.id : null}
            onPick={(id) => onChange(id ? { kind: "class", id } : { kind: "all" })}
          />
        )}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Choose whose calendar to view" className="flex flex-wrap items-center gap-2">
      <Chip active={view.kind === "all"} onClick={() => onChange({ kind: "all" })}>
        Whole school
      </Chip>
      <SearchChip
        label="Child"
        placeholder="Search pupils by name"
        options={directory.children.map((c) => ({ id: c.id, name: c.name }))}
        selectedId={view.kind === "child" ? view.id : null}
        onPick={(id) => onChange(id ? { kind: "child", id } : { kind: "all" })}
      />
      <SearchChip
        label="Class"
        placeholder="Search classes"
        options={directory.classes.map((c) => ({ id: c.id, name: c.name, hint: c.yearGroup || undefined }))}
        selectedId={view.kind === "class" ? view.id : null}
        onPick={(id) => onChange(id ? { kind: "class", id } : { kind: "all" })}
      />
      <SearchChip
        label="Teacher"
        placeholder="Search teachers"
        options={directory.teachers.map((t) => ({ id: t.id, name: t.name }))}
        selectedId={view.kind === "teacher" ? view.id : null}
        onPick={(id) => onChange(id ? { kind: "teacher", id } : { kind: "all" })}
      />
    </div>
  );
}
