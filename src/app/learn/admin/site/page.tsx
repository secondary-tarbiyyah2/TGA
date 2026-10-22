"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { useLearnSession } from "@/lib/learn/session";
import { visibleAdminSections } from "@/lib/learn/nav";

/**
 * Moodle's "Site administration" page: one place listing every admin
 * tool, with a search box and a tab per category. Replaces the seven
 * dropdown menus that used to crowd the admin top bar.
 */
function SiteAdminContent() {
  const { roles } = useLearnSession();
  const sections = useMemo(() => visibleAdminSections(roles.map((r) => r.role)), [roles]);
  const [tab, setTab] = useState<string>("All");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const shown = sections
    .filter((s) => tab === "All" || s.label === tab)
    .map((s) => ({ ...s, items: s.items.filter((i) => !q || `${i.label} ${i.hint || ""} ${s.label}`.toLowerCase().includes(q)) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Site administration" }]} title="Site administration" />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search site administration"
        aria-label="Search site administration"
        className="mb-4 w-full max-w-md border border-gold-light px-3 py-2 text-sm"
      />

      <nav aria-label="Administration categories" className="mb-6 flex gap-1 overflow-x-auto border-b border-gold-light">
        {["All", ...sections.map((s) => s.label)].map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(label)}
            aria-current={tab === label ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-[3px] px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === label ? "border-teal-700 text-ink" : "border-transparent text-ink/65 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="text-sm text-ink/65">Nothing matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="space-y-4">
          {shown.map((s) => (
            <section key={s.label} className="grid gap-4 rounded-2xl border border-gold-light bg-white p-5 md:grid-cols-[200px_minmax(0,1fr)]">
              <h2 className="text-base font-semibold text-ink">{s.label}</h2>
              <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {s.items.map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} className="group block rounded-lg px-2 py-1.5 hover:bg-cream">
                      <span className="block text-sm font-medium text-teal-700 group-hover:underline">{i.label}</span>
                      {i.hint && <span className="block text-xs text-ink/65">{i.hint}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export default function SiteAdminPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <SiteAdminContent />
      </LearnGate>
    </section>
  );
}
