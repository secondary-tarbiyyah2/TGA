"use client";

import { Loading } from "@/components/learn/kit";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Select } from "@/components/learn/Select";

type Category = { id: string; label: string };
/** One row of safeguarding_leads() (migration 0085): a name and why they receive concerns. Names only. */
type Recipient = { full_name: string; kind: "dsl" | "head_teacher" };

/** "A", "A and B", "A, B and C". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Who a reported concern goes to, by name: the Designated Safeguarding Lead(s)
 * (the safeguarding_lead permission), and the Headteacher(s) who are not
 * already named as a lead.
 */
function describeRecipients(recipients: Recipient[]): { dsl: string[]; heads: string[]; headIsAlsoDsl: boolean } {
  const dsl = Array.from(new Set(recipients.filter((r) => r.kind === "dsl").map((r) => r.full_name)));
  const allHeads = Array.from(new Set(recipients.filter((r) => r.kind === "head_teacher").map((r) => r.full_name)));
  const heads = allHeads.filter((n) => !dsl.includes(n));
  return { dsl, heads, headIsAlsoDsl: allHeads.length > 0 && heads.length === 0 };
}

/**
 * The reporting entry point every /learn role (staff, parent, student) can
 * reach, see 0015_compliance.sql's safeguarding_concerns header for why
 * the record this creates is then locked to Safeguarding Lead + Head
 * Teacher only, including for the person submitting it here. This page
 * deliberately does NOT try to show "your past reports"– there is nothing
 * to show, by design.
 */
function ReportConcernForm() {
  const { session, roles } = useLearnSession();
  const supabase = getSupabaseClient();
  const [categories, setCategories] = useState<Category[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [severity, setSeverity] = useState("standard");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    // Categories are readable only by Safeguarding Lead/Headteacher (0015)
    //, a reporter never needs to browse this list, so it's fine that a
    // plain parent/student/teacher gets an empty list back here and falls
    // through to the free-text-only "Other" path below.
    supabase.from("safeguarding_categories").select("id, label").eq("active", true).order("label").then(({ data }) => setCategories((data as Category[]) || []));
    // Names only, so everyone who can open this form can see who will read it.
    supabase.rpc("safeguarding_leads").then(({ data, error: rpcError }) => {
      if (!rpcError) setRecipients((data as Recipient[] | null) || []);
    });
  }, [supabase]);

  const { dsl, heads, headIsAlsoDsl } = describeRecipients(recipients);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !session || session === "loading" || !summary.trim() || !subject.trim()) return;
    setBusy(true);
    setError(null);
    const primaryRole = roles[0]?.role || null;
    const { error: insertErr } = await supabase.from("safeguarding_concerns").insert({
      reported_by: session.user.id,
      reported_by_role: primaryRole,
      category_id: categoryId || null,
      severity,
      subject_description: subject.trim(),
      summary: summary.trim(),
    });
    setBusy(false);
    if (insertErr) {
      setError("Something went wrong sending this. If this is urgent, please contact the school directly.");
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Thank you</h1>
        <p className="mt-2 text-sm text-ink/70">
          Your concern has been recorded and sent to the school&apos;s Designated Safeguarding Lead
          {dsl.length > 0 ? <>, <span className="font-medium text-ink">{joinList(dsl)}</span>,</> : ""}{" "}
          {headIsAlsoDsl ? (
            "who is also the Headteacher"
          ) : (
            <>
              and to the Headteacher{heads.length > 0 ? <>, <span className="font-medium text-ink">{joinList(heads)}</span></> : ""}
            </>
          )}
          .
        </p>
        <p className="mt-2 text-sm text-ink/70">
          It is not visible to anyone else, including you, once it has been submitted. This is how the school handles all safeguarding
          concerns.
        </p>
        <p className="mt-2 text-sm text-ink/70">
          If this is an emergency, please contact the emergency services or the school office directly. Please do not rely on this form.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h1 className="font-serif text-h2 font-semibold text-ink">Report a concern</h1>
      <p className="mt-1 text-sm text-ink/65">
        Use this form to raise any safeguarding or welfare concern, whether it is about a child, a member of staff, or anything else.
        It goes directly, and only, to the school&apos;s Designated Safeguarding Lead and the Headteacher.
      </p>
      {dsl.length > 0 && (
        <p className="mt-2 text-sm text-ink/70">
          Our Designated Safeguarding Lead {dsl.length === 1 ? "is" : "team is"} <span className="font-medium text-ink">{joinList(dsl)}</span>
          {headIsAlsoDsl ? ", who is also the Headteacher" : ""}.{" "}
          {heads.length > 0 && (
            <>
              The Headteacher {heads.length === 1 ? "is" : "team is"} <span className="font-medium text-ink">{joinList(heads)}</span>.
            </>
          )}
        </p>
      )}
      <form onSubmit={submit} data-guide="concern-form" className="mt-4 space-y-4">
        <label className="block text-sm text-ink">
          Who or what is this about?
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2" placeholder="e.g. a child in Year 4, a staff member, a general concern" />
        </label>
        {categories.length > 0 && (
          <label className="block text-sm text-ink">
            Category (optional)
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2">
              <option value="">Not sure / other</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </label>
        )}
        <label className="block text-sm text-ink">
          How urgent does this feel?
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2">
            <option value="low">Low</option>
            <option value="standard">Standard</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </label>
        <label className="block text-sm text-ink">
          What happened?
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} required rows={5} className="mt-1 block w-full rounded-lg border border-gold-light/60 px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-lg bg-gold-700 px-5 py-2 text-sm font-semibold disabled:opacity-60 text-white hover:bg-gold-900 transition-colors">
          {busy ? "Sending…" : "Send to Safeguarding Lead"}
        </button>
      </form>
    </div>
  );
}

// Deliberately not wrapped in LearnGate, every /learn role, staff or not,
// should be able to reach this with only an ordinary sign-in, no role check
// at all. The write itself is still fully RLS-scoped (0015): reported_by
// must equal auth.uid(), and there is no read access back.
export default function ReportConcernPage() {
  const { session } = useLearnSession();
  return (
    <section className="app-pad">
      <div className="mx-auto max-w-2xl">
        {session === "loading" && <Loading label="Loading…" bare />}
        {session === null && (
          <p className="text-ink/65">
            Please <Link href="/login" className="text-gold-700 underline">sign in</Link> to report a concern.
          </p>
        )}
        {session && session !== "loading" && <ReportConcernForm />}
      </div>
    </section>
  );
}
