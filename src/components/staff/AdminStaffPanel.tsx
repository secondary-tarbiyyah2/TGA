"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/Dropdown";

type StaffRow = {
  id: string;
  profile_id: string;
  display_name: string;
  role_title: string;
  active: boolean;
  profiles: { email: string; role: string } | null;
};

type AuditRow = { id: number; actor_email: string | null; action: string; target_table: string; created_at: string };

type InviteResult = { email: string; tempPassword: string; loginUrl: string; emailSent: boolean };

export function AdminStaffPanel({ roleFilter, defaultInviteRole = "staff" }: { roleFilter?: string; defaultInviteRole?: string }) {
  const supabase = getSupabaseClient();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadStaff() {
    if (!supabase) return;
    const { data } = await supabase
      .from("staff_members")
      .select("id, profile_id, display_name, role_title, active, profiles(email, role)")
      .order("display_name", { ascending: true });
    setStaff((data as unknown as StaffRow[]) || []);
  }

  async function loadAuditLog() {
    if (!supabase) return;
    const { data } = await supabase
      .from("audit_log")
      .select("id, actor_email, action, target_table, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    setAuditLog((data as AuditRow[]) || []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle state sync
    loadStaff();
    loadAuditLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [supabase]);

  const visibleStaff = roleFilter ? staff.filter((s) => s.profiles?.role === roleFilter) : staff;

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setInviting(true);
    setInviteError(null);
    setInviteResult(null);
    setCopied(false);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "");
    const { data, error } = await supabase.functions.invoke("admin-manage-staff", {
      body: {
        action: "invite",
        email,
        displayName: form.get("displayName"),
        roleTitle: form.get("roleTitle"),
        role: form.get("role"),
      },
    });
    setInviting(false);
    if (error || !data?.ok) {
      setInviteError("Couldn't create the account, check the details and try again.");
      return;
    }
    setInviteResult({ email, tempPassword: data.tempPassword, loginUrl: data.loginUrl, emailSent: data.emailSent });
    e.currentTarget.reset();
    loadStaff();
    loadAuditLog();
  }

  function copyCredentials() {
    if (!inviteResult) return;
    const text = `Sign in at ${inviteResult.loginUrl}\nEmail: ${inviteResult.email}\nTemporary password: ${inviteResult.tempPassword}\n(You'll be asked to set a new password on first sign-in.)`;
    navigator.clipboard?.writeText(text).then(() => setCopied(true));
  }

  async function setActive(profileId: string, active: boolean) {
    if (!supabase) return;
    await supabase.functions.invoke("admin-manage-staff", { body: { action: "set_active", profileId, active } });
    loadStaff();
    loadAuditLog();
  }

  async function setRole(profileId: string, role: string) {
    if (!supabase) return;
    await supabase.functions.invoke("admin-manage-staff", { body: { action: "set_role", profileId, role } });
    loadStaff();
    loadAuditLog();
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-serif text-lg font-semibold text-ink">{roleFilter === "teacher" ? "Teacher accounts" : "Staff accounts"}</h2>
        <ul className="mt-3 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
          {visibleStaff.length === 0 && <li className="p-4 text-sm text-ink/65">No accounts yet.</li>}
          {visibleStaff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-ink">
                  {s.display_name} <span className="text-xs text-ink/65">– {s.role_title}</span>
                </p>
                <p className="text-xs text-ink/65">
                  {s.profiles?.email} · role: {s.profiles?.role} · {s.active ? "active" : "deactivated"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!roleFilter && (
                  <button
                    type="button"
                    onClick={() => setRole(s.profile_id, s.profiles?.role === "admin" ? "staff" : "admin")}
                    className="rounded-full border border-gold-500 px-3 py-1.5 text-xs text-gold-700 hover:bg-cream"
                  >
                    {s.profiles?.role === "admin" ? "Demote to staff" : "Promote to admin"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActive(s.profile_id, !s.active)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${s.active ? "border-red-300 text-red-700 hover:bg-red-50" : "border-gold-500 text-gold-700 hover:bg-cream"}`}
                >
                  {s.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-ink">{roleFilter === "teacher" ? "Create a teacher account" : "Invite a new staff account"}</h2>
        <p className="mt-1 text-sm text-ink/65">
          Creates the account with a temporary password right away, no email needed. We&apos;ll also try to email it,
          but either way you get a copyable password below to share yourself.
        </p>
        <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-ink sm:col-span-1">
            Email
            <input name="email" type="email" required className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="text-sm text-ink sm:col-span-1">
            Full name
            <input name="displayName" type="text" required className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          <label className="text-sm text-ink sm:col-span-1">
            Role / subject title
            <input name="roleTitle" type="text" required placeholder="e.g. Admissions, Year 4 Teacher" className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2" />
          </label>
          {roleFilter === "teacher" ? (
            <input type="hidden" name="role" value="teacher" />
          ) : (
            <label className="text-sm text-ink sm:col-span-1">
              Account level
              <Select native name="role" defaultValue={defaultInviteRole} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2">
                <option value="staff">Staff</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </Select>
            </label>
          )}
          <div className="sm:col-span-2">
            <button type="submit" disabled={inviting} className="rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">
              {inviting ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
        {inviteError && <p role="alert" className="mt-3 text-sm text-red-700">{inviteError}</p>}
        {inviteResult && (
          <div className="mt-4 rounded-2xl border border-gold-500/40 bg-gold-50 p-4">
            <p className="text-sm font-semibold text-ink">
              Account ready for {inviteResult.email}. {inviteResult.emailSent ? "An email was also sent." : "The email could not be sent, share these details yourself:"}
            </p>
            <div className="mt-2 space-y-1 font-mono text-xs text-ink/80">
              <p>Sign in: {inviteResult.loginUrl}</p>
              <p>Email: {inviteResult.email}</p>
              <p>Temporary password: {inviteResult.tempPassword}</p>
            </div>
            <button type="button" onClick={copyCredentials} className="mt-3 rounded-full border border-gold-500 px-4 py-1.5 text-xs text-gold-700 hover:bg-cream">
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
            <p className="mt-2 text-xs text-ink/65">This password is shown once, it won&apos;t be shown again after you leave this page.</p>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-ink">Recent admin activity</h2>
        <p className="mt-1 text-sm text-ink/65">Every change to staff accounts, roles and bookings is logged automatically.</p>
        <ul className="mt-3 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white text-sm">
          {auditLog.length === 0 && <li className="p-4 text-ink/65">No activity yet.</li>}
          {auditLog.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between p-3">
              <span>
                <span className="font-medium text-ink">{entry.actor_email || "system"}</span>{" "}
                <span className="text-ink/65">{entry.action.toLowerCase()}d {entry.target_table.replace(/_/g, " ")}</span>
              </span>
              <span className="text-xs text-ink/65">{new Date(entry.created_at).toLocaleString("en-GB")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
