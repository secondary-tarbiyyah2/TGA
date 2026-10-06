// Streams an uploaded website policy (PDF or Word file) so the main site can
// serve it from a stable address on its own domain: /policies/<slug>.pdf
// (or .docx). The main site is a static export on cPanel, so
// deploy/policy.php (the same idea as deploy/calendar.php) calls this
// function server-side and passes the bytes straight through; visitors never
// see a supabase.co address.
//
// Deployed with --no-verify-jwt: the files are public website policies and
// the only caller is that PHP script. It only ever serves a file that is
// attached to a live (not removed) policy, looked up by slug.
//
// GET ?slug=<slug>&ext=pdf|docx
//   200  file bytes
//   404  no such policy, removed, or no file uploaded for it (the PHP script
//        then falls back to the PDF bundled with the site build, if any)
import { createClient } from "jsr:@supabase/supabase-js@2";

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "policy-documents";

const CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function notFound(): Response {
  return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  const params = new URL(req.url).searchParams;
  const slug = (params.get("slug") || "").toLowerCase();
  const ext = params.get("ext") === "docx" ? "docx" : "pdf";
  if (!/^[a-z0-9][a-z0-9-]{0,118}$/.test(slug)) return notFound();

  const { data: row } = await service
    .from("policy_links")
    .select("file_path, file_kind, updated_at")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row || !row.file_path || row.file_kind !== ext) return notFound();

  const { data: blob, error } = await service.storage.from(BUCKET).download(row.file_path as string);
  if (error || !blob) return notFound();

  return new Response(req.method === "HEAD" ? null : blob, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPE[ext],
      "Content-Disposition": `inline; filename="${slug}.${ext}"`,
      // A replaced file is live straight away: browsers must re-check each time.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex",
    },
  });
});
