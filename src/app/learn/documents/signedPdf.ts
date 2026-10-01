import { getSupabaseClient } from "@/lib/supabase/client";

/** Asks the `document-signed-pdf` function for a short-lived URL to the signed
 * PDF (it is generated on first request). Returns null on any failure. */
export async function getSignedPdfUrl(signatureId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke("document-signed-pdf", { body: { signature_id: signatureId } });
    if (error || !data?.ok || !data.url) return null;
    return data.url as string;
  } catch {
    return null;
  }
}

/** Opens the signed PDF in a new tab. The tab is opened synchronously (so
 * pop-up blockers allow it) and pointed at the URL once it arrives. */
export async function openSignedPdf(signatureId: string): Promise<boolean> {
  const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
  const url = await getSignedPdfUrl(signatureId);
  if (!url) {
    tab?.close();
    return false;
  }
  if (tab) tab.location.href = url;
  else window.location.href = url;
  return true;
}
