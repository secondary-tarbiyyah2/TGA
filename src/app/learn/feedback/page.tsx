"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { LEARN_ROLES } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, attachmentUrl, ticketRef, type FeedbackTicket } from "@/lib/learn/feedback";
import { FeedbackButton } from "@/components/learn/feedback/FeedbackButton";
import { Icon } from "@/components/learn/Icon";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Everything you've sent through "Send feedback", with its status and the school's reply. */
function YourFeedback() {
  const [tickets, setTickets] = useState<FeedbackTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;
      // Own rows only, even for head/admin (who can read everything).
      const { data, error: err } = await supabase
        .from("feedback_tickets")
        .select("id, number, kind, title, details, attachments, status, response, responded_at, created_at, updated_at")
        .eq("submitted_by", user.id)
        .order("created_at", { ascending: false });
      if (!alive) return;
      if (err) setError("Your feedback couldn't be loaded. Refresh to try again.");
      setTickets((data as unknown as FeedbackTicket[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const open = async (path: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const url = await attachmentUrl(supabase, path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <PageHeader title="Your feedback" subtitle="Problems you've reported, ideas you've shared and questions you've asked, with our replies." actions={<FeedbackButton />} />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {tickets === null ? (
        <div className="h-32 motion-safe:animate-pulse rounded-2xl bg-white" />
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gold-light bg-white p-8 text-center">
          <p className="font-semibold text-ink">Help us improve the portal</p>
          <p className="mt-1 text-sm text-ink/70">Spotted a problem or have an idea? Use the Feedback button at the top of any page.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-2xl border border-gold-light bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-ink/65">
                    {ticketRef(t.number)} · {KIND_LABEL[t.kind]} · sent {fmt(t.created_at)}
                  </p>
                  <h2 className="mt-0.5 text-base font-semibold text-ink">{t.title}</h2>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">{t.details}</p>
              {t.attachments.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {t.attachments.map((a) => (
                    <li key={a.path}>
                      <button type="button" onClick={() => open(a.path)} className="inline-flex items-center gap-1.5 rounded-lg bg-cream px-2.5 py-1 text-xs font-medium text-ink hover:bg-gold-100">
                        <Icon name="paperclip" className="h-3.5 w-3.5" />
                        {a.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {t.response && (
                <div className="mt-4 rounded-xl bg-teal-100/60 px-4 py-3">
                  <p className="text-xs font-semibold text-teal-900">Reply from the school{t.responded_at ? ` · ${fmt(t.responded_at)}` : ""}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{t.response}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function FeedbackPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={[...LEARN_ROLES]}>
        <YourFeedback />
      </LearnGate>
    </section>
  );
}
