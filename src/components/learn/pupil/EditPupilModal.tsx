"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Modal } from "@/components/learn/curriculum/Modal";
import { FormSection, Notice, ui } from "@/components/learn/ui";
import { PupilPlacement } from "./PupilPlacement";

type Loaded = {
  name: string;
  dob: string;
  yearGroupId: string;
  above: boolean;
  classIds: string[];
  gender: "" | "male" | "female";
};

/**
 * Edit a pupil's core record (Headteacher and Admin only; RLS on children,
 * set_child_classes and pupil_details enforces it): name, date of birth, year
 * group with the "working above year group" flag, classes, and gender (which
 * gives the pronoun that report and note forms prefill). The family's own
 * details (address, health, contacts, consents) stay with the family's form.
 */
export function EditPupilModal({ childId, onClose, onSaved }: { childId: string; onClose: () => void; onSaved: () => void }) {
  const [orig, setOrig] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Loaded | null>(null);
  const [yearGroups, setYearGroups] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string; yearGroupId: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [c, flag, e, d, yg, cl] = await Promise.all([
        supabase.from("children").select("id, name, dob, year_group_id").eq("id", childId).maybeSingle(),
        // Separate, so the form still opens if the 0185 column isn't there yet.
        supabase.from("children").select("working_above_year_group").eq("id", childId).maybeSingle(),
        supabase.from("enrolments").select("class_id").eq("child_id", childId),
        supabase.from("pupil_details").select("gender").eq("child_id", childId).maybeSingle(),
        supabase.from("year_groups").select("id, name").order("sort_order"),
        supabase.from("classes").select("id, name, year_group_id").order("name"),
      ]);
      if (cancelled) return;
      const row = c.data as { name: string; dob: string | null; year_group_id: string | null } | null;
      if (!row) return setError(c.error?.message || "We couldn't load this pupil.");
      const loaded: Loaded = {
        name: row.name,
        dob: row.dob || "",
        yearGroupId: row.year_group_id || "",
        above: !!(flag.data as { working_above_year_group?: boolean } | null)?.working_above_year_group,
        classIds: ((e.data as { class_id: string }[]) || []).map((x) => x.class_id),
        gender: ((d.data as { gender: "male" | "female" | null } | null)?.gender || "") as Loaded["gender"],
      };
      setOrig(loaded);
      setForm(loaded);
      setYearGroups((yg.data as { id: string; name: string }[]) || []);
      setClasses(((cl.data as { id: string; name: string; year_group_id: string | null }[]) || []).map((x) => ({ id: x.id, name: x.name, yearGroupId: x.year_group_id })));
    })();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  const set = <K extends keyof Loaded>(k: K, v: Loaded[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !form || !orig) return;
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      if (form.name.trim() !== orig.name) patch.name = form.name.trim();
      if (form.dob !== orig.dob) patch.dob = form.dob;
      if (form.yearGroupId !== orig.yearGroupId) patch.year_group_id = form.yearGroupId || null;
      if (form.above !== orig.above) patch.working_above_year_group = form.above;
      if (Object.keys(patch).length) {
        const { data, error: e } = await supabase.from("children").update(patch).eq("id", childId).select("id");
        if (e) return setError(`Couldn't save: ${e.message}`);
        if (!data || data.length === 0) return setError("Couldn't save: only the Headteacher or an Admin can edit pupils.");
      }
      const sameClasses = form.classIds.length === orig.classIds.length && form.classIds.every((id) => orig.classIds.includes(id));
      if (!sameClasses) {
        const { error: e } = await supabase.rpc("set_child_classes", { p_child_id: childId, p_class_ids: form.classIds });
        if (e) return setError(`The details were saved, but the classes couldn't be: ${e.message}`);
      }
      if (form.gender && form.gender !== orig.gender) {
        const { error: e } = await supabase.from("pupil_details").upsert({ child_id: childId, gender: form.gender }, { onConflict: "child_id" });
        if (e) return setError(`The details were saved, but gender couldn't be: ${e.message}`);
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const valid = !!form && !!form.name.trim() && !!form.dob;

  return (
    <Modal title={orig ? `Edit ${orig.name}` : "Edit pupil"} onClose={onClose}>
      <div className="space-y-4 p-4 sm:p-5">
        {error && <Notice tone="bad">{error}</Notice>}
        {!form ? (
          !error && <div role="status" aria-label="Loading" className="h-40 rounded-xl bg-cream motion-safe:animate-pulse" />
        ) : (
          <>
            <FormSection title="The pupil" description="Their name, date of birth and the year group they are placed in.">
              <label className="block">
                <span className={ui.label}>Full name</span>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" className={`mt-1 ${ui.input}`} />
              </label>
              <PupilPlacement
                idPrefix="edit-pupil"
                part="placement"
                dob={form.dob}
                setDob={(v) => set("dob", v)}
                yearGroupId={form.yearGroupId}
                setYearGroupId={(v) => set("yearGroupId", v)}
                above={form.above}
                setAbove={(v) => set("above", v)}
                yearGroups={yearGroups}
              />
              <fieldset>
                <legend className={`${ui.label} mb-1`}>Gender</legend>
                <div className="flex flex-wrap gap-2">
                  {(["male", "female"] as const).map((g) => (
                    <label key={g} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${form.gender === g ? "border-teal-700 bg-teal-100/60" : "border-gold-light bg-white hover:bg-cream"}`}>
                      <input type="radio" name="edit-pupil-gender" checked={form.gender === g} onChange={() => set("gender", g)} className="accent-[var(--color-teal-700)]" />
                      {g === "male" ? "Male (he / him)" : "Female (she / her)"}
                    </label>
                  ))}
                </div>
                <p className={`mt-1 ${ui.hint}`}>Report and note forms use this for the pronoun; staff can still change it there.</p>
              </fieldset>
            </FormSection>
            <FormSection title="Classes" description="Tick every class the pupil is in. A pupil can be in one class per subject.">
              <PupilPlacement
                idPrefix="edit-pupil"
                part="classes"
                dob={form.dob}
                setDob={(v) => set("dob", v)}
                yearGroupId={form.yearGroupId}
                setYearGroupId={(v) => set("yearGroupId", v)}
                above={form.above}
                setAbove={(v) => set("above", v)}
                yearGroups={yearGroups}
                classes={classes}
                classIds={form.classIds}
                setClassIds={(ids) => set("classIds", ids)}
              />
            </FormSection>
            <div className="flex flex-wrap justify-end gap-2 border-t border-gold-light pt-3">
              <button type="button" onClick={onClose} className={ui.btnSecondary}>
                Cancel
              </button>
              <button type="button" onClick={save} disabled={busy || !valid} className={ui.btnPrimary}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
