"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Dialog } from "@/components/learn/kit";
import { ui } from "@/components/learn/ui";
import { LogModal } from "@/components/learn/behaviour/LogModal";
import { loadStudents, type StudentOption } from "@/components/learn/behaviour/data";

/**
 * Log behaviour from Today: the same dialog as the Behaviour page, over Today. A teacher picks
 * from pupils in their classes (`classIds`); the office from every pupil (no `classIds`) and can
 * log an incident too.
 */
export function BehaviourDialog({ classIds, allowIncident = false, onClose }: { classIds?: string[]; allowIncident?: boolean; onClose: () => void }) {
  const [students, setStudents] = useState<StudentOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const key = classIds ? classIds.join(",") : "all";
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    loadStudents(supabase, classIds).then(
      (s) => {
        if (alive) setStudents(s);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the class list's contents
  }, [key]);
  if (failed)
    return (
      <Dialog title="Log behaviour" onClose={onClose} footer={<button type="button" onClick={onClose} className={ui.btnSecondary}>Close</button>}>
        <p className="text-sm text-red-800">Your pupils couldn&apos;t load. Try again, or use the Behaviour page.</p>
      </Dialog>
    );
  if (students === null)
    return (
      <Dialog title="Log behaviour" onClose={onClose}>
        <p className="py-4 text-sm text-ink-500">Loading pupils…</p>
      </Dialog>
    );
  return <LogModal students={students} initialKind="merit" allowIncident={allowIncident} onClose={onClose} onSaved={onClose} />;
}
