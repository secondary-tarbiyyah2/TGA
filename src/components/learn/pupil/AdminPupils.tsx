"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { DataTable, type Column } from "@/components/learn/DataTable";
import { ProgressBar, MISSING_CHIP, type MissingKey } from "./data";
import { usePupils } from "./usePupils";

type Chip = "all" | "complete" | "incomplete" | "alerts" | MissingKey;
const CHIPS: { key: Chip; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "complete", label: "Complete" },
  { key: "incomplete", label: "Incomplete" },
  { key: "contacts", label: MISSING_CHIP.contacts },
  { key: "address", label: MISSING_CHIP.address },
  { key: "gp", label: MISSING_CHIP.gp },
  { key: "consents", label: MISSING_CHIP.consents },
  { key: "alerts", label: "Medical alerts" },
];

export function AdminPupils() {
  const { pupils, yearGroups, error } = usePupils();
  const [year, setYear] = useState("");
  const [cls, setCls] = useState("");
  const [chip, setChip] = useState<Chip>("all");

  const classOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pupils || []) for (const c of p.classes) m.set(c.id, c.name);
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pupils]);

  const counts = useMemo(() => {
    const list = pupils || [];
    const c: Record<string, number> = {
      all: list.length,
      complete: list.filter((p) => p.details?.completed_at).length,
      incomplete: list.filter((p) => !p.details?.completed_at).length,
      alerts: list.filter((p) => p.alerts.length > 0).length,
    };
    for (const k of ["contacts", "address", "gp", "consents"] as MissingKey[]) c[k] = list.filter((p) => p.missing.includes(k)).length;
    return c;
  }, [pupils]);

  const rows = useMemo(() => {
    return (pupils || []).filter((p) => {
      if (year && p.yearGroupId !== year) return false;
      if (cls && !p.classes.some((c) => c.id === cls)) return false;
      if (chip === "complete") return !!p.details?.completed_at;
      if (chip === "incomplete") return !p.details?.completed_at;
      if (chip === "alerts") return p.alerts.length > 0;
      if (chip !== "all") return p.missing.includes(chip);
      return true;
    });
  }, [pupils, year, cls, chip]);

  const selectCls = "rounded-lg border border-gold-light bg-white px-3 py-2 text-sm text-ink";

  type Pupil = (typeof rows)[number];
  const columns: Column<Pupil>[] = [
    {
      key: "pupil",
      header: "Pupil",
      sort: (p) => p.name,
      csv: (p) => p.name,
      cell: (p) => (
        <Link href={`/admin/pupils?id=${p.id}`} className="font-medium text-teal-800 hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: "year", header: "Year group", sort: (p) => p.yearGroup || "", csv: (p) => p.yearGroup || "", cell: (p) => p.yearGroup || "–" },
    { key: "class", header: "Class", sort: (p) => p.classes.map((c) => c.name).join(", "), csv: (p) => p.classes.map((c) => c.name).join("; "), cell: (p) => <span className="text-ink/75">{p.classes.map((c) => c.name).join(", ") || "None"}</span> },
    {
      key: "record",
      header: "Record",
      sort: (p) => p.percent,
      csv: (p) => (p.details?.completed_at ? "Complete" : `${p.percent}%`),
      className: "w-40",
      cell: (p) => (
        <>
          <ProgressBar percent={p.percent} />
          <p className="mt-1 text-xs text-ink/65">{p.details?.completed_at ? "Complete" : `${p.percent}%`}</p>
        </>
      ),
    },
    {
      key: "flags",
      header: "Flags",
      sort: (p) => p.alerts.length * 10 + p.missing.length,
      csv: (p) => [...p.alerts, ...p.missing.map((m) => MISSING_CHIP[m])].join("; "),
      cell: (p) =>
        p.alerts.length + p.missing.length === 0 ? (
          <span className="text-ink/65">None</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {p.alerts.map((a) => (
              <span key={a} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
                {a}
              </span>
            ))}
            {p.missing.map((m) => (
              <span key={m} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                {MISSING_CHIP[m]}
              </span>
            ))}
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Pupils" }]} title="Pupils" subtitle="Home, health, emergency contacts and consents for every pupil, as completed by their families." />
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Some of this couldn&apos;t load: {error}</p>}

      <div className="space-y-4">
        {pupils !== null && counts.incomplete > 0 && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <span>
              <strong>{counts.incomplete}</strong> of {counts.all} pupil{counts.all === 1 ? "" : "s"} {counts.incomplete === 1 ? "has" : "have"} incomplete details. Families see a notice on their dashboard until each record is complete.
            </span>
            <button type="button" onClick={() => setChip("incomplete")} className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-100">
              Show incomplete
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Completeness">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={chip === c.key}
              onClick={() => setChip(c.key)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${chip === c.key ? "border-teal-600 bg-teal-600 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
            >
              {c.label} <span className={chip === c.key ? "text-white/80" : "text-ink/65"}>{counts[c.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <DataTable
          caption="Pupils"
          rows={pupils === null ? null : rows}
          rowKey={(p) => p.id}
          columns={columns}
          search={{ text: (p) => `${p.name} ${p.yearGroup || ""}`, placeholder: "Search by name" }}
          filters={
            <>
              <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year group" className={selectCls}>
                <option value="">All year groups</option>
                {yearGroups.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
              <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class" className={selectCls}>
                <option value="">All classes</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          }
          initialSort={{ key: "pupil", dir: "asc" }}
          csvName="pupils"
          empty="No pupils yet."
          emptyFiltered="No pupils match."
        />
      </div>
    </>
  );
}
