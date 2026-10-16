"use client";

import { DataTable, type Column } from "@/components/learn/DataTable";
import { fmtDate, type BehaviourRecord } from "./data";

function KindPill({ r }: { r: BehaviourRecord }) {
  const style =
    r.kind === "merit" ? "bg-green-100 text-green-800" : r.kind === "demerit" ? "bg-red-50 text-red-700" : "bg-amber-100 text-amber-800";
  const label = r.kind === "merit" ? "Merit" : r.kind === "demerit" ? "Demerit" : "Incident";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

function Pts({ r }: { r: BehaviourRecord }) {
  if (r.kind === "incident") return <span className="text-ink/65">–</span>;
  return <span className={r.points > 0 ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{r.points > 0 ? `+${r.points}` : r.points}</span>;
}

/** Behaviour records in the shared DataTable: sortable, paged, CSV, cards on phones. */
export function RecordsTable({
  records,
  showStudent = true,
  onVoid,
  empty = "No records yet.",
  csvName,
}: {
  records: BehaviourRecord[];
  showStudent?: boolean;
  onVoid?: (id: string) => void;
  empty?: string;
  /** Adds "Download CSV" with this file name. */
  csvName?: string;
}) {
  const columns: Column<BehaviourRecord>[] = [
    { key: "date", header: "Date", sort: (r) => r.occurred_on, csv: (r) => r.occurred_on, className: "whitespace-nowrap", cell: (r) => fmtDate(r.occurred_on) },
    ...(showStudent
      ? [
          {
            key: "student",
            header: "Student",
            sort: (r: BehaviourRecord) => r.children?.name || "",
            csv: (r: BehaviourRecord) => r.children?.name || "",
            cell: (r: BehaviourRecord) => (
              <>
                <span className="font-medium text-ink">{r.children?.name || "Student"}</span>
                {r.classes?.name && <span className="block text-xs text-ink/65">{r.classes.name}</span>}
              </>
            ),
          },
        ]
      : []),
    { key: "type", header: "Type", sort: (r) => r.kind, csv: (r) => r.kind, cell: (r) => <KindPill r={r} /> },
    { key: "category", header: "Category", sort: (r) => r.category, csv: (r) => r.category, cell: (r) => r.category },
    { key: "points", header: "Points", align: "right", sort: (r) => r.points, csv: (r) => r.points, cell: (r) => <Pts r={r} /> },
    { key: "note", header: "Note", csv: (r) => r.note || "", className: "max-w-xs text-ink/70", cell: (r) => r.note || "" },
    ...(onVoid
      ? [
          {
            key: "void",
            header: "",
            align: "right" as const,
            hideOnPhone: false,
            cell: (r: BehaviourRecord) =>
              r.voided_at ? (
                <span className="text-xs text-ink/65">Voided</span>
              ) : (
                <button type="button" onClick={() => onVoid(r.id)} className="text-xs font-medium text-red-700 hover:underline">
                  Void
                </button>
              ),
          },
        ]
      : []),
  ];
  return (
    <DataTable
      caption="Behaviour records"
      rows={records}
      rowKey={(r) => r.id}
      columns={columns}
      initialSort={{ key: "date", dir: "desc" }}
      csvName={csvName}
      search={showStudent ? { text: (r) => `${r.children?.name || ""} ${r.category} ${r.note || ""}`, placeholder: "Search pupil, category or note" } : undefined}
      empty={empty}
      rowClassName={(r) => (r.voided_at ? "text-ink/65 line-through" : "")}
    />
  );
}
