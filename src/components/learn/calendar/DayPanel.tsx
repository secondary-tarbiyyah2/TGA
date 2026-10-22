"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CLOSURE_LABEL, type ClosureRow, type TermRow, dayInfo } from "./useCalendarTerms";
import { addDays, formatHijri, toHijri } from "@/lib/learn/hijri";
import { localDateKey } from "@/lib/learn/calendar";
import type { DayItem, ItemKind } from "./useCalendarData";
import { itemColour, KIND_LABEL } from "./calendarUtils";

export function parseKey(k: string): Date {
  return new Date(`${k}T12:00:00`);
}
export function gregLong(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function shiftKey(k: string, n: number): string {
  return localDateKey(addDays(parseKey(k), n));
}

const ORDER: ItemKind[] = ["lesson", "homework", "assessment", "announcement"];
const iconBtn = "rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream";

function KindMark({ kind, colour }: { kind: ItemKind; colour: string }) {
  const shape = kind === "lesson" ? "rounded-full" : kind === "homework" ? "rounded-sm" : kind === "assessment" ? "rotate-45 rounded-[2px]" : "rounded-full border-2 bg-transparent";
  return <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 ${shape}`} style={kind === "announcement" ? { borderColor: colour } : { backgroundColor: colour }} />;
}

function ItemCard({ item, colour }: { item: DayItem; colour: string }) {
  const meta = [item.subject && item.subject !== item.title ? item.subject : null, item.teacherName, item.room].filter(Boolean).join(" · ");
  const when = item.time ? (item.endTime ? `${item.time}–${item.endTime}` : item.kind === "homework" ? `Due ${item.time}` : item.time) : null;
  return (
    <li className="rounded-xl border border-gold-light/80 bg-white p-3" style={{ borderLeft: `4px solid ${colour}` }}>
      <div className="flex items-start gap-2.5">
        <KindMark kind={item.kind} colour={colour} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{item.title}</p>
          <p className="text-xs text-ink/65">
            {when}
            {when && item.className && item.className !== item.title ? " · " : ""}
            {item.className && item.className !== item.title ? item.className : ""}
          </p>
          {item.childName && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium" style={{ color: colour }}>
              {item.childName}
            </p>
          )}
          {meta && <p className="mt-0.5 text-xs text-ink/65">{meta}</p>}
          {item.note && <p className="mt-1 line-clamp-3 text-xs text-ink/65">{item.note}</p>}
          {(item.href || item.joinUrl) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.href && (
                <Link href={item.href} className="rounded-lg bg-gold-700 px-3 py-1 text-xs font-semibold text-white hover:bg-gold-900">
                  {item.kind === "lesson" ? "Open lesson" : item.kind === "homework" ? "Open homework" : item.kind === "assessment" ? "Open class" : "Read"}
                </Link>
              )}
              {item.joinUrl && (
                <a href={item.joinUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-green-700 px-3 py-1 text-xs font-semibold text-green-800 hover:bg-green-50">
                  Join link
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Everything on one date: Hijri + Gregorian, term/closure info, then lessons, homework, assessments, announcements. */
export function DayPanel({
  dateKey,
  items,
  loading,
  terms,
  closures,
  childOrder,
  isToday,
  onShift,
  onToday,
  onClose,
  headingId,
}: {
  dateKey: string;
  items: DayItem[];
  loading: boolean;
  terms: TermRow[] | null;
  closures: ClosureRow[];
  childOrder: string[];
  isToday: boolean;
  onShift: (n: number) => void;
  onToday: () => void;
  onClose?: () => void;
  headingId: string;
}) {
  const d = parseKey(dateKey);
  const h = toHijri(d);
  const info = dayInfo(dateKey, terms, closures);
  const banners: { text: string; tone: "green" | "amber" | "red" }[] = [];
  for (const c of info.closure) banners.push({ text: `${c.name} (${CLOSURE_LABEL[c.kind]})${c.notes ? ` — ${c.notes}` : ""}`, tone: "red" });
  if (info.halfTerm && info.term) banners.push({ text: `${info.term.name} · half-term break`, tone: "amber" });
  else if (info.term) banners.push({ text: info.term.name, tone: "green" });
  else if (terms && terms.length) banners.push({ text: "Outside term time", tone: "amber" });
  if (info.boundaryLabel) banners.push({ text: info.boundaryLabel, tone: "green" });
  const tone = { green: "bg-green-50 text-green-900", amber: "bg-amber-50 text-amber-900", red: "bg-red-50 text-red-900" };
  const wd = d.getDay();
  const weekend = wd === 0 || wd === 6;

  return (
    <div className="flex max-h-full flex-col">
      <div className="border-b border-gold-light px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="font-serif text-lg font-semibold leading-tight text-ink">
              {formatHijri(h)}
            </h3>
            <p className="text-sm text-ink/70">{gregLong(d)}</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close day details" className={iconBtn}>
              Close
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => onShift(-1)} aria-label="Previous day" className={iconBtn}>
            ‹
          </button>
          <button type="button" onClick={onToday} disabled={isToday} className={`${iconBtn} disabled:opacity-50`}>
            Today
          </button>
          <button type="button" onClick={() => onShift(1)} aria-label="Next day" className={iconBtn}>
            ›
          </button>
          <span className="ml-auto text-xs text-ink/65">
            {loading ? "Loading…" : `${items.length} item${items.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {banners.length > 0 && (
        <ul className="space-y-1 border-b border-gold-light px-4 py-2">
          {banners.map((b) => (
            <li key={b.text} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${tone[b.tone]}`}>
              {b.text}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-4 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-ink/65">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink/65">{info.closure.length ? "School is closed — nothing scheduled." : weekend ? "Weekend — nothing scheduled." : "Nothing scheduled for this day."}</p>
        ) : (
          ORDER.map((k) => {
            const list = items.filter((i) => i.kind === k);
            if (!list.length) return null;
            return (
              <Section key={k} title={`${KIND_LABEL[k]} (${list.length})`}>
                {list.map((i) => (
                  <ItemCard key={i.id} item={i} colour={itemColour(i, childOrder)} />
                ))}
              </Section>
            );
          })
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink/65">{title}</h4>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

export { ItemCard };
