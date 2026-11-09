"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/Dropdown";
import { Button, EmptyState, Field, Notice, Section, StatusChip, ui } from "@/components/learn/ui";
import { DatePicker } from "@/components/learn/DatePicker";
import {
  DOC_KIND,
  DOCUMENT_COLUMNS,
  PLAN_STATUS,
  PRIMARY_NEED,
  SUPPORT_LEVEL,
  describeChange,
  fmtDate,
  fmtDateTime,
  reviewState,
  type ChangeLogRow,
  type DocKind,
  type PlanDocument,
  type PlanStatus,
  type PrimaryNeed,
  type RegisterRow,
  type SupportLevel,
} from "@/lib/learn/send";

import { askConfirm } from "@/components/learn/kit";
const errText = (e: { message?: string } | null) => (e?.message ? e.message.replace(/^.*?:\s*/, "") : "Please try again.");

/**
 * Links to a pupil's SEND documents (EHC plan, reports, review notes) kept in
 * the school's secure storage. SENCo, Headteacher and admin only (RLS, 0186).
 */
export function DocumentsSection({ planId, onChanged }: { planId: string; onChanged?: () => void }) {
  const supabase = getSupabaseClient();
  const [docs, setDocs] = useState<PlanDocument[] | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<DocKind>("professional_report");
  const [dated, setDated] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("send_plan_documents").select(DOCUMENT_COLUMNS).eq("plan_id", planId).order("created_at", { ascending: false });
    // Table not there yet (0186 not applied): the section shows as empty.
    setDocs(error ? [] : ((data as PlanDocument[]) || []));
  }, [supabase, planId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the plan changes
    void load();
  }, [load]);

  const add = async () => {
    if (!supabase) return;
    const link = url.trim();
    if (!title.trim()) return setMsg({ tone: "bad", text: "Give the document a title." });
    if (!/^https:\/\//i.test(link)) return setMsg({ tone: "bad", text: "The link must start with https:// (copy it from SharePoint or OneDrive)." });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("send_plan_documents").insert({ plan_id: planId, title: title.trim(), url: link, kind, dated: dated || null });
    setBusy(false);
    if (error) return setMsg({ tone: "bad", text: `Couldn't add it: ${errText(error)}` });
    setTitle("");
    setUrl("");
    setDated("");
    setMsg({ tone: "good", text: "Document added." });
    await load();
    onChanged?.();
  };

  const remove = async (d: PlanDocument) => {
    if (!supabase || !(await askConfirm(`Remove the link to "${d.title}"? The file itself stays where it is.`))) return;
    const { error } = await supabase.from("send_plan_documents").delete().eq("id", d.id);
    if (error) return setMsg({ tone: "bad", text: `Couldn't remove it: ${errText(error)}` });
    setMsg({ tone: "good", text: "Link removed." });
    await load();
    onChanged?.();
  };

  return (
    <Section title="Documents" description="Links to the EHC plan, reports and review notes in the school's secure storage. Only the SENCo, Headteacher and admin see these; teachers and families don't.">
      <div className="space-y-4">
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {docs === null ? (
          <div className="h-16 motion-safe:animate-pulse rounded-xl bg-cream" />
        ) : docs.length === 0 ? (
          <p className="text-sm text-ink/65">No documents linked yet.</p>
        ) : (
          <ul className="divide-y divide-gold-light/60 rounded-xl border border-gold-light">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 underline-offset-2 hover:underline">
                    {d.title}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <span className="block text-xs text-ink/65">{[DOC_KIND[d.kind], d.dated ? fmtDate(d.dated) : `Added ${fmtDate(d.created_at)}`].join(" · ")}</span>
                </span>
                <button type="button" className={ui.btnLinkDanger} onClick={() => void remove(d)} aria-label={`Remove the link to ${d.title}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <fieldset className="rounded-xl border border-gold-light/70 p-3">
          <legend className="px-1 text-sm font-medium text-ink">Add a document link</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" htmlFor={`doc-title-${planId}`}>
              <input id={`doc-title-${planId}`} className={ui.input} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: EHC plan, final version" />
            </Field>
            <Field label="Type" htmlFor={`doc-kind-${planId}`}>
              <Select id={`doc-kind-${planId}`} value={kind} onChange={(e) => setKind(e.target.value as DocKind)} className={ui.select}>
                {(Object.keys(DOC_KIND) as DocKind[]).map((k) => (
                  <option key={k} value={k}>
                    {DOC_KIND[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link" htmlFor={`doc-url-${planId}`} hint="Share the file with staff only in SharePoint or OneDrive, then paste the link.">
              <input id={`doc-url-${planId}`} type="url" inputMode="url" className={ui.input} maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </Field>
            <DatePicker label="Date on the document (optional)" value={dated} onChange={setDated} />
          </div>
          <div className="mt-3">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void add()}>
              {busy ? "Adding…" : "Add document"}
            </Button>
          </div>
        </fieldset>
      </div>
    </Section>
  );
}

/** Who changed what and when. For one pupil, or (no childId) the whole register. */
export function ChangeLog({ childId, refreshKey = 0, showPupil = false, limit = 50 }: { childId?: string; refreshKey?: number; showPupil?: boolean; limit?: number }) {
  const [rows, setRows] = useState<ChangeLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    supabase.rpc("send_change_log", { p_child: childId ?? null, p_limit: limit }).then(({ data, error: e }) => {
      if (!alive) return;
      setError(e ? e.message : null);
      setRows((data as ChangeLogRow[]) || []);
    });
    return () => {
      alive = false;
    };
  }, [childId, refreshKey, limit]);

  if (error) return <Notice tone="bad">Couldn&apos;t load the change log: {error}</Notice>;
  if (rows === null) return <div className="h-24 motion-safe:animate-pulse rounded-xl bg-cream" />;
  if (rows.length === 0) return <EmptyState title="No changes recorded yet." />;
  return (
    <ol className="divide-y divide-gold-light/60 rounded-xl border border-gold-light bg-white" aria-label="Changes, newest first">
      {rows.map((r, i) => (
        <li key={`${r.changed_at}-${i}`} className="px-3 py-2.5 text-sm">
          <p className="text-ink">
            {showPupil && r.child_name ? <span className="font-medium">{r.child_name}: </span> : null}
            {describeChange(r)}
          </p>
          <p className="text-xs text-ink/65">
            <time dateTime={r.changed_at}>{fmtDateTime(r.changed_at)}</time> · {r.actor_name}
          </p>
        </li>
      ))}
    </ol>
  );
}

type InlinePatch = Partial<{ status: PlanStatus; support_level: SupportLevel; primary_need: PrimaryNeed | null; next_review_due: string | null }>;

/**
 * The SEND register as a table the SENCo can edit in place: level, main need,
 * status and next review date save as soon as they're changed. On phones each
 * pupil is a card with the same controls. Every change is logged (0169 audit
 * triggers) and shows under Recent changes.
 */
export function RegisterTable({ rows, onOpen, onSaved }: { rows: RegisterRow[]; onOpen: (childId: string) => void; onSaved: () => void }) {
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (r: RegisterRow, patch: InlinePatch, what: string) => {
    const supabase = getSupabaseClient();
    if (!supabase || !r.plan_id) return;
    if (patch.status === "closed" && !(await askConfirm(`Close ${r.child_name}'s plan? Teachers will stop seeing it; the family can still read it.`))) return;
    setSaving(r.child_id);
    setStatus(null);
    const { error } = await supabase.from("send_support_plans").update(patch).eq("id", r.plan_id);
    setSaving(null);
    if (error) return setStatus({ tone: "bad", text: `Couldn't save ${what} for ${r.child_name}: ${errText(error)}` });
    setStatus({ tone: "good", text: `Saved ${what} for ${r.child_name}.` });
    onSaved();
  };

  const controls = (r: RegisterRow) => {
    const busy = saving === r.child_id;
    if (!r.plan_id) {
      return {
        level: <span className="text-sm text-ink/65">No plan yet</span>,
        need: null,
        status: null,
        review: null,
      };
    }
    return {
      level: (
        <Select aria-label={`Level of support for ${r.child_name}`} disabled={busy} value={r.support_level || "sen_support"} onChange={(e) => void save(r, { support_level: e.target.value as SupportLevel }, "the level of support")} className={`${ui.select} !min-h-10 !py-1.5 text-sm`}>
          {(Object.keys(SUPPORT_LEVEL) as SupportLevel[]).map((k) => (
            <option key={k} value={k}>
              {SUPPORT_LEVEL[k]}
            </option>
          ))}
        </Select>
      ),
      need: (
        <Select aria-label={`Main area of need for ${r.child_name}`} disabled={busy} value={r.primary_need || ""} placeholder="Not set" onChange={(e) => void save(r, { primary_need: (e.target.value || null) as PrimaryNeed | null }, "the main area of need")} className={`${ui.select} !min-h-10 !py-1.5 text-sm`}>
          {(Object.keys(PRIMARY_NEED) as PrimaryNeed[]).map((k) => (
            <option key={k} value={k}>
              {PRIMARY_NEED[k]}
            </option>
          ))}
        </Select>
      ),
      status: (
        <Select aria-label={`Plan status for ${r.child_name}`} disabled={busy} value={r.status || "draft"} onChange={(e) => void save(r, { status: e.target.value as PlanStatus }, "the plan status")} className={`${ui.select} !min-h-10 !py-1.5 text-sm`}>
          {(Object.keys(PLAN_STATUS) as PlanStatus[]).map((k) => (
            <option key={k} value={k}>
              {PLAN_STATUS[k]}
            </option>
          ))}
        </Select>
      ),
      review: (
        <input
          type="date"
          aria-label={`Next review date for ${r.child_name}`}
          disabled={busy}
          defaultValue={r.next_review_due || ""}
          key={r.next_review_due || "none"}
          onBlur={(e) => {
            const v = e.target.value || null;
            if (v !== (r.next_review_due || null)) void save(r, { next_review_due: v }, "the next review date");
          }}
          className={`${ui.input} !min-h-10 !py-1.5 text-sm`}
        />
      ),
    };
  };

  const chips = (r: RegisterRow) => {
    const rs = reviewState(r.next_review_due);
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {!r.plan_id && <StatusChip tone="warn">Needs mentioned, no plan</StatusChip>}
        {r.status === "active" && rs.state !== "ok" && <StatusChip tone={rs.state === "overdue" ? "bad" : "warn"}>{rs.label}</StatusChip>}
        {r.has_access && <StatusChip tone="info">Access arrangements</StatusChip>}
        {r.status === "active" && !r.family_agreed_at && <StatusChip>Not agreed yet</StatusChip>}
        {r.unseen_comments > 0 && <StatusChip tone="warn">{r.unseen_comments} new from family</StatusChip>}
      </span>
    );
  };

  const summary = (r: RegisterRow) =>
    [r.year_group, r.key_adult_name ? `Key adult ${r.key_adult_name}` : "", r.plan_id ? `${r.adjustments_count} adjustment${r.adjustments_count === 1 ? "" : "s"}, ${r.open_targets} open target${r.open_targets === 1 ? "" : "s"}` : ""]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-3">
      <p role="status" aria-live="polite" className="sr-only">
        {status?.text || ""}
      </p>
      {status && <Notice tone={status.tone}>{status.text}</Notice>}

      {/* Wide screens: a real table. */}
      <div className="hidden rounded-2xl border border-gold-light bg-white lg:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">SEND register. Changes to level, main need, status and next review save straight away.</caption>
          <thead className="border-b border-gold-light text-xs uppercase tracking-wide text-ink/65">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Pupil</th>
              <th scope="col" className="px-2 py-2.5 font-medium">Level of support</th>
              <th scope="col" className="px-2 py-2.5 font-medium">Main area of need</th>
              <th scope="col" className="px-2 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-2 py-2.5 font-medium">Next review</th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                <span className="sr-only">Open plan</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gold-light/50">
            {rows.map((r) => {
              const c = controls(r);
              return (
                <tr key={r.child_id} className="align-top">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="block font-medium text-ink">{r.child_name}</span>
                    <span className="block text-xs text-ink/65">{summary(r)}</span>
                    <span className="mt-1.5 block">{chips(r)}</span>
                  </th>
                  <td className="w-44 px-2 py-3">{c.level}</td>
                  <td className="w-60 px-2 py-3">{c.need}</td>
                  <td className="w-32 px-2 py-3">{c.status}</td>
                  <td className="w-44 px-2 py-3">{c.review}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={() => onOpen(r.child_id)} aria-label={`${r.plan_id ? "Open the plan for" : "Start a plan for"} ${r.child_name}`}>
                      {r.plan_id ? "Open plan" : "Start plan"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones and tablets: one card per pupil with the same controls. */}
      <ul className="space-y-3 lg:hidden">
        {rows.map((r) => {
          const c = controls(r);
          return (
            <li key={r.child_id} className="rounded-2xl border border-gold-light bg-white p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-ink">{r.child_name}</h3>
                  <p className="text-xs text-ink/65">{summary(r)}</p>
                </div>
                <Button size="sm" onClick={() => onOpen(r.child_id)} aria-label={`${r.plan_id ? "Open the plan for" : "Start a plan for"} ${r.child_name}`}>
                  {r.plan_id ? "Open plan" : "Start plan"}
                </Button>
              </div>
              <div className="mt-2">{chips(r)}</div>
              {r.plan_id && (
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className={ui.hint}>Level of support</dt>
                    <dd className="mt-1">{c.level}</dd>
                  </div>
                  <div>
                    <dt className={ui.hint}>Main area of need</dt>
                    <dd className="mt-1">{c.need}</dd>
                  </div>
                  <div>
                    <dt className={ui.hint}>Status</dt>
                    <dd className="mt-1">{c.status}</dd>
                  </div>
                  <div>
                    <dt className={ui.hint}>Next review</dt>
                    <dd className="mt-1">{c.review}</dd>
                  </div>
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Add a pupil to the register": any pupil, so the SENCo isn't limited to flagged ones. */
export function AddPupilPicker({ onPick }: { onPick: (childId: string, name: string) => void }) {
  const [options, setOptions] = useState<{ child_id: string; child_name: string; year_group: string | null; has_plan: boolean }[]>([]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.rpc("send_pupil_options").then(({ data }) => setOptions((data as typeof options) || []));
  }, []);
  if (!options.length) return null;
  return (
    <Select
      aria-label="Add a pupil to the register"
      value=""
      placeholder="Add a pupil…"
      searchable
      searchPlaceholder="Search pupils"
      onChange={(e) => {
        const o = options.find((x) => x.child_id === e.target.value);
        if (o) onPick(o.child_id, o.child_name);
      }}
      className={`${ui.select} !w-auto min-w-[14rem]`}
    >
      <option value="">Add a pupil…</option>
      {options.map((o) => (
        <option key={o.child_id} value={o.child_id}>
          {`${o.child_name}${o.year_group ? `, ${o.year_group}` : ""}${o.has_plan ? " (has a plan)" : ""}`}
        </option>
      ))}
    </Select>
  );
}
