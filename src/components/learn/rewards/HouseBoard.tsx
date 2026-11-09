"use client";

import { useMemo, useState, type DragEvent } from "react";
import { Select } from "@/components/learn/Select";

// Kanban-style house assignment: one card per house (plus "No house"), each
// pupil a small tile. Drag a tile (or the whole ticked selection) onto
// another house, or tick pupils and use "Move selected to…" (which also works
// by keyboard and on touch screens, where dragging is unreliable).

export type BoardHouse = { id: string; name: string; colour: string; active: boolean };
export type BoardChild = { id: string; name: string; parent_user_id: string; year_groups: { name: string } | null };

const HEX = /^#[0-9A-Fa-f]{6}$/;
const NONE = "";
const FIRST = 60;
const DRAG_TYPE = "application/x-tga-children";

export function HouseBoard({
  houses,
  pupils: children,
  members,
  busy,
  onMove,
  onAutoAssign,
}: {
  houses: BoardHouse[];
  pupils: BoardChild[];
  members: Map<string, string>;
  busy: boolean;
  onMove: (childIds: string[], houseId: string) => void;
  onAutoAssign: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const years = useMemo(() => [...new Set(children.map((c) => c.year_groups?.name).filter((y): y is string => !!y))].sort(), [children]);

  const columns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = children.filter((c) => (!q || c.name.toLowerCase().includes(q)) && (!year || c.year_groups?.name === year));
    const byHouse = new Map<string, BoardChild[]>();
    for (const c of visible) {
      const h = members.get(c.id) || NONE;
      byHouse.set(h, [...(byHouse.get(h) || []), c]);
    }
    const totals = new Map<string, number>();
    members.forEach((h) => totals.set(h, (totals.get(h) || 0) + 1));
    const cols: { id: string; name: string; colour: string; archived: boolean; kids: BoardChild[]; total: number }[] = [];
    const unassignedTotal = children.filter((c) => !members.has(c.id)).length;
    cols.push({ id: NONE, name: "No house", colour: "#9CA3AF", archived: false, kids: byHouse.get(NONE) || [], total: unassignedTotal });
    for (const h of houses) {
      if (!h.active && !(totals.get(h.id) || 0)) continue;
      cols.push({ id: h.id, name: h.name, colour: HEX.test(h.colour) ? h.colour : "#B08E45", archived: !h.active, kids: byHouse.get(h.id) || [], total: totals.get(h.id) || 0 });
    }
    return cols;
  }, [children, houses, members, search, year]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleColumn = (kids: BoardChild[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = kids.length > 0 && kids.every((k) => next.has(k.id));
      kids.forEach((k) => (all ? next.delete(k.id) : next.add(k.id)));
      return next;
    });

  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const moveSelected = () => {
    if (target === null || selected.size === 0) return;
    onMove([...selected], target);
    setSelected(new Set());
    setTarget(null);
  };

  const drop = (houseId: string, e: DragEvent) => {
    e.preventDefault();
    setOverCol(null);
    let ids: string[] = [];
    try {
      ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as string[];
    } catch {
      return;
    }
    ids = ids.filter((id) => (members.get(id) || NONE) !== houseId);
    if (ids.length === 0) return;
    onMove(ids, houseId);
    setSelected(new Set());
  };

  const activeHouses = houses.filter((h) => h.active);

  return (
    <section className="rounded-2xl border border-gold-light/50 bg-white p-4" aria-labelledby="house-board-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="house-board-h" className="text-base font-semibold text-ink">
            Assign children
          </h2>
          <p className="text-xs text-ink/65">Drag a child onto a house, or tick several and use Move selected. Siblings are placed together by auto-assign.</p>
        </div>
        <button type="button" disabled={busy} onClick={onAutoAssign} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-xs font-semibold text-ink/80 hover:bg-cream disabled:opacity-50">
          Auto-assign everyone without a house
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" aria-label="Search children" className="rounded-lg border border-gold-light px-3 py-1.5" />
        {years.length > 1 && (
          <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year group" className="rounded-lg border border-gold-light bg-white px-2 py-1.5">
            <option value="">All year groups</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        )}
        <span className="text-xs text-ink/65">{columns[0].total > 0 ? `${columns[0].total} without a house` : "Everyone has a house"}</span>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Selected children" className="sticky top-[68px] z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm shadow-sm">
          <strong className="text-teal-900">{selected.size} selected</strong>
          <label className="flex items-center gap-1.5 text-xs text-ink/70">
            Move selected to
            <Select value={target ?? "__"} onChange={(e) => setTarget(e.target.value === "__" ? null : e.target.value)} className="rounded-lg border border-gold-light bg-white px-2 py-1 text-sm">
              <option value="__">Choose…</option>
              {activeHouses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
              <option value={NONE}>No house</option>
            </Select>
          </label>
          <button type="button" disabled={busy || target === null} onClick={moveSelected} className="rounded-lg bg-gold-700 px-3 py-1 text-xs font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            Move
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-ink/70 underline">
            Clear
          </button>
        </div>
      )}

      {houses.filter((h) => h.active).length === 0 && <p className="mt-3 text-sm text-ink/65">Add a house above to start assigning children.</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {columns.map((col) => {
          const isCollapsed = collapsed.has(col.id);
          const allTicked = col.kids.length > 0 && col.kids.every((k) => selected.has(k.id));
          const showAll = expanded.has(col.id);
          const kids = showAll ? col.kids : col.kids.slice(0, FIRST);
          const droppable = col.id === NONE || !col.archived;
          return (
            <div
              key={col.id || "none"}
              onDragOver={(e) => {
                if (!droppable || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overCol !== col.id) setOverCol(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverCol((c) => (c === col.id ? null : c));
              }}
              onDrop={(e) => droppable && drop(col.id, e)}
              className={`rounded-xl border bg-cream/30 transition-colors ${overCol === col.id ? "border-teal-500 bg-teal-50/60 ring-2 ring-teal-300" : "border-gold-light/60"}`}
              style={{ borderTop: `4px solid ${col.colour}` }}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <input type="checkbox" checked={allTicked} disabled={col.kids.length === 0} onChange={() => toggleColumn(col.kids)} aria-label={`Select everyone shown in ${col.name}`} />
                <button type="button" aria-expanded={!isCollapsed} onClick={() => setCollapsed((s) => flip(s, col.id))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="truncate text-sm font-semibold text-ink">{col.name}</span>
                  {col.archived && <span className="rounded bg-ink/5 px-1.5 py-px text-[10px] text-ink/65">archived</span>}
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-ink/70">{col.total}</span>
                  <span aria-hidden="true" className="text-xs text-ink/65">
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                  <span className="sr-only">{isCollapsed ? "Expand" : "Collapse"}</span>
                </button>
              </div>
              {!isCollapsed && (
                <>
                  <ul className="max-h-80 min-h-[3.5rem] space-y-1 overflow-y-auto px-2 pb-2" aria-label={`Children in ${col.name}`}>
                    {kids.map((c) => {
                      const on = selected.has(c.id);
                      return (
                        <li
                          key={c.id}
                          draggable
                          onDragStart={(e) => {
                            const ids = on ? [...selected] : [c.id];
                            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
                            e.dataTransfer.setData("text/plain", ids.length > 1 ? `${ids.length} children` : c.name);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setOverCol(null)}
                          className={`flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1 text-sm active:cursor-grabbing ${on ? "border-teal-400 bg-teal-50" : "border-gold-light/50 bg-white"}`}
                        >
                          <input type="checkbox" checked={on} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} />
                          <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                          {c.year_groups?.name && <span className="shrink-0 text-[11px] text-ink/65">{c.year_groups.name}</span>}
                        </li>
                      );
                    })}
                    {col.kids.length === 0 && <li className="px-1 py-2 text-xs text-ink/65">{col.total === 0 ? "Drop children here." : "No matches."}</li>}
                  </ul>
                  {col.kids.length > FIRST && (
                    <button type="button" onClick={() => setExpanded((s) => flip(s, col.id))} className="mb-2 ml-3 text-xs font-medium text-ink/70 underline">
                      {showAll ? "Show fewer" : `Show all ${col.kids.length}`}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
