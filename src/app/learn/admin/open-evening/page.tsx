"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { useLearnSession } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  bookingsCsv,
  downloadCsv,
  isoToUkLocal,
  ukDateTime,
  ukLocalToIso,
  type OpenEveningBooking,
  type OpenEveningSession,
} from "@/lib/learn/openEvening";
import { useNow } from "@/lib/learn/useNow";
import { ui } from "@/components/learn/ui";

type Draft = {
  title: string;
  description: string;
  start: string; // datetime-local, UK wall-clock time
  minutes: number;
  capacity: number;
  joinUrl: string;
  published: boolean;
};

const BLANK: Draft = { title: "Virtual open evening", description: "", start: "", minutes: 60, capacity: 50, joinUrl: "", published: true };
const inputCls = `mt-1 ${ui.input}`;

function OpenEveningContent() {
  const { session } = useLearnSession();
  const supabase = getSupabaseClient();
  const now = useNow();
  const [sessions, setSessions] = useState<OpenEveningSession[] | null>(null);
  const [bookings, setBookings] = useState<OpenEveningBooking[]>([]);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [s, b] = await Promise.all([
      supabase.from("open_evening_sessions").select("*").order("starts_at", { ascending: false }),
      supabase.from("open_evening_bookings").select("*").order("created_at", { ascending: true }),
    ]);
    if (s.error || b.error) setMessage({ text: "Couldn't load the open evenings. Only Admissions, Admin or the Headteacher can see them.", error: true });
    setSessions((s.data as OpenEveningSession[]) || []);
    setBookings((b.data as OpenEveningBooking[]) || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const taken = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bookings) if (b.status === "confirmed") m.set(b.session_id, (m.get(b.session_id) || 0) + b.attendees);
    return m;
  }, [bookings]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const startNew = () => {
    setEditingId("new");
    setDraft(BLANK);
    setMessage(null);
  };

  const startEdit = (s: OpenEveningSession) => {
    setEditingId(s.id);
    setDraft({
      title: s.title,
      description: s.description || "",
      start: isoToUkLocal(s.starts_at),
      minutes: Math.max(1, Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)),
      capacity: s.capacity,
      joinUrl: s.join_url || "",
      published: s.published,
    });
    setMessage(null);
  };

  async function save() {
    if (!supabase) return;
    if (!draft.title.trim()) return setMessage({ text: "Give the evening a title.", error: true });
    if (!draft.start) return setMessage({ text: "Choose the date and start time (UK time).", error: true });
    if (!Number.isInteger(draft.minutes) || draft.minutes < 5 || draft.minutes > 480) return setMessage({ text: "The length must be between 5 and 480 minutes.", error: true });
    if (!Number.isInteger(draft.capacity) || draft.capacity < 1 || draft.capacity > 1000) return setMessage({ text: "The number of places must be between 1 and 1,000.", error: true });
    if (draft.joinUrl.trim() && !/^https:\/\//i.test(draft.joinUrl.trim())) return setMessage({ text: "The joining link must start with https://", error: true });
    const existingTaken = editingId && editingId !== "new" ? taken.get(editingId) || 0 : 0;
    if (draft.capacity < existingTaken) return setMessage({ text: `${existingTaken} places are already booked, so the capacity cannot be lower than that.`, error: true });

    setBusy(true);
    const startsAt = ukLocalToIso(draft.start);
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + draft.minutes * 60000).toISOString(),
      capacity: draft.capacity,
      join_url: draft.joinUrl.trim() || null,
      published: draft.published,
    };
    const { error } =
      editingId === "new"
        ? await supabase.from("open_evening_sessions").insert({ ...payload, created_by: session && session !== "loading" ? session.user.id : null })
        : await supabase.from("open_evening_sessions").update(payload).eq("id", editingId);
    setBusy(false);
    if (error) return setMessage({ text: `Couldn't save: ${error.message}`, error: true });
    setEditingId(null);
    setMessage({ text: "Saved. It is on the website straight away." });
    await load();
  }

  async function setCancelled(s: OpenEveningSession, cancel: boolean) {
    if (!supabase) return;
    if (cancel && !confirm(`Cancel "${s.title}" on ${ukDateTime(s.starts_at)}? It stops being offered on the website. People who have already booked are not emailed automatically; use "Email everyone booked" to tell them.`)) return;
    setBusy(true);
    const { error } = await supabase.from("open_evening_sessions").update({ cancelled_at: cancel ? new Date().toISOString() : null }).eq("id", s.id);
    setBusy(false);
    if (error) return setMessage({ text: `Couldn't update it: ${error.message}`, error: true });
    setMessage({ text: cancel ? "Cancelled. It is no longer on the website." : "Reopened. It is on the website again." });
    await load();
  }

  async function cancelBooking(b: OpenEveningBooking) {
    if (!supabase) return;
    if (!confirm(`Cancel the booking for ${b.parent_name} (${b.attendees} ${b.attendees === 1 ? "place" : "places"})? The places are released straight away. They are not emailed automatically.`)) return;
    setBusy(true);
    const { error } = await supabase.from("open_evening_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", b.id);
    setBusy(false);
    if (error) return setMessage({ text: `Couldn't cancel it: ${error.message}`, error: true });
    await load();
  }

  const mailtoAll = (s: OpenEveningSession) => {
    const emails = [...new Set(bookings.filter((b) => b.session_id === s.id && b.status === "confirmed").map((b) => b.email))];
    return `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(`${s.title}: ${ukDateTime(s.starts_at)}`)}`;
  };

  const exportCsv = (list: OpenEveningSession[], filename: string) => {
    const rows = list.flatMap((s) => bookings.filter((b) => b.session_id === s.id).map((b) => ({ session: s, booking: b })));
    downloadCsv(filename, bookingsCsv(rows));
  };

  const form = (
    <div className="space-y-3 rounded-2xl border border-gold-light bg-cream/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-ink sm:col-span-2">Title
          <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={120} className={inputCls} />
        </label>
        <label className="text-sm text-ink">Start (UK time)
          <input type="datetime-local" value={draft.start} onChange={(e) => set("start", e.target.value)} className={inputCls} />
        </label>
        <label className="text-sm text-ink">Length (minutes)
          <input type="text" inputMode="decimal" min={5} max={480} value={draft.minutes} onChange={(e) => set("minutes", Number(e.target.value))} className={inputCls} />
        </label>
        <label className="text-sm text-ink">Places (total people)
          <input type="text" inputMode="decimal" min={1} max={1000} value={draft.capacity} onChange={(e) => set("capacity", Number(e.target.value))} className={inputCls} />
        </label>
        <label className="text-sm text-ink">Joining link
          <input value={draft.joinUrl} onChange={(e) => set("joinUrl", e.target.value)} placeholder="https://…" className={inputCls} />
          <span className="block text-xs text-ink/65">Only sent in the confirmation and reminder emails. Never shown on the website.</span>
        </label>
        <label className="text-sm text-ink sm:col-span-2">Description
          <textarea rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} className={inputCls} />
          <span className="block text-xs text-ink/65">Shown to parents under the date, for example who will speak and what will be covered.</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input type="checkbox" checked={draft.published} onChange={(e) => set("published", e.target.checked)} />
          Show on the website and accept bookings
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-gold-light px-4 py-2 text-sm text-ink/70 hover:bg-cream">Cancel</button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Open evenings"
        subtitle="Create the virtual open evenings parents can book on the website, and see who has booked. Changes are live immediately."
        actions={
          <>
            {sessions && sessions.length > 0 && (
              <button type="button" onClick={() => exportCsv(sessions, "open-evening-bookings.csv")} className="rounded-lg border border-gold-light bg-white px-4 py-2 text-sm font-medium text-ink/80 hover:bg-cream">
                Export all bookings (CSV)
              </button>
            )}
            <button type="button" onClick={startNew} className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-900">
              + New open evening
            </button>
          </>
        }
      />

      {message && <p role={message.error ? "alert" : "status"} className={`mb-4 rounded-lg px-4 py-2 text-sm ${message.error ? "bg-red-50 text-red-800" : "bg-green-50 text-green-900"}`}>{message.text}</p>}

      {editingId === "new" && <div className="mb-4">{form}</div>}

      {sessions === null ? (
        <div className="h-40 animate-pulse rounded-2xl border border-gold-light bg-white" />
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-gold-light bg-white px-5 py-12 text-center">
          <p className="text-base font-semibold text-ink">No open evenings yet</p>
          <p className="mt-1 text-sm text-ink/65">Add one and it appears on the Open evening page of the website straight away.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const list = bookings.filter((b) => b.session_id === s.id);
            const confirmed = list.filter((b) => b.status === "confirmed");
            const people = taken.get(s.id) || 0;
            const past = new Date(s.ends_at).getTime() < now;
            const state = s.cancelled_at ? "Cancelled" : !s.published ? "Hidden" : past ? "Past" : "On the website";
            const open = openId === s.id;
            return (
              <li key={s.id} className="rounded-2xl border border-gold-light bg-white p-4">
                {editingId === s.id ? (
                  form
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{s.title}</p>
                        <p className="text-sm text-ink/75">{ukDateTime(s.starts_at)} to {new Date(s.ends_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} (UK time)</p>
                        <p className="mt-1 text-xs text-ink/65">
                          <span className={`mr-2 rounded-full px-2 py-0.5 font-semibold ${state === "On the website" ? "bg-green-100 text-green-900" : "bg-ink/5 text-ink/70"}`}>{state}</span>
                          {people} of {s.capacity} places booked · {confirmed.length} {confirmed.length === 1 ? "booking" : "bookings"}
                          {s.join_url ? "" : " · no joining link yet"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open} className="rounded-lg border border-gold-light px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream">
                          {open ? "Hide bookings" : `Bookings (${list.length})`}
                        </button>
                        <button type="button" onClick={() => startEdit(s)} className="rounded-lg border border-gold-500 px-3 py-1.5 text-xs font-medium text-gold-700 hover:bg-cream">Edit</button>
                        {s.cancelled_at ? (
                          <button type="button" disabled={busy} onClick={() => setCancelled(s, false)} className="rounded-lg border border-gold-light px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-cream disabled:opacity-50">Reopen</button>
                        ) : (
                          <button type="button" disabled={busy} onClick={() => setCancelled(s, true)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Cancel evening</button>
                        )}
                      </div>
                    </div>

                    {open && (
                      <div className="mt-4 border-t border-gold-light/60 pt-3">
                        {list.length === 0 ? (
                          <p className="text-sm text-ink/65">Nobody has booked this evening yet.</p>
                        ) : (
                          <>
                            <div className="mb-2 flex flex-wrap gap-3 text-xs">
                              <button type="button" onClick={() => exportCsv([s], `open-evening-${s.starts_at.slice(0, 10)}.csv`)} className="font-medium text-teal-700 underline">Export this evening (CSV)</button>
                              {confirmed.length > 0 && <a href={mailtoAll(s)} className="font-medium text-teal-700 underline">Email everyone booked</a>}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[640px] text-left text-sm">
                                <thead>
                                  <tr className="border-b border-gold-light/60 text-xs uppercase tracking-wide text-ink/65">
                                    <th className="py-2 pr-3 font-medium">Name</th>
                                    <th className="py-2 pr-3 font-medium">Contact</th>
                                    <th className="py-2 pr-3 font-medium">People</th>
                                    <th className="py-2 pr-3 font-medium">Year groups</th>
                                    <th className="py-2 pr-3 font-medium">Questions</th>
                                    <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gold-light/40">
                                  {list.map((b) => (
                                    <tr key={b.id} className={b.status === "cancelled" ? "text-ink/65 line-through" : "text-ink/85"}>
                                      <td className="py-2 pr-3 align-top">{b.parent_name}</td>
                                      <td className="py-2 pr-3 align-top"><a href={`mailto:${b.email}`} className="hover:underline">{b.email}</a>{b.phone && <span className="block text-xs">{b.phone}</span>}</td>
                                      <td className="py-2 pr-3 align-top">{b.attendees}</td>
                                      <td className="py-2 pr-3 align-top">{b.year_groups}</td>
                                      <td className="max-w-xs whitespace-pre-wrap py-2 pr-3 align-top text-xs">{b.questions || ""}</td>
                                      <td className="py-2 text-right align-top">
                                        {b.status === "confirmed" && (
                                          <button type="button" disabled={busy} onClick={() => cancelBooking(b)} className="text-xs font-medium text-red-700 underline disabled:opacity-50">Cancel booking</button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-xs text-ink/65">
        Parents get a confirmation email with a calendar invitation and the joining link, the admissions inbox is told about each booking, and a reminder goes out the day before. The booking list contains parents&apos; contact details: please download it only when you need it.
      </p>
    </>
  );
}

export default function AdminOpenEveningPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <OpenEveningContent />
      </LearnGate>
    </section>
  );
}
