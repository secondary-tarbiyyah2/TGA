"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { PrintButton } from "@/components/learn/PrintButton";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PupilRecord, type RecordChild } from "./PupilRecord";

type ChildRaw = { id: string; name: string; dob: string | null; year_groups?: { name: string } | null };
type EnrolRaw = { classes?: { name: string } | null };

export function AdminPupilDetail({ id }: { id: string }) {
  const [child, setChild] = useState<RecordChild | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [c, e] = await Promise.all([
        supabase.from("children").select("id, name, dob, year_groups(name)").eq("id", id).maybeSingle(),
        supabase.from("enrolments").select("classes(name)").eq("child_id", id),
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
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const crumbs = [{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Pupils", href: "/admin/pupils" }, { label: child?.name || "Pupil" }];

  if (state === "missing") {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Pupil not found" />
        <p className="text-sm text-ink/60">We couldn&apos;t find that pupil.</p>
      </>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader crumbs={crumbs} title={child?.name || "Pupil"} subtitle="Pupil information. Opening this record is logged because it contains medical details." actions={<PrintButton label="Print view" />} />
      </div>
      <h1 className="mb-3 hidden text-xl font-semibold text-ink print:block">Pupil information: {child?.name}</h1>
      {state === "loading" || !child ? <p className="text-sm text-ink/60">Loading…</p> : <PupilRecord child={child} showAcks />}
    </>
  );
}
