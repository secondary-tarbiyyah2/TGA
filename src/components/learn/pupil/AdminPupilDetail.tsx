"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BaselineAssessments } from "./BaselineAssessments";
import { PageHeader } from "@/components/learn/PageHeader";
import { PrintScope, findPrintScope, printElement } from "@/components/learn/printScope";
import { Tabs } from "@/components/learn/Tabs";
import { Button, Notice, StatusChip, ui } from "@/components/learn/ui";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukDaysAgo } from "@/lib/learn/ukTime";
import { LeaderboardPrivacy } from "@/components/learn/behaviour/LeaderboardPrivacy";
import { ProgressBar, ageFromDob, completeness, formatDob, formatStamp, medicalAlerts } from "./data";
import { PupilOverview } from "./PupilOverview";
import { RecordSections, usePupilRecordData, type RecordChild } from "./PupilRecord";
import { Fig, PupilAttendanceTab, PupilBehaviourTab, PupilReportsTab, attendanceFigures } from "./ProfileTabs";
import { SupportPlanEditor } from "@/components/learn/send/SupportPlanEditor";
import { EditPupilModal } from "./EditPupilModal";

type ChildRaw = { id: string; name: string; dob: string | null; parent_user_id: string | null; year_groups?: { name: string } | null };
type EnrolRaw = { classes?: { name: string } | null };
type Parent = { full_name: string | null; email: string | null };

type Tab = "overview" | "details" | "medical" | "send" | "attendance" | "behaviour" | "reports" | "assessment";
const TABS: Tab[] = ["overview", "details", "medical", "send", "attendance", "behaviour", "reports", "assessment"];

/**
 * A pupil's profile: the one place for everything about a child. Overview,
 * details and contacts, medical and consents, attendance, behaviour and
 * rewards, reports and entry assessment. Opening it is logged (medical data).
 */
export function AdminPupilDetail({ id }: { id: string }) {
  // Saving an edit reloads the whole profile (details, record and tabs).
  const [version, setVersion] = useState(0);
  return <PupilProfile key={version} id={id} onEdited={() => setVersion((v) => v + 1)} />;
}

function PupilProfile({ id, onEdited }: { id: string; onEdited: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const rawTab = params.get("tab") as Tab | null;
  const tab: Tab = rawTab && TABS.includes(rawTab) ? rawTab : "overview";
  const [child, setChild] = useState<RecordChild | null>(null);
  const [parent, setParent] = useState<Parent | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [att30, setAtt30] = useState<ReturnType<typeof attendanceFigures> | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      // The last 30 UK days, today included.
      const since = ukDaysAgo(29);
      const [c, e, a, f] = await Promise.all([
        supabase.from("children").select("id, name, dob, parent_user_id, year_groups(name)").eq("id", id).maybeSingle(),
        supabase.from("enrolments").select("classes(name)").eq("child_id", id),
        supabase.from("attendance_records").select("status, lesson_instances!inner(date)").eq("child_id", id).gte("lesson_instances.date", since).limit(1000),
        // Separate, so the profile still loads before migration 0184 is applied.
        supabase.from("children").select("working_above_year_group").eq("id", id).maybeSingle(),
      ]);
      if (cancelled) return;
      const row = c.data as unknown as ChildRaw | null;
      if (!row) return setState("missing");
      setChild({
        id: row.id,
        name: row.name,
        dob: row.dob,
        yearGroup: row.year_groups?.name || null,
        classes: ((e.data as unknown as EnrolRaw[]) || []).map((x) => x.classes?.name || "").filter(Boolean),
      });
      setAtt30(attendanceFigures((a.data as { status: string }[]) || []));
      setAbove(!!(f.data as { working_above_year_group?: boolean } | null)?.working_above_year_group);
      setState("ready");
      if (row.parent_user_id) {
        const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", row.parent_user_id).maybeSingle();
        if (!cancelled) setParent((p as Parent | null) || null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const record = usePupilRecordData(id, { showAcks: true });
  const progress = useMemo(() => completeness(record.details, record.contacts.length, child ? child.dob : undefined), [record.details, record.contacts.length, child]);
  const missing = progress.items.filter((i) => !i.ok).map((i) => i.label);
  const alerts = medicalAlerts(record.details);

  const setTab = (t: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (t === "overview") q.delete("tab");
    else q.set("tab", t);
    router.replace(`/admin/pupils?${q.toString()}`, { scroll: false });
  };

  const crumbs = [{ label: "Home", href: "/admin/dashboard" }, { label: "Pupils", href: "/admin/pupils" }, { label: child?.name || "Pupil" }];

  if (state === "missing") {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Pupil not found" />
        <p className="text-sm text-ink/65">
          We couldn&apos;t find that pupil.{" "}
          <Link href="/admin/pupils" className="font-medium text-teal-700 underline">
            Back to all pupils
          </Link>
        </p>
      </>
    );
  }

  const requestHref = (() => {
    if (!child || !parent?.email || missing.length === 0) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const body = [
      `Assalamu alaikum${parent.full_name ? ` ${parent.full_name}` : ""},`,
      "",
      `We are missing some details from ${child.name}'s school record:`,
      ...missing.map((m) => `- ${m}`),
      "",
      `Please sign in to your family dashboard and complete them under "Pupil information": ${origin}/family/dashboard`,
      "",
      "Thank you,",
      "Tarbiyyah Global Academy",
    ].join("\n");
    return `mailto:${encodeURIComponent(parent.email)}?subject=${encodeURIComponent(`${child.name}: a few details still needed`)}&body=${encodeURIComponent(body)}`;
  })();

  const age = child ? ageFromDob(child.dob) : null;
  const items: { key: Tab; label: string; count?: number; countAlert?: boolean }[] = [
    { key: "overview", label: "Overview" },
    { key: "details", label: "Details & contacts", count: missing.length || undefined, countAlert: true },
    { key: "medical", label: "Medical & consents", count: alerts.length || undefined, countAlert: true },
    { key: "send", label: "Support plan" },
    { key: "attendance", label: "Attendance" },
    { key: "behaviour", label: "Behaviour & rewards" },
    { key: "reports", label: "Reports" },
    { key: "assessment", label: "Entry assessment" },
  ];

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          crumbs={crumbs}
          title={child?.name || "Pupil"}
          subtitle="Pupil profile. Opening it is logged because it contains medical details."
          actions={
            <button type="button" onClick={() => printElement(findPrintScope(printRef.current, "pupil-record"))} className={ui.btnSecondary}>
              Print record
            </button>
          }
          action={
            state === "ready" ? (
              <Button variant="primary" icon="pencil" onClick={() => setEditing(true)}>
                Edit pupil
              </Button>
            ) : undefined
          }
        />
      </div>

      {state === "loading" || !child ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      ) : (
        <div className="space-y-4">
          {/* Who they are, at a glance. */}
          <section className={`${ui.card} print:hidden`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink/70">{[child.yearGroup, child.classes.join(", ")].filter(Boolean).join(" · ") || "Not in a class yet"}</p>
                <p className="text-sm text-ink/70">{child.dob ? `Born ${formatDob(child.dob)}${age !== null ? ` (age ${age})` : ""}` : "Date of birth not recorded"}</p>
                {parent && <p className="text-sm text-ink/70">Parent: {parent.full_name || parent.email}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {above && <StatusChip tone="info">Working above year group</StatusChip>}
                {alerts.map((a) => (
                  <StatusChip key={a} tone="bad">
                    {a}
                  </StatusChip>
                ))}
              </div>
            </div>
            {record.loaded && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <ProgressBar percent={progress.percent} />
                </div>
                <p className="text-xs text-ink/65">{record.details?.completed_at ? `Details complete · ${formatStamp(record.details.completed_at)}` : `${missing.length} detail${missing.length === 1 ? "" : "s"} missing`}</p>
              </div>
            )}
          </section>

          <Tabs items={items} value={tab} onChange={setTab} label="Pupil profile sections" className="print:hidden" />

          {record.error && <Notice tone="bad">{record.error}</Notice>}

          <div className="print:hidden">
            {tab === "overview" && (
              <div className="space-y-4">
                {record.loaded && missing.length > 0 && <MissingCard missing={missing} requestHref={requestHref} hasParentEmail={!!parent?.email} started={!!record.details} onOpen={() => setTab("details")} />}
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Fig label="Attendance (30 days)" value={att30 ? (att30.rate === null ? "–" : `${att30.rate}%`) : "…"} warn={!!att30 && att30.rate !== null && att30.rate < 90} sub={att30 ? `${att30.absent} missed of ${att30.lessons}` : undefined} />
                  <Fig label="Medical alerts" value={record.loaded ? (alerts.length ? alerts.join(", ") : "None") : "…"} warn={alerts.length > 0} sub={record.details?.health_confirmed ? "Confirmed by the family" : "Not confirmed yet"} />
                  <Fig label="Emergency contacts" value={record.loaded ? String(record.contacts.length) : "…"} warn={record.loaded && record.contacts.length < 2} sub={record.contacts[0] ? `${record.contacts[0].name}, ${record.contacts[0].phone}` : "None yet"} />
                  <Fig label="Consents" value={record.details ? `${record.details.photo_consent ? "Photos" : "No photos"} · ${record.details.trip_consent ? "Trips" : "No trips"}` : "…"} sub={record.details?.photo_consent == null || record.details?.trip_consent == null ? "Not all answered" : "Answered"} />
                </dl>
                <PupilOverview childId={child.id} />
              </div>
            )}
            {tab === "details" && (
              <div className="space-y-4">
                {record.loaded && missing.length > 0 && <MissingCard missing={missing} requestHref={requestHref} hasParentEmail={!!parent?.email} started={!!record.details} />}
                {record.loaded ? <RecordSections data={record} only={["basics", "contacts"]} /> : <div className="h-32 animate-pulse rounded-2xl bg-white" />}
              </div>
            )}
            {tab === "medical" && (record.loaded ? <div className="space-y-4"><RecordSections data={record} showAcks only={["health", "consents", "acks"]} /></div> : <div className="h-32 animate-pulse rounded-2xl bg-white" />)}
            {tab === "send" && <SupportPlanEditor childId={child.id} childName={child.name} />}
            {tab === "attendance" && <PupilAttendanceTab childId={child.id} />}
            {tab === "behaviour" && <PupilBehaviourTab childId={child.id} extra={<LeaderboardPrivacy kids={[{ id: child.id, name: child.name }]} />} />}
            {tab === "reports" && <PupilReportsTab childId={child.id} childName={child.name} />}
            {tab === "assessment" && (
              <div className="space-y-3">
                <BaselineAssessments childId={child.id} canEdit />
                <p className="text-xs text-ink/65">
                  The online entry assessments are set and marked in{" "}
                  <Link href="/admin/assessments" className="text-teal-700 underline">
                    Assessments
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>

          {/* Printed: the whole record, whichever tab is open. */}
          <div ref={printRef} className="hidden print:block">
            <PrintScope title={`Pupil information: ${child.name}`} id="pupil-record">
              {record.loaded && <RecordSections data={record} showAcks />}
            </PrintScope>
          </div>
        </div>
      )}
      {editing && (
        <EditPupilModal
          childId={id}
          onClose={() => setEditing(false)}
          onSaved={onEdited}
        />
      )}
    </>
  );
}

function MissingCard({ missing, requestHref, hasParentEmail, started, onOpen }: { missing: string[]; requestHref: string | null; hasParentEmail: boolean; started: boolean; onOpen?: () => void }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4" aria-labelledby="missing-h">
      <h3 id="missing-h" className="text-sm font-semibold text-amber-950">
        {started ? "Still missing from the record" : "The family hasn't started this record yet"}
      </h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {missing.map((m) => (
          <li key={m}>
            <StatusChip tone="warn">{m}</StatusChip>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-950/80">The family sees a reminder on their dashboard until it&apos;s complete.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {requestHref ? (
          <a href={requestHref} className={`${ui.btnPrimary} ${ui.sm}`}>
            Request from family
          </a>
        ) : (
          <span className="text-xs text-amber-950/80">{hasParentEmail ? "" : "No parent email address on file."}</span>
        )}
        {onOpen && (
          <button type="button" onClick={onOpen} className={`${ui.btnSecondary} ${ui.sm}`}>
            See details
          </button>
        )}
      </div>
    </section>
  );
}
