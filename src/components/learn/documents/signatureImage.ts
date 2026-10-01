import type { SupabaseClient } from "@supabase/supabase-js";

export const SIGNATURE_BUCKET = "signature-images";

export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stores a signature PNG at <signerId>/<signatureId>.png. Returns the path + hash, or null on failure. */
export async function uploadSignatureImage(
  supabase: SupabaseClient,
  signerId: string,
  signatureId: string,
  blob: Blob,
): Promise<{ path: string; sha256: string } | null> {
  const path = `${signerId}/${signatureId}.png`;
  const { error } = await supabase.storage.from(SIGNATURE_BUCKET).upload(path, blob, { contentType: "image/png", upsert: false });
  if (error) return null;
  return { path, sha256: await sha256Hex(blob) };
}

/** The signer's saved default signature as a PNG blob, or null when none is saved. */
export async function loadSavedSignature(supabase: SupabaseClient, userId: string): Promise<Blob | null> {
  try {
    const { data: row } = await supabase.from("user_signatures").select("image_path").eq("user_id", userId).maybeSingle();
    if (!row?.image_path) return null;
    const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(row.image_path as string);
    return error || !data ? null : data;
  } catch {
    return null;
  }
}

export async function saveDefaultSignature(supabase: SupabaseClient, userId: string, blob: Blob): Promise<boolean> {
  try {
    const path = `${userId}/default.png`;
    const up = await supabase.storage.from(SIGNATURE_BUCKET).upload(path, blob, { contentType: "image/png", upsert: true });
    if (up.error) return false;
    const { error } = await supabase
      .from("user_signatures")
      .upsert({ user_id: userId, image_path: path, image_sha256: await sha256Hex(blob), updated_at: new Date().toISOString() });
    return !error;
  } catch {
    return false;
  }
}

export async function forgetDefaultSignature(supabase: SupabaseClient, userId: string): Promise<void> {
  try {
    await supabase.from("user_signatures").delete().eq("user_id", userId);
    await supabase.storage.from(SIGNATURE_BUCKET).remove([`${userId}/default.png`]);
  } catch {
    /* best effort */
  }
}

/** A short-lived object URL for a stored signature image (caller revokes), or null. */
export async function signatureImageUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(path);
    return error || !data ? null : URL.createObjectURL(data);
  } catch {
    return null;
  }
}
