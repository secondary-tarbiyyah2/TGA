"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/learn/PageHeader";
import { SectionLayout, SectionNav, type SectionItem } from "@/components/learn/SectionNav";
import { ButtonLink, Notice, StatusChip, ui } from "@/components/learn/ui";
import { Loading } from "@/components/learn/kit";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukDaysAgo } from "@/lib/learn/ukTime";
import { useSupportPlans } from "@/lib/learn/send";
import { PupilSupportCard } from "@/components/learn/send/SupportAtAGlance";
import { ageFromDob, formatDob, formatStamp, medicalAlerts } from "./data";
import { PupilOverview } from "./PupilOverview";
import { RecordSections, usePupilRecordData } from "./PupilRecord";
import { Fig, PupilAttendanceTab, PupilBehaviourTab, PupilReportsTab, attendanceFigures } from "./ProfileTabs";
import { PupilDocumentsTab, PupilQuranTab, PupilWorkTab } from "./ProfileSections";
import { ackState, usePupils } from "./usePupils";

type Sec = "overview" | "attendance" | "behaviour" | "work" | "quran" | "support" | "contacts" | "reports" | "documents";
const SECS: Sec[] = ["overview", "attendance", "behaviour", "work", "quran", "support", "contacts", "reports", "documents"];

/**
 * A pupil's full profile for the staff who teach them (owner, 11 Nov 2026: "press on the students' names and
 * get their full info"). Its own page with the sections down the left: overview, attendance, behaviour and
 * house points, classwork and grades, Qur'an, support and medical, contacts, reports and documents. What a
 * teacher may see is decided by the database (0098): health and needs, not the family's address or GP.
 */
export function TeachPupilProfile({ id }: { id: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("tab") as Sec | null;
  const sec: Sec = raw && SECS.includes(raw) ? raw : "overview";
  const hrefFor = (k: Sec) => `/teach/pupils?id=${id}${k === "overview" ? "" : `&tab=${k}`}`;
  const { pupils, reload } = usePupils(true);
  const { roles } = useLearnSession();
  const canAcknowledge = roles.some((r) => r.role === "teacher" || r.role === "teaching_assistant_cover");
  const pupil = useMemo(() => (pupils || []).find((p) => p.id === id) || null, [pupils, id]);
  const plans = useSupportPlans(pupil ? [pupil.id] : null);
  const plan = plans?.[id];
  const record = usePupilRecordData(id, { teacherView: true });
  const [att30, setAtt30] = useState<ReturnType<typeof attendanceFigures> | null>(null);
  const [busy, setBusy] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("attendance_records")
      .select("status, lesson_instances!inner(date)")
      .eq("child_id", id)
      .gte("lesson_instances.date", ukDaysAgo(29))
      .limit(1000)
      .then(({ data }) => {
        if (alive) setAtt30(attendanceFigures((data as { status: string }[]) || []));
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // Previous and next pupil, in the same order as the My pupils list.
  const order = useMemo(() => (pupils || []).filter((p) => p.classes.length > 0), [pupils]);
  const at = order.findIndex((p) => p.id === id);
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;

  const crumbs = [{ label: "My pupils", href: "/teach/pupils" }, { label: pupil?.name || "Pupil" }];
  if (pupils && !pupil) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Pupil not found" />
        <p className="text-sm text-ink/70">
          This pupil isn&apos;t in any of your classes.{" "}
          <Link href="/teach/pupils" className="font-medium text-forest-700 underline">
            Back to My pupils
          </Link>
        </p>
      </>
    );
  }
  if (!pupil) return <Loading label="Loading the pupil's profile" bare />;

  const alerts = record.loaded ? medicalAlerts(record.details) : pupil.alerts;
  const st = ackState(pupil);
  const age = ageFromDob(pupil.dob);
  const items: SectionItem<Sec>[] = [
    { key: "overview", label: "Overview" },
    { key: "attendance", label: "Attendance" },
    { key: "behaviour", label: "Behaviour and house points" },
    { key: "work", label: "Classwork and grades" },
    { key: "quran", label: "Qur'an" },
    { key: "support", label: "Support and medical", count: canAcknowledge && st !== "current" ? 1 : alerts.length || undefined, countAlert: true },
    { key: "contacts", label: "Contacts" },
    { key: "reports", label: "Reports" },
    { key: "documents", label: "Documents" },
  ];

  const acknowledge = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setAckError(null);
    const { error } = await supabase.from("pupil_detail_acknowledgements").upsert({ child_id: id }, { onConflict: "child_id,teacher_id" });
    setBusy(false);
    if (error) return setAckError("We couldn't record that just now. Please try again.");
    reload();
  };

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title={pupil.name}
        subtitle={[pupil.yearGroup, pupil.classes.map((c) => c.name).join(", "), pupil.dob ? `born ${formatDob(pupil.dob)}${age !== null ? ` (age ${age})` : ""}` : ""].filter(Boolean).join(" · ")}
        actions={
          <span className="flex items-center gap-1">
            {prev && (
              <ButtonLink href={`/teach/pupils?id=${prev.id}${sec === "overview" ? "" : `&tab=${sec}`}`} size="sm" icon="chevronLeft" aria-label={`Previous pupil: ${prev.name}`}>
                Previous
              </ButtonLink>
            )}
            {next && (
              <ButtonLink href={`/teach/pupils?id=${next.id}${sec === "overview" ? "" : `&tab=${sec}`}`} size="sm" iconRight="chevronRight" aria-label={`Next pupil: ${next.name}`}>
                Next
              </ButtonLink>
            )}
          </span>
        }
        action={
          <ButtonLink href={`/teach/messages?family=${id}`} variant="primary" icon="messageSquare">
            Message family
          </ButtonLink>
        }
      />
      {(alerts.length > 0 || plan) && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5" data-guide="pupil-alerts">
          {alerts.map((a) => (
            <StatusChip key={a} tone="bad">
              {a}
            </StatusChip>
          ))}
          {plan && <StatusChip tone="info">Support plan</StatusChip>}
        </div>
      )}
      <SectionLayout nav={<SectionNav items={items} value={sec} hrefFor={hrefFor} label="Pupil profile sections" guide="pupil-sections" id="pupil-section" />}>
        {sec === "overview" && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Fig label="Attendance (30 days)" value={att30 ? (att30.rate === null ? "No lessons" : `${att30.rate}%`) : "…"} warn={!!att30 && att30.rate !== null && att30.rate < 90} sub={att30 ? `${att30.absent} missed of ${att30.lessons}` : undefined} />
              <Fig label="Medical alerts" value={alerts.length ? alerts.join(", ") : "None"} warn={alerts.length > 0} />
              <Fig label="Support plan" value={plan ? "Yes" : "No"} />
              <Fig label="Health information" value={st === "current" ? "Read" : "Not read yet"} warn={canAcknowledge && st !== "current"} sub={pupil.ack ? `You read it on ${formatStamp(pupil.ack.acknowledged_at)}` : undefined} />
            </dl>
            <PupilOverview childId={id} />
          </div>
        )}
        {sec === "attendance" && <PupilAttendanceTab childId={id} />}
        {sec === "behaviour" && <PupilBehaviourTab childId={id} />}
        {sec === "work" && <PupilWorkTab childId={id} />}
        {sec === "quran" && <PupilQuranTab childId={id} name={pupil.name} area="teach" />}
        {sec === "support" && (
          <div className="space-y-4">
            {canAcknowledge && (
              <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3 ${st === "current" ? "border-gold-light bg-white" : "border-amber-300 bg-amber-50/60"}`}>
                <p className="text-sm text-ink">
                  {st === "current" && pupil.ack
                    ? `You acknowledged this on ${formatStamp(pupil.ack.acknowledged_at)}.`
                    : st === "stale"
                      ? "This has changed since you last read it. Please read it again."
                      : "Please read the health and needs information, then tick it off."}
                </p>
                {st !== "current" && (
                  <button type="button" disabled={busy} onClick={acknowledge} className={ui.btnPrimary}>
                    {busy ? "Saving…" : "I've read this"}
                  </button>
                )}
              </div>
            )}
            {ackError && <Notice tone="bad">{ackError}</Notice>}
            {plan && <PupilSupportCard plan={plan} />}
            {record.loaded ? <RecordSections data={record} teacherView only={["health", "consents"]} /> : <Loading label="Loading" bare />}
          </div>
        )}
        {sec === "contacts" && (record.loaded ? <RecordSections data={record} teacherView only={["contacts"]} /> : <Loading label="Loading" bare />)}
        {sec === "reports" && <PupilReportsTab childId={id} childName={pupil.name} />}
        {sec === "documents" && <PupilDocumentsTab childId={id} onOpenReports={() => router.replace(hrefFor("reports"), { scroll: false })} />}
      </SectionLayout>
    </>
  );
}
