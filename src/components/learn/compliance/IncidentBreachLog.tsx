"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Incident = { id: string; title: string; severity: string; description: string; affected_count: number | null; status: string; discovered_at: string };
type ChecklistItem = { id: number; item_key: string; done: boolean; done_at: string | null; notes: string | null };

const ITEM_LABELS: Record<string, string> = {
  assessed_notifiable_risk: "Assessed for notifiable risk to individuals",
  ico_notified: "ICO notified (within 72 hours of discovery, where required)",
  individuals_notified_if_high_risk: "Affected individuals notified (if high risk)",
  containment_completed: "Containment actions completed",
  post_incident_review: "Post-incident review completed",
};

const ICO_DEADLINE_HOURS = 72;

function IncidentCard({ incident }: { incident: Incident }) {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  // Date.now() is impure and can't be called during render (react-hooks/purity)
  // — captured once via effect instead, same as every other "how much time
  // is left" widget in this codebase.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capturing the current time once on mount, not a render-cycle sync
    setNow(Date.now());
  }, []);
  const deadline = new Date(new Date(incident.discovered_at).getTime() + ICO_DEADLINE_HOURS * 3600000);
  const hoursLeft = now === null ? null : Math.round((deadline.getTime() - now) / 3600000);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("incident_checklist_items").select("id, item_key, done, done_at, notes").eq("incident_id", incident.id);
    setItems((data as ChecklistItem[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading this incident's checklist on mount, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident.id]);

  const toggle = async (item: ChecklistItem) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("incident_checklist_items").update({ done: !item.done, done_by: !item.done ? user?.id : null, done_at: !item.done ? new Date().toISOString() : null }).eq("id", item.id);
    await load();
  };

  return (
    <li className="rounded-lg border border-gold-light/40 p-3 text-sm">
      <p className="font-semibold">{incident.title} <span className="font-normal text-ink/50">({incident.severity}, {incident.status})</span></p>
      <p className="mt-1 text-ink/70">{incident.description}</p>
      <p className="mt-1 text-xs text-ink/50">
        Affected: {incident.affected_count ?? "not yet counted"} · discovered {new Date(incident.discovered_at).toLocaleString("en-GB")}
      </p>
      <p className={`mt-1 text-xs font-semibold ${hoursLeft !== null && hoursLeft < 24 ? "text-red-700" : "text-ink/60"}`}>
        ICO 72-hour window: {hoursLeft === null ? "…" : hoursLeft >= 0 ? `${hoursLeft}h remaining` : `${Math.abs(hoursLeft)}h overdue`} (deadline {deadline.toLocaleString("en-GB")})
      </p>
      <ul className="mt-2 space-y-1 border-t border-gold-light/30 pt-2">
        {(items || []).map((it) => (
          <li key={it.id} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={it.done} onChange={() => toggle(it)} />
            <span className={it.done ? "text-ink/50 line-through" : "text-ink/80"}>{ITEM_LABELS[it.item_key] || it.item_key}</span>
            {it.done && it.done_at && <span className="text-ink/40">— {new Date(it.done_at).toLocaleString("en-GB")}</span>}
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Head Teacher/Admin write, view_compliance read — see 0015. */
export function IncidentBreachLog() {
  const supabase = getSupabaseClient();
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [form, setForm] = useState({ title: "", severity: "low", description: "", affected_count: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("incident_breach_log").select("id, title, severity, description, affected_count, status, discovered_at").order("discovered_at", { ascending: false });
    setIncidents((data as Incident[]) || []);
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load, not a render-cycle sync
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !form.title.trim() || !form.description.trim()) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("incident_breach_log").insert({
      title: form.title.trim(), severity: form.severity, description: form.description.trim(),
      affected_count: form.affected_count ? Number(form.affected_count) : null, reported_by: user?.id,
    });
    setForm({ title: "", severity: "low", description: "", affected_count: "" });
    setBusy(false);
    await load();
  };

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h2 className="font-serif text-h3 font-semibold text-ink">Incident &amp; data-breach log</h2>
      <p className="mt-1 text-xs text-ink/50">Every incident gets a structured ICO-notification checklist with a live 72-hour countdown from the moment it was logged as discovered.</p>
      <ul className="mt-3 space-y-2">
        {(incidents || []).map((i) => <IncidentCard key={i.id} incident={i} />)}
        {incidents?.length === 0 && <p className="text-sm text-ink/60">No incidents logged.</p>}
      </ul>
      <form onSubmit={submit} className="mt-4 space-y-2 border-t border-gold-light/30 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Log a new incident</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm" />
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <input value={form.affected_count} onChange={(e) => setForm({ ...form, affected_count: e.target.value })} placeholder="Number of people affected (count only)" type="number" min="0" className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm sm:col-span-2" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What happened" rows={2} className="rounded-lg border border-gold-light/60 px-2 py-1.5 text-sm sm:col-span-2" />
        </div>
        <button type="submit" disabled={busy} className="rounded-full bg-gold-500 px-4 py-1.5 text-xs font-semibold text-ink-900 hover:brightness-95 disabled:opacity-60">Log incident</button>
      </form>
    </div>
  );
}
