"use client";

import { useEffect, useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { useLearnPermission } from "@/lib/learn/session";
import { getSupabaseClient } from "@/lib/supabase/client";

type SignableDoc = { id: string; title: string; requires_signature: boolean; target_roles: string[]; synced_at: string };
type Outstanding = { user_id: string; full_name: string; email: string; title: string };
type SignatureRow = { signer_id: string; typed_full_name: string; signed_at: string; signable_documents?: { title: string } | null };

/**
 * Admin's e-signature dashboard: which documents require a signature (set
 * in Sanity Studio — see policyLink's requiresSignature/
 * signatureTargetRoles fields and scripts/sync-signable-documents-from-
 * sanity.mjs; this page is read-only for that, deliberately — no
 * duplicate "which docs need signing" entry point), plus who's outstanding
 * and (for can_export_data holders) full history export.
 */
function DocumentsContent() {
  const canExport = useLearnPermission("can_export_data");
  const supabase = getSupabaseClient();
  const [docs, setDocs] = useState<SignableDoc[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding[]>([]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("signable_documents").select("id, title, requires_signature, target_roles, synced_at").then(({ data }) => setDocs((data as SignableDoc[]) || []));
    supabase.from("outstanding_signatures").select("user_id, full_name, email, title").then(({ data }) => setOutstanding((data as Outstanding[]) || []));
  }, [supabase]);

  const exportCsv = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("document_signatures").select("signer_id, typed_full_name, signed_at, signable_documents(title)");
    const rows = (data as unknown as SignatureRow[]) || [];
    const csv = ["document,signer_name,signed_at", ...rows.map((r) => `"${r.signable_documents?.title || ""}","${r.typed_full_name}","${r.signed_at}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document-signatures.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Documents &amp; signatures</h1>
        <p className="mt-1 text-sm text-ink/60">
          Which documents require a signature is configured on the document itself in Sanity Studio (the &quot;Requires e-signature&quot; and &quot;Who must sign&quot; fields on
          Policy documents), synced here nightly.
        </p>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h2 className="font-serif text-h3 font-semibold text-ink">Signable documents</h2>
        <ul className="mt-3 space-y-2">
          {docs
            .filter((d) => d.requires_signature)
            .map((d) => (
              <li key={d.id} className="rounded-lg border border-gold-light/40 p-3 text-sm">
                <span className="font-medium">{d.title}</span>
                <span className="ml-2 text-ink/50">{d.target_roles.join(", ")}</span>
              </li>
            ))}
          {docs.filter((d) => d.requires_signature).length === 0 && <p className="text-sm text-ink/60">No documents currently require a signature.</p>}
        </ul>
      </div>

      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-h3 font-semibold text-ink">Outstanding school-wide</h2>
          {canExport && (
            <button type="button" onClick={exportCsv} className="rounded-lg border border-gold-light px-4 py-2 text-sm hover:bg-cream bg-white text-ink/80 font-medium transition-colors">
              Export signature history (CSV)
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-ink/50">Nudge emails go out automatically a week after a document becomes due (see .github/workflows/nudge-outstanding-signatures.yml).</p>
        <ul className="mt-3 space-y-2">
          {outstanding.map((o, i) => (
            <li key={`${o.user_id}-${i}`} className="rounded-lg border border-gold-light/40 p-3 text-sm">
              {o.full_name} ({o.email}) — {o.title}
            </li>
          ))}
          {outstanding.length === 0 && <p className="text-sm text-ink/60">Everyone is up to date.</p>}
        </ul>
      </div>
    </div>
  );
}

export default function AdminDocumentsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminShell>
          <DocumentsContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
