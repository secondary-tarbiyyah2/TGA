"use client";

import { useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatGBP } from "@/lib/format";
import { matchFeeBand } from "@/lib/learn/fees";
import { round2, todayIso } from "./shared";
import type { FeeBand } from "@/content/seed";

export type FamilyOpt = { id: string; name: string };
export type ChildOpt = { id: string; name: string; parentId: string; yearGroupId: string | null; yearGroup: string | null };
export type YearGroupOpt = { id: string; name: string };
export type ClassOpt = { id: string; name: string };
export type EnrolmentOpt = { classId: string; childId: string };

type Target = "family" | "year_group" | "class";

export function NewChargeDialog({
  families,
  pupils,
  yearGroups,
  classes,
  enrolments,
  feeBands,
  onClose,
  onDone,
}: {
  families: FamilyOpt[];
  pupils: ChildOpt[];
  yearGroups: YearGroupOpt[];
  classes: ClassOpt[];
  enrolments: EnrolmentOpt[];
  feeBands: FeeBand[];
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const supabase = getSupabaseClient();
  const [target, setTarget] = useState<Target>("family");
  const [familyId, setFamilyId] = useState("");
  const [childId, setChildId] = useState("");
  const [yearGroupId, setYearGroupId] = useState("");
  const [classId, setClassId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const familyChildren = pupils.filter((c) => c.parentId === familyId);

  // The charges that will be created: one per child for group targets, one
  // per family (optionally tied to a child) for the family target.
  const targets = useMemo(() => {
    if (target === "family") {
      if (!familyId) return [];
      return [{ parentId: familyId, childId: childId || null }];
    }
    let kids: ChildOpt[] = [];
    if (target === "year_group" && yearGroupId) kids = pupils.filter((c) => c.yearGroupId === yearGroupId);
    if (target === "class" && classId) {
      const ids = new Set(enrolments.filter((e) => e.classId === classId).map((e) => e.childId));
      kids = pupils.filter((c) => ids.has(c.id));
    }
    return kids.map((c) => ({ parentId: c.parentId, childId: c.id }));
  }, [target, familyId, childId, yearGroupId, classId, pupils, enrolments]);

  const familyCount = new Set(targets.map((t) => t.parentId)).size;
  const groupYearName =
    target === "year_group" ? yearGroups.find((y) => y.id === yearGroupId)?.name : target === "family" && childId ? pupils.find((c) => c.id === childId)?.yearGroup : null;
  const band = matchFeeBand(groupYearName, feeBands);
  const value = round2(Number(amount));
  const valid = targets.length > 0 && description.trim().length > 0 && value > 0 && !!dueDate;

  const save = async () => {
    if (!supabase || !valid) return;
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rows = targets.map((t) => ({
      parent_user_id: t.parentId,
      child_id: t.childId,
      description: description.trim(),
      amount: value,
      due_date: dueDate,
      created_by: user?.id ?? null,
    }));
    const { error: err } = await supabase.from("fee_charges").insert(rows);
    setBusy(false);
    if (err) {
      setError("Could not create the charge — please try again.");
      return;
    }
    onDone(rows.length);
  };

  const field = "mt-1 w-full rounded-lg border border-gold-light bg-white px-3 py-2";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-gold-light bg-white p-5 sm:rounded-2xl">
        <h2 className="text-lg font-semibold text-ink">New charge</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["family", "One family"],
                ["year_group", "Year group"],
                ["class", "Class"],
              ] as [Target, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={target === k}
                onClick={() => setTarget(k)}
                className={`rounded-full border px-3 py-1.5 font-medium ${target === k ? "border-teal-700 bg-teal-700 text-white" : "border-gold-light bg-white text-ink/70 hover:bg-cream"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {target === "family" && (
            <>
              <label className="block">
                <span className="text-ink/70">Family</span>
                <select value={familyId} onChange={(e) => { setFamilyId(e.target.value); setChildId(""); }} className={field}>
                  <option value="">Choose a family…</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
              {familyChildren.length > 0 && (
                <label className="block">
                  <span className="text-ink/70">For</span>
                  <select value={childId} onChange={(e) => setChildId(e.target.value)} className={field}>
                    <option value="">Whole family</option>
                    {familyChildren.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.yearGroup ? ` (${c.yearGroup})` : ""}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          {target === "year_group" && (
            <label className="block">
              <span className="text-ink/70">Year group</span>
              <select value={yearGroupId} onChange={(e) => setYearGroupId(e.target.value)} className={field}>
                <option value="">Choose a year group…</option>
                {yearGroups.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </label>
          )}
          {target === "class" && (
            <label className="block">
              <span className="text-ink/70">Class</span>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
                <option value="">Choose a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          {target !== "family" && (
            <p className="rounded-lg bg-cream px-3 py-2 text-ink/70">
              {targets.length === 0 ? "No children found for this selection." : `One charge per child: ${targets.length} charge${targets.length === 1 ? "" : "s"} across ${familyCount} famil${familyCount === 1 ? "y" : "ies"}.`}
            </p>
          )}

          <label className="block">
            <span className="text-ink/70">Description</span>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={field} placeholder="e.g. Spring term fees" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-ink/70">Amount (£)</span>
              <input type="text" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className="text-ink/70">Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
            </label>
          </div>
          {band && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink/60">
              <span>Fee table ({band.yearGroupRange}):</span>
              {(
                [
                  ["Annual", band.annualFee],
                  ["Termly", band.termlyFee],
                  ["Monthly", band.monthlyFee],
                ] as [string, number][]
              ).map(([label, v]) => (
                <button key={label} type="button" onClick={() => setAmount(v.toFixed(2))} className="rounded-full border border-gold-light bg-white px-2.5 py-1 font-medium text-ink/75 hover:bg-cream">
                  {label} {formatGBP(v)}
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-red-700">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
            Cancel
          </button>
          <button type="button" disabled={!valid || busy} onClick={save} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
            {busy ? "Creating…" : targets.length > 1 ? `Create ${targets.length} charges` : "Create charge"}
          </button>
        </div>
      </div>
    </div>
  );
}
