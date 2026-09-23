"use client";

import { useMemo, useState } from "react";
import type { FaqEntry } from "@/content/seed";
import { faqCategories } from "@/content/seed";

export function FaqAccordion({ entries }: { entries: FaqEntry[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const matchesCategory = category === "All" || e.category === category;
      const matchesQuery = !q || e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [entries, query, category]);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">Search FAQs</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search FAQs…"
            className="w-full rounded-full border border-gold-light/60 px-5 py-2.5 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {["All", ...faqCategories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                category === c ? "bg-gold-500 text-ink-900" : "bg-cream text-ink/70 hover:bg-gold-light/50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && <p className="text-ink/60">No FAQs match your search yet.</p>}

      <ul className="divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
        {filtered.map((e) => {
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
    </div>
  );
}
