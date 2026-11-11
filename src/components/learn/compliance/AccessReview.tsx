"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ukDateTime } from "@/lib/learn/ukTime";
import { learnRoleLabel, type LearnRole } from "@/lib/learn/session";
import { LoadingState, Section, Status, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

type Account = {
  user_id: string;
  full_name: string;
  email: string | null;
  roles: string[];
  permissions: string[];
  active: boolean;
  last_sign_in_at: string | null;
  created_at: string | null;
};
type Count = { kind: "parent" | "student"; accounts: number; never_signed_in: number; not_in_90_days: number };
type SignIn = { email: string; failed: number; succeeded: number; last_failed_at: string | null; last_attempt_at: string; networks: number };

const PERMISSION_LABELS: Record<string, string> = {
  safeguarding_lead: "Designated Safeguarding Lead",
  timetabler: "Timetabler",
  can_export_data: "Can export data",
  assessment_lead: "Assessment lead",
  senco: "SENCo",
};

const DAY = 86_400_000;
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);
const roleLabel = (r: string) => learnRoleLabel(r as LearnRole) || r;

/**
 * Accounts and access, read only (migration 0218): every staff account with
 * its roles, extra permissions and last sign-in; family and pupil accounts as
 * totals only; and sign-in attempts per email address. For the Digital Lead's
 * monthly review, and the Headteacher and Admin. Nothing here changes anything:
 * roles are changed by the Headteacher in Staff.
 */
export function AccessReview() {
  const supabase = getSupabaseClient();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [counts, setCounts] = useState<Count[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    Promise.all([supabase.rpc("access_review_accounts"), supabase.rpc("access_review_counts")]).then(([a, c]) => {
      if (a.error || c.error) setError((a.error || c.error)!.message);
      setAccounts((a.data as Account[] | null) || []);
      setCounts((c.data as Count[] | null) || []);
    });
  }, [supabase]);

  const quiet = (accounts || []).filter((a) => a.active && (daysSince(a.last_sign_in_at) ?? 9999) > 90).length;
  const inactiveWithAccess = (accounts || []).filter((a) => !a.active).length;

  return (
    <Section
      title="Accounts and access"
      description="Every staff account with its roles and when it last signed in. Look for roles nobody should still hold, and accounts unused for a long time. Only the Headteacher changes roles, in Staff."
    >
      <div data-guide="access-accounts">
        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}
        {accounts === null ? (
          <LoadingState rows={4} label="Loading accounts" />
        ) : (
          <>
            <p className="t-meta mb-3">
              {accounts.length} staff accounts. {quiet} active {quiet === 1 ? "account has" : "accounts have"} not signed in for 90 days or more
              {inactiveWithAccess > 0 ? `; ${inactiveWithAccess} marked inactive still ${inactiveWithAccess === 1 ? "holds" : "hold"} a role` : ""}.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <caption className="sr-only">Staff accounts, roles and last sign-in</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
                    <th scope="col" className="pb-2 pr-3">Name</th>
                    <th scope="col" className="pb-2 pr-3">Roles and permissions</th>
                    <th scope="col" className="pb-2 pr-3">Last signed in</th>
                    <th scope="col" className="pb-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const days = daysSince(a.last_sign_in_at);
                    return (
                      <tr key={a.user_id} className="border-t border-gold-light align-top">
                        <td className="py-2 pr-3">
                          <span className="font-medium text-ink">{a.full_name}</span>
                          {a.email && <span className="block text-ink-500">{a.email}</span>}
                        </td>
                        <td className="py-2 pr-3">
                          {a.roles.map(roleLabel).join(", ")}
                          {a.permissions.length > 0 && <span className="block text-ink-500">{a.permissions.map((p) => PERMISSION_LABELS[p] || p).join(", ")}</span>}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3">{a.last_sign_in_at ? ukDateTime(a.last_sign_in_at) : "Never"}</td>
                        <td className="py-2 pr-3">
                          {!a.active ? (
                            <Status kind="attention">Inactive, still has a role</Status>
                          ) : days === null || days > 90 ? (
                            <Status kind="attention">{days === null ? "Never signed in" : "Not used for 90 days"}</Status>
                          ) : (
                            <Status kind="completed">In use</Status>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {counts.length > 0 && (
              <p className="t-meta mt-3">
                {counts
                  .map((c) => `${c.kind === "parent" ? "Parent" : "Pupil"} accounts: ${c.accounts} (${c.never_signed_in} never signed in, ${c.not_in_90_days} not for 90 days)`)
                  .join(". ")}
                . Families and pupils are counted, not listed.
              </p>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

export function SignInReview() {
  const supabase = getSupabaseClient();
  const [days, setDays] = useState("30");
  const [rows, setRows] = useState<SignIn[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("access_review_sign_ins", { p_days: Number(days) }).then(({ data, error: err }) => {
      setError(err ? err.message : null);
      setRows((data as SignIn[] | null) || []);
    });
  }, [supabase, days]);

  const failing = (rows || []).filter((r) => r.failed > 0);

  return (
    <Section
      title="Sign-in attempts"
      description="Failed and successful portal sign-ins per email address. Many failures, or failures from several networks, can mean someone is guessing a password. Network addresses are never shown."
      action={
        <label className="flex items-center gap-2 text-sm text-ink">
          <span>Period</span>
          <Select value={days} onChange={(e) => setDays(e.target.value)} className={`${ui.select} w-auto`}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        </label>
      }
    >
      <div data-guide="access-sign-ins">
        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}
        {rows === null ? (
          <LoadingState rows={3} label="Loading sign-ins" />
        ) : failing.length === 0 ? (
          <p className="t-meta">No failed sign-ins in this period{rows.length > 0 ? ` (${rows.length} addresses signed in)` : ""}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Failed sign-in attempts by email address</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
                  <th scope="col" className="pb-2 pr-3">Email</th>
                  <th scope="col" className="pb-2 pr-3">Failed</th>
                  <th scope="col" className="pb-2 pr-3">Succeeded</th>
                  <th scope="col" className="pb-2 pr-3">Networks</th>
                  <th scope="col" className="pb-2 pr-3">Last failure</th>
                </tr>
              </thead>
              <tbody>
                {failing.map((r) => (
                  <tr key={r.email} className="border-t border-gold-light">
                    <td className="py-2 pr-3 text-ink">{r.email}</td>
                    <td className="py-2 pr-3">{r.failed >= 5 ? <Status kind="attention">{String(r.failed)}</Status> : r.failed}</td>
                    <td className="py-2 pr-3">{r.succeeded}</td>
                    <td className="py-2 pr-3">{r.networks}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{r.last_failed_at ? ukDateTime(r.last_failed_at) : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}
