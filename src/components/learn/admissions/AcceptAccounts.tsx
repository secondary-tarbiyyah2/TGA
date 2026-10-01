"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { invite, friendlyError, type InviteResult } from "@/components/learn/people/shared";
import type { ApplicationPatch, ApplicationRow, ApplicationStatus } from "@/components/admissions/applicationShared";

type YearGroup = { id: string; name: string };
type ClassOpt = { id: string; name: string; year_group_id: string | null };
type Line = { text: string; link?: string; bad?: boolean };

function yearNumber(name: string): number {
  if (/reception/i.test(name)) return 0;
  const m = /(\d+)/.exec(name);
  return m ? Number(m[1]) : 0;
}

const fieldCls = "mt-1 block w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm";

function describe(name: string, email: string, r: InviteResult, what: string): Line {
  if (r.emailSent) return { text: `Setup email sent to ${email} (${what}).` };
  return { text: `${name}'s ${what} account is ready, but the email to ${email} could not be sent. Copy this setup link and send it yourself:`, link: r.setupLink, bad: true };
}

export function AcceptAccounts({
  app,
  onPatch,
  onMove,
}: {
  app: ApplicationRow;
  onPatch: (id: string, patch: ApplicationPatch) => Promise<boolean>;
  onMove: (id: string, status: ApplicationStatus) => Promise<boolean>;
}) {
  const [yearGroups, setYearGroups] = useState<YearGroup[]>([]);
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [yearGroupId, setYearGroupId] = useState("");
  const [classId, setClassId] = useState("");
  const [wantStudent, setWantStudent] = useState(false);
  const [studentEmail, setStudentEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const done = Boolean(app.accounts_created_at);
  const childName = `${app.child_first_name} ${app.child_last_name}`;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    Promise.all([
      supabase.from("year_groups").select("id, name").order("sort_order"),
      supabase.from("classes").select("id, name, year_group_id").order("name"),
    ]).then(([yg, cl]) => {
      const ygs = (yg.data as YearGroup[] | null) || [];
      setYearGroups(ygs);
      setClasses((cl.data as ClassOpt[] | null) || []);
      const match = ygs.find((y) => y.name.toLowerCase() === app.year_group_applying.toLowerCase());
      if (match) {
        setYearGroupId(match.id);
        setWantStudent(yearNumber(match.name) >= 7); // default on for Year 7+
      }
    });
  }, [app.year_group_applying]);

  const classOptions = classes.filter((c) => !yearGroupId || !c.year_group_id || c.year_group_id === yearGroupId);

  async function run(resend: boolean) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (wantStudent && !done && !studentEmail.trim()) return setLines([{ text: "Enter the student's email address, or untick the student account.", bad: true }]);
    setBusy(true);
    const out: Line[] = [];
    try {
      // 1. Move to Accepted (asks for confirmation if fee/deposit are outstanding).
      if (app.status !== "accepted") {
        const moved = await onMove(app.id, "accepted");
        if (!moved) return;
      }

      // 2. Parent account. Skipped on a second click unless re-sending links.
      let parentId = app.parent_profile_id;
      if (!parentId || resend) {
        const r = await invite({ email: app.parent_email.trim().toLowerCase(), fullName: app.parent_name, role: "parent" });
        if (!r.ok || !r.profileId) {
          out.push({ text: `Couldn't create the parent account. ${friendlyError(r)}`, bad: true });
          return;
        }
        parentId = r.profileId;
        if (!app.parent_profile_id) await onPatch(app.id, { parent_profile_id: parentId });
        out.push(describe(app.parent_name, app.parent_email, r, "parent"));
      } else {
        out.push({ text: "Parent account already exists." });
      }

      // 3. Child record, reusing an existing identical one (parent + name + dob).
      let childId = app.child_id;
      if (!childId) {
        const { data: existing } = await supabase
          .from("children")
          .select("id")
          .eq("parent_user_id", parentId)
          .eq("name", childName)
          .eq("dob", app.child_dob)
          .limit(1);
        childId = (existing as { id: string }[] | null)?.[0]?.id || null;
        if (!childId) {
          const { data, error } = await supabase
            .from("children")
            .insert({ parent_user_id: parentId, name: childName, dob: app.child_dob, year_group_id: yearGroupId || null })
            .select("id")
            .single();
          const row = data as { id: string } | null;
          if (error || !row) {
            out.push({ text: `The parent account is ready, but the pupil record couldn't be saved: ${error?.message || "unknown error"}. Click again to retry.`, bad: true });
            return;
          }
          childId = row.id;
        }
        await onPatch(app.id, { child_id: childId });
        out.push({ text: `${childName} added as a pupil.` });
      } else {
        out.push({ text: `${childName} already has a pupil record.` });
      }
      if (classId) {
        const { error } = await supabase.from("enrolments").upsert({ class_id: classId, child_id: childId }, { onConflict: "class_id,child_id" });
        const cls = classes.find((c) => c.id === classId)?.name || "the class";
        out.push(error ? { text: `Couldn't enrol in ${cls}. Do it from Academic, Classes.`, bad: true } : { text: `Enrolled in ${cls}.` });
      }

      // 4. Optional student login.
      if (wantStudent && studentEmail.trim() && (!app.student_profile_id || resend)) {
        const r = await invite({ email: studentEmail.trim().toLowerCase(), fullName: childName, role: "student" });
        if (!r.ok || !r.profileId) {
          out.push({ text: `Couldn't create the student account. ${friendlyError(r)}`, bad: true });
        } else {
          const { error } = await supabase
            .from("student_accounts")
            .upsert({ child_id: childId, profile_id: r.profileId, invited_at: new Date().toISOString() }, { onConflict: "child_id" });
          if (error) out.push({ text: `Student login created but not linked to the pupil record: ${error.message}`, bad: true });
          else {
            await onPatch(app.id, { student_profile_id: r.profileId });
            out.push(describe(childName, studentEmail.trim(), r, "student"));
          }
        }
      } else if (app.student_profile_id) {
        out.push({ text: "Student account already exists." });
      }

      if (!app.accounts_created_at) await onPatch(app.id, { accounts_created_at: new Date().toISOString() });
    } finally {
      setLines(out);
      setBusy(false);
    }
  }

  return (
    <section aria-label="Accept and create accounts" className="rounded-xl border border-gold-light/50 bg-white p-4">
      <h3 className="font-serif text-lg font-semibold text-ink">Accept &amp; create accounts</h3>
      <p className="mt-1 text-xs text-ink/60">
        Creates the parent login ({app.parent_email}) and a pupil record linked to it. Each person gets a setup email. Safe to click again: nothing is duplicated.
      </p>
      {!done && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Year group
            <select value={yearGroupId} onChange={(e) => { setYearGroupId(e.target.value); setClassId(""); }} className={fieldCls}>
              <option value="">Not set</option>
              {yearGroups.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-ink">
            Class <span className="font-normal text-ink/50">(optional)</span>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className={fieldCls}>
              <option value="">No class yet</option>
              {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={wantStudent} onChange={(e) => setWantStudent(e.target.checked)} />
            Also create a student login (on by default for Year 7 and above)
          </label>
          {wantStudent && (
            <label className="block text-sm font-medium text-ink sm:col-span-2">
              Student email
              <input type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} className={fieldCls} />
            </label>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => run(false)} disabled={busy} className="rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
          {busy ? "Working…" : done ? "Run again (fill any gaps)" : "Accept & create accounts"}
        </button>
        {done && (
          <button type="button" onClick={() => run(true)} disabled={busy} className="rounded-lg border border-gold-light px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream disabled:opacity-50">
            Re-send setup emails
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <ul role="status" className="mt-3 space-y-2 text-sm">
          {lines.map((l, i) => (
            <li key={i} className={l.bad ? "text-red-700" : "text-ink/80"}>
              {l.text}
              {l.link && <code className="mt-1 block break-all rounded bg-cream p-2 text-xs text-ink">{l.link}</code>}
            </li>
          ))}
        </ul>
      )}
      {done && (
        <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm text-ink">
          Next step: <strong>complete pupil details</strong> (address, medical, contacts and so on) in{" "}
          <Link href={`/admin/people?q=${encodeURIComponent(childName)}`} className="font-semibold text-teal-700 underline">People &amp; accounts</Link>.
        </p>
      )}
    </section>
  );
}
