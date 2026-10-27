"use client";

import { useMemo, useState } from "react";
import type { FaqEntry } from "@/content/seed";

// Grouped by the question a parent actually has, rather than the internal
// DfE-style category (Admissions/Fees/Curriculum/...) · same idea as the
// Policies page's parent-question grouping. Each internal category maps to
// exactly one group; no FAQ content changes, just how it's organised.
const PARENT_GROUPS: { heading: string; categories: string[] }[] = [
  { heading: "Applying, deadlines and open evenings", categories: ["Admissions"] },
  { heading: "The school day", categories: ["School day"] },
  { heading: "Fees and paying", categories: ["Fees"] },
  { heading: "What my child will learn", categories: ["Curriculum"] },
  { heading: "Qur'an, Arabic and Islamic Studies", categories: ["Islamic Studies"] },
  { heading: "Equipment, Teams and the portal", categories: ["Technology"] },
  { heading: "Additional needs and accessibility", categories: ["SEND"] },
  { heading: "Keeping children safe", categories: ["Safeguarding"] },
];

function FaqList({ entries, openId, setOpenId }: { entries: FaqEntry[]; openId: string | null; setOpenId: (id: string | null) => void }) {
  return (
    <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
      {entries.map((e) => {
        const open = openId === e._id;
        return (
          <li key={e._id}>
            <h3>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : e._id)}
                aria-expanded={open}
                aria-controls={`faq-panel-${e._id}`}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-medium text-ink">{e.question}</span>
                <span aria-hidden="true" className={`shrink-0 text-gold transition-transform ${open ? "rotate-45" : ""}`}>+</span>
              </button>
            </h3>
            {open && (
              <div id={`faq-panel-${e._id}`} className="px-5 pb-5 text-sm text-ink/70">
                {e.answer}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FaqAccordion({ entries }: { entries: FaqEntry[] }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q));
  }, [entries, query]);

  const grouped = PARENT_GROUPS.map((g) => ({
    ...g,
    items: filtered.filter((e) => g.categories.includes(e.category)),
  })).filter((g) => g.items.length > 0);

  const groupedCategories = new Set(PARENT_GROUPS.flatMap((g) => g.categories));
  const ungrouped = filtered.filter((e) => !groupedCategories.has(e.category));

  return (
    <div>
      <label className="mb-8 block">
        <span className="sr-only">Search FAQs</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search FAQs…"
          className="w-full rounded-full border border-gold-light/60 px-5 py-2.5 text-sm"
        />
      </label>

      {filtered.length === 0 && <p className="text-ink/70">No FAQs match your search yet.</p>}

      {grouped.map((g) => (
        <div key={g.heading} className="mb-8">
          <h2 className="mb-3 font-serif text-xl font-semibold text-ink">{g.heading}</h2>
          <FaqList entries={g.items} openId={openId} setOpenId={setOpenId} />
        </div>
      ))}

      {ungrouped.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-serif text-xl font-semibold text-ink">Other questions</h2>
          <FaqList entries={ungrouped} openId={openId} setOpenId={setOpenId} />
        </div>
      )}
    </div>
  );
}
