"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
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
import { PageHeader } from "@/components/learn/PageHeader";

type Keyword = { id: string; phrase: string };

function SafeguardingKeywordsAdmin() {
  const supabase = getSupabaseClient();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const p = phrase.trim();
    if (!supabase || !p) return;
    setError(null);
    if (keywords.some((k) => k.phrase.toLowerCase() === p.toLowerCase())) return setError(`"${p}" is already on the list.`);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("safeguarding_keywords").insert({ phrase: p, created_by: user?.id });
    if (err) return setError("Couldn't add that phrase. Only the Safeguarding Lead can change this list.");
    setPhrase("");
    await load();
  };
  const remove = async (k: Keyword) => {
    if (!supabase || !window.confirm(`Stop flagging messages that contain "${k.phrase}"?`)) return;
    setError(null);
    const { error: err } = await supabase.from("safeguarding_keywords").delete().eq("id", k.id);
    if (err) setError("Couldn't remove that phrase. Only the Safeguarding Lead can change this list.");
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Safeguarding keywords</h2>
      <p className="mt-1 text-xs text-ink/65">Messages matching any phrase below are automatically flagged for the Safeguarding Lead.</p>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="Add a phrase…" aria-label="New safeguarding phrase" className="flex-1 rounded-md border border-gold-light/60 px-3 py-2 text-sm" />
        <button type="submit" disabled={!phrase.trim()} className="rounded-lg bg-gold-700 px-4 py-2 text-sm text-white hover:bg-gold-900 font-medium transition-colors disabled:opacity-50">
          Add
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {keywords.length === 0 && <p className="mt-3 text-xs text-ink/65">No phrases yet, so no messages are flagged automatically.</p>}
      <ul className="mt-3 flex flex-wrap gap-2">
        {keywords.map((k) => (
          <li key={k.id} className="flex items-center gap-1 rounded-full border border-gold-light/40 px-3 py-1 text-xs text-ink/70">
            {k.phrase}
            <button type="button" onClick={() => remove(k)} className="text-ink/65 hover:text-red-700" aria-label={`Remove ${k.phrase}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type RecordItem = { key: string; label: string; node: ReactNode };

/**
 * The statutory registers, one at a time: a list of names on the left (a
 * menu on phones) and the chosen register beside it, instead of eight long
 * cards stacked down the page.
 */
function RecordsPanel({ items }: { items: RecordItem[] }) {
  const [active, setActive] = useState(items[0]?.key ?? "");
  const current = items.find((i) => i.key === active) || items[0];
  if (!current) return null;
  return (
    <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
      <label className="md:hidden">
        <span className="sr-only">Choose a record</span>
        <select value={current.key} onChange={(e) => setActive(e.target.value)} className="w-full rounded-lg border border-gold-light bg-white px-3 py-2 text-sm">
          {items.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label="Records" className="hidden md:block">
        <ul className="sticky top-4 space-y-1">
          {items.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => setActive(i.key)}
                aria-current={i.key === current.key ? "true" : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${i.key === current.key ? "bg-teal-700 text-white" : "text-ink/75 hover:bg-cream"}`}
              >
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{current.node}</div>
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
      <PageHeader crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Safeguarding and compliance" }]} title="Safeguarding and compliance" subtitle="Alerts that need action, outstanding policy signatures, and the school's statutory records." />

      <SafeguardingLeadsBanner canManage={isHeadTeacher} />

      <ComplianceDashboard
        isHeadTeacher={isHeadTeacher}
        topExtra={isSafeguardingLead || isHeadTeacher ? <SafeguardingReviews /> : null}
        alertsExtra={isSafeguardingLead ? <SafeguardingKeywordsAdmin /> : null}
        recordsTab={
          <RecordsPanel
            items={[
              ...(isSafeguardingLead || isHeadTeacher ? [{ key: "log", label: "Safeguarding log", node: <SafeguardingLog /> }] : []),
              ...(isHeadTeacherOrAdmin ? [{ key: "scr", label: "Single Central Record", node: <SingleCentralRecord /> }] : []),
              { key: "rights", label: "Data rights requests", node: <DataRights /> },
              { key: "incidents", label: "Incidents and breaches", node: <IncidentBreachLog /> },
              { key: "consent", label: "Consent register", node: <ConsentRegister /> },
              { key: "policies", label: "Policy reviews", node: <PolicyReviewTracker /> },
              { key: "retention", label: "Retention runs", node: <RetentionRegistry /> },
              ...(isHeadTeacherOrAdmin
                ? [
                    {
                      key: "audit",
                      label: "Audit log and data protection",
                      node: (
                        <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
                          <h2 className="font-serif text-h3 font-semibold text-ink">Audit log and data protection</h2>
                          <p className="mt-1 text-sm text-ink/65">These have their own pages.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link href="/admin/audit-log" className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
                              Open the audit log
                            </Link>
                            <Link href="/admin/data-protection" className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
                              Open data protection
                            </Link>
                          </div>
                          <p className="mt-3 text-xs text-ink/65">The audit log has filters and CSV export, with restricted records masked. Data protection holds the retention rules and subject access exports.</p>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
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
