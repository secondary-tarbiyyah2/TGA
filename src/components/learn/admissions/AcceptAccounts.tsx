"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ApplicationRow, ApplicationStatus } from "@/components/admissions/applicationShared";
import type { AccountsResult } from "@/components/learn/admissions/accountsApi";
import type { MoveOptions } from "@/components/learn/admissions/ApplicationDrawer";
import type { AdmissionsContext } from "@/components/learn/admissions/useAdmissionsContext";

type ClassOpt = { id: string; name: string; year_group_id: string | null };
type YearGroupRow = { id: string; name: string };
type LoginRow = { username: string; must_change_password: boolean };

export type CreateAccountsFn = (
  app: ApplicationRow,
  opts?: { resend?: boolean; classIds?: string[]; createStudentLogin?: boolean },
) => Promise<AccountsResult>;

/**
 * Accounts for an accepted application. Moving the application to Accepted runs
 * this automatically (see ApplicationsTab); this panel is where staff choose the
 * classes and whether the pupil gets a username login, and where they re-run it.
 */
export function AcceptAccounts({
  app,
  ctx,
  onMove,
  onCreateAccounts,
}: {
  app: ApplicationRow;
  ctx: AdmissionsContext;
  onMove: (id: string, status: ApplicationStatus, opts?: MoveOptions) => Promise<boolean>;
  onCreateAccounts: CreateAccountsFn;
}) {
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [yearGroups, setYearGroups] = useState<YearGroupRow[]>([]);
  const [login, setLogin] = useState<LoginRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<{ text: string; bad?: boolean }[]>([]);
  const done = Boolean(app.accounts_created_at);
  const childName = `${app.child_first_name} ${app.child_last_name}`;
  const classIds = ctx.details?.account_class_ids ?? [];
  const wantLogin = ctx.details?.account_student_login ?? true;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    Promise.all([
      supabase.from("classes").select("id, name, year_group_id").order("name"),
      supabase.from("year_groups").select("id, name").order("sort_order"),
    ]).then(([cl, yg]) => {
      setClasses((cl.data as ClassOpt[] | null) || []);
      setYearGroups((yg.data as YearGroupRow[] | null) || []);
    });
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !app.child_id) return;
    supabase
      .from("student_logins")
      .select("username, must_change_password")
      .eq("child_id", app.child_id)
      .maybeSingle()
      .then(({ data }) => setLogin((data as LoginRow | null) || null));
  }, [app.child_id, app.student_profile_id]);

  const matchingYear = yearGroups.find((y) => y.name.toLowerCase() === app.year_group_applying.toLowerCase());
  const ordered = [...classes].sort((a, b) => {
    const am = matchingYear && a.year_group_id === matchingYear.id ? 0 : 1;
    const bm = matchingYear && b.year_group_id === matchingYear.id ? 0 : 1;
    return am - bm || a.name.localeCompare(b.name);
  });

  async function toggleClass(id: string, on: boolean) {
    const next = on ? [...new Set([...classIds, id])] : classIds.filter((c) => c !== id);
    await ctx.saveDetails({ account_class_ids: next });
  }

  async function run(resend: boolean) {
    if (resend && !window.confirm("Re-send the parent's setup email and generate a NEW temporary password for the pupil? The old password stops working.")) return;
    setBusy(true);
    setNotes([]);
    try {
      if (app.status !== "accepted") {
        // Accepting runs the account creation automatically (ApplicationsTab.moveTo).
        const moved = await onMove(app.id, "accepted");
        if (!moved) return;
        setNotes([{ text: "Accepted. The accounts are being created and the parent is being emailed." }]);
        return;
      }
      const r = await onCreateAccounts(app, { resend, classIds, createStudentLogin: wantLogin });
      setNotes(r.notes.map((text) => ({ text, bad: !r.ok })));
      if (r.ok && !r.emailSent && (r.setupLink || r.credentials)) {
        setNotes((n) => [...n, { text: `The email to ${r.parentEmail || "the parent"} could not be sent${r.emailError ? ` (${r.emailError})` : ""}.`, bad: true }]);
      }
      if (r.setupLink) setNotes((n) => [...n, { text: `Copy this setup link and send it yourself: ${r.setupLink}`, bad: true }]);
    } finally {
      setBusy(false);
    }
  }

  const checkCls = "flex items-center gap-2 text-sm text-ink";

  return (
    <section aria-label="Accept and create accounts" className="rounded-xl border border-gold-light/50 bg-white p-4">
      <h3 className="font-serif text-lg font-semibold text-ink">Accept and create accounts</h3>
      <p className="mt-1 text-xs text-ink/65">
        Accepting an application creates the accounts automatically: the parent account for {app.guardian_is_other && app.guardian_email ? app.guardian_email : app.parent_email} (a setup link is
        emailed, never a password), the pupil record, the classes chosen below and, if ticked, a username login for the pupil. The parent receives one email with everything. Safe to run again: nothing is duplicated.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={`${checkCls} sm:col-span-2`}>
          <input type="checkbox" checked={wantLogin} disabled={!ctx.details && ctx.loading} onChange={(e) => void ctx.saveDetails({ account_student_login: e.target.checked })} />
          Give {app.child_first_name} their own login (username and temporary password, no email needed)
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-ink">
            Classes <span className="font-normal text-ink/65">(optional, choose as many as needed: one per subject)</span>
          </legend>
          {classes.length === 0 ? (
            <p className="mt-1 text-xs text-ink/65">No classes have been set up yet. You can enrol {app.child_first_name} later from Academic.</p>
          ) : (
            <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-gold-light/50 p-2 sm:grid-cols-2">
              {ordered.map((c) => (
                <li key={c.id}>
                  <label className={checkCls}>
                    <input type="checkbox" checked={classIds.includes(c.id)} onChange={(e) => void toggleClass(c.id, e.target.checked)} />
                    <span className="min-w-0 break-words">
                      {c.name}
                      {matchingYear && c.year_group_id === matchingYear.id && <span className="ml-1 text-xs text-teal-700">(same year group)</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>

      {done && (
        <dl className="mt-3 space-y-1 rounded-lg bg-cream px-3 py-2 text-sm text-ink">
          <div>Parent account: {app.parent_profile_id ? "created" : "not yet"}</div>
          <div>Pupil record: {app.child_id ? "created" : "not yet"}</div>
          <div>
            Student login:{" "}
            {login ? (
              <>
                username <strong className="font-mono">{login.username}</strong>
                {login.must_change_password ? " (has not chosen their own password yet)" : " (password chosen)"}
              </>
            ) : app.student_profile_id ? (
              "has an email login"
            ) : (
              "none"
            )}
          </div>
        </dl>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void run(false)} disabled={busy} className="rounded-lg bg-gold-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-50">
          {busy ? "Working…" : app.status !== "accepted" ? "Accept and create accounts" : done ? "Run again (fill any gaps)" : "Create accounts now"}
        </button>
        {done && (
          <button type="button" onClick={() => void run(true)} disabled={busy} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
            Re-send setup email and reset password
          </button>
        )}
      </div>
      {notes.length > 0 && (
        <ul role="status" className="mt-3 space-y-1 text-sm">
          {notes.map((l, i) => (
            <li key={i} className={`break-words ${l.bad ? "text-red-700" : "text-ink/80"}`}>{l.text}</li>
          ))}
        </ul>
      )}
      {done && (
        <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm text-ink">
          Next step: <strong>complete pupil details</strong> (address, medical, contacts and so on) in{" "}
          <Link href={`/admin/people?q=${encodeURIComponent(childName)}`} className="font-semibold text-teal-700 underline">People and accounts</Link>.
        </p>
      )}
    </section>
  );
}
