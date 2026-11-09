import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { completeness, medicalAlerts, type Acknowledgement, type MissingKey, type PupilDetails } from "./data";

export type PupilRow = {
  id: string;
  name: string;
  dob: string | null;
  yearGroupId: string | null;
  yearGroup: string | null;
  classes: { id: string; name: string }[];
  details: PupilDetails | null;
  contactCount: number;
  percent: number;
  missing: MissingKey[];
  alerts: string[];
  ack: Acknowledgement | null; // the current user's own acknowledgement
  /** Taught ahead of the year their date of birth gives (0184; false before it's applied). */
  workingAhead: boolean;
  workingAheadNote: string | null;
};

type ChildRaw = { id: string; name: string; dob: string | null; year_group_id: string | null; working_ahead?: boolean; working_ahead_note?: string | null; year_groups?: { name: string } | null };
type EnrolRaw = { child_id: string; class_id: string; classes?: { name: string } | null };

const SUMMARY_SELECT =
  "id, child_id, gender, address_line1, address_line2, town, postcode, home_language, ethnicity, previous_school, siblings_at_school, gp_name, gp_phone, medical_conditions, allergies, medication, dietary_needs, sen_notes, health_confirmed, photo_consent, trip_consent, completed_at, completed_by, updated_at";

/** Everything the signed-in staff member may see, joined client-side. `withOwnAcks` = the teacher view: their own classes, health and needs only. */
export function usePupils(withOwnAcks = false) {
  const [pupils, setPupils] = useState<PupilRow[] | null>(null);
  const [yearGroups, setYearGroups] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const uid = withOwnAcks ? (await supabase.auth.getUser()).data.user?.id : undefined;
      const [kids, enrols, det, cons, acks, yg] = await Promise.all([
        // "*" so this still loads before migration 0184 (working_ahead) is applied.
        supabase.from("children").select("*, year_groups(name)").order("name"),
        supabase.from("enrolments").select("child_id, class_id, classes(name)"),
        // Teachers get health, needs, consents and the home address (0100
        // teacher_pupil_health, Policy 09); the office sees the whole record.
        withOwnAcks ? supabase.rpc("teacher_pupil_health") : supabase.from("pupil_details").select(SUMMARY_SELECT),
        supabase.from("pupil_emergency_contacts").select("child_id"),
        withOwnAcks && uid
          ? supabase.from("pupil_detail_acknowledgements").select("id, child_id, teacher_id, acknowledged_at, details_updated_at").eq("teacher_id", uid)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("year_groups").select("id, name").order("sort_order"),
      ]);
      if (cancelled) return;
      const detailsBy = new Map(((det.data as unknown as PupilDetails[]) || []).map((d) => [d.child_id, d]));
      const countBy = new Map<string, number>();
      for (const c of (cons.data as unknown as { child_id: string }[]) || []) countBy.set(c.child_id, (countBy.get(c.child_id) || 0) + 1);
      const ackBy = new Map(((acks.data as unknown as Acknowledgement[]) || []).map((a) => [a.child_id, a]));
      const classesBy = new Map<string, { id: string; name: string }[]>();
      for (const e of (enrols.data as unknown as EnrolRaw[]) || []) {
        const list = classesBy.get(e.child_id) || [];
        list.push({ id: e.class_id, name: e.classes?.name || "Class" });
        classesBy.set(e.child_id, list);
      }
      const rows: PupilRow[] = ((kids.data as unknown as ChildRaw[]) || []).map((c) => {
        const d = detailsBy.get(c.id) || null;
        const n = countBy.get(c.id) || 0;
        const p = completeness(d, n, c.dob || null);
        return {
          id: c.id,
          name: c.name,
          dob: c.dob,
          yearGroupId: c.year_group_id,
          yearGroup: c.year_groups?.name || null,
          classes: classesBy.get(c.id) || [],
          details: d,
          contactCount: n,
          percent: p.percent,
          missing: p.missing,
          alerts: medicalAlerts(d),
          ack: ackBy.get(c.id) || null,
          workingAhead: Boolean(c.working_ahead),
          workingAheadNote: c.working_ahead_note || null,
        };
      });
      setPupils(rows);
      setYearGroups((yg.data as unknown as { id: string; name: string }[]) || []);
      setError(kids.error?.message || det.error?.message || cons.error?.message || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick, withOwnAcks]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { pupils, yearGroups, error, reload };
}

export type AckState = "none" | "stale" | "current";

export function ackState(p: PupilRow): AckState {
  if (!p.ack) return "none";
  if (p.details && p.ack.details_updated_at && new Date(p.details.updated_at).getTime() > new Date(p.ack.details_updated_at).getTime() + 1000) return "stale";
  return "current";
}
