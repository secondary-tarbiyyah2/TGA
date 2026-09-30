"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { getSupabaseClient, getEdgeFunctionUrl } from "@/lib/supabase/client";
import { learnRoleLabel } from "@/lib/learn/session";

type YearGroup = { id: string; name: string };

type InviteResult = { ok: boolean; error?: string; detail?: string; profileId?: string; isNewUser?: boolean; setupLink?: string; emailSent?: boolean };

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

type AddedChild = {
  id: string;
  name: string;
  studentLink: string | null;
  studentEmailSent: boolean;
  linked: boolean; // has a student login (or was explicitly skipped)
  skipped: boolean;
};

/**
 * One guided flow: invite a parent, add ONE OR MORE of their children, then
 * (optionally, per child) invite each child their own student login —
 * carrying state between the steps instead of three disconnected screens.
 * Every account creation step re-uses the exact same learn-invite Edge
 * Function the rest of /learn's staff invites go through (no password ever
 * emailed — a one-time setup link is shown once and must be copied/sent by
 * the admin, same handling as scripts/invite-first-head-teacher.mjs).
 *
 * Reworked (reported feedback: "doing this each time is slow when a family
 * has multiple children, or when processing several families in a row") so
 * that:
 *  - the "child" step is now repeatable — "Add another child" stays on the
 *    same step instead of forcing a restart of the parent-invite step for
 *    every additional child of the same family;
 *  - the "student login" step now covers every child added in one pass,
 *    not just one;
 *  - "done" offers a clear "Start another family" action that actually
 *    resets the whole flow (previously a dead end — see the report).
 *
 * Deliberately NOT a CSV/bulk import: the reported pain point is "a family
 * with a handful of children" and "several families in a row", both of
 * which this in-flow repeat solves directly; a CSV importer would add real
 * complexity (parsing, validation, partial-failure handling, a very
 * different UI) for a use case (bulk-loading many families at once) that
 * wasn't actually reported. Worth reconsidering if onboarding an entire
 * school roll at once turns out to be a real, recurring need.
 */
function GuidedFlow({ yearGroups, onChanged }: { yearGroups: YearGroup[]; onChanged: () => void }) {
  const supabase = getSupabaseClient();
  const [step, setStep] = useState<Step>("parent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parent
  const [parentEmail, setParentEmail] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentLink, setParentLink] = useState<string | null>(null);
  const [parentEmailSent, setParentEmailSent] = useState(false);
  const [parentUserId, setParentUserId] = useState<string | null>(null);

  // Children added so far, this family
  const [children, setChildren] = useState<AddedChild[]>([]);
  const [childName, setChildName] = useState("");
  const [childDob, setChildDob] = useState("");
  const [childYearGroupId, setChildYearGroupId] = useState("");

  // Student logins, keyed by child id, for the "student" step
  const [studentEmails, setStudentEmails] = useState<Record<string, string>>({});

  const resetAll = () => {
    setStep("parent");
    setError(null);
    setParentEmail("");
    setParentName("");
    setParentLink(null);
    setParentEmailSent(false);
    setParentUserId(null);
    setChildren([]);
    setChildName("");
    setChildDob("");
    setChildYearGroupId("");
    setStudentEmails({});
  };

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
      setParentEmailSent(!!result.emailSent);
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
      setChildren((prev) => [...prev, { id: data.id, name: childName.trim(), studentLink: null, studentEmailSent: false, linked: false, skipped: false }]);
      onChanged();
      // Reset the form fields only — stay on the same "child" step so
      // adding a second/third/fourth child is just filling the form again,
      // no navigating back or restarting the parent step.
      setChildName("");
      setChildDob("");
      setChildYearGroupId("");
    } finally {
      setBusy(false);
    }
  };

  const proceedToStudentLogins = () => {
    if (children.length === 0) return;
    setStep("student");
  };

  const inviteStudentFor = async (child: AddedChild) => {
    const email = (studentEmails[child.id] || "").trim();
    if (!supabase || !email) return;
    setBusy(true);
    setError(null);
    try {
      const result = await invite({ email, fullName: child.name, role: "student" });
      if (!result.ok || !result.profileId) {
        setError(`Could not invite a login for ${child.name}: ${result.detail || result.error}`);
        return;
      }
      const { error: linkErr } = await supabase
        .from("student_accounts")
        .upsert({ child_id: child.id, profile_id: result.profileId, invited_at: new Date().toISOString() }, { onConflict: "child_id" });
      if (linkErr) {
        setError(`Account created for ${child.name} but could not link it to their child record: ${linkErr.message}`);
        return;
      }
      setChildren((prev) =>
        prev.map((c) => (c.id === child.id ? { ...c, linked: true, studentLink: result.setupLink || null, studentEmailSent: !!result.emailSent } : c))
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const skipStudentFor = (childId: string) => {
    // A child record with no linked account is a normal, supported end
    // state (not every child needs their own login yet).
    setChildren((prev) => prev.map((c) => (c.id === childId ? { ...c, skipped: true } : c)));
  };

  const finishFamily = () => setStep("done");

  const allChildrenHandled = children.every((c) => c.linked || c.skipped);

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <div className="flex items-center gap-2 text-xs font-medium text-ink/50">
        {(["parent", "child", "student", "done"] as Step[]).map((s, i) => (
          <span key={s} className={`flex items-center gap-2 ${step === s ? "text-gold-700" : ""}`}>
            {i > 0 && <span>→</span>}
            {i + 1}. {s === "parent" ? "Parent" : s === "child" ? "Child(ren)" : s === "student" ? "Student logins" : "Done"}
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
          <h2 className="font-serif text-h3 font-semibold text-ink">2. Add their children</h2>
          {parentLink && (
            <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">
              {parentEmailSent ? (
                <>Parent account created — a setup email has been sent to them directly.</>
              ) : (
                <>
                  Parent account created, but the setup email could not be sent. Copy this link and send it to the parent yourself
                  (shown once):{" "}
                  <a href={parentLink} className="break-all text-gold-700 underline">
                    {parentLink}
                  </a>
                </>
              )}
            </p>
          )}

          {children.length > 0 && (
            <ul className="space-y-1 text-sm text-ink/70">
              {children.map((c) => (
                <li key={c.id} className="rounded-lg bg-cream px-3 py-1.5">
                  {c.name}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Child's full name" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            <input type="date" value={childDob} onChange={(e) => setChildDob(e.target.value)} className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm" />
            <select value={childYearGroupId} onChange={(e) => setChildYearGroupId(e.target.value)} aria-label="Year group" className="rounded-lg border border-gold-light/60 px-3 py-2 text-sm">
              <option value="">Year group…</option>
              {yearGroups.map((yg) => (
                <option key={yg.id} value={yg.id}>
                  {yg.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !childName.trim() || !childDob} onClick={addChild} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900 disabled:opacity-50">
              {children.length === 0 ? "Add child" : "Add another child"}
            </button>
          </div>

          {children.length > 0 && (
            <button type="button" onClick={proceedToStudentLogins} className="rounded-full border border-gold-500 px-4 py-2 text-xs font-semibold text-gold-700 hover:bg-cream">
              Continue to student logins ({children.length} {children.length === 1 ? "child" : "children"}) →
            </button>
          )}
        </div>
      )}

      {step === "student" && (
        <div className="mt-4 space-y-3">
          <h2 className="font-serif text-h3 font-semibold text-ink">3. Give each child their own login (optional)</h2>
          <p className="text-xs text-ink/60">
            Every student, any year group, gets a full account — the dashboard is simply simpler for younger year groups. You
            can skip any of these and add a login later from this same page.
          </p>
          <div className="space-y-2">
            {children.map((c) => (
              <div key={c.id} className="rounded-lg border border-gold-light/40 p-3">
                <p className="text-sm font-medium text-ink">{c.name}</p>
                {c.linked ? (
                  <p className="mt-1 text-xs text-ink/60">
                    {c.studentEmailSent ? (
                      "Login created — a setup email has been sent to the family directly."
                    ) : c.studentLink ? (
                      <>
                        Login created, but the setup email could not be sent. Copy this link and send it to the family yourself
                        (shown once):{" "}
                        <a href={c.studentLink} className="break-all text-gold-700 underline">
                          {c.studentLink}
                        </a>
                      </>
                    ) : (
                      "Login created."
                    )}
                  </p>
                ) : c.skipped ? (
                  <p className="mt-1 text-xs text-ink/60">Skipped for now — add a login later from this page.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={studentEmails[c.id] || ""}
                      onChange={(e) => setStudentEmails((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder={`${c.name}'s email`}
                      type="email"
                      className="rounded-lg border border-gold-light/60 px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={busy || !(studentEmails[c.id] || "").trim()}
                      onClick={() => inviteStudentFor(c)}
                      className="rounded-full bg-gold-500 px-3 py-1.5 text-xs font-semibold text-ink-900 disabled:opacity-50"
                    >
                      Invite
                    </button>
                    <button type="button" onClick={() => skipStudentFor(c.id)} className="rounded-full border border-gold-light/60 px-3 py-1.5 text-xs text-ink/60 hover:bg-cream">
                      Skip for now
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={finishFamily} className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900">
            {allChildrenHandled ? "Finish this family" : "Finish (skip the rest)"}
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="mt-4 space-y-2">
          <h2 className="font-serif text-h3 font-semibold text-ink">Done</h2>
          <p className="text-sm text-ink/70">
            {children.length} {children.length === 1 ? "child has" : "children have"} been added to this family
            {children.some((c) => c.linked) ? ", with logins for those given one." : "."}
          </p>
          <p className="text-xs text-ink/50">Enrol {children.map((c) => c.name).join(", ")} into their classes from Academic → Classes.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                resetAll();
                onChanged();
              }}
              className="rounded-full bg-gold-500 px-4 py-2 text-xs font-semibold text-ink-900"
            >
              Start another family
            </button>
          </div>
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
  const [search, setSearch] = useState("");

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

  if (rows === null) return <p className="text-sm text-ink/60">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink/60">No families added yet.</p>;

  const query = search.trim().toLowerCase();
  const filtered = query
    ? rows.filter((r) =>
        [r.childName, r.yearGroup, r.parentName, r.parentEmail].some((v) => (v || "").toLowerCase().includes(query))
      )
    : rows;

  return (
    <div>
      {/* Client-side filter only — the whole roster is already loaded above, so this is instant with no round trip. Worth a real search-as-you-go combobox once families run into the hundreds; a plain filtered table is still comfortable at current/expected roll sizes. */}
      <div className="mb-3">
        <label htmlFor="family-search" className="sr-only">
          Search families by child, year group or parent
        </label>
        <input
          id="family-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by child, year group or parent…"
          className="w-full max-w-sm rounded-lg border border-gold-light/60 px-3 py-2 text-sm sm:w-auto"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-ink/60">No families match &quot;{search.trim()}&quot;.</p>
      ) : (
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
              {filtered.map((r) => (
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
      )}
      <p className="mt-2 text-xs text-ink/50">
        {filtered.length} of {rows.length} famil{rows.length === 1 ? "y" : "ies"}
        {query ? " shown" : " on record"}.
      </p>
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

      <GuidedFlow yearGroups={yearGroups} onChanged={() => setRefreshKey((k) => k + 1)} />

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
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <PeopleContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
