"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { LearnRole } from "@/lib/learn/session";
import { CredentialsCard } from "./StudentCredentials";
import { studentAccountAction, type IssuedCredentials } from "./studentAccounts";
import { ui } from "@/components/learn/ui";
import { PupilPlacement } from "@/components/learn/pupil/PupilPlacement";
import { GOLD_BUTTON, INPUT_CLASS, friendlyError, invite, type ClassOption, type InviteResult, type ParentOption, type YearGroup } from "./shared";

export type PersonType = "student" | "parent" | "teacher" | "staff";

type Outcome = { text: string; link?: string; code?: string; creds?: IssuedCredentials };

type LoginMode = "username" | "email" | "none";

const TILES: { type: PersonType; title: string; blurb: string; icon: string }[] = [
  { type: "student", title: "Student", blurb: "A pupil, linked to a parent", icon: "🎓" },
  { type: "parent", title: "Parent", blurb: "A family login, with children", icon: "👨‍👩‍👧" },
  { type: "teacher", title: "Teacher", blurb: "Teacher or teaching assistant", icon: "📚" },
  { type: "staff", title: "Headteacher / Admin", blurb: "Headteacher, Admin or Admissions", icon: "🛡️" },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/65">{hint}</span>}
    </label>
  );
}

function describeInvite(name: string, email: string, r: InviteResult, what: string): Outcome {
  if (r.emailSent) {
    return { text: r.isNewUser === false ? `Invite sent to ${email} (they already had an account, so this also adds the ${what} role).` : `Invite sent to ${email}.` };
  }
  return {
    text: `${name}'s account is ready, but the email to ${email} couldn't be sent. Send them the setup link, or the code with the address learn.tarbiyyah.co.uk/login/forgot (shown once):`,
    link: r.setupLink,
    code: r.setupCode,
  };
}

export function AddPersonModal({
  initialType,
  presetParentId,
  yearGroups,
  classes,
  parents,
  onClose,
  onChanged,
}: {
  initialType?: PersonType;
  presetParentId?: string;
  yearGroups: YearGroup[];
  classes: ClassOption[];
  parents: ParentOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = getSupabaseClient();
  const [type, setType] = useState<PersonType | null>(initialType || null);
  const [done, setDone] = useState<Outcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // shared fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // student / child fields
  const [dob, setDob] = useState("");
  const [yearGroupId, setYearGroupId] = useState("");
  // Placed in or working at a year above their age (T27); staff only (0184).
  const [above, setAbove] = useState(false);
  const [classId, setClassId] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  // A pupil can sign in with a username and temporary password (no email), or with their own email.
  const [loginMode, setLoginMode] = useState<LoginMode>("username");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [parentMode, setParentMode] = useState<"existing" | "new">(presetParentId || parents.length > 0 ? "existing" : "new");
  const [parentId, setParentId] = useState(presetParentId || "");
  const [newParentName, setNewParentName] = useState("");
  const [newParentEmail, setNewParentEmail] = useState("");
  // parent: optional first child
  const [withChild, setWithChild] = useState(false);
  const [childName, setChildName] = useState("");
  // teacher / staff
  const [teacherKind, setTeacherKind] = useState<LearnRole>("teacher");
  const [staffRole, setStaffRole] = useState<LearnRole>("admissions");
  // carried across retries so a failed second step never duplicates the first
  const [createdParentId, setCreatedParentId] = useState<string | null>(null);
  const [createdChildId, setCreatedChildId] = useState<string | null>(null);

  const pickType = (t: PersonType) => {
    setType(t);
    setError(null);
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      setCopied(null);
    }
  };

  // Creates the child record (+ optional class enrolment + optional own login) for a known parent.
  const addChildFor = async (parent: string, cname: string, out: Outcome[]): Promise<boolean> => {
    if (!supabase) {
      setError("The portal isn't connected to the server yet.");
      return false;
    }
    let childId = createdChildId;
    if (!childId) {
      const { data, error: insErr } = await supabase
        .from("children")
        .insert({ parent_user_id: parent, name: cname, dob, year_group_id: yearGroupId || null, ...(above ? { working_above_year_group: true } : {}) })
        .select("id")
        .single();
      const row = data as { id: string } | null;
      if (insErr || !row) {
        setError(`Couldn't save ${cname}. ${insErr?.message || "Try again."}`);
        return false;
      }
      childId = row.id;
      setCreatedChildId(row.id);
    }
    out.push({ text: `${cname} has been added.` });
    if (classIds.length > 0) {
      const { error: enrErr } = await supabase.rpc("set_child_classes", { p_child_id: childId, p_class_ids: classIds });
      const names = classIds.map((id) => classes.find((c) => c.id === id)?.name).filter(Boolean).join(", ");
      out.push({ text: enrErr ? `${cname} couldn't be added to the chosen classes. Do it from Academic, then Classes.` : `Enrolled in ${names}.` });
    }
    const login = studentEmail.trim();
    if (loginMode === "username") {
      const r = await studentAccountAction("create", childId, cname);
      if (!r.ok) {
        out.push({ text: `${cname} was added, but their login couldn't be created: ${r.text} You can add it later from the people list.` });
      } else {
        out.push({ text: `Username login created for ${cname}. The parent has been emailed the details. Note the password now: it can't be shown again.`, creds: r.creds });
      }
    } else if (loginMode === "email" && login) {
      const r = await invite({ email: login, fullName: cname, role: "student" });
      if (!r.ok || !r.profileId) {
        out.push({ text: `${cname} was added, but their login couldn't be created: ${friendlyError(r)} You can add it later from the people list.` });
      } else {
        const { error: linkErr } = await supabase
          .from("student_accounts")
          .upsert({ child_id: childId, profile_id: r.profileId, invited_at: new Date().toISOString() }, { onConflict: "child_id" });
        out.push(
          linkErr
            ? { text: `${cname}'s login was created but couldn't be linked to their record: ${linkErr.message}` }
            : describeInvite(cname, login, r, "student")
        );
      }
    }
    return true;
  };

  const resolveParent = async (out: Outcome[]): Promise<string | null> => {
    if (parentMode === "existing") return parentId || null;
    if (createdParentId) return createdParentId;
    const r = await invite({ email: newParentEmail.trim(), fullName: newParentName.trim(), role: "parent" });
    if (!r.ok || !r.profileId) {
      setError(`Couldn't invite the parent. ${friendlyError(r)}`);
      return null;
    }
    setCreatedParentId(r.profileId);
    out.push(describeInvite(newParentName.trim(), newParentEmail.trim(), r, "parent"));
    return r.profileId;
  };

  const submit = async () => {
    if (!type) return;
    setBusy(true);
    setError(null);
    const out: Outcome[] = [];
    try {
      if (type === "student") {
        const parent = await resolveParent(out);
        if (!parent) return;
        if (!(await addChildFor(parent, name.trim(), out))) {
          if (out.length) setError((e) => `${out.map((o) => o.text).join(" ")} ${e || ""}`.trim());
          return;
        }
      } else if (type === "parent") {
        const r = await invite({ email: email.trim(), fullName: name.trim(), role: "parent" });
        if (!r.ok || !r.profileId) {
          setError(`Couldn't invite ${name.trim()}. ${friendlyError(r)}`);
          return;
        }
        out.push(describeInvite(name.trim(), email.trim(), r, "parent"));
        if (withChild) {
          if (!(await addChildFor(r.profileId, childName.trim(), out))) {
            setParentMode("existing");
            setParentId(r.profileId);
            setError((e) => `Invite sent, but the child wasn't saved. ${e || ""}`.trim());
            return;
          }
        }
      } else {
        const role: LearnRole = type === "teacher" ? teacherKind : staffRole;
        const body: Record<string, unknown> = { email: email.trim(), fullName: name.trim(), role };
        if (type === "teacher" && classId) {
          body.scopeType = "class";
          body.scopeId = classId;
        }
        const r = await invite(body);
        if (!r.ok) {
          setError(`Couldn't invite ${name.trim()}. ${friendlyError(r)}`);
          return;
        }
        out.push(describeInvite(name.trim(), email.trim(), r, role === "head_teacher" ? "Headteacher" : role));
      }
      setDone(out);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const emailOk = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
  const valid = (() => {
    if (!type) return false;
    if (type === "student") {
      const parentOk = parentMode === "existing" ? !!parentId : !!newParentName.trim() && emailOk(newParentEmail);
      return !!name.trim() && !!dob && parentOk && (loginMode !== "email" || emailOk(studentEmail));
    }
    if (type === "parent") return !!name.trim() && emailOk(email) && (!withChild || (!!childName.trim() && !!dob));
    return !!name.trim() && emailOk(email);
  })();

  // Says why "Add" is greyed out, instead of leaving the admin to guess.
  const missing = (() => {
    if (!type) return [];
    const m: string[] = [];
    if (type === "student") {
      if (!name.trim()) m.push("the pupil's name");
      if (!dob) m.push("date of birth");
      if (parentMode === "existing" ? !parentId : !newParentName.trim()) m.push("a parent");
      if (parentMode !== "existing" && !emailOk(newParentEmail)) m.push("the parent's email");
      if (loginMode === "email" && !emailOk(studentEmail)) m.push("the pupil's email");
    } else {
      if (!name.trim()) m.push("name");
      if (!emailOk(email)) m.push("a valid email");
      if (type === "parent" && withChild) {
        if (!childName.trim()) m.push("the child's name");
        if (!dob) m.push("the child's date of birth");
      }
    }
    return m;
  })();

  const title = done ? "All done" : !type ? "Add a person" : `Add ${TILES.find((t) => t.type === type)?.title.toLowerCase()}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gold-light px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-xl leading-none text-ink/65 hover:bg-cream">
            ×
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {done ? (
            <>
              <ul className="space-y-2">
                {done.map((o, i) => (
                  <li key={i} className="rounded-lg bg-teal-100/60 px-3 py-2 text-sm text-ink">
                    ✓ {o.text}
                    {o.creds && <span className="mt-2 block"><CredentialsCard creds={o.creds} onDismiss={() => setDone((d) => (d ? d.map((x) => (x === o ? { ...x, creds: undefined } : x)) : d))} /></span>}
                    {o.link && (
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <input readOnly value={o.link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded border border-gold-light bg-white px-2 py-1 text-xs" aria-label="Setup link" />
                        <button type="button" onClick={() => copy(o.link as string)} className="rounded-lg border border-gold-light bg-white px-3 py-1 text-xs font-semibold hover:bg-cream">
                          {copied === o.link ? "Copied" : "Copy link"}
                        </button>
                      </span>
                    )}
                    {o.code && (
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-ink/70">Setup code</span>
                        <span className="rounded bg-white px-2 py-1 font-mono text-base font-bold tracking-[0.3em]">{o.code}</span>
                        <button type="button" onClick={() => copy(o.code as string)} className="rounded-lg border border-gold-light bg-white px-3 py-1 text-xs font-semibold hover:bg-cream">
                          {copied === o.code ? "Copied" : "Copy code"}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className={ui.btnSecondary}>
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // reset to a blank step 1 by closing and reopening is the parent's job; just clear locally
                    setDone(null);
                    setType(null);
                    setName("");
                    setEmail("");
                    setDob("");
                    setYearGroupId("");
                    setAbove(false);
                    setStudentEmail("");
                    setNewParentName("");
                    setNewParentEmail("");
                    setChildName("");
                    setClassId("");
                    setClassIds([]);
                    setLoginMode("username");
                    setWithChild(false);
                    setCreatedChildId(null);
                    setCreatedParentId(null);
                    if (createdParentId) {
                      setParentMode("existing");
                      setParentId(createdParentId);
                    }
                  }}
                  className={GOLD_BUTTON}
                >
                  Add another
                </button>
              </div>
            </>
          ) : !type ? (
            <>
              <p className="text-sm text-ink/65">Who are you adding?</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {TILES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => pickType(t.type)}
                    className="flex items-center gap-3 rounded-2xl border border-gold-light bg-white p-4 text-left transition hover:border-gold-500 hover:bg-gold-50 hover:shadow-sm"
                  >
                    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-2xl">
                      {t.icon}
                    </span>
                    <span>
                      <span className="block text-base font-semibold text-ink">{t.title}</span>
                      <span className="block text-xs text-ink/65">{t.blurb}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {error && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}

              {type === "student" && (
                <>
                  <Field label="Student's full name">
                    <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                  </Field>
                  <div className="rounded-xl bg-gold-50 p-3">
                    <div className="mb-2 flex gap-2 text-xs font-semibold">
                      {parents.length > 0 && (
                        <button type="button" onClick={() => setParentMode("existing")} aria-pressed={parentMode === "existing"} className={`rounded-full px-3 py-1 ${parentMode === "existing" ? "bg-gold-500 text-ink" : "bg-white text-ink/70"}`}>
                          Existing parent
                        </button>
                      )}
                      <button type="button" onClick={() => setParentMode("new")} aria-pressed={parentMode === "new"} className={`rounded-full px-3 py-1 ${parentMode === "new" ? "bg-gold-500 text-ink" : "bg-white text-ink/70"}`}>
                        New parent
                      </button>
                    </div>
                    {parentMode === "existing" ? (
                      <Field label="Parent">
                        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={INPUT_CLASS}>
                          <option value="">Choose a parent…</option>
                          {parents.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.email ? ` (${p.email})` : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Parent's name">
                          <input value={newParentName} onChange={(e) => setNewParentName(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                        </Field>
                        <Field label="Parent's email">
                          <input type="email" value={newParentEmail} onChange={(e) => setNewParentEmail(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                        </Field>
                      </div>
                    )}
                  </div>

                  <PupilPlacement
                    idPrefix="add-pupil"
                    dob={dob}
                    setDob={setDob}
                    yearGroupId={yearGroupId}
                    setYearGroupId={setYearGroupId}
                    above={above}
                    setAbove={setAbove}
                    yearGroups={yearGroups}
                    classes={classes}
                    classIds={classIds}
                    setClassIds={setClassIds}
                  />
                  <Field label="Student's login" hint={loginMode === "username" ? "A username (firstname.lastname) and a temporary password are generated. The parent is emailed them, and you see them once. The student chooses their own password at first sign-in." : undefined}>
                    <select value={loginMode} onChange={(e) => setLoginMode(e.target.value as LoginMode)} className={INPUT_CLASS}>
                      <option value="username">Username and password (no email needed)</option>
                      <option value="email">Their own email address</option>
                      <option value="none">No login yet</option>
                    </select>
                  </Field>
                  {loginMode === "email" && (
                    <Field label="Student's email">
                      <input type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                    </Field>
                  )}
                </>
              )}

              {type !== "student" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Full name">
                    <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                  </Field>
                </div>
              )}

              {type === "parent" && (
                <div className="rounded-xl bg-gold-50 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <input type="checkbox" checked={withChild} onChange={(e) => setWithChild(e.target.checked)} className="h-4 w-4" />
                    Add their child now
                  </label>
                  {withChild && (
                    <div className="mt-3 space-y-3">
                      <Field label="Child's full name">
                        <input value={childName} onChange={(e) => setChildName(e.target.value)} className={INPUT_CLASS} autoComplete="off" />
                      </Field>
                      <PupilPlacement idPrefix="add-child" dob={dob} setDob={setDob} yearGroupId={yearGroupId} setYearGroupId={setYearGroupId} above={above} setAbove={setAbove} yearGroups={yearGroups} />
                    </div>
                  )}
                </div>
              )}

              {type === "teacher" && (
                <>
                  <Field label="Role">
                    <select value={teacherKind} onChange={(e) => setTeacherKind(e.target.value as LearnRole)} className={INPUT_CLASS}>
                      <option value="teacher">Teacher</option>
                      <option value="teaching_assistant_cover">Teaching assistant / cover</option>
                    </select>
                  </Field>
                  <Field label="Class (optional)" hint="You can assign more classes later from Academic → Classes.">
                    <select value={classId} onChange={(e) => setClassId(e.target.value)} className={INPUT_CLASS}>
                      <option value="">No class yet</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}

              {type === "staff" && (
                <Field label="Role" hint="Only a Headteacher can add another Headteacher or an Admin.">
                  <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as LearnRole)} className={INPUT_CLASS}>
                    <option value="admissions">Admissions</option>
                    <option value="admin">Admin</option>
                    <option value="head_teacher">Headteacher</option>
                  </select>
                </Field>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {initialType ? <span /> : (
                  <button type="button" onClick={() => { setType(null); setError(null); }} className={ui.btnGhost}>
                    ← Back
                  </button>
                )}
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {!valid && !busy && missing.length > 0 && <span className="text-xs text-ink/65">Still needed: {missing.join(", ")}.</span>}
                  <button type="button" disabled={busy || !valid} onClick={submit} className={GOLD_BUTTON}>
                    {busy ? "Saving…" : type === "student" ? "Add student" : "Send invite"}
                  </button>
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
