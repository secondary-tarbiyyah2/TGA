"use client";

import Link from "next/link";
import { useState } from "react";
import type { FaqEntry } from "@/content/seed";
import { FaqAnswer } from "@/components/FaqAnswer";
import { faqSlug } from "@/lib/faq";

export function FaqPreview({ entries }: { entries: FaqEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(entries[0]?._id ?? null);

  return (
    <ul className="divide-y divide-gold-light/40 overflow-hidden rounded-2xl border border-gold-light/50 bg-white">
      {entries.map((e) => {
        const open = openId === e._id;
        return (
          <li key={e._id}>
            <h3>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : e._id)}
                aria-expanded={open}
                aria-controls={`faq-preview-${e._id}`}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gold-50"
                style={{ minHeight: 48 }}
              >
                <span className="font-medium text-ink">{e.question}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className={`mt-0.5 h-5 w-5 shrink-0 text-gold-700 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </h3>
            <div id={`faq-preview-${e._id}`} hidden={!open} className="px-5 pb-5 text-sm text-ink/70">
              <FaqAnswer answer={e.answer} />
              <Link href={`/faqs#${faqSlug(e.question)}`} className="mt-3 inline-block text-sm font-semibold text-gold-700 hover:text-gold-900">
                Read the full answer
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
