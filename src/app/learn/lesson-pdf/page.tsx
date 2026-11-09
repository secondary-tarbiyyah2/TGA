"use client";

// Opens a lesson's pupil PDF (lessons v3): the slides pupils need plus a worksheet with space to
// write. Linked from the first slide of every lesson deck and from the lesson plan as
// learn.tarbiyyah.co.uk/lesson-pdf/?s=<subject>&y=<year>&n=<lesson>. Staff can open any lesson's
// PDF; a pupil can open the lessons of their own year (migration 0189).

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DECK_BUCKET } from "@/lib/learn/curriculum";

function OpenPdf() {
  const supabase = getSupabaseClient();
  const params = useSearchParams();
  const s = params.get("s") || "";
  const y = params.get("y") || "";
  const n = Number(params.get("n"));
  const valid = /^[a-z-]+$/.test(s) && /^(y\d{1,2}|reception)$/.test(y) && Number.isInteger(n) && n > 0;
  const [state, setState] = useState<{ url?: string; error?: string }>({});

  useEffect(() => {
    if (!supabase || !valid) return;
    let live = true;
    (async () => {
      const { data: path, error } = await supabase.rpc("lesson_pupil_pdf_path", { p_subject: s, p_year: y, p_lesson: n });
      if (!live) return;
      if (error || !path) {
        setState({ error: error ? "This lesson's PDF cannot be opened right now. Please try again later." : "This lesson's PDF is not ready yet, or it is for a different year group. Ask your teacher to share it in Teams." });
        return;
      }
      const { data, error: e2 } = await supabase.storage.from(DECK_BUCKET).createSignedUrl(path as string, 60 * 60);
      if (!live) return;
      if (e2 || !data?.signedUrl) {
        setState({ error: "This lesson's PDF cannot be opened right now. Please try again later." });
        return;
      }
      setState({ url: data.signedUrl });
      window.location.replace(data.signedUrl);
    })();
    return () => {
      live = false;
    };
  }, [supabase, valid, s, y, n]);

  if (!valid) return <p className="text-sm text-ink/70">This link is not complete. Open the lesson PDF from the first slide of the lesson.</p>;
  if (state.error) return <p className="text-sm text-ink/80">{state.error}</p>;
  if (state.url)
    return (
      <p className="text-sm text-ink/80">
        Opening the lesson PDF…{" "}
        <a className="font-medium text-teal-700 underline" href={state.url}>
          Open it here
        </a>{" "}
        if it does not open by itself.
      </p>
    );
  return <p className="text-sm text-ink/70">Finding the lesson PDF…</p>;
}

export default function LessonPdfPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["student", "head_teacher", "admin", "teacher", "teaching_assistant_cover"]}>
        <div className="mx-auto max-w-xl rounded-2xl border border-gold-light bg-white p-6">
          <h1 className="font-serif text-h3 font-semibold text-ink">Today&apos;s lesson PDF</h1>
          <p className="mt-1 text-sm text-ink/70">The lesson slides and a worksheet. Print it, or write on it with a drawing tablet.</p>
          <div className="mt-4">
            <Suspense fallback={<p className="text-sm text-ink/70">Loading…</p>}>
              <OpenPdf />
            </Suspense>
          </div>
        </div>
      </LearnGate>
    </section>
  );
}
