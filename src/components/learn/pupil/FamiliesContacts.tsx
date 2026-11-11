"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";
import { Loading, SidePanel } from "@/components/learn/kit";
import { Button, ButtonLink, EmptyState, Notice, Status, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";
import { saveCsv, toCsv } from "@/lib/learn/csv";
import { CONTACT_SELECT, type EmergencyContact } from "./data";

type Child = { id: string; name: string; parent_user_id: string | null; year_groups: { name: string } | null };
type Parent = { id: string; full_name: string | null; email: string | null };
type Issue = "no_parent" | "no_email" | "no_phone" | "no_contact" | "one_contact" | "no_pr";
type Family = { child: Child; parent: Parent | null; contacts: EmergencyContact[]; issues: Issue[] };

const ISSUE: Record<Issue, { label: string; help: string }> = {
  no_parent: { label: "No parent linked", help: "No parent sign-in is linked to the pupil." },
  no_email: { label: "No parent email", help: "The parent's account, and every contact with parental responsibility, has no email address." },
  no_phone: { label: "No phone number", help: "No contact has a phone number." },
  no_contact: { label: "No emergency contact", help: "The family has not added an emergency contact." },
  one_contact: { label: "Only one contact", help: "Two emergency contacts are expected." },
  no_pr: { label: "No one with parental responsibility", help: "No contact is marked as having parental responsibility." },
};
const ORDER: Issue[] = ["no_parent", "no_email", "no_phone", "no_contact", "one_contact", "no_pr"];

function issuesFor(c: Child, p: Parent | null, contacts: EmergencyContact[]): Issue[] {
  const out: Issue[] = [];
  if (!c.parent_user_id) out.push("no_parent");
  const prEmail = contacts.some((x) => x.parental_responsibility && (x.email || "").trim());
  if (!(p?.email || "").trim() && !prEmail) out.push("no_email");
  if (!contacts.some((x) => (x.phone || x.alt_phone || "").trim())) out.push("no_phone");
  if (contacts.length === 0) out.push("no_contact");
  else if (contacts.length === 1) out.push("one_contact");
  if (contacts.length > 0 && !contacts.some((x) => x.parental_responsibility)) out.push("no_pr");
  return out;
}

const tel = (n: string) => `tel:${n.replace(/\s+/g, "")}`;

/**
 * Families and contacts (owner feedback 3, 11 Nov 2026): who to reach for every pupil, and what is missing.
 * Counts at the top filter the list; a family opens beside it with the parent's sign-in and every emergency
 * contact (relationship, parental responsibility, phone and email). Built from the same records as a pupil's
 * Details and contacts; the head teacher and admin only.
 */
export function FamiliesContacts() {
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<Issue | "">("");
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const [k, c] = await Promise.all([
        supabase.from("children").select("id, name, parent_user_id, year_groups(name)").order("name").limit(2000),
        supabase.from("pupil_emergency_contacts").select(CONTACT_SELECT).order("priority").limit(5000),
      ]);
      const kids = (k.data as unknown as Child[] | null) || [];
      const ids = [...new Set(kids.map((x) => x.parent_user_id).filter(Boolean) as string[])];
      const p = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [], error: null };
      if (!alive) return;
      if (k.error || c.error || p.error) setError("Some of this couldn't load.");
      const parents = new Map(((p.data as Parent[] | null) || []).map((x) => [x.id, x]));
      const byChild = new Map<string, EmergencyContact[]>();
      for (const x of (c.data as unknown as EmergencyContact[] | null) || []) byChild.set(x.child_id, [...(byChild.get(x.child_id) || []), x]);
      setFamilies(
        kids.map((child) => {
          const parent = child.parent_user_id ? parents.get(child.parent_user_id) || null : null;
          const contacts = byChild.get(child.id) || [];
          return { child, parent, contacts, issues: issuesFor(child, parent, contacts) };
        }),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const years = useMemo(() => [...new Set((families || []).map((f) => f.child.year_groups?.name).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true })), [families]);
  const inYear = (families || []).filter((f) => !year || f.child.year_groups?.name === year);
  const count = (i: Issue) => inYear.filter((f) => f.issues.includes(i)).length;
  const needle = q.trim().toLowerCase();
  const shown = inYear.filter(
    (f) =>
      (!only || f.issues.includes(only)) &&
      (!needle || f.child.name.toLowerCase().includes(needle) || (f.parent?.full_name || "").toLowerCase().includes(needle) || f.contacts.some((c) => c.name.toLowerCase().includes(needle))),
  );
  const current = open ? (families || []).find((f) => f.child.id === open) || null : null;
  const at = current ? shown.findIndex((f) => f.child.id === current.child.id) : -1;

  const download = () => {
    const rows: (string | number | null)[][] = [];
    for (const f of shown) {
      const base = [f.child.name, f.child.year_groups?.name || "", f.parent?.full_name || "", f.parent?.email || "", f.issues.map((i) => ISSUE[i].label).join("; ")];
      if (f.contacts.length === 0) rows.push([...base, "", "", "", "", "", ""]);
      for (const c of f.contacts) rows.push([...base, c.name, c.relationship || "", c.parental_responsibility ? "Yes" : "No", c.phone || "", c.alt_phone || "", c.email || ""]);
    }
    saveCsv(
      `families-and-contacts${year ? `-${year.toLowerCase().replace(/\s+/g, "-")}` : ""}.csv`,
      toCsv(["Pupil", "Year", "Parent account", "Parent email", "Missing", "Contact", "Relationship", "Parental responsibility", "Phone", "Other phone", "Contact email"], rows),
    );
  };

  return (
    <>
      <PageHeader
        title="Families and contacts"
        subtitle="Who to reach for every pupil, and what is missing. Press a pupil to see their family's details."
        action={
          <Button icon="download" onClick={download} disabled={!families || shown.length === 0}>
            Download CSV
          </Button>
        }
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {families === null ? (
        <Loading label="Loading families" bare />
      ) : (
        <div className="space-y-4">
          <div role="group" aria-label="What is missing" className="grid grid-cols-2 border-y border-gold-light sm:grid-cols-3 lg:grid-cols-6" data-guide="families-counts">
            {ORDER.map((i, n) => (
              <button
                key={i}
                type="button"
                aria-pressed={only === i}
                onClick={() => setOnly(only === i ? "" : i)}
                title={ISSUE[i].help}
                className={`px-4 py-3 text-left hover:bg-cream/60 ${n > 0 ? "border-l border-gold-light" : ""} ${only === i ? "bg-[var(--portal-surface)] shadow-[inset_0_-2px_0_var(--color-forest-700)]" : ""}`}
              >
                <span className={`block text-2xl font-semibold tabular-nums ${count(i) > 0 ? "text-amber-800" : "text-ink"}`}>{count(i)}</span>
                <span className="t-meta block">{ISSUE[i].label}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a pupil, parent or contact" aria-label="Search" className="min-w-[12rem] flex-1 rounded-[7px] border border-gold-light bg-white px-3 py-2 text-sm" />
            <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year group" className={`${ui.select} w-full sm:w-44`}>
              <option value="">Every year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <span className="t-meta">
              {shown.length} of {inYear.length} pupils{only ? `: ${ISSUE[only].label.toLowerCase()}` : ""}
            </span>
            {only && (
              <button type="button" onClick={() => setOnly("")} className="text-sm font-medium text-forest-700 hover:underline">
                Show everyone
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyState title={only ? "Nobody is missing this." : "No pupils to show."} />
          ) : (
            <ul className="divide-y divide-gold-light/60 rounded-[10px] border border-gold-light bg-white" data-guide="families-list">
              {shown.map((f) => (
                <li key={f.child.id}>
                  <button type="button" onClick={() => setOpen(f.child.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-cream/60">
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block font-medium text-ink">{f.child.name}</span>
                      <span className="t-meta block">{f.child.year_groups?.name || "No year group"}</span>
                    </span>
                    <span className="min-w-0 flex-1 basis-56 text-sm">
                      <span className="block truncate text-ink">{f.parent?.full_name || <span className="text-ink/60">{f.child.parent_user_id ? "Parent account, no name" : "No parent linked"}</span>}</span>
                      <span className="t-meta block truncate">{f.parent?.email || ""}</span>
                    </span>
                    <span className="t-meta w-28">
                      {f.contacts.length} contact{f.contacts.length === 1 ? "" : "s"}
                    </span>
                    <span className="flex w-56 flex-wrap justify-end gap-x-3 gap-y-1">
                      {f.issues.length === 0 ? <Status kind="completed">Complete</Status> : f.issues.slice(0, 2).map((i) => <Status key={i} kind="attention">{ISSUE[i].label}</Status>)}
                      {f.issues.length > 2 && <span className="t-meta">and {f.issues.length - 2} more</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {current && (
        <SidePanel
          title={current.child.name}
          eyebrow={`Family · ${current.child.year_groups?.name || "No year group"}`}
          onClose={() => setOpen(null)}
          footer={
            <>
              <Button size="sm" icon="chevronLeft" disabled={at <= 0} onClick={() => setOpen(shown[at - 1].child.id)}>
                Previous
              </Button>
              <Button size="sm" iconRight="chevronRight" disabled={at < 0 || at >= shown.length - 1} onClick={() => setOpen(shown[at + 1].child.id)}>
                Next
              </Button>
              <ButtonLink size="sm" href={`/admin/pupils?id=${current.child.id}&edit=details`} className="ml-auto">
                Edit details
              </ButtonLink>
            </>
          }
        >
          <div className="space-y-5 text-sm">
            {current.issues.length > 0 && (
              <ul className="space-y-1">
                {current.issues.map((i) => (
                  <li key={i}>
                    <Status kind="attention">{ISSUE[i].label}</Status> <span className="t-meta">{ISSUE[i].help}</span>
                  </li>
                ))}
              </ul>
            )}
            <section aria-labelledby="fc-parent">
              <h3 id="fc-parent" className="t-eyebrow mb-1.5">
                Parent sign-in
              </h3>
              {current.parent ? (
                <p>
                  <span className="block font-medium text-ink">{current.parent.full_name || "Parent"}</span>
                  {current.parent.email && (
                    <a href={`mailto:${current.parent.email}`} className="text-forest-700 hover:underline">
                      {current.parent.email}
                    </a>
                  )}
                </p>
              ) : (
                <p className="text-ink/70">
                  {current.child.parent_user_id ? "A parent sign-in is linked but has no name or email." : "No parent sign-in is linked."}{" "}
                  <Link href={`/admin/people?q=${encodeURIComponent(current.child.name)}`} className="font-medium text-forest-700 hover:underline">
                    Accounts and sign-ins
                  </Link>
                </p>
              )}
            </section>
            <section aria-labelledby="fc-contacts">
              <h3 id="fc-contacts" className="t-eyebrow mb-1.5">
                Emergency contacts, in the order to ring them
              </h3>
              {current.contacts.length === 0 ? (
                <p className="text-ink/70">None yet. The family adds them under their child&apos;s details.</p>
              ) : (
                <ol className="divide-y divide-gold-light/60 rounded-[10px] border border-gold-light">
                  {current.contacts.map((c) => (
                    <li key={c.id} className="space-y-0.5 px-3 py-2.5">
                      <p className="font-medium text-ink">
                        {c.name} <span className="font-normal text-ink/70">· {c.relationship || "Relationship not given"}</span>
                      </p>
                      <p className="t-meta">
                        {[c.parental_responsibility ? "Has parental responsibility" : "No parental responsibility", c.is_authorised_collector ? "May collect" : null].filter(Boolean).join(" · ")}
                      </p>
                      <p className="flex flex-wrap gap-x-4">
                        {c.phone && (
                          <a href={tel(c.phone)} className="tabular-nums text-forest-700 hover:underline">
                            {c.phone}
                          </a>
                        )}
                        {c.alt_phone && (
                          <a href={tel(c.alt_phone)} className="tabular-nums text-forest-700 hover:underline">
                            {c.alt_phone}
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="text-forest-700 hover:underline">
                            {c.email}
                          </a>
                        )}
                        {!c.phone && !c.alt_phone && !c.email && <span className="text-ink/60">No phone or email</span>}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <Link href={`/admin/pupils?id=${current.child.id}`} className="inline-block font-medium text-forest-700 hover:underline">
              Open {current.child.name}&apos;s profile
            </Link>
          </div>
        </SidePanel>
      )}
    </>
  );
}
