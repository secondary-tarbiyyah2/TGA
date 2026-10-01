"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ATTENTION_META, FEEDBACK_COLUMNS, type AttentionRow, type HomeworkFeedback } from "@/lib/learn/homeworkFeedback";
import { FeedbackStatusChip } from "@/components/learn/homework/SubmissionFeedback";

type FeedbackItem = HomeworkFeedback & { submission: { child_id: string; homework: { title: string } | null } | null };

/**
 * Dashboard section for a student or family: homework that is late, missing
 * or waiting for a resubmission, and the latest teacher feedback (typed or
 * audio). Both lists are RLS-scoped; childId narrows them to one child.
 */
export function HomeworkFeedbackWidget({ childId, href }: { childId: string; href: string }) {
  const supabase = getSupabaseClient();
  const [attention, setAttention] = useState<AttentionRow[] | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[] | null>(null);

  useEffect(() => {
    if (!supabase || !childId) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
      const [att, fb] = await Promise.all([
        supabase
          .from("homework_attention")
          .select("homework_id, homework_title, class_id, class_name, due_at, child_id, child_name, submission_id, submitted_at, attention, resubmission_requested_at")
          .eq("child_id", childId)
          .gte("due_at", since)
          .order("due_at", { ascending: false })
          .limit(8),
        supabase
          .from("homework_feedback")
          .select(`${FEEDBACK_COLUMNS}, submission:submission_id!inner(child_id, homework:homework_id(title))`)
          .eq("submission.child_id", childId)
          .order("given_at", { ascending: false })
          .limit(4),
      ]);
      if (cancelled) return;
      setAttention((att.data as unknown as AttentionRow[]) || []);
      setFeedback((fb.data as unknown as FeedbackItem[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, childId]);

  if (attention === null || feedback === null) return <p className="text-sm text-ink/60">Loading homework feedback…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Feedback &amp; late work</h3>
        <Link href={href} className="text-xs text-gold-700 underline">
          Open homework
        </Link>
      </div>
      {attention.length === 0 && feedback.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">Nothing needs attention.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {attention.map((r) => (
            <li key={`a-${r.homework_id}`} className="flex items-center justify-between gap-2 rounded-lg border border-gold-light/40 p-2 text-sm">
              <span className="min-w-0 truncate">{r.homework_title || "Homework"}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ATTENTION_META[r.attention].className}`}>{ATTENTION_META[r.attention].label}</span>
            </li>
          ))}
          {feedback.map((f) => (
            <li key={`f-${f.id}`} className="rounded-lg border border-gold-light/40 p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{f.submission?.homework?.title || "Homework"}</span>
                <FeedbackStatusChip status={f.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-ink/60">
                {f.feedback_text || (f.audio_path ? "Audio note from your teacher." : "")}
                {f.feedback_text && f.audio_path ? " (+ audio note)" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
