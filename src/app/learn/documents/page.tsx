"use client";

import { useCallback, useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { PageHeader } from "@/components/learn/PageHeader";
import { SignaturePrompts } from "@/components/learn/SignaturePrompts";
import { getSupabaseClient } from "@/lib/supabase/client";

type Signed = { id: string; signed_at: string; document_id: string; title: string };

function DocumentsContent() {
  const supabase = getSupabaseClient();
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [history, setHistory] = useState<Signed[] | null>(null);

  const loadHistory = useCallback(async () => {
    if (!supabase) return;
    const { data: sigs } = await supabase.from("document_signatures").select("id, document_id, signed_at").order("signed_at", { ascending: false });
    const list = (sigs as { id: string; document_id: string; signed_at: string }[] | null) || [];
    const ids = Array.from(new Set(list.map((s) => s.document_id)));
    const { data: docs } = ids.length ? await supabase.from("signable_documents").select("id, title").in("id", ids) : { data: [] };
    const titles = new Map(((docs as { id: string; title: string }[] | null) || []).map((d) => [d.id, d.title]));
    setHistory(list.map((s) => ({ ...s, title: titles.get(s.document_id) || "Document" })));
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    loadHistory();
  }, [loadHistory]);

  return (
    <>
      <PageHeader title="My documents" subtitle="Policies and agreements that need your signature, and what you have already signed." />
      <div className="space-y-6">
        <SignaturePrompts onLoaded={setOutstanding} onSigned={loadHistory} />
        {outstanding === 0 && (
          <div className="rounded-2xl border border-gold-light bg-white p-8 text-center">
            <p className="font-medium text-ink">All signed</p>
            <p className="mt-1 text-sm text-ink/60">You have no documents waiting for your signature.</p>
          </div>
        )}

        <div className="rounded-2xl border border-gold-light bg-white">
          <h2 className="border-b border-gold-light px-5 py-3 text-lg font-semibold text-ink">Signed by you</h2>
          {history === null && <p className="px-5 py-4 text-sm text-ink/60">Loading…</p>}
          {history && history.length === 0 && <p className="px-5 py-4 text-sm text-ink/60">You have not signed any documents yet.</p>}
          {history && history.length > 0 && (
            <ul className="divide-y divide-gold-light/70">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="font-medium text-ink">{h.title}</span>
                  <span className="text-ink/60">
                    Signed{" "}
                    {new Date(h.signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

export default function MyDocumentsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover", "parent", "student"]}>
        <DocumentsContent />
      </LearnGate>
    </section>
  );
}
