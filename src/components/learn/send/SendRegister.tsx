"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, Notice, ui } from "@/components/learn/ui";
import { PLAN_COLUMNS, PLAN_STATUS, reviewState, useCanManageSend, type RegisterRow, type SupportPlan } from "@/lib/learn/send";
import { SupportPlanEditor } from "./SupportPlanEditor";
import { PupilSupportCard } from "./SupportAtAGlance";
import { AddPupilPicker, ChangeLog, RegisterTable } from "./SendExtras";

type Filter = "plans" | "due" | "drafts" | "flagged" | "closed" | "log";

/**
 * /admin/send and /teach/send. The SENCo, Headteacher and admin get the SEND
 * register (every plan, reviews due or overdue, drafts started from
 * applications, pupils whose family mentioned a need but have no plan) and
 * edit plans here. Other teachers get the active plans for pupils they teach.
 */
export function SendPage({ area }: { area: "admin" | "teach" }) {
  const canManage = useCanManageSend();
  return canManage ? <SendRegister area={area} /> : <TeacherSupportPlans />;
}

function SendRegister({ area }: { area: "admin" | "teach" }) {
  const params = useSearchParams();
  const router = useRouter();
  const openId = params.get("pupil");
  const [rows, setRows] = useState<RegisterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("plans");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const base = `/${area}/send`;

  const load = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error: e } = await supabase.rpc("send_register");
    if (e) setError(e.message);
    setRows((data as RegisterRow[]) || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const r = rows || [];
    return {
      plans: r.filter((x) => x.status === "active" || x.status === "draft").length,
      due: r.filter((x) => x.status === "active" && ["overdue", "soon", "none"].includes(reviewState(x.next_review_due).state)).length,
      drafts: r.filter((x) => x.status === "draft").length,
      flagged: r.filter((x) => !x.plan_id && x.flagged).length,
      closed: r.filter((x) => x.status === "closed").length,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || [])
      .filter((x) => !needle || x.child_name.toLowerCase().includes(needle))
      .filter((x) => {
        if (filter === "plans") return x.status === "active" || x.status === "draft";
        if (filter === "due") return x.status === "active" && ["overdue", "soon", "none"].includes(reviewState(x.next_review_due).state);
        if (filter === "drafts") return x.status === "draft";
        if (filter === "flagged") return !x.plan_id && x.flagged;
        return x.status === "closed";
      })
      .sort((a, b) => (filter === "due" ? (a.next_review_due || "").localeCompare(b.next_review_due || "") : a.child_name.localeCompare(b.child_name)));
  }, [rows, filter, q]);

  const open = openId ? (rows || []).find((r) => r.child_id === openId) : null;
  const go = (id: string | null) => router.replace(id ? `${base}?pupil=${id}` : base, { scroll: true });

  if (openId) {
    const name = open?.child_name || picked[openId] || "Pupil";
    return (
      <>
        <PageHeader
          crumbs={[{ label: "Home", href: `/${area}/dashboard` }, { label: "SEND register", href: base }, { label: name }]}
          title={`${name}: support plan`}
          subtitle={[open?.year_group, open?.status ? PLAN_STATUS[open.status] : "No plan yet"].filter(Boolean).join(" · ")}
          actions={
            <>
              {area === "admin" && (
                <Link href={`/admin/pupils?id=${openId}`} className={ui.btnSecondary}>
                  Pupil profile
                </Link>
              )}
              <button type="button" className={ui.btnGhost} onClick={() => go(null)}>
                Back to the register
              </button>
            </>
          }
        />
        <SupportPlanEditor childId={openId} childName={name} onChanged={load} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="SEND register"
        subtitle="Pupils with a support plan, reviews coming up, and pupils whose family mentioned a need. Change the level, need, status or review date in the table; open a plan for everything else. Every change is logged."
      />
      {error && <Notice tone="bad">Couldn&apos;t load the register: {error}</Notice>}
      <div className="space-y-4">
        <div className={ui.toolbar}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" className={`${ui.input} !w-auto min-w-[12rem] flex-1`} />
          <AddPupilPicker
            onPick={(id, name) => {
              setPicked((p) => ({ ...p, [id]: name }));
              go(id);
            }}
          />
        </div>
        <Tabs
          variant="switch"
          label="Show"
          guide="send-filter"
          value={filter}
          onChange={setFilter}
          items={[
            { key: "plans", label: "Current plans", count: counts.plans },
            { key: "due", label: "Review due", count: counts.due, countAlert: counts.due > 0 },
            { key: "drafts", label: "Drafts", count: counts.drafts },
            { key: "flagged", label: "Needs mentioned, no plan", count: counts.flagged, countAlert: counts.flagged > 0 },
            { key: "closed", label: "Closed", count: counts.closed },
            { key: "log", label: "Recent changes" },
          ]}
        />
        {filter === "log" ? (
          <ChangeLog showPupil limit={100} refreshKey={rows?.length || 0} />
        ) : rows === null ? (
          <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />
        ) : shown.length === 0 ? (
          <EmptyState title={filter === "flagged" ? "No unplanned needs." : filter === "due" ? "No reviews due in the next 14 days." : "Nothing here."}>
            {filter === "plans" ? "Use Add a pupil above, or open a pupil from Needs mentioned, no plan." : null}
          </EmptyState>
        ) : (
          <div data-guide="send-list" >
            <RegisterTable rows={shown} onOpen={(id) => go(id)} onSaved={load} />
          </div>
        )}
        <p className={ui.hint}>
          Draft plans start by themselves when an applicant who mentioned a need is accepted. The Headteacher gives someone the SENCo role under People, Staff (or switches SENCo on for a teacher who also keeps the register).
        </p>
      </div>
    </>
  );
}

/** For teachers who aren't the SENCo: active plans for the pupils they teach. */
function TeacherSupportPlans() {
  const [plans, setPlans] = useState<(SupportPlan & { children: { name: string } | null })[] | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase
      .from("send_support_plans")
      .select(`${PLAN_COLUMNS}, children(name)`)
      .eq("status", "active")
      .then(({ data }) => {
        const list = ((data as unknown as (SupportPlan & { children: { name: string } | null })[]) || []).slice();
        list.sort((a, b) => (a.children?.name || "").localeCompare(b.children?.name || ""));
        setPlans(list);
      });
  }, []);

  return (
    <>
      <PageHeader title="Support plans" subtitle="Pupils you teach who have a support plan: what to do in lessons and in tests. The SENCo writes and reviews the plans." />
      {plans === null ? (
        <div className="h-40 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : plans.length === 0 ? (
        <EmptyState title="None of your pupils has a support plan.">If you think a pupil needs one, talk to the SENCo.</EmptyState>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => (
            <div key={p.id}>
              <h2 className="mb-1.5 text-base font-semibold text-ink">{p.children?.name || "Pupil"}</h2>
              <PupilSupportCard plan={p} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
