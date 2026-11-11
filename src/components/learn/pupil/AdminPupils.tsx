"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SidePanel, WorkspaceHeader } from "@/components/learn/kit";
import { DataTable, type Column } from "@/components/learn/DataTable";
import { Icon } from "@/components/learn/Icon";
import { Button, IconButton, Notice, StatusChip, ui } from "@/components/learn/ui";
import { Dropdown } from "@/components/ui/Dropdown";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useLearnPermission } from "@/lib/learn/session";
import { ukDaysAgo } from "@/lib/learn/ukTime";
import { SUPPORT_LEVEL, type SupportLevel } from "@/lib/learn/send";
import { AddPersonModal } from "@/components/learn/people/AddPersonModal";
import { usePeople } from "@/components/learn/people/usePeople";
import { initials } from "@/components/learn/people/shared";
import { MISSING_CHIP, completeness } from "./data";
import { EditPupilModal } from "./EditPupilModal";
import { attendanceFigures } from "./ProfileTabs";
import { usePupils, type PupilRow } from "./usePupils";

type Show = "all" | "missing" | "alerts" | "support" | "above";

/** One rule for "complete", used by the count, the filter, the cell and the CSV. */
const isComplete = (p: PupilRow): boolean => Boolean(p.details?.completed_at) || p.missing.length === 0;

/** What is still missing from a pupil's record, in plain words (for the list's tooltip and the CSV). */
function missingItems(p: PupilRow): string[] {
  return completeness(p.details, p.contactCount, p.dob || null)
    .items.filter((i) => !i.ok)
    .map((i) => i.label);
}

type Extras = {
  /** Attendance rate over the last 30 UK days (null = no lessons marked). */
  attendance: Map<string, number | null>;
  support: Map<string, SupportLevel>;
  above: Set<string>;
  parentEmail: Map<string, { name: string | null; email: string }>;
  loaded: boolean;
};

/**
 * What the list shows beyond the basics: 30-day attendance, active support
 * plans, "working above year group" and each family's email (for reminders).
 * Loaded after the list so the page appears straight away; any part that
 * fails is simply left blank.
 */
function usePupilExtras(ids: string[] | null, tick: number): Extras {
  const [x, setX] = useState<Extras>({ attendance: new Map(), support: new Map(), above: new Set(), parentEmail: new Map(), loaded: false });
  const key = ids ? ids.length : -1;
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || key < 0) return;
    let cancelled = false;
    (async () => {
      const since = ukDaysAgo(29);
      const [plans, flags, kids] = await Promise.all([
        supabase.from("send_support_plans").select("child_id, support_level").eq("status", "active"),
        supabase.from("children").select("id").eq("working_above_year_group", true),
        supabase.from("children").select("id, parent_user_id"),
      ]);
      // Attendance marks for the last 30 days, a page at a time.
      const att: { child_id: string; status: string }[] = [];
      for (let page = 0; page < 20; page++) {
        const { data, error } = await supabase
          .from("attendance_records")
          .select("child_id, status, lesson_instances!inner(date)")
          .gte("lesson_instances.date", since)
          .range(page * 1000, page * 1000 + 999);
        if (error || !data) break;
        att.push(...(data as unknown as { child_id: string; status: string }[]));
        if (data.length < 1000) break;
      }
      const parentIds = [...new Set(((kids.data as { id: string; parent_user_id: string | null }[]) || []).map((k) => k.parent_user_id).filter(Boolean))] as string[];
      const profiles = parentIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", parentIds) : { data: [] };
      if (cancelled) return;

      const byChild = new Map<string, { status: string }[]>();
      for (const r of att) {
        const l = byChild.get(r.child_id) || [];
        l.push(r);
        byChild.set(r.child_id, l);
      }
      const attendance = new Map<string, number | null>();
      for (const [id, rows] of byChild) attendance.set(id, attendanceFigures(rows).rate);
      const support = new Map<string, SupportLevel>();
      for (const p of (plans.data as { child_id: string; support_level: SupportLevel }[]) || []) support.set(p.child_id, p.support_level);
      const prof = new Map(((profiles.data as { id: string; full_name: string | null; email: string | null }[]) || []).map((p) => [p.id, p]));
      const parentEmail = new Map<string, { name: string | null; email: string }>();
      for (const k of (kids.data as { id: string; parent_user_id: string | null }[]) || []) {
        const p = k.parent_user_id ? prof.get(k.parent_user_id) : null;
        if (p?.email && !p.email.endsWith(".internal")) parentEmail.set(k.id, { name: p.full_name, email: p.email });
      }
      setX({ attendance, support, above: new Set(((flags.data as { id: string }[]) || []).map((f) => f.id)), parentEmail, loaded: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, tick]);
  return x;
}

/** Opens "Add pupil" with the lists it needs (parents, classes, year groups). */
function AddPupil({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const people = usePeople();
  if (people.loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" role="status" aria-label="Loading">
        <div className="h-24 w-64 rounded-2xl bg-white motion-safe:animate-pulse" />
      </div>
    );
  }
  return <AddPersonModal initialType="student" yearGroups={people.yearGroups} classes={people.classes} parents={people.parents} onClose={onClose} onChanged={onChanged} />;
}

/**
 * A pupil's essentials beside the list (owner, 11 Nov 2026: pick a row, its detail opens
 * beside the list; docs/portal-structure.md, pattern 4): year, classes, attendance, support,
 * medical alerts and what is missing from the record, with the record's main actions.
 * Previous and Next move through the list as it is filtered and sorted, without closing.
 */
function PupilPeek({ pupil, extras, onClose, onEdit, onPrev, onNext, position }: { pupil: PupilRow; extras: Extras; onClose: () => void; onEdit: () => void; onPrev?: () => void; onNext?: () => void; position: string }) {
  const att = extras.attendance.get(pupil.id);
  const support = extras.support.get(pupil.id);
  const missing = isComplete(pupil) ? [] : missingItems(pupil);
  const row = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="t-meta">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{value}</dd>
    </div>
  );
  return (
    <SidePanel
      title={pupil.name}
      eyebrow={[pupil.yearGroup || "No year group", position].filter(Boolean).join(" · ")}
      onClose={onClose}
      footer={
        <>
          <Link href={`/admin/pupils?id=${pupil.id}`} className={ui.btnPrimary}>
            Open full record
          </Link>
          <button type="button" onClick={onEdit} className={ui.btnSecondary}>
            Edit pupil
          </button>
          <span className="ml-auto flex gap-1">
            <IconButton icon="chevronLeft" label="Previous pupil" onClick={onPrev} disabled={!onPrev} />
            <IconButton icon="chevronRight" label="Next pupil" onClick={onNext} disabled={!onNext} />
          </span>
        </>
      }
    >
      <div data-guide="pupil-peek">
        {pupil.alerts.length > 0 && (
          <div className="mb-4">
            <Notice tone="bad">
              <span className="font-semibold">Medical: </span>
              {pupil.alerts.join(", ")}
            </Notice>
          </div>
        )}
        <dl className="divide-y divide-gold-light">
          {row("Classes", pupil.classes.length ? pupil.classes.map((c) => c.name).join(", ") : <span className="text-ink-500">None yet</span>)}
          {row("Attendance", !extras.loaded ? "…" : att === undefined || att === null ? <span className="text-ink-500">No lessons marked in the last 30 days</span> : <span className={att < 90 ? "font-semibold text-amber-900" : ""}>{att}% over the last 30 days</span>)}
          {row("Support", support ? SUPPORT_LEVEL[support] : <span className="text-ink-500">No active support plan</span>)}
          {row("Working above year", extras.above.has(pupil.id) ? "Yes" : <span className="text-ink-500">No</span>)}
          {row(
            "Record",
            missing.length === 0 ? (
              <span className="text-green-800">Complete</span>
            ) : (
              <span>
                <span className="font-medium text-amber-900">{pupil.details ? `${missing.length} missing` : "Not started"}</span>
                <span className="mt-0.5 block text-ink-500">{missing.join(", ")}</span>
              </span>
            ),
          )}
          {row("Parent", extras.parentEmail.get(pupil.id)?.email || <span className="text-ink-500">No parent account linked</span>)}
        </dl>
        <p className="mt-4 text-sm">
          <Link href={`/admin/pupils?id=${pupil.id}&edit=details`} className="font-medium text-forest-700 hover:underline">
            Edit home, health, contacts and consents
          </Link>
        </p>
      </div>
    </SidePanel>
  );
}

/** The list's class cell: a count that opens to the names, so long lists never wrap the row. */
function ClassesCell({ classes }: { classes: { id: string; name: string }[] }) {
  if (classes.length === 0) return <span className="text-ink/60">None</span>;
  if (classes.length === 1) return <span className="block max-w-[14rem] truncate text-ink/80" title={classes[0].name}>{classes[0].name}</span>;
  return (
    <details className="group max-w-[16rem]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded text-ink/80 hover:text-ink [&::-webkit-details-marker]:hidden">
        {classes.length} classes
        <Icon name="chevronDown" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-1 space-y-0.5 text-xs text-ink/75">
        {classes.map((c) => (
          <li key={c.id} className="break-words">
            {c.name}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Every pupil, with what is particular to each one at a glance (year group,
 * classes, 30-day attendance, support plan, missing details, medical alerts)
 * and the actions that matter: open the full record (click anywhere on the
 * row), edit, add a pupil, and remind families whose details are missing.
 */
export function AdminPupils() {
  const { pupils, yearGroups, error, reload } = usePupils();
  const [tick, setTick] = useState(0);
  const extras = usePupilExtras(pupils ? pupils.map((p) => p.id) : null, tick);
  const [show, setShow] = useState<Show>("all");
  const [year, setYear] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  // The pupil whose essentials are open beside the list.
  const [peek, setPeek] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Same gate as every other export in the portal.
  const canExport = useLearnPermission("can_export_data");

  const refresh = () => {
    reload();
    setTick((t) => t + 1);
  };

  const summary = useMemo(() => {
    const list = pupils || [];
    return {
      all: list.length,
      missing: list.filter((p) => !isComplete(p)).length,
      alerts: list.filter((p) => p.alerts.length > 0).length,
      support: list.filter((p) => extras.support.has(p.id)).length,
      above: list.filter((p) => extras.above.has(p.id)).length,
    };
  }, [pupils, extras]);

  const rows = useMemo(
    () =>
      (pupils || []).filter((p) => {
        if (year && p.yearGroupId !== year) return false;
        if (show === "missing") return !isComplete(p);
        if (show === "alerts") return p.alerts.length > 0;
        if (show === "support") return extras.support.has(p.id);
        if (show === "above") return extras.above.has(p.id);
        return true;
      }),
    [pupils, show, year, extras]
  );

  // Families to remind: those of the pupils listed with missing details.
  const remind = useMemo(() => {
    if (show !== "missing") return null;
    const emails = new Map<string, string>();
    for (const p of rows) {
      const e = extras.parentEmail.get(p.id);
      if (e) emails.set(e.email.toLowerCase(), e.email);
    }
    const list = [...emails.values()];
    const noEmail = rows.filter((p) => !extras.parentEmail.has(p.id)).length;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const body = [
      "Assalamu alaikum,",
      "",
      "Some details are still missing from your child's school record (for example health information, emergency contacts or consents).",
      "",
      `Please sign in to your family dashboard and complete them under "Pupil information": ${origin}/family/dashboard`,
      "",
      "Thank you,",
      "Tarbiyyah Global Academy",
    ].join("\n");
    const href = `mailto:?bcc=${encodeURIComponent(list.join(","))}&subject=${encodeURIComponent("A few details still needed for your child's school record")}&body=${encodeURIComponent(body)}`;
    return { list, noEmail, href };
  }, [show, rows, extras]);

  const copyEmails = async () => {
    if (!remind) return;
    try {
      await navigator.clipboard.writeText(remind.list.join(", "));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const columns: Column<PupilRow>[] = [
    {
      key: "pupil",
      header: "Pupil",
      sort: (p) => p.name,
      csv: (p) => p.name,
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs font-semibold text-gold-900">
            {initials(p.name)}
          </span>
          <span className="min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeek(p.id);
              }}
              className="block text-left font-medium text-ink hover:text-teal-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              {p.name}
            </button>
            {extras.above.has(p.id) && (
              <span className="mt-0.5 block text-xs font-medium text-teal-700" title="Working above year group">
                Above year group
              </span>
            )}
          </span>
        </span>
      ),
    },
    { key: "year", header: "Year", sort: (p) => p.yearGroup || "", csv: (p) => p.yearGroup || "", cell: (p) => <span className="whitespace-nowrap">{p.yearGroup || "–"}</span> },
    {
      key: "class",
      header: "Classes",
      csv: (p) => p.classes.map((c) => c.name).join("; "),
      cell: (p) => <ClassesCell classes={p.classes} />,
      hideOnPhone: true,
    },
    {
      key: "attendance",
      header: "Attendance",
      align: "right",
      sort: (p) => extras.attendance.get(p.id) ?? null,
      csv: (p) => extras.attendance.get(p.id) ?? "",
      cell: (p) => {
        if (!extras.loaded) return <span className="text-ink/40">…</span>;
        const r = extras.attendance.get(p.id);
        if (r === undefined || r === null) return <span className="text-ink/50" title="No lessons marked in the last 30 days">–</span>;
        return (
          <span className={`tabular-nums ${r < 90 ? "font-semibold text-amber-900" : "text-ink"}`} title="Last 30 days">
            {r}%
          </span>
        );
      },
    },
    {
      key: "support",
      header: "Support",
      sort: (p) => (extras.support.has(p.id) ? SUPPORT_LEVEL[extras.support.get(p.id)!] : ""),
      csv: (p) => (extras.support.has(p.id) ? SUPPORT_LEVEL[extras.support.get(p.id)!] : ""),
      cell: (p) => {
        const s = extras.support.get(p.id);
        return s ? <StatusChip tone="info">{SUPPORT_LEVEL[s]}</StatusChip> : <span className="text-ink/40">–</span>;
      },
    },
    {
      key: "record",
      header: "Details",
      sort: (p) => p.percent,
      csv: (p) => (isComplete(p) ? "Complete" : `Missing: ${missingItems(p).join("; ")}`),
      cell: (p) => {
        if (isComplete(p))
          return (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-green-800">
              <Icon name="circleCheck" className="h-4 w-4" />
              Complete
            </span>
          );
        const items = missingItems(p);
        return (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-amber-900" title={items.join(", ")}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
            {p.details ? `${items.length} missing` : "Not started"}
            <span className="sr-only">: {p.missing.map((m) => MISSING_CHIP[m]).join(", ")}</span>
          </span>
        );
      },
    },
    {
      key: "alerts",
      header: "Medical",
      align: "center",
      csv: (p) => p.alerts.join("; "),
      cell: (p) =>
        p.alerts.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-red-700" title={p.alerts.join(", ")}>
            <Icon name="circleAlert" className="h-4 w-4" />
            <span className="sr-only">{p.alerts.join(", ")}</span>
          </span>
        ) : (
          <span className="text-ink/40">
            <span aria-hidden="true">–</span>
            <span className="sr-only">No alerts</span>
          </span>
        ),
    },
    {
      key: "edit",
      header: "Edit",
      align: "right",
      hideOnPhone: true,
      className: "!pl-1 !pr-3",
      cell: (p) => <IconButton icon="pencil" label={`Edit ${p.name}`} onClick={() => setEditing(p.id)} className="-my-2" />,
    },
  ];

  const filterChips: { key: Show; label: string; count: number }[] = [
    { key: "all", label: "All", count: summary.all },
    { key: "missing", label: "Missing details", count: summary.missing },
    { key: "alerts", label: "Medical alerts", count: summary.alerts },
    { key: "support", label: "Support plan", count: summary.support },
    { key: "above", label: "Above year group", count: summary.above },
  ];

  return (
    <>
      <div className="mb-6">
        <WorkspaceHeader
          eyebrow={[{ label: "Today", href: "/admin/dashboard" }, { label: "Pupils" }]}
          title="Pupils"
          description="Press a pupil to see them beside the list; open the full record for details, medical, support, attendance, behaviour, reports and entry assessment."
          stats={
            pupils
              ? [
                  { value: summary.all, label: summary.all === 1 ? "pupil" : "pupils" },
                  { value: summary.missing, label: "missing details" },
                  { value: summary.alerts, label: "medical alerts" },
                  { value: summary.support, label: "support plans" },
                ]
              : undefined
          }
          primary={
            <Button variant="primary" icon="userRoundPlus" onClick={() => setAdding(true)} data-guide="pupils-add">
              Add pupil
            </Button>
          }
        />
      </div>
      {error && (
        <div className="mb-4">
          <Notice tone="bad">Some of this couldn&apos;t load: {error}</Notice>
        </div>
      )}
      <div className="space-y-3">
        <div data-guide="pupils-filter" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Show">
          {filterChips
            .filter((c) => c.key === "all" || c.key === show || c.count > 0)
            .map((c) => (
              <button key={c.key} type="button" aria-pressed={show === c.key} onClick={() => setShow(c.key)} className={`${show === c.key ? ui.chipOn : ui.chip} shrink-0 whitespace-nowrap`}>
                {c.label}
                <span className={`tabular-nums ${show === c.key ? "text-white/85" : "text-ink/60"}`}>{pupils === null ? "" : c.count}</span>
              </button>
            ))}
        </div>

        {remind && rows.length > 0 && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4" aria-label="Remind families">
            <p className="min-w-0 text-sm text-amber-950">
              <span className="font-semibold">{rows.length} pupil{rows.length === 1 ? "" : "s"} with missing details.</span> Families also see a reminder on their dashboard until it&apos;s complete.
              {remind.noEmail > 0 && <span className="block text-xs text-amber-950/80">{remind.noEmail} without a family email address on file.</span>}
            </p>
            <span className="flex flex-wrap gap-2">
              {remind.list.length > 0 && (
                <>
                  <a href={remind.href} className={`${ui.btnPrimary} ${ui.sm}`}>
                    <Icon name="mail" size="sm" />
                    Remind {remind.list.length} famil{remind.list.length === 1 ? "y" : "ies"}
                  </a>
                  <button type="button" onClick={copyEmails} className={`${ui.btnSecondary} ${ui.sm}`}>
                    {copied ? "Copied" : "Copy email addresses"}
                  </button>
                </>
              )}
            </span>
          </section>
        )}

        <div data-guide="pupils-list">
        <DataTable
          caption="Pupils"
          rows={pupils === null ? null : rows}
          rowKey={(p) => p.id}
          columns={columns}
          onRowClick={(p) => setPeek(p.id)}
          rowClassName={() => "!align-middle"}
          search={{ text: (p) => `${p.name} ${p.yearGroup || ""} ${p.classes.map((c) => c.name).join(" ")}`, placeholder: "Search pupils or classes" }}
          filters={
            yearGroups.length > 0 && (
              <div className="w-full sm:w-48">
                <Dropdown
                  value={year}
                  onChange={setYear}
                  aria-label="Year group"
                  className={ui.select}
                  placeholder="All year groups"
                  options={[{ value: "", label: "All year groups" }, ...yearGroups.map((y) => ({ value: y.id, label: y.name }))]}
                />
              </div>
            )
          }
          initialSort={{ key: "pupil", dir: "asc" }}
          csvName={canExport ? "pupils" : undefined}
          empty="No pupils yet. Use Add pupil to add the first one."
          emptyFiltered="No pupils match."
        />
        </div>
      </div>

      {adding && <AddPupil onClose={() => setAdding(false)} onChanged={refresh} />}
      {/* Edit pupil replaces the pupil's panel (owner, 11 Nov 2026: the edit form must never open
          underneath it); closing the edit brings the pupil's panel back. */}
      {editing && <EditPupilModal childId={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {(() => {
        if (editing) return null;
        const i = peek ? rows.findIndex((r) => r.id === peek) : -1;
        if (i < 0) return null;
        const pupil = rows[i];
        return (
          <PupilPeek
            pupil={pupil}
            extras={extras}
            position={`${i + 1} of ${rows.length}`}
            onClose={() => setPeek(null)}
            onEdit={() => setEditing(pupil.id)}
            onPrev={i > 0 ? () => setPeek(rows[i - 1].id) : undefined}
            onNext={i < rows.length - 1 ? () => setPeek(rows[i + 1].id) : undefined}
          />
        );
      })()}
    </>
  );
}
