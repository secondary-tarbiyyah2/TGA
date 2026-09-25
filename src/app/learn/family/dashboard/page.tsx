"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { TimetableGrid } from "@/components/learn/TimetableGrid";
import { PrintButton } from "@/components/learn/PrintButton";
import { IcsFeedLink } from "@/components/learn/IcsFeedLink";
import { useLearnSession, useLearnSignOut } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { TimetableSlot } from "@/lib/learn/timetable";

type Child = { id: string; name: string; year_group_id: string | null; year_groups?: { name: string } | null };

function ChildTimetable({ childId }: { childId: string }) {
  const supabase = getSupabaseClient();
  const [slots, setSlots] = useState<TimetableSlot[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: enrolments } = await supabase.from("enrolments").select("class_id").eq("child_id", childId);
      const classIds = (enrolments || []).map((e) => e.class_id);
      if (classIds.length === 0) {
        setSlots([]);
        return;
      }
      const { data } = await supabase
        .from("timetable_slots")
        .select("id, run_id, class_id, subject_id, teacher_user_id, virtual_session_id, weekday, start_time, end_time, classes(name, year_group), subjects(name)")
        .in("class_id", classIds);
      setSlots((data as unknown as TimetableSlot[]) || []);
    })();
  }, [supabase, childId]);

  if (slots === null) return <p className="text-sm text-ink/60">Loading timetable…</p>;
  return <TimetableGrid slots={slots} />;
}

function FamilyContent() {
  const { session } = useLearnSession();
  const signOut = useLearnSignOut();
  const supabase = getSupabaseClient();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [newChildDob, setNewChildDob] = useState("");
  const [busy, setBusy] = useState(false);

  const loadChildren = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("children").select("id, name, year_group_id, year_groups(name)").order("name");
    setChildren((data as unknown as Child[]) || []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    loadChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const addChild = async () => {
    if (!supabase || !newChildName.trim() || !newChildDob) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("children")
        .insert({ parent_user_id: user.id, name: newChildName.trim(), dob: newChildDob });
      if (!error) {
        setNewChildName("");
        setNewChildDob("");
        await loadChildren();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-h2 font-semibold text-ink">My children</h1>
            <p className="mt-1 text-sm text-ink/60">
              Signed in as {session && session !== "loading" ? session.user.email : ""}.
            </p>
          </div>
          <button type="button" onClick={signOut} className="print:hidden rounded-full border border-gold-500 px-4 py-2 text-sm text-gold-700 hover:bg-cream">
            Sign out
          </button>
        </div>

        <div className="print:hidden mt-4 flex flex-wrap items-end gap-2 border-t border-gold-light/30 pt-4">
          <div>
            <label className="block text-xs font-medium text-ink/70">Child&apos;s name</label>
            <input
              value={newChildName}
              onChange={(e) => setNewChildName(e.target.value)}
              className="mt-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/70">Date of birth</label>
            <input
              type="date"
              value={newChildDob}
              onChange={(e) => setNewChildDob(e.target.value)}
              className="mt-1 rounded-lg border border-gold-light/60 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={addChild}
            disabled={busy}
            className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 disabled:opacity-50"
          >
            Add child
          </button>
        </div>
      </div>

      {children === null && <p className="text-sm text-ink/60">Loading…</p>}
      {children && children.length === 0 && (
        <p className="text-sm text-ink/60">No children added yet — add your child above to see their timetable.</p>
      )}
      {children?.map((child) => (
        <div key={child.id} className="rounded-2xl border border-gold-light/50 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-h3 font-semibold text-ink">
              {child.name}
              {child.year_groups?.name ? <span className="ml-2 text-sm font-normal text-ink/60">{child.year_groups.name}</span> : null}
            </h2>
            <PrintButton />
          </div>
          <div className="mt-4">
            <ChildTimetable childId={child.id} />
          </div>
        </div>
      ))}

      <IcsFeedLink />
    </div>
  );
}

export default function FamilyDashboardPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["parent"]}>
        <FamilyContent />
      </LearnGate>
    </section>
  );
}
