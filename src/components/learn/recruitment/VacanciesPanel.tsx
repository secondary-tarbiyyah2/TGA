"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { MAIN_SITE_ORIGIN } from "@/lib/learn/origin";
import { CONTRACT_LABELS, DEPARTMENTS, VACANCY_PUBLIC_COLUMNS, longDate, type ContractType, type Vacancy, type VacancyStatus } from "@/lib/careers";
import { Button, EmptyState, StatusChip, btn, ui } from "@/components/learn/ui";
import { Select } from "@/components/learn/Select";

import { askConfirm } from "@/components/learn/kit";
type Draft = Omit<Vacancy, "id" | "hours_text" | "salary_text" | "start_text" | "closing_date"> & {
  hours_text: string;
  salary_text: string;
  start_text: string;
  closing_date: string;
};

const BLANK: Draft = {
  slug: "",
  title: "",
  department: "Teaching",
  summary: "",
  description: "",
  responsibilities: "",
  requirements: "",
  desirable: "",
  contract_type: "part_time",
  hours_text: "",
  salary_text: "",
  location_text: "Remote: live online lessons",
  start_text: "",
  closing_date: "",
  status: "draft",
  sort_order: 100,
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

const STATUS_TONE: Record<VacancyStatus, "good" | "neutral" | "bad"> = { open: "good", draft: "neutral", closed: "bad" };
const STATUS_LABEL: Record<VacancyStatus, string> = { open: "Open: on the website", draft: "Draft: hidden", closed: "Closed" };

export function VacanciesPanel({ userId }: { userId: string | null }) {
  const supabase = getSupabaseClient();
  const [roles, setRoles] = useState<Vacancy[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [v, a] = await Promise.all([
      supabase.from("job_vacancies").select(VACANCY_PUBLIC_COLUMNS).order("sort_order", { ascending: true }).order("title"),
      supabase.from("job_applications").select("vacancy_id"),
    ]);
    if (v.error) setMessage({ text: "Couldn't load the roles. Only the Headteacher and Admin can manage them.", error: true });
    setRoles((v.data as Vacancy[] | null) || []);
    const m = new Map<string, number>();
    for (const r of (a.data as { vacancy_id: string | null }[] | null) || []) if (r.vacancy_id) m.set(r.vacancy_id, (m.get(r.vacancy_id) || 0) + 1);
    setCounts(m);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function startNew() {
    setEditingId("new");
    setDraft(BLANK);
    setMessage(null);
  }

  function startEdit(r: Vacancy) {
    setEditingId(r.id);
    setDraft({ ...r, hours_text: r.hours_text || "", salary_text: r.salary_text || "", start_text: r.start_text || "", closing_date: r.closing_date || "" });
    setMessage(null);
  }

  async function save() {
    if (!supabase) return;
    const title = draft.title.trim();
    if (title.length < 2) return setMessage({ text: "Give the role a title.", error: true });
    const slug = slugify(draft.slug || title);
    if (!slug) return setMessage({ text: "The web address needs some letters or numbers.", error: true });
    if (draft.status === "open" && !draft.summary.trim()) return setMessage({ text: "Add a short summary before opening the role: it shows on the Careers page.", error: true });
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    if (draft.status === "open" && draft.closing_date && draft.closing_date < today) return setMessage({ text: "The closing date has passed, so the role wouldn't show. Choose a later date or leave it empty.", error: true });
    if (draft.status === "open" && /\bDRAFT\b/.test(draft.description)) return setMessage({ text: "The description still says DRAFT. Please finish the wording before opening the role.", error: true });

    const payload = {
      slug,
      title,
      department: draft.department,
      summary: draft.summary.trim(),
      description: draft.description.trim(),
      responsibilities: draft.responsibilities.trim(),
      requirements: draft.requirements.trim(),
      desirable: draft.desirable.trim(),
      contract_type: draft.contract_type,
      hours_text: draft.hours_text.trim() || null,
      salary_text: draft.salary_text.trim() || null,
      location_text: draft.location_text.trim() || "Remote: live online lessons",
      start_text: draft.start_text.trim() || null,
      closing_date: draft.closing_date || null,
      status: draft.status,
      sort_order: Number.isFinite(draft.sort_order) ? draft.sort_order : 100,
    };
    setBusy(true);
    const { error } = editingId === "new" ? await supabase.from("job_vacancies").insert({ ...payload, created_by: userId }) : await supabase.from("job_vacancies").update(payload).eq("id", editingId);
    setBusy(false);
    if (error) {
      return setMessage({ text: error.code === "23505" ? "Another role already uses that web address. Change the title or the web address." : "Couldn't save the role. Please check the details and try again.", error: true });
    }
    setEditingId(null);
    setMessage({ text: draft.status === "open" ? "Saved. The role is on the Careers page now." : "Saved. It is hidden from the website until you open it." });
    await load();
  }

  async function setStatus(r: Vacancy, status: VacancyStatus) {
    if (!supabase) return;
    if (status === "open" && /\bDRAFT\b/.test(r.description)) return setMessage({ text: `"${r.title}" still has DRAFT wording. Edit it first, then open it.`, error: true });
    if (status === "closed" && !(await askConfirm(`Close "${r.title}"? It comes off the Careers page straight away. Applications already received are kept.`))) return;
    setBusy(true);
    const { error } = await supabase.from("job_vacancies").update({ status }).eq("id", r.id);
    setBusy(false);
    if (error) return setMessage({ text: "Couldn't update the role. Please try again.", error: true });
    setMessage({ text: status === "open" ? `"${r.title}" is now on the Careers page.` : status === "closed" ? `"${r.title}" is closed.` : `"${r.title}" is hidden as a draft.` });
    await load();
  }

  const inputCls = `mt-1 ${ui.input}`;
  const textCls = `mt-1 ${ui.textarea}`;

  const form = (
    <div className="space-y-4 rounded-2xl border border-gold-light bg-cream/40 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-ink sm:col-span-2">
          Job title
          <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={120} className={inputCls} />
        </label>
        <label className="text-sm text-ink">
          Department
          <Select value={draft.department} onChange={(e) => set("department", e.target.value)} className={inputCls}>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </label>
        <label className="text-sm text-ink">
          Contract
          <Select value={draft.contract_type} onChange={(e) => set("contract_type", e.target.value as ContractType)} className={inputCls}>
            {(Object.keys(CONTRACT_LABELS) as ContractType[]).map((c) => (
              <option key={c} value={c}>{CONTRACT_LABELS[c]}</option>
            ))}
          </Select>
        </label>
        <label className="text-sm text-ink">
          Hours
          <input value={draft.hours_text} onChange={(e) => set("hours_text", e.target.value)} maxLength={200} placeholder="e.g. 3 days a week, 9am to 3pm UK time" className={inputCls} />
        </label>
        <label className="text-sm text-ink">
          Pay
          <input value={draft.salary_text} onChange={(e) => set("salary_text", e.target.value)} maxLength={200} placeholder="e.g. £28,000 to £35,000 pro rata" className={inputCls} />
        </label>
        <label className="text-sm text-ink">
          Where
          <input value={draft.location_text} onChange={(e) => set("location_text", e.target.value)} maxLength={200} className={inputCls} />
        </label>
        <label className="text-sm text-ink">
          Start
          <input value={draft.start_text} onChange={(e) => set("start_text", e.target.value)} maxLength={200} placeholder="e.g. January 2027" className={inputCls} />
        </label>
        <label className="text-sm text-ink">
          Closing date
          <input type="date" value={draft.closing_date} onChange={(e) => set("closing_date", e.target.value)} className={inputCls} />
          <span className={ui.hint}>The role comes off the website automatically after this day. Leave empty to keep it open.</span>
        </label>
        <label className="text-sm text-ink">
          Order on the page
          <input type="number" value={draft.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={inputCls} />
          <span className={ui.hint}>Lower numbers show first.</span>
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          Summary (one or two sentences on the Careers page)
          <textarea rows={2} maxLength={400} value={draft.summary} onChange={(e) => set("summary", e.target.value)} className={textCls} />
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          About the role
          <textarea rows={4} maxLength={8000} value={draft.description} onChange={(e) => set("description", e.target.value)} className={textCls} />
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          What you will do (one point per line)
          <textarea rows={4} maxLength={6000} value={draft.responsibilities} onChange={(e) => set("responsibilities", e.target.value)} className={textCls} />
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          What we are looking for (essential, one per line)
          <textarea rows={4} maxLength={6000} value={draft.requirements} onChange={(e) => set("requirements", e.target.value)} className={textCls} />
        </label>
        <label className="text-sm text-ink sm:col-span-2">
          Desirable (one per line)
          <textarea rows={3} maxLength={4000} value={draft.desirable} onChange={(e) => set("desirable", e.target.value)} className={textCls} />
        </label>
        <label className="text-sm text-ink">
          Web address
          <input value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugify(draft.title) || "made from the title"} maxLength={80} className={inputCls} />
          <span className={ui.hint}>Used in the link /careers/apply/?role=…</span>
        </label>
        <label className="text-sm text-ink">
          Show on the website?
          <Select value={draft.status} onChange={(e) => set("status", e.target.value as VacancyStatus)} className={inputCls}>
            <option value="draft">Draft: hidden</option>
            <option value="open">Open: on the Careers page</option>
            <option value="closed">Closed</option>
          </Select>
        </label>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save role"}</Button>
        <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-ink/75">Open roles appear on the Careers page straight away, with no rebuild. Drafts stay hidden. Closing a role keeps its applications.</p>
        <Button variant="primary" icon="plus" onClick={startNew}>New role</Button>
      </div>

      {message && <p role={message.error ? "alert" : "status"} className={`rounded-lg border px-4 py-2 text-sm ${message.error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-900"}`}>{message.text}</p>}

      {editingId === "new" && form}

      {roles === null ? (
        <div className="h-40 motion-safe:animate-pulse rounded-2xl border border-gold-light bg-white" />
      ) : roles.length === 0 && editingId !== "new" ? (
        <EmptyState title="No roles yet" icon="briefcase" action={<Button variant="primary" icon="plus" onClick={startNew}>New role</Button>}>
          Add a role, then open it to show it on the Careers page.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {roles.map((r) => (
            <li key={r.id} className="rounded-2xl border border-gold-light bg-white p-4">
              {editingId === r.id ? (
                form
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{r.title}</p>
                    <p className="text-sm text-ink/75">
                      {r.department} · {CONTRACT_LABELS[r.contract_type]}
                      {r.closing_date ? ` · closes ${longDate(r.closing_date)}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-ink/65">
                      <span className="mr-2"><StatusChip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusChip></span>
                      {counts.get(r.id) || 0} {(counts.get(r.id) || 0) === 1 ? "application" : "applications"}
                      {/\bDRAFT\b/.test(r.description) ? " · wording still to finish" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEdit(r)} className={btn("secondary", "sm")}>Edit</button>
                    {r.status !== "open" && <button type="button" disabled={busy} onClick={() => setStatus(r, "open")} className={btn("secondary", "sm")}>Open on website</button>}
                    {r.status === "open" && (
                      <a href={`${MAIN_SITE_ORIGIN}/careers/#role-${r.slug}`} target="_blank" rel="noopener noreferrer" className={btn("ghost", "sm")}>
                        View on website<span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    )}
                    {r.status === "open" && <button type="button" disabled={busy} onClick={() => setStatus(r, "closed")} className={btn("ghost", "sm") + " !text-red-700 hover:!bg-red-50"}>Close</button>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
