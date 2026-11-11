"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BaselineAssessments } from "./BaselineAssessments";
import { PageHeader } from "@/components/learn/PageHeader";
import { PrintScope, findPrintScope, printElement } from "@/components/learn/printScope";
import { SectionLayout, SectionNav } from "@/components/learn/SectionNav";
import { PupilChronology, PupilSummary } from "./ProfileSummary";
import { PupilDocumentsTab, PupilQuranTab, PupilWorkTab } from "./ProfileSections";
import { Button, Notice, StatusChip, ui } from "@/components/learn/ui";
import { getSupabaseClient } from "@/lib/supabase/client";
import { LeaderboardPrivacy } from "@/components/learn/behaviour/LeaderboardPrivacy";
import { ProgressBar, ageFromDob, completeness, formatDob, formatStamp, medicalAlerts } from "./data";
import { PupilOverview } from "./PupilOverview";
import { RecordSections, usePupilRecordData, type RecordChild } from "./PupilRecord";
import { PupilAttendanceTab, PupilBehaviourTab, PupilReportsTab } from "./ProfileTabs";
import { SupportPlanEditor } from "@/components/learn/send/SupportPlanEditor";
import { EditPupilModal } from "./EditPupilModal";
import { createAccountsFor } from "@/components/learn/admissions/accountsApi";
import { askNotice } from "@/components/learn/kit";
import { PupilDetailsEditor } from "./PupilDetailsEditor";

type ChildRaw = { id: string; name: string; dob: string | null; parent_user_id: string | null; year_group_id?: string | null; year_groups?: { name: string } | null };
type EnrolRaw = { classes?: { name: string } | null };
type Parent = { full_name: string | null; email: string | null };

type Tab = "overview" | "chronology" | "details" | "medical" | "send" | "attendance" | "behaviour" | "work" | "quran" | "reports" | "documents" | "assessment";
const TABS: Tab[] = ["overview", "chronology", "details", "medical", "send", "attendance", "behaviour", "work", "quran", "reports", "documents", "assessment"];

/**
 * A pupil's profile: the one place for everything about a child. Overview,
 * details and contacts, medical and consents, attendance, behaviour and
 * rewards, reports and entry assessment. Opening it is logged (medical data).
 */
export function AdminPupilDetail({ id }: { id: string }) {
  // Saving an edit reloads the whole profile (details, record and tabs).
  const [version, setVersion] = useState(0);
  const params = useSearchParams();
  const router = useRouter();
  // "Edit details" opens over the record (owner, 11 Nov 2026: actions open in place). The
  // address keeps &edit=details, so older links open the same panel over the record.
  const editingDetails = params.get("edit") === "details";
  const closeDetails = () => {
    const q = new URLSearchParams(params.toString());
    q.delete("edit");
    router.replace(`/admin/pupils?${q.toString()}`, { scroll: false });
  };
  return (
    <>
      <PupilProfile key={version} id={id} onEdited={() => setVersion((v) => v + 1)} />
      {editingDetails && <PupilDetailsEditor id={id} onClose={closeDetails} onSaved={() => setVersion((v) => v + 1)} />}
    </>
  );
}

function PupilProfile({ id, onEdited }: { id: string; onEdited: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const rawTab = params.get("tab") as Tab | null;
  const tab: Tab = rawTab && TABS.includes(rawTab) ? rawTab : "overview";
  const [child, setChild] = useState<RecordChild | null>(null);
  const [parent, setParent] = useState<Parent | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [yearGroupId, setYearGroupId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [above, setAbove] = useState(false);
  // The accepted application this pupil came from, if any: "Fill in from application".
  const [fromApp, setFromApp] = useState<{ id: string; child_first_name: string; child_last_name: string } | null>(null);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [c, e, f] = await Promise.all([
        supabase.from("children").select("id, name, dob, parent_user_id, year_group_id, year_groups(name)").eq("id", id).maybeSingle(),
        supabase.from("enrolments").select("classes(name)").eq("child_id", id),
        // Separate, so the profile still loads before migration 0185 is applied.
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
      setYearGroupId(row.year_group_id || null);
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

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase
      .from("admissions_applications")
      .select("id, child_first_name, child_last_name")
      .eq("child_id", id)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (alive) setFromApp(((data as { id: string; child_first_name: string; child_last_name: string }[] | null) || [])[0] || null);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  /** Copies what the family wrote on the application into any EMPTY parts of the record (never overwrites). */
  const fillFromApplication = async () => {
    if (!fromApp) return;
    setFilling(true);
    const r = await createAccountsFor(fromApp, { createStudentLogin: false });
    setFilling(false);
    await askNotice(r.ok ? "Filled in from the application" : "Could not fill in from the application", r.notes.join(" ") || "Nothing new to copy.");
    // Every section of the record loads its own data: reload so they all show what was copied.
    if (r.ok) window.location.reload();
  };

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

  const crumbs = [{ label: "Today", href: "/admin/dashboard" }, { label: "Pupils", href: "/admin/pupils" }, { label: child?.name || "Pupil" }];

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
    { key: "overview", label: "Summary" },
    { key: "chronology", label: "Chronology" },
    { key: "attendance", label: "Attendance" },
    { key: "behaviour", label: "Behaviour and house points" },
    { key: "work", label: "Classwork and grades" },
    { key: "quran", label: "Qur'an" },
    { key: "medical", label: "Medical and consents", count: alerts.length || undefined, countAlert: true },
    { key: "send", label: "Support plan" },
    { key: "details", label: "Details and contacts", count: missing.length || undefined, countAlert: true },
    { key: "reports", label: "Reports" },
    { key: "documents", label: "Documents" },
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
            <>
              {fromApp && (
                <button type="button" onClick={fillFromApplication} disabled={filling} title="Copies the address, gender, previous school and parent contacts from the application into any empty parts of the record. Nothing already entered is changed." className={ui.btnSecondary}>
                  {filling ? "Filling in…" : "Fill in from application"}
                </button>
              )}
              <button type="button" onClick={() => printElement(findPrintScope(printRef.current, "pupil-record"))} className={ui.btnSecondary}>
                Print record
              </button>
              <Link href={`/admin/messages?family=${id}`} className={ui.btnSecondary}>
                Message family
              </Link>
              <Link href={`/admin/pupils?id=${id}&edit=details`} scroll={false} className={ui.btnSecondary} data-guide="pupil-edit-details">
                Edit details
              </Link>
            </>
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
        <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : (
        <div className="space-y-4">
          {/* Who they are, at a glance. */}
          <section className={`${ui.card} print:hidden`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-ink/70">{[child.yearGroup, child.classes.join(", ")].filter(Boolean).join(" · ") || "Not in a class yet"}</p>
                <p className="text-sm text-ink/70">{child.dob ? `Born ${formatDob(child.dob)}${age !== null ? ` (age ${age})` : ""}` : "Date of birth not recorded"}</p>
                {parent && <p className="text-sm text-ink/70">Parent: {parent.full_name || parent.email}</p>}
                {/* One pupil record: sign-ins live under Office › Accounts, one click away. */}
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm print:hidden">
                  <Link href={`/admin/people?q=${encodeURIComponent(child.name)}`} className="font-medium text-teal-700 hover:underline">
                    Pupil&apos;s sign-in
                  </Link>
                  {parent?.email && (
                    <Link href={`/admin/people?q=${encodeURIComponent(parent.email)}`} className="font-medium text-teal-700 hover:underline">
                      Parent&apos;s sign-in
                    </Link>
                  )}
                </p>
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

          <SectionLayout nav={<SectionNav items={items} value={tab} onChange={setTab} label="Pupil profile sections" guide="pupil-sections" id="pupil-section" />}>
          {record.error && <Notice tone="bad">{record.error}</Notice>}

          <div className="print:hidden">
            {tab === "overview" && (
              <div className="space-y-4">
                {record.loaded && missing.length > 0 && <MissingCard missing={missing} requestHref={requestHref} hasParentEmail={!!parent?.email} started={!!record.details} onOpen={() => setTab("details")} />}
                <PupilSummary childId={child.id} yearGroupId={yearGroupId} yearGroup={child.yearGroup} scopeNote="Averages are for every pupil in the same year group." />
                <PupilOverview childId={child.id} />
              </div>
            )}
            {tab === "chronology" && <PupilChronology childId={child.id} />}
            {tab === "details" && (
              <div className="space-y-4">
                {record.loaded && missing.length > 0 && <MissingCard missing={missing} requestHref={requestHref} hasParentEmail={!!parent?.email} started={!!record.details} />}
                {record.loaded ? <RecordSections data={record} only={["basics", "contacts"]} /> : <div className="h-32 motion-safe:animate-pulse rounded-2xl bg-white" />}
              </div>
            )}
            {tab === "medical" && (record.loaded ? <div className="space-y-4"><RecordSections data={record} showAcks only={["health", "consents", "acks"]} /></div> : <div className="h-32 motion-safe:animate-pulse rounded-2xl bg-white" />)}
            {tab === "send" && <SupportPlanEditor childId={child.id} childName={child.name} />}
            {tab === "attendance" && <PupilAttendanceTab childId={child.id} />}
            {tab === "behaviour" && <PupilBehaviourTab childId={child.id} extra={<LeaderboardPrivacy kids={[{ id: child.id, name: child.name }]} />} />}
            {tab === "work" && <PupilWorkTab childId={child.id} />}
            {tab === "quran" && <PupilQuranTab childId={child.id} name={child.name} area="admin" />}
            {tab === "reports" && <PupilReportsTab childId={child.id} childName={child.name} />}
            {tab === "documents" && <PupilDocumentsTab childId={child.id} onOpenReports={() => setTab("reports")} />}
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

          </SectionLayout>

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
