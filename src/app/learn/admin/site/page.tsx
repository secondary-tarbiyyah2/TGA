"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { useLearnSession } from "@/lib/learn/session";
import { SUB_PAGES, visibleAdminSections } from "@/lib/learn/nav";
import { ui } from "@/components/learn/ui";

/**
 * Moodle's "Site administration" page: one place listing every admin
 * tool, with a search box and a tab per category. Replaces the seven
 * dropdown menus that used to crowd the admin top bar.
 */
function SiteAdminContent() {
  const { roles } = useLearnSession();
  const sections = useMemo(
    () => visibleAdminSections(roles.map((r) => r.role)).map((s) => ({ ...s, items: s.items.flatMap((i) => [i, ...(SUB_PAGES[i.href] || []).map((c) => ({ ...c, sub: true }))]) })),
    [roles],
  );
  const [tab, setTab] = useState<string>("All");
  const [query, setQuery] = useState("");
  const router = useRouter();

  const q = query.trim().toLowerCase();
  // A search looks through every category, not just the open tab, so a
  // match is never hidden behind the wrong tab.
  const shown = sections
    .filter((s) => q || tab === "All" || s.label === tab)
    .map((s) => ({ ...s, items: s.items.filter((i) => !q || `${i.label} ${i.hint || ""} ${s.label}`.toLowerCase().includes(q)) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      <PageHeader crumbs={[{ label: "Today", href: "/admin/dashboard" }, { label: "Site administration" }]} title="Site administration" subtitle="Every admin page in one place. Search, or pick a category." />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter opens the first match.
          const first = shown[0]?.items[0];
          if (e.key === "Enter" && q && first) router.push(first.href);
        }}
        placeholder="Search site administration"
        aria-label="Search site administration"
        className={`${ui.input} mb-4 max-w-md`}
      />
      {q && shown.length > 0 && <p className="-mt-2 mb-4 text-xs text-ink/65">Searching every category. Press Enter to open the first match.</p>}

      <nav aria-label="Administration categories" className={`mb-6 flex gap-1 overflow-x-auto border-b border-gold-light ${q ? "opacity-50" : ""}`}>
        {["All", ...sections.map((s) => s.label)].map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setTab(label);
              setQuery("");
            }}
            aria-current={tab === label && !q ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium transition-colors ${
              tab === label && !q ? "border-teal-700 text-ink" : "border-transparent text-ink/65 hover:text-ink"
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
                  <li key={i.href} className={"sub" in i && i.sub ? "sm:pl-4" : undefined}>
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
