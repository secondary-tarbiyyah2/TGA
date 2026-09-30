"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getFeeBands, getSiteSettings } from "@/lib/content";
import { matchFeeBand } from "@/lib/learn/fees";
import { formatGBP } from "@/lib/format";
import type { FeeBand } from "@/content/seed";

type Row = {
  childId: string;
  childName: string;
  yearGroup: string | null;
  parentName: string | null;
  parentEmail: string | null;
  enrolled: boolean;
  band: FeeBand | null;
  discount: number;
  total: number;
};

function toCsv(rows: Row[]): string {
  const header = ["Child", "Year group", "Parent", "Parent email", "Enrolled", "Fee band", "Annual fee", "Sibling discount", "Total"];
  const lines = rows.map((r) =>
    [
      r.childName,
      r.yearGroup || "",
      r.parentName || "",
      r.parentEmail || "",
      r.enrolled ? "Yes" : "No",
      r.band?.yearGroupRange || "",
      r.band ? r.band.annualFee.toFixed(2) : "",
      r.discount ? r.discount.toFixed(2) : "0.00",
      r.band ? r.total.toFixed(2) : "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function FeesContent() {
  const supabase = getSupabaseClient();
  const canExport = useLearnPermission("can_export_data");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [feeBands, settings, { data: children }, { data: enrolments }] = await Promise.all([
        getFeeBands(),
        getSiteSettings(),
        supabase.from("children").select("id, name, parent_user_id, year_groups(name)"),
        supabase.from("enrolments").select("child_id"),
      ]);
      const enrolledChildIds = new Set((enrolments || []).map((e) => e.child_id as string));

      const parentIds = Array.from(new Set((children || []).map((c) => c.parent_user_id).filter(Boolean)));
      const { data: parents } = parentIds.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", parentIds)
        : { data: [] };
      const parentById = new Map((parents || []).map((p) => [p.id, p]));

      // Sibling discount per family: count of THAT family's enrolled children.
      const enrolledCountByParent = new Map<string, number>();
      for (const c of children || []) {
        if (!enrolledChildIds.has(c.id)) continue;
        enrolledCountByParent.set(c.parent_user_id, (enrolledCountByParent.get(c.parent_user_id) || 0) + 1);
      }

      const out: Row[] = (children || []).map((c) => {
        const yearGroupName = (c.year_groups as unknown as { name?: string } | null)?.name || null;
        const band = matchFeeBand(yearGroupName, feeBands);
        const enrolled = enrolledChildIds.has(c.id);
        const siblingCount = enrolledCountByParent.get(c.parent_user_id) || 0;
        const hasSiblingDiscount = (settings.siblingDiscountPercent ?? 0) > 0 && siblingCount >= 2 && enrolled;
        const discount = hasSiblingDiscount && band ? (band.annualFee * (settings.siblingDiscountPercent as number)) / 100 : 0;
        const parent = parentById.get(c.parent_user_id);
        return {
          childId: c.id,
          childName: c.name,
          yearGroup: yearGroupName,
          parentName: parent?.full_name || null,
          parentEmail: parent?.email || null,
          enrolled,
          band,
          discount,
          total: band ? band.annualFee - discount : 0,
        };
      });
      setRows(out);
    })();
  }, [supabase]);

  const exportCsv = () => {
    if (!rows) return;
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fees-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-h2 font-semibold text-ink">Fees &amp; billing</h1>
            <p className="mt-1 text-sm text-ink/60">
              Every child&apos;s fee band (from the published fee table) and sibling discount, computed from real enrolments —
              not a hand-kept spreadsheet.
            </p>
          </div>
          {canExport && rows && rows.length > 0 && (
            <button type="button" onClick={exportCsv} className="rounded-full border border-gold-500 px-4 py-2 text-xs font-semibold text-gold-700 hover:bg-cream">
              Export CSV
            </button>
          )}
        </div>
        {!canExport && (
          <p className="mt-2 text-xs text-ink/50">
            Exporting this data requires the &quot;Can export data&quot; permission — ask a Head Teacher to grant it if you need it.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6 overflow-x-auto">
        {rows === null && <p className="text-sm text-ink/60">Loading…</p>}
        {rows && rows.length === 0 && <p className="text-sm text-ink/60">No children on record yet.</p>}
        {rows && rows.length > 0 && (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr>
                {["Child", "Year group", "Parent", "Enrolled", "Fee band", "Annual fee", "Discount", "Total"].map((h) => (
                  <th key={h} className="border-b border-gold-light/50 p-2 font-semibold text-ink/70">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.childId}>
                  <td className="border-b border-gold-light/20 p-2 font-medium text-ink">{r.childName}</td>
                  <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.yearGroup || "—"}</td>
                  <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.parentName || "—"}</td>
                  <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.enrolled ? "Yes" : "No"}</td>
                  <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.band?.yearGroupRange || "—"}</td>
                  <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.band ? formatGBP(r.band.annualFee) : "—"}</td>
                  <td className="border-b border-gold-light/20 p-2 text-gold-700">{r.discount ? `−${formatGBP(r.discount)}` : "—"}</td>
                  <td className="border-b border-gold-light/20 p-2 font-medium text-ink">{r.band ? formatGBP(r.total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-ink/50">
          &quot;Fee band&quot; is matched from the child&apos;s year group against the published fee table — a child with no year
          group set, or one that doesn&apos;t match a published band, shows as &quot;—&quot; rather than a guessed figure.
        </p>
      </div>
    </div>
  );
}

export default function AdminFeesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <FeesContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
