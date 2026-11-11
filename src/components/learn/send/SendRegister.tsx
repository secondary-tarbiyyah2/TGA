"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs } from "@/components/learn/Tabs";
import { EmptyState, Notice, ui } from "@/components/learn/ui";
import { PLAN_COLUMNS, PLAN_STATUS, PRIMARY_NEED, SUPPORT_LEVEL, reviewState, useCanManageSend, type PrimaryNeed, type RegisterRow, type SupportLevel, type SupportPlan } from "@/lib/learn/send";
import { Select } from "@/components/learn/Select";
import { PupilLink } from "@/components/learn/pupil/PupilLink";
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
  const [need, setNeed] = useState<"" | PrimaryNeed>("");
  const [level, setLevel] = useState<"" | SupportLevel>("");
  const [year, setYear] = useState("");
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

  // The register's figures (owner feedback 3: total on the register, EHC plans, SEN support, reviews due).
  const figures = useMemo(() => {
    const on = (rows || []).filter((x) => x.status === "active" || x.status === "draft");
    const due = on.filter((x) => x.status === "active" && ["overdue", "soon", "none"].includes(reviewState(x.next_review_due).state));
    return {
      on: on.length,
      ehcp: on.filter((x) => x.support_level === "ehcp").length,
      sen: on.filter((x) => x.support_level === "sen_support").length,
      monitoring: on.filter((x) => x.support_level === "monitoring").length,
      due: due.length,
      overdue: due.filter((x) => reviewState(x.next_review_due).state === "overdue").length,
    };
  }, [rows]);
  const years = useMemo(() => [...new Set((rows || []).map((r) => r.year_group).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true })), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || [])
      .filter((x) => !needle || x.child_name.toLowerCase().includes(needle))
      .filter((x) => (!need || x.primary_need === need) && (!level || x.support_level === level) && (!year || x.year_group === year))
      .filter((x) => {
        if (filter === "plans") return x.status === "active" || x.status === "draft";
        if (filter === "due") return x.status === "active" && ["overdue", "soon", "none"].includes(reviewState(x.next_review_due).state);
        if (filter === "drafts") return x.status === "draft";
        if (filter === "flagged") return !x.plan_id && x.flagged;
        return x.status === "closed";
      })
      .sort((a, b) => (filter === "due" ? (a.next_review_due || "").localeCompare(b.next_review_due || "") : a.child_name.localeCompare(b.child_name)));
  }, [rows, filter, q, need, level, year]);

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
        <dl className="grid grid-cols-2 border-y border-gold-light lg:grid-cols-4" data-guide="send-figures">
          {[
            { label: "On the register", value: figures.on, note: `${figures.monitoring} monitoring`, go: () => { setFilter("plans"); setLevel(""); } },
            { label: "EHC plans", value: figures.ehcp, note: "Education, health and care plans", go: () => { setFilter("plans"); setLevel("ehcp"); } },
            { label: "SEN support", value: figures.sen, note: "Support from the school", go: () => { setFilter("plans"); setLevel("sen_support"); } },
            { label: "Reviews due", value: figures.due, note: figures.overdue ? `${figures.overdue} overdue` : "None overdue", bad: figures.overdue > 0, go: () => { setFilter("due"); setLevel(""); } },
          ].map((f, i) => (
            <div key={f.label} className={`${i % 2 === 1 ? "border-l border-gold-light" : ""} ${i >= 2 ? "border-t border-gold-light lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
              <button type="button" onClick={f.go} className="block w-full px-4 py-4 text-left hover:bg-cream/50">
                <dt className="t-eyebrow">{f.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">{rows === null ? "…" : f.value}</dd>
                <dd className={`t-meta mt-0.5 ${f.bad ? "font-medium !text-red-700" : ""}`}>{f.note}</dd>
              </button>
            </div>
          ))}
        </dl>
        <div className={ui.toolbar}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" className={`${ui.input} !w-auto min-w-[12rem] flex-1`} />
          <Select value={need} onChange={(e) => setNeed(e.target.value as "" | PrimaryNeed)} aria-label="Area of need">
            <option value="">Every area of need</option>
            {(Object.keys(PRIMARY_NEED) as PrimaryNeed[]).map((k) => (
              <option key={k} value={k}>
                {PRIMARY_NEED[k]}
              </option>
            ))}
          </Select>
          <Select value={level} onChange={(e) => setLevel(e.target.value as "" | SupportLevel)} aria-label="Level of support">
            <option value="">Every level</option>
            {(Object.keys(SUPPORT_LEVEL) as SupportLevel[]).map((k) => (
              <option key={k} value={k}>
                {SUPPORT_LEVEL[k]}
              </option>
            ))}
          </Select>
          <Select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year group">
            <option value="">Every year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
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
            <RegisterTable rows={shown} onOpen={(id) => go(id)} onSaved={load} nameLink={area === "admin" ? (r) => <PupilLink id={r.child_id} name={r.child_name} className="font-medium text-ink" /> : undefined} />
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
