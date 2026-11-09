"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AddPersonModal } from "@/components/learn/people/AddPersonModal";
import { usePeople } from "@/components/learn/people/usePeople";
import { EditPupilDialog } from "./EditPupilDialog";
import { ncYearLabel, yearsAheadOfAge, ncYearFromDob } from "@/lib/learn/yearGroup";
import { PageHeader } from "@/components/learn/PageHeader";
import { DataTable, type Column } from "@/components/learn/DataTable";
import { Icon } from "@/components/learn/Icon";
import { Button, Notice, StatusChip } from "@/components/learn/ui";
import { MISSING_CHIP, ageFromDob, completeness } from "./data";
import { usePupils, type PupilRow } from "./usePupils";
import { useLearnPermission } from "@/lib/learn/session";

import { Select } from "@/components/ui/Dropdown";
type Show = "all" | "missing" | "alerts" | "ahead" | "noclass";

/** One rule for "complete", used by the count, the filter, the cell and the CSV
 * (the count used to include records the table showed as Complete). */
const isComplete = (p: PupilRow): boolean => Boolean(p.details?.completed_at) || p.missing.length === 0;

/** What is still missing from a pupil's record, in plain words (for the list's tooltip and the CSV). */
function missingItems(p: PupilRow): string[] {
  return completeness(p.details, p.contactCount, p.dob || null)
    .items.filter((i) => !i.ok)
    .map((i) => i.label);
}

/** A filter chip with its count, so a number is never a surprise. */
function Chip({ label, on, count, onClick, tone }: { label: string; on: boolean; count?: number; onClick: () => void; tone?: "warn" | "bad" }) {
  const idle = tone === "bad" ? "text-red-800" : tone === "warn" ? "text-amber-900" : "text-ink/80";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors ${
        on ? "border-teal-700 bg-teal-700 text-white" : `border-gold-light bg-white hover:border-ink/25 ${idle}`
      }`}
    >
      {label}
      {count !== undefined && <span className={`tabular-nums text-xs ${on ? "text-white/85" : "text-ink/55"}`}>{count}</span>}
    </button>
  );
}

/** Loads the people lists only when "Add pupil" is opened. */
function AddPupil({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const data = usePeople();
  return <AddPersonModal initialType="student" yearGroups={data.yearGroups} classes={data.classes} parents={data.parents} onClose={onClose} onChanged={onChanged} />;
}

/**
 * Every pupil, kept light: name, year group, class, one completeness mark and
 * a medical-alert icon. Everything else about a child lives on their profile
 * (click a name).
 */
export function AdminPupils() {
  const { pupils, yearGroups, error, reload } = usePupils();
  const [show, setShow] = useState<Show>("all");
  const [year, setYear] = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  // Same gate as every other export in the portal.
  const canExport = useLearnPermission("can_export_data");

  const summary = useMemo(() => {
    const list = pupils || [];
    return {
      all: list.length,
      missing: list.filter((p) => !isComplete(p)).length,
      alerts: list.filter((p) => p.alerts.length > 0).length,
      ahead: list.filter((p) => p.workingAhead).length,
      noclass: list.filter((p) => p.classes.length === 0).length,
      byYear: new Map(yearGroups.map((y) => [y.id, list.filter((p) => p.yearGroupId === y.id).length])),
    };
  }, [pupils, yearGroups]);

  const rows = useMemo(
    () =>
      (pupils || []).filter((p) => {
        if (year && p.yearGroupId !== year) return false;
        if (show === "missing") return !isComplete(p);
        if (show === "alerts") return p.alerts.length > 0;
        if (show === "ahead") return p.workingAhead;
        if (show === "noclass") return p.classes.length === 0;
        return true;
      }),
    [pupils, show, year]
  );

  const columns: Column<PupilRow>[] = [
    {
      key: "pupil",
      header: "Pupil",
      sort: (p) => p.name,
      csv: (p) => p.name,
      cell: (p) => {
        const age = ageFromDob(p.dob);
        return (
          <span className="block min-w-0">
            <Link href={`/admin/pupils?id=${p.id}`} className="font-medium text-ink hover:text-teal-800 hover:underline">
              {p.name}
            </Link>
            <span className="block text-xs text-ink/60">{age !== null ? `Age ${age}` : "No date of birth"}</span>
          </span>
        );
      },
    },
    {
      key: "year",
      header: "Year group",
      sort: (p) => p.yearGroup || "",
      csv: (p) => [p.yearGroup || "", p.workingAhead ? `working ahead${p.workingAheadNote ? `: ${p.workingAheadNote}` : ""}` : ""].filter(Boolean).join(" · "),
      cell: (p) => {
        const diff = yearsAheadOfAge(p.dob, p.yearGroup);
        const byAge = ncYearFromDob(p.dob);
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{p.yearGroup || "–"}</span>
            {p.workingAhead && (
              <span title={p.workingAheadNote || undefined}>
                <StatusChip tone="info">Ahead</StatusChip>
              </span>
            )}
            {!p.workingAhead && diff !== null && diff !== 0 && byAge !== null && (
              <span title={`Date of birth gives ${ncYearLabel(byAge)}`}>
                <StatusChip tone="warn">{`Age says ${ncYearLabel(byAge)}`}</StatusChip>
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "class",
      header: "Class",
      sort: (p) => p.classes.map((c) => c.name).join(", "),
      csv: (p) => p.classes.map((c) => c.name).join("; "),
      // Compact: the first two, then "+N" (a pupil has one class per subject, which used to wrap to several lines).
      cell: (p) =>
        p.classes.length === 0 ? (
          <span className="text-amber-900">None</span>
        ) : (
          <span className="text-ink/75" title={p.classes.map((c) => c.name).join(", ")}>
            {p.classes
              .slice(0, 2)
              .map((c) => c.name)
              .join(", ")}
            {p.classes.length > 2 && <span className="ml-1 rounded-full bg-cream px-1.5 text-xs font-medium text-ink/70">+{p.classes.length - 2}</span>}
          </span>
        ),
      hideOnPhone: true,
    },
    {
      key: "record",
      header: "Details",
      sort: (p) => p.percent,
      csv: (p) => (isComplete(p) ? "Complete" : `Missing: ${missingItems(p).join("; ")}`),
      cell: (p) => {
        if (isComplete(p))
          return (
            <span className="inline-flex items-center gap-1 text-sm text-green-800">
              <Icon name="circleCheck" className="h-4 w-4" />
              Complete
            </span>
          );
        const items = missingItems(p);
        return (
          <span className="inline-flex items-center gap-1 text-sm text-amber-900" title={items.join(", ")}>
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
      sort: (p) => p.alerts.length,
      csv: (p) => p.alerts.join("; "),
      cell: (p) =>
        p.alerts.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-red-700" title={p.alerts.join(", ")}>
            <Icon name="circleAlert" className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only sm:text-xs sm:font-medium">{p.alerts.join(", ")}</span>
          </span>
        ) : (
          <span className="text-ink/30" aria-label="No alerts">
            –
          </span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (p) => (
        <button type="button" onClick={() => setEditId(p.id)} className="rounded-lg px-2 py-1 text-sm font-medium text-teal-800 hover:bg-cream" aria-label={`Edit ${p.name}`}>
          Edit
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Pupils" }]}
        title="Pupils"
        subtitle="Open a pupil for everything about them: details, medical, attendance, behaviour, reports and entry assessment."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            Add pupil
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Notice tone="bad">Some of this couldn&apos;t load: {error}</Notice>
        </div>
      )}
      <div className="space-y-3">
        {pupils !== null && (
          <div className="space-y-2">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible" role="group" aria-label="Show">
              <Chip label="All" on={show === "all"} count={summary.all} onClick={() => setShow("all")} />
              <Chip label="Missing details" tone="warn" on={show === "missing"} count={summary.missing} onClick={() => setShow("missing")} />
              <Chip label="Medical alerts" tone="bad" on={show === "alerts"} count={summary.alerts} onClick={() => setShow("alerts")} />
              <Chip label="Working ahead" on={show === "ahead"} count={summary.ahead} onClick={() => setShow("ahead")} />
              <Chip label="No class" tone="warn" on={show === "noclass"} count={summary.noclass} onClick={() => setShow("noclass")} />
            </div>
            {yearGroups.length > 0 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible" role="group" aria-label="Year group">
                <Chip label="Every year" on={!year} onClick={() => setYear("")} />
                {yearGroups.map((y) => (
                  <Chip key={y.id} label={y.name} on={year === y.id} count={summary.byYear.get(y.id) || 0} onClick={() => setYear(year === y.id ? "" : y.id)} />
                ))}
              </div>
            )}
            {show === "missing" && summary.missing > 0 && <p className="text-xs text-ink/65">Families see a reminder on their dashboard until their child&apos;s record is complete.</p>}
          </div>
        )}
        <DataTable
          caption="Pupils"
          rows={pupils === null ? null : rows}
          rowKey={(p) => p.id}
          columns={columns}
          search={{ text: (p) => `${p.name} ${p.yearGroup || ""} ${p.classes.map((c) => c.name).join(" ")}`, placeholder: "Search pupils" }}
          initialSort={{ key: "pupil", dir: "asc" }}
          csvName={canExport ? "pupils" : undefined}
          empty="No pupils yet."
          emptyFiltered="No pupils match."
        />
      </div>
      {adding && <AddPupil onClose={() => setAdding(false)} onChanged={reload} />}
      {editId && <EditPupilDialog childId={editId} onClose={() => setEditId(null)} onSaved={reload} />}
    </>
  );
}
