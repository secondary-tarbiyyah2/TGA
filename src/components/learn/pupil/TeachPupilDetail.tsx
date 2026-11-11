"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useSupportPlans } from "@/lib/learn/send";
import { PupilSupportCard } from "@/components/learn/send/SupportAtAGlance";
import { EmptyState, LoadingState, Notice, ui } from "@/components/learn/ui";
import { formatStamp } from "./data";
import { PupilOverview } from "./PupilOverview";
import { PupilRecord } from "./PupilRecord";
import { ackState, usePupils } from "./usePupils";

/**
 * A pupil's full record for teachers, on its own page (owner, 11 Nov 2026: pressing a pupil's
 * name anywhere opens their full information). What the teacher may see is unchanged: the
 * pupil's classes with them, attendance, Qur'an, health, needs and consents (RLS and
 * teacher_pupil_health decide). "I've read this" stays at the foot.
 */
export function TeachPupilDetail({ id }: { id: string }) {
  const { pupils, error, reload } = usePupils(true);
  const { roles } = useLearnSession();
  const canAcknowledge = roles.some((r) => r.role === "teacher" || r.role === "teaching_assistant_cover");
  const pupil = pupils?.find((p) => p.id === id) || null;
  const plans = useSupportPlans(pupil ? [pupil.id] : null);
  const [busy, setBusy] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const crumbs = [
    { label: "Today", href: "/teach/dashboard" },
    { label: "My pupils", href: "/teach/pupils" },
    { label: pupil?.name || "Pupil" },
  ];

  if (pupils === null) return <LoadingState label="Loading the pupil's record" />;
  if (!pupil)
    return (
      <>
        <PageHeader crumbs={crumbs} title="Pupil" back={{ label: "My pupils", href: "/teach/pupils" }} />
        <EmptyState title="This pupil's record is not open to you" action={<Link href="/teach/pupils" className={ui.btnSecondary}>Back to my pupils</Link>}>
          Teachers see the records of pupils in their own classes. Ask the office if you need more.
        </EmptyState>
      </>
    );

  const acknowledge = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setAckError(null);
    const { error: e } = await supabase.from("pupil_detail_acknowledgements").upsert({ child_id: pupil.id }, { onConflict: "child_id,teacher_id" });
    setBusy(false);
    if (e) return setAckError("We couldn't record that just now. Please try again.");
    reload();
  };
  const st = ackState(pupil);

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        back={{ label: "My pupils", href: "/teach/pupils" }}
        title={pupil.name}
        subtitle={[pupil.yearGroup, pupil.classes.map((c) => c.name).join(", ")].filter(Boolean).join(" · ") || undefined}
        actions={
          <Link href="/teach/messages?compose=1" className={ui.btnSecondary}>
            New message
          </Link>
        }
      />
      {error && <Notice tone="bad">Some of this couldn&apos;t load. Please refresh the page.</Notice>}
      <div className="space-y-5">
        {pupil.alerts.length > 0 && (
          <Notice tone="bad">
            <span className="font-semibold">Medical alert:</span> {pupil.alerts.join(", ")}
          </Notice>
        )}
        {plans?.[pupil.id] && <PupilSupportCard plan={plans[pupil.id]} />}
        <PupilOverview childId={pupil.id} />
        <PupilRecord teacherView child={{ id: pupil.id, name: pupil.name, dob: pupil.dob, yearGroup: pupil.yearGroup, classes: pupil.classes.map((c) => c.name) }} />
        {canAcknowledge && (
          <section className="rounded-[10px] border border-gold-light bg-white px-4 py-3">
            {ackError && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{ackError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-500">
                {st === "current" && pupil.ack
                  ? `You acknowledged this on ${formatStamp(pupil.ack.acknowledged_at)}.`
                  : st === "stale"
                    ? "This record has changed since you last read it."
                    : "Tick this off once you have read the health and needs information."}
              </p>
              {st !== "current" && (
                <button type="button" disabled={busy} onClick={acknowledge} className={ui.btnPrimary}>
                  {busy ? "Saving…" : "I've read this"}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
