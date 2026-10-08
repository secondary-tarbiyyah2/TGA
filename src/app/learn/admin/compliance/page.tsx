"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { ComplianceDashboard } from "@/components/learn/documents/ComplianceDashboard";
import { useLearnPermission, useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SafeguardingLog } from "@/components/learn/compliance/SafeguardingLog";
import { SafeguardingLeadsBanner } from "@/components/learn/compliance/SafeguardingLeads";
import { DataRights } from "@/components/learn/compliance/DataRights";
import { RetentionRegistry } from "@/components/learn/compliance/RetentionRegistry";
import { SingleCentralRecord } from "@/components/learn/compliance/SingleCentralRecord";
import { ConsentRegister } from "@/components/learn/compliance/ConsentRegister";
import { IncidentBreachLog } from "@/components/learn/compliance/IncidentBreachLog";
import { SafeguardingReviews } from "@/components/learn/compliance/SafeguardingReviews";
import { PolicyReviewTracker } from "@/components/learn/compliance/PolicyReviewTracker";

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
      <p className="mt-1 text-xs text-ink/65">Messages matching any phrase below are automatically flagged for the Safeguarding Lead.</p>
      <div className="mt-3 flex gap-2">
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Add a phrase…" className="flex-1 rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
        <button type="button" onClick={add} className="rounded-lg bg-gold-700 px-4 py-2 text-sm text-white hover:bg-gold-900 font-medium transition-colors">
          Add
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {keywords.map((k) => (
          <li key={k.id} className="flex items-center gap-1 rounded-full border border-gold-light/40 px-3 py-1 text-xs text-ink/70">
            {k.phrase}
            <button type="button" onClick={() => remove(k.id)} className="text-ink/65 hover:text-red-700" aria-label={`Remove ${k.phrase}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Headteacher/Admin/Safeguarding-Lead compliance dashboard. A summary strip
 * and two working tabs (Alerts with an acknowledge/resolve workflow, and
 * Signatures grouped per person) live in ComplianceDashboard; the long-form
 * registers (safeguarding log, DBS record, data rights, ...) sit under
 * "Records & settings". RLS on the underlying tables is what restricts each
 * role: a Teacher hitting this URL directly gets empty result sets.
 */
function ComplianceContent() {
  const isSafeguardingLead = useLearnPermission("safeguarding_lead");
  const { roles } = useLearnSession();
  const isHeadTeacher = roles.some((r) => r.role === "head_teacher");
  const isHeadTeacherOrAdmin = roles.some((r) => r.role === "head_teacher" || r.role === "admin");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Compliance &amp; safeguarding</h1>
        <p className="mt-1 text-sm text-ink/60">Alerts that need action, outstanding policy signatures, and the school&apos;s statutory records.</p>
      </div>

      <SafeguardingLeadsBanner canManage={isHeadTeacher} />

      <ComplianceDashboard
        isHeadTeacher={isHeadTeacher}
        topExtra={isSafeguardingLead || isHeadTeacher ? <SafeguardingReviews /> : null}
        alertsExtra={isSafeguardingLead ? <SafeguardingKeywordsAdmin /> : null}
        recordsTab={
          <>
            {(isSafeguardingLead || isHeadTeacher) && <SafeguardingLog />}
            <DataRights />
            <RetentionRegistry />
            {isHeadTeacherOrAdmin && <SingleCentralRecord />}
            <ConsentRegister />
            <IncidentBreachLog />
            {isHeadTeacherOrAdmin && (
              <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
                <h2 className="font-serif text-h3 font-semibold text-ink">Audit log and data protection</h2>
                <p className="mt-1 text-sm text-ink/60">
                  The <a href="/admin/audit-log" className="font-medium text-teal-700 underline">audit log</a> has filters and CSV export, with restricted records masked. <a href="/admin/data-protection" className="font-medium text-teal-700 underline">Data protection</a> holds the retention rules and subject access exports.
                </p>
              </div>
            )}
            <PolicyReviewTracker />
          </>
        }
      />
    </div>
  );
}

export default function AdminCompliancePage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <ComplianceContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
