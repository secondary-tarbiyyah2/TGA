"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

type AuditRow = { id: number; action: string; target_id: string | null; changes: Record<string, unknown> | null; created_at: string };
type FlaggedMessage = { id: string; body: string; flagged_keywords: string[] | null; created_at: string; thread_id: string };
type Outstanding = { user_id: string; full_name: string; email: string; title: string };
type Keyword = { id: string; phrase: string };

function SafeguardingKeywordsAdmin() {
  const supabase = getSupabaseClient();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [phrase, setPhrase] = useState("");

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("safeguarding_keywords").select("id, phrase").order("phrase");
    setKeywords((data as Keyword[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const add = async () => {
    if (!supabase || !phrase.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("safeguarding_keywords").insert({ phrase: phrase.trim(), created_by: user?.id });
    setPhrase("");
    await load();
  };
  const remove = async (id: string) => {
    if (!supabase) return;
    await supabase.from("safeguarding_keywords").delete().eq("id", id);
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Safeguarding keywords</h2>
      <p className="mt-1 text-xs text-ink/50">Messages matching any phrase below are automatically flagged for the Safeguarding Lead.</p>
      <div className="mt-3 flex gap-2">
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Add a phrase…" className="flex-1 rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
        <button type="button" onClick={add} className="rounded-full bg-gold-600 px-4 py-2 text-sm text-white">
          Add
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {keywords.map((k) => (
          <li key={k.id} className="flex items-center gap-1 rounded-full border border-gold-light/40 px-3 py-1 text-xs text-ink/70">
            {k.phrase}
            <button type="button" onClick={() => remove(k.id)} className="text-ink/40 hover:text-red-700" aria-label={`Remove ${k.phrase}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Head Teacher/Admin/Safeguarding-Lead compliance dashboard: unexplained-
 * absence escalations (Phase B's ABSENCE_ALERT_SENT audit_log entries),
 * keyword-flagged messages (0013), and outstanding e-signatures (0014) —
 * all in one place, per the ground rule. RLS on `audit_log`,
 * `message_thread_messages` and `outstanding_signatures` is what actually
 * restricts this to permitted roles (view_compliance/safeguarding_lead/
 * head_teacher/admin/can_export_data) — a Teacher hitting this URL
 * directly gets empty result sets from every query below, not hidden UI.
 */
function ComplianceContent() {
  const isSafeguardingLead = useLearnPermission("safeguarding_lead");
  const [absenceAlerts, setAbsenceAlerts] = useState<AuditRow[] | null>(null);
  const [flagged, setFlagged] = useState<FlaggedMessage[] | null>(null);
  const [outstanding, setOutstanding] = useState<Outstanding[] | null>(null);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("audit_log")
      .select("id, action, target_id, changes, created_at")
      .eq("action", "ABSENCE_ALERT_SENT")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setAbsenceAlerts((data as AuditRow[]) || []));
    supabase
      .from("message_thread_messages")
      .select("id, body, flagged_keywords, created_at, thread_id")
      .eq("flagged", true)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setFlagged((data as FlaggedMessage[]) || []));
    supabase
      .from("outstanding_signatures")
      .select("user_id, full_name, email, title")
      .then(({ data }) => setOutstanding((data as Outstanding[]) || []));
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Compliance &amp; safeguarding</h1>
        <p className="mt-1 text-sm text-ink/60">Attendance escalations, flagged messages, and outstanding policy signatures.</p>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Unexplained absence alerts</h2>
        <ul className="mt-3 space-y-2">
          {(absenceAlerts || []).map((a) => (
            <li key={a.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
              {String((a.changes as { child_id?: string })?.child_id || "")} — {new Date(a.created_at).toLocaleString("en-GB")}
            </li>
          ))}
          {absenceAlerts?.length === 0 && <p className="text-sm text-ink/60">No unexplained-absence alerts.</p>}
        </ul>
      </div>

      {isSafeguardingLead && <SafeguardingKeywordsAdmin />}

      {isSafeguardingLead && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
          <h2 className="font-serif text-h3 font-semibold text-ink">Keyword-flagged messages</h2>
          <p className="mt-1 text-xs text-ink/50">Visible to you as Safeguarding Lead regardless of thread membership.</p>
          <ul className="mt-3 space-y-2">
            {(flagged || []).map((m) => (
              <li key={m.id} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                <p>{m.body}</p>
                <p className="mt-1 text-xs text-ink/50">
                  Keywords: {(m.flagged_keywords || []).join(", ")} · {new Date(m.created_at).toLocaleString("en-GB")}
                </p>
              </li>
            ))}
            {flagged?.length === 0 && <p className="text-sm text-ink/60">No flagged messages.</p>}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Outstanding policy signatures</h2>
        <ul className="mt-3 space-y-2">
          {(outstanding || []).map((o, i) => (
            <li key={`${o.user_id}-${i}`} className="rounded-lg border border-gold-light/40 p-3 text-sm">
              {o.full_name} ({o.email}) — {o.title}
            </li>
          ))}
          {outstanding?.length === 0 && <p className="text-sm text-ink/60">Everyone is up to date.</p>}
        </ul>
      </div>
    </div>
  );
}

export default function AdminCompliancePage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <ComplianceContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
