"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { learnRoleLabel } from "@/lib/learn/session";

type YearGroup = { id: string; name: string };

type InviteResult = { ok: boolean; error?: string; detail?: string; profileId?: string; isNewUser?: boolean; setupLink?: string };

async function invite(body: Record<string, unknown>): Promise<InviteResult> {
  const supabase = getSupabaseClient();
  const url = getEdgeFunctionUrl("learn-invite");
  if (!supabase || !url) return { ok: false, error: "not_configured" };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

type Step = "parent" | "child" | "student" | "done";

/**
 * One guided flow: invite a parent, add their child, then (optionally)
 * invite the child their own student login — carrying state between the
 * three steps instead of three disconnected screens. Every account
 * creation step re-uses the exact same learn-invite Edge Function the rest
 * of /learn's staff invites go through (no password ever emailed — a
 * one-time setup link is shown once and must be copied/sent by the admin,
 * same handling as scripts/invite-first-head-teacher.mjs).
 */
function GuidedFlow({ yearGroups, onFinished }: { yearGroups: YearGroup[]; onFinished: () => void }) {
  const supabase = getSupabaseClient();
  const [step, setStep] = useState<Step>("parent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parent
  const [parentEmail, setParentEmail] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentLink, setParentLink] = useState<string | null>(null);
  const [parentUserId, setParentUserId] = useState<string | null>(null);

  // Child
  const [childName, setChildName] = useState("");
  const [childDob, setChildDob] = useState("");
  const [childYearGroupId, setChildYearGroupId] = useState("");
  const [childId, setChildId] = useState<string | null>(null);

  // Student account
  const [studentEmail, setStudentEmail] = useState("");
  const [studentLink, setStudentLink] = useState<string | null>(null);

  const inviteParent = async () => {
    if (!parentEmail.trim() || !parentName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invite({ email: parentEmail.trim(), fullName: parentName.trim(), role: "parent" });
      if (!result.ok || !result.profileId) {
        setError(`Could not invite parent: ${result.detail || result.error}`);
        return;
      }
      setParentUserId(result.profileId);
      setParentLink(result.setupLink || null);
      setStep("child");
    } finally {
      setBusy(false);
    }
  };

  const addChild = async () => {
    if (!supabase || !parentUserId || !childName.trim() || !childDob) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: insertErr } = await supabase
        .from("children")
        .insert({ parent_user_id: parentUserId, name: childName.trim(), dob: childDob, year_group_id: childYearGroupId || null })
        .select("id")
        .single();
      if (insertErr || !data) {
        setError(`Could not add child: ${insertErr?.message}`);
        return;
      }
      setChildId(data.id);
      setStep("student");
    } finally {
      setBusy(false);
    }
  };

  const inviteStudent = async () => {
    if (!supabase || !childId || !studentEmail.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invite({ email: studentEmail.trim(), fullName: childName.trim(), role: "student" });
      if (!result.ok || !result.profileId) {
        setError(`Could not invite student: ${result.detail || result.error}`);
        return;
      }
      const { error: linkErr } = await supabase
        .from("student_accounts")
        .upsert({ child_id: childId, profile_id: result.profileId, invited_at: new Date().toISOString() }, { onConflict: "child_id" });
      if (linkErr) {
        setError(`Account created but could not link it to the child record: ${linkErr.message}`);
        return;
      }
      setStudentLink(result.setupLink || null);
      setStep("done");
    } finally {
      setBusy(false);
    }
  };

  const skipStudentAccount = () => {
    // A child record with no linked account is a normal, supported end
    // state (not every child needs their own login yet).
    setStep("done");
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex items-center gap-2 text-xs font-medium text-ink/50">
        {(["parent", "child", "student", "done"] as Step[]).map((s, i) => (
          <span key={s} className={`flex items-center gap-2 ${step === s ? "text-gold-700" : ""}`}>
            {i > 0 && <span>→</span>}
            {i + 1}. {s === "parent" ? "Parent" : s === "child" ? "Child" : s === "student" ? "Student login" : "Done"}
          </span>
        ))}
      </div>

      {error && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}

      {step === "parent" && (
        <div className="mt-4 space-y-3">
          <h2 className="font-serif text-h3 font-semibold text-ink">1. Invite the parent</h2>
          <div className="flex flex-wrap gap-2">
            <input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="Parent's full name" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            <input value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="Parent's email" type="email" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            <button type="button" disabled={busy} onClick={inviteParent} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
              Invite &amp; continue
            </button>
          </div>
        </div>
      )}

      {step === "child" && (
        <div className="mt-4 space-y-3">
          <h2 className="font-serif text-h3 font-semibold text-ink">2. Add their child</h2>
          {parentLink && (
            <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">
              Parent account created. Setup link (send this to the parent — it is shown once):{" "}
              <a href={parentLink} className="break-all text-gold-700 underline">
                {parentLink}
              </a>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Child's full name" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            <input type="date" value={childDob} onChange={(e) => setChildDob(e.target.value)} className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            <select value={childYearGroupId} onChange={(e) => setChildYearGroupId(e.target.value)} className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
              <option value="">Year group…</option>
              {yearGroups.map((yg) => (
                <option key={yg.id} value={yg.id}>
                  {yg.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy} onClick={addChild} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
              Add child &amp; continue
            </button>
          </div>
        </div>
      )}

      {step === "student" && (
        <div className="mt-4 space-y-3">
          <h2 className="font-serif text-h3 font-semibold text-ink">3. Give {childName} their own login (optional)</h2>
          <p className="text-xs text-ink/60">
            Every student, any year group, gets a full account — the dashboard is simply simpler for younger year groups. You
            can skip this and add it later from this same page.
          </p>
          <div className="flex flex-wrap gap-2">
            <input value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} placeholder="Student's email" type="email" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            <button type="button" disabled={busy || !studentEmail.trim()} onClick={inviteStudent} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
              Invite &amp; finish
            </button>
            <button type="button" onClick={skipStudentAccount} className="rounded-full border border-gold-light/60 px-4 py-2 text-xs text-ink/60 hover:bg-cream">
              Skip for now
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="mt-4 space-y-2">
          <h2 className="font-serif text-h3 font-semibold text-ink">Done</h2>
          <p className="text-sm text-ink/70">{childName} has been added, linked to their parent{studentLink ? ", with their own login." : "."}</p>
          {studentLink && (
            <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">
              Student setup link (send this to the family — it is shown once):{" "}
              <a href={studentLink} className="break-all text-gold-700 underline">
                {studentLink}
              </a>
            </p>
          )}
          <p className="text-xs text-ink/50">Enrol {childName} into their classes from Academic → Classes.</p>
          <button type="button" onClick={onFinished} className="rounded-full border border-gold-500 px-4 py-2 text-xs text-gold-700 hover:bg-cream">
            Start another
          </button>
        </div>
      )}
    </div>
  );
}

type FamilyRow = {
  childId: string;
  childName: string;
  yearGroup: string | null;
  parentName: string | null;
  parentEmail: string | null;
  hasStudentAccount: boolean;
};

function ExistingFamilies() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<FamilyRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: children } = await supabase.from("children").select("id, name, parent_user_id, year_groups(name)").order("name");
      const parentIds = Array.from(new Set((children || []).map((c) => c.parent_user_id)));
      const { data: parents } = parentIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", parentIds) : { data: [] };
      const parentById = new Map((parents || []).map((p) => [p.id, p]));
      const childIds = (children || []).map((c) => c.id);
      const { data: accounts } = childIds.length ? await supabase.from("student_accounts").select("child_id").in("child_id", childIds) : { data: [] };
      const accountChildIds = new Set((accounts || []).map((a) => a.child_id as string));

      setRows(
        (children || []).map((c) => ({
          childId: c.id,
          childName: c.name,
          yearGroup: (c.year_groups as unknown as { name?: string } | null)?.name || null,
          parentName: parentById.get(c.parent_user_id)?.full_name || null,
          parentEmail: parentById.get(c.parent_user_id)?.email || null,
          hasStudentAccount: accountChildIds.has(c.id),
        }))
      );
    })();
  }, [supabase]);

  if (rows === null) return null;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No families added yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr>
            {["Child", "Year group", "Parent", "Student login"].map((h) => (
              <th key={h} className="border-b border-gold-light/50 p-2 font-semibold text-ink/70">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.childId}>
              <td className="border-b border-gold-light/20 p-2 font-medium text-ink">{r.childName}</td>
              <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.yearGroup || "—"}</td>
              <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.parentName || r.parentEmail || "—"}</td>
              <td className="border-b border-gold-light/20 p-2 text-ink/70">{r.hasStudentAccount ? "Yes" : "Not yet"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeopleContent() {
  const supabase = getSupabaseClient();
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("year_groups")
      .select("id, name")
      .order("sort_order")
      .then(({ data }) => setYearGroups((data as YearGroup[]) || []));
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">People</h1>
        <p className="mt-1 text-sm text-ink/60">
          Add a parent, their child, and (optionally) the child&apos;s own login — one guided flow, no passwords ever emailed.
          Staff accounts (teachers, admins, {learnRoleLabel("admissions")}) are created the same way from a future staff-management
          screen; this page covers families.
        </p>
      </div>

      <GuidedFlow yearGroups={yearGroups} onFinished={() => setRefreshKey((k) => k + 1)} />

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Families on record</h2>
        <div className="mt-4">
          <ExistingFamilies key={refreshKey} />
        </div>
      </div>
    </div>
  );
}

export default function AdminPeoplePage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <PeopleContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
