"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { Card } from "@/components/learn/Card";
import { MAIN_SITE_ORIGIN } from "@/lib/learn/origin";

// Deliberately links out to Sanity Studio rather than duplicating an editor
// here: Studio already provides a complete, working UI for every one of
// these documents, with its own separate, already-working access control
// (Sanity project membership) — building a second editor for the same data
// would mean keeping two UIs in sync forever for no new capability.
const EDITABLE_SECTIONS = ["Site settings (contact details, fees, key dates)", "Homepage content", "About page content", "Curriculum page content", "Curriculum documents", "Policy documents"];

export default function AdminWebsitecontentPage() {
  const studioUrl = `${MAIN_SITE_ORIGIN}/studio`;
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <Card title="Website content" description="Edited in Sanity Studio, the CMS behind the public site.">
            <p className="text-sm text-ink/70">Studio covers:</p>
            <ul className="mt-2 space-y-1 text-sm text-ink/70">
              {EDITABLE_SECTIONS.map((s) => (
                <li key={s} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1 text-gold-700">
                    ◆
                  </span>
                  {s}
                </li>
              ))}
            </ul>
            <a
              href={studioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-lg bg-gold-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gold-900 transition-colors"
            >
              Open Sanity Studio →
            </a>
            <p className="mt-2 text-xs text-ink/50">Opens in a new tab. Sign-in there is separate from your /learn account.</p>
          </Card>
        </AdminShell>
      </LearnGate>
    </section>
  );
}
