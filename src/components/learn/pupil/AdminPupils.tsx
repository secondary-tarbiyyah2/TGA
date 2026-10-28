"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { DataTable, type Column } from "@/components/learn/DataTable";
import { Icon } from "@/components/learn/Icon";
import { Notice, ui } from "@/components/learn/ui";
import { MISSING_CHIP, completeness } from "./data";
import { usePupils, type PupilRow } from "./usePupils";
import { useLearnPermission } from "@/lib/learn/session";

type Show = "all" | "missing" | "alerts";

/** One rule for "complete", used by the count, the filter, the cell and the CSV
 * (the count used to include records the table showed as Complete). */
const isComplete = (p: PupilRow): boolean => Boolean(p.details?.completed_at) || p.missing.length === 0;

/** What is still missing from a pupil's record, in plain words (for the list's tooltip and the CSV). */
function missingItems(p: PupilRow): string[] {
  return completeness(p.details, p.contactCount, p.dob || null)
    .items.filter((i) => !i.ok)
    .map((i) => i.label);
}

/**
 * Every pupil, kept light: name, year group, class, one completeness mark and
 * a medical-alert icon. Everything else about a child lives on their profile
 * (click a name).
 */
export function AdminPupils() {
  const { pupils, yearGroups, error } = usePupils();
  const [show, setShow] = useState<Show>("all");
  const [year, setYear] = useState("");
  // Same gate as every other export in the portal.
  const canExport = useLearnPermission("can_export_data");

  const summary = useMemo(() => {
    const list = pupils || [];
    return {
      all: list.length,
      missing: list.filter((p) => !isComplete(p)).length,
      alerts: list.filter((p) => p.alerts.length > 0).length,
    };
  }, [pupils]);

  const rows = useMemo(
    () =>
      (pupils || []).filter((p) => {
        if (year && p.yearGroupId !== year) return false;
        if (show === "missing") return !isComplete(p);
        if (show === "alerts") return p.alerts.length > 0;
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
      cell: (p) => (
        <Link href={`/admin/pupils?id=${p.id}`} className="font-medium text-ink hover:text-teal-800 hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: "year", header: "Year group", sort: (p) => p.yearGroup || "", csv: (p) => p.yearGroup || "", cell: (p) => p.yearGroup || "–" },
    {
      key: "class",
      header: "Class",
      sort: (p) => p.classes.map((c) => c.name).join(", "),
      csv: (p) => p.classes.map((c) => c.name).join("; "),
      cell: (p) => <span className="text-ink/75">{p.classes.map((c) => c.name).join(", ") || "None"}</span>,
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
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Pupils" }]} title="Pupils" subtitle="Open a pupil for everything about them: details, medical, attendance, behaviour, reports and entry assessment." />
      {error && (
        <div className="mb-4">
          <Notice tone="bad">Some of this couldn&apos;t load: {error}</Notice>
        </div>
      )}
      <div className="space-y-3">
        {pupils !== null && (
          <p className="text-sm text-ink/70">
            {summary.all} pupil{summary.all === 1 ? "" : "s"}
            {summary.missing > 0 && (
              <>
                {" · "}
                <button type="button" onClick={() => setShow("missing")} className="font-medium text-amber-900 underline-offset-2 hover:underline">
                  {summary.missing} with missing details
                </button>
              </>
            )}
            {summary.alerts > 0 && (
              <>
                {" · "}
                <button type="button" onClick={() => setShow("alerts")} className="font-medium text-red-800 underline-offset-2 hover:underline">
                  {summary.alerts} with medical alerts
                </button>
              </>
            )}
            {summary.missing > 0 && <span className="text-ink/65"> · families see a reminder on their dashboard until it&apos;s complete</span>}
          </p>
        )}
        <DataTable
          caption="Pupils"
          rows={pupils === null ? null : rows}
          rowKey={(p) => p.id}
          columns={columns}
          search={{ text: (p) => `${p.name} ${p.yearGroup || ""} ${p.classes.map((c) => c.name).join(" ")}`, placeholder: "Search pupils" }}
          filters={
            <>
              <select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show" className={`${ui.input} !w-auto`}>
                <option value="all">Show: All</option>
                <option value="missing">Show: Missing information</option>
                <option value="alerts">Show: Medical alerts</option>
              </select>
              {yearGroups.length > 0 && (
                <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year group" className={`${ui.input} !w-auto`}>
                  <option value="">All year groups</option>
                  {yearGroups.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              )}
            </>
          }
          initialSort={{ key: "pupil", dir: "asc" }}
          csvName={canExport ? "pupils" : undefined}
          empty="No pupils yet."
          emptyFiltered="No pupils match."
        />
      </div>
    </>
  );
}
