"use client";

import Link from "next/link";
import { useState } from "react";
import type { FaqEntry } from "@/content/seed";
import { FaqAnswer } from "@/components/FaqAnswer";
import { faqSlug } from "@/lib/faq";

export function FaqPreview({ entries }: { entries: FaqEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(entries[0]?._id ?? null);

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
                aria-controls={`faq-preview-${e._id}`}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                style={{ minHeight: 48 }}
              >
                <span className="font-medium text-ink">{e.question}</span>
                <span aria-hidden="true" className={`shrink-0 text-gold-500 transition-transform ${open ? "rotate-45" : ""}`}>+</span>
              </button>
            </h3>
            <div id={`faq-preview-${e._id}`} hidden={!open} className="px-5 pb-5 text-sm text-ink/70">
              <FaqAnswer answer={e.answer} />
              <Link href={`/faqs#${faqSlug(e.question)}`} className="mt-3 inline-block text-xs font-medium text-gold-700 hover:text-gold-900">
                Open in FAQs
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
