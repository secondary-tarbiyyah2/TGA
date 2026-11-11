"use client";

import { Loading } from "@/components/learn/kit";
import Link from "next/link";
import { CLOSURE_LABEL, type ClosureRow, type TermRow, dayInfo } from "./useCalendarTerms";
import { addDays, formatHijri, toHijri } from "@/lib/learn/hijri";
import { localDateKey } from "@/lib/learn/calendar";
import type { DayItem } from "./useCalendarData";
import { CATEGORIES, CAT, itemColour, sortDay } from "./calendarUtils";
import { Icon } from "@/components/learn/Icon";
import { ui } from "@/components/learn/ui";

export function parseKey(k: string): Date {
  return new Date(`${k}T12:00:00`);
}
export function gregLong(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function shiftKey(k: string, n: number): string {
  return localDateKey(addDays(parseKey(k), n));
}

function openLabel(i: DayItem): string {
  if (i.kind === "lesson") return "Open lesson";
  if (i.kind === "homework") return "Open homework";
  if (i.kind === "assessment") return "Open class";
  return "Open";
}

/** One item: a bar in its category colour, the time, title, where and who, and its actions. */
export function ItemCard({ item, onEdit }: { item: DayItem; onEdit?: (i: DayItem) => void }) {
  const colour = itemColour(item);
  const meta = [item.subject && item.subject !== item.title ? item.subject : null, item.teacherName, item.room].filter(Boolean).join(" · ");
  const when = item.time ? (item.endTime ? `${item.time} to ${item.endTime}` : item.kind === "homework" ? `Due ${item.time}` : item.time) : item.kind === "lesson" ? null : "All day";
  return (
    <li className="relative rounded-lg border border-gold-light bg-white py-2.5 pl-4 pr-3">
      <span aria-hidden="true" className="absolute inset-y-2 left-1.5 w-1 rounded-full" style={{ backgroundColor: colour }} />
      <p className="flex items-baseline justify-between gap-2 text-xs text-ink-500">
        <span>{when}</span>
        <span className="font-medium" style={{ color: colour }}>
          {CAT[item.category].short}
        </span>
      </p>
      <p className="text-sm font-semibold text-ink">{item.title}</p>
      {(item.className && item.className !== item.title) || item.childName ? (
        <p className="text-xs text-ink-500">{[item.className !== item.title ? item.className : null, item.childName].filter(Boolean).join(" · ")}</p>
      ) : null}
      {meta && <p className="mt-0.5 text-xs text-ink-500">{meta}</p>}
      {item.note && <p className="mt-1 line-clamp-3 text-xs text-ink-700">{item.note}</p>}
      {(item.href || item.joinUrl || onEdit) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.href && (
            <Link href={item.href} className={`${ui.btnSecondary} ${ui.sm}`}>
              {openLabel(item)}
            </Link>
          )}
          {item.joinUrl && (
            <a href={item.joinUrl} target="_blank" rel="noopener noreferrer" className={`${ui.btnSecondary} ${ui.sm}`}>
              <Icon name="externalLink" size="sm" /> {item.kind === "lesson" ? "Join" : "Open link"}
            </a>
          )}
          {onEdit && (
            <button type="button" onClick={() => onEdit(item)} className={`${ui.btnGhost} ${ui.sm}`}>
              <Icon name="pencil" size="sm" /> Edit
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Everything on one date: Hijri and Gregorian, term or closure, then the items by category. */
export function DayPanel({
  dateKey,
  items,
  loading,
  terms,
  closures,
  isToday,
  onShift,
  onToday,
  onClose,
  onAdd,
  canEdit,
  onEdit,
  headingId,
}: {
  dateKey: string;
  items: DayItem[];
  loading: boolean;
  terms: TermRow[] | null;
  closures: ClosureRow[];
  isToday: boolean;
  onShift: (n: number) => void;
  onToday: () => void;
  onClose?: () => void;
  /** Staff: add an entry on this day. */
  onAdd?: () => void;
  canEdit?: (i: DayItem) => boolean;
  onEdit?: (i: DayItem) => void;
  headingId: string;
}) {
  const d = parseKey(dateKey);
  const h = toHijri(d);
  const info = dayInfo(dateKey, terms, closures);
  const status = info.closure.length ? `${info.closure[0].name} (${CLOSURE_LABEL[info.closure[0].kind]})` : info.halfTerm ? "Half-term break" : info.term ? info.term.name : terms && terms.length ? "Outside term time" : null;
  const wd = d.getDay();
  const weekend = wd === 0 || wd === 6;
  const sorted = sortDay(items);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gold-light px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="t-section text-base">
              {gregLong(d)}
            </h3>
            <p className="t-meta">
              {formatHijri(h)}
              {status ? ` · ${status}` : ""}
            </p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close day details" className={ui.btnIcon}>
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1">
          <button type="button" onClick={() => onShift(-1)} aria-label="Previous day" className={ui.btnIcon}>
            <Icon name="chevronLeft" />
          </button>
          <button type="button" onClick={onToday} disabled={isToday} className={`${ui.btnGhost} ${ui.sm}`}>
            Today
          </button>
          <button type="button" onClick={() => onShift(1)} aria-label="Next day" className={ui.btnIcon}>
            <Icon name="chevronRight" />
          </button>
          {onAdd && (
            <button type="button" onClick={onAdd} className={`${ui.btnSecondary} ${ui.sm} ml-auto`}>
              <Icon name="plus" size="sm" /> Add on this day
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-label={`Items on ${gregLong(d)}`}>
        {loading ? (
          <Loading label="Loading" bare />
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-500">{info.closure.length ? "School is closed, nothing scheduled." : weekend ? "Weekend, nothing scheduled." : "Nothing scheduled for this day."}</p>
        ) : (
          CATEGORIES.map((c) => {
            const list = sorted.filter((i) => i.category === c.key);
            if (!list.length) return null;
            return (
              <section key={c.key}>
                <h4 className="t-eyebrow mb-1.5 flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: c.colour }} />
                  {c.label} ({list.length})
                </h4>
                <ul className="space-y-2">
                  {list.map((i) => (
                    <ItemCard key={i.id} item={i} onEdit={onEdit && canEdit?.(i) ? onEdit : undefined} />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
