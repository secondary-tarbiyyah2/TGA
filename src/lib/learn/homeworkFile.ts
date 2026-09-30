import { getSupabaseClient } from "@/lib/supabase/client";

// The 'homework-submissions' bucket is private (see 0010_homework.sql) —
// a signed URL is the only way to open a file, and createSignedUrl itself
// enforces the same storage.objects RLS policies as a direct read (student/
// parent of that child, teacher of that class, or manage_academic staff),
// so this can't be used to reach a file outside what the caller already
// has read access to. Short expiry (60s) since it's generated on click,
// not stored or shared.
export async function getHomeworkFileUrl(path: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.storage.from("homework-submissions").createSignedUrl(path, 60);
  return data?.signedUrl || null;
}
