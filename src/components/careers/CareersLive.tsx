"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CONTRACT_LABELS, VACANCY_PUBLIC_COLUMNS, lines, longDate, type Vacancy } from "@/lib/careers";

/**
 * The open roles, read live from the database (anyone may read OPEN roles
 * whose closing date has not passed, migration 0182), so a role the school
 * opens in the portal appears here straight away with no site rebuild.
 */
export function CareersLive({ email }: { email: string }) {
  const [roles, setRoles] = useState<Vacancy[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setFailed(true);
      setRoles([]);
      return () => undefined;
    }
    let cancelled = false;
    void supabase
      .from("job_vacancies")
      .select(VACANCY_PUBLIC_COLUMNS)
      .eq("status", "open")
      .or(`closing_date.is.null,closing_date.gte.${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" })}`)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setFailed(true);
        const list = (data as Vacancy[] | null) || [];
        setRoles(list);
        // Opening /careers/#role-slug expands that role.
        const hash = window.location.hash.replace(/^#role-/, "");
        if (hash && list.some((r) => r.slug === hash)) setOpen(hash);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => load(), [load]);

  if (roles === null) {
    return <p role="status" aria-live="polite" className="rounded-2xl border border-gold-light/50 bg-white p-6 text-ink/70">Loading the current vacancies…</p>;
  }

  if (roles.length === 0) {
    return (
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <p className="font-serif text-lg font-semibold text-ink">{failed ? "We couldn't load the vacancies just now." : "There are no advertised vacancies at the moment."}</p>
        <p className="mt-2 text-ink/75">
          We are always glad to hear from excellent teachers. You can{" "}
          <Link href="/careers/apply/?role=general" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">send a general application</Link>{" "}
          and we will keep it on file for the next suitable role, or email{" "}
          <a href={`mailto:${email}`} className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">{email}</a>.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {roles.map((r) => {
        const expanded = open === r.slug;
        const panelId = `role-panel-${r.slug}`;
        const facts = [r.department, CONTRACT_LABELS[r.contract_type], r.hours_text, r.location_text].filter(Boolean) as string[];
        return (
          <li key={r.id} id={`role-${r.slug}`} className="scroll-mt-24 rounded-2xl border border-gold-light/60 bg-white">
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-serif text-xl font-semibold text-ink">{r.title}</h3>
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label="Role details">
                    {facts.map((f) => (
                      <li key={f} className="rounded-full bg-gold-50 px-3 py-1 text-xs font-medium text-ink/80 ring-1 ring-gold-light/60">{f}</li>
                    ))}
                  </ul>
                </div>
                {r.closing_date && <p className="text-sm text-ink/70">Closes <strong className="text-ink">{longDate(r.closing_date)}</strong></p>}
              </div>
              {r.summary && <p className="mt-3 max-w-prose text-ink/80">{r.summary}</p>}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/careers/apply/?role=${encodeURIComponent(r.slug)}`} className="inline-flex min-h-11 items-center rounded-lg bg-gold-500 px-5 py-2 font-semibold text-ink-900 hover:bg-gold-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
                  Apply for this role
                </Link>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? null : r.slug)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-gold-500 bg-white px-5 py-2 font-semibold text-ink hover:bg-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                >
                  {expanded ? "Hide the details" : "Read the full details"}
                </button>
              </div>
            </div>
            {expanded && (
              <div id={panelId} className="space-y-5 border-t border-gold-light/60 bg-cream/50 p-5 sm:p-6">
                {r.description && <p className="max-w-prose whitespace-pre-line text-ink/85">{r.description}</p>}
                <RoleList title="What you will do" text={r.responsibilities} />
                <RoleList title="What we are looking for" text={r.requirements} />
                <RoleList title="It would be good if you also have" text={r.desirable} />
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {r.salary_text && <Fact term="Pay" value={r.salary_text} />}
                  {r.start_text && <Fact term="Start" value={r.start_text} />}
                  {r.hours_text && <Fact term="Hours" value={r.hours_text} />}
                  <Fact term="Where" value={r.location_text} />
                </dl>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RoleList({ title, text }: { title: string; text: string }) {
  const items = lines(text);
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="font-semibold text-ink">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/85">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-ink/65">{term}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
