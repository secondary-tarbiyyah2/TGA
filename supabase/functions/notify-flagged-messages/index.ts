// Closes a real gap: message_thread_messages' keyword-match trigger
// (0013) sets flagged=true on a concerning message, but nothing ever told
// the safeguarding lead, it just sat there until someone happened to
// open Compliance. Runs on a schedule (see
// .github/workflows/notify-flagged-messages.yml), same pattern as every
// other alert in this codebase (send-reminders, lms-absence-alerts,
// nudge-outstanding-signatures): find what's new, email it, mark it
// notified so it's never sent twice.
//
// No JWT verification needed, this is scheduled, not user-triggered
// (see supabase/config.toml's other scheduled functions, none of which
// verify_jwt either); it uses the service-role key throughout.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isServiceRequest } from "../_shared/serviceCaller.ts";
import { emailShell, sendEmail } from "../_shared/resend.ts";

const LEARN_SITE_URL = Deno.env.get("LEARN_SITE_URL") || "https://learn.tarbiyyah.co.uk";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  if (!(await isServiceRequest(req))) return jsonResponse({ ok: false, error: "forbidden" }, 403);

  const { data: pending, error } = await supabase
    .from("message_thread_messages")
    .select("id, thread_id, body, flagged_keywords, created_at, profiles(full_name)")
    .eq("flagged", true)
    .is("flagged_notified_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return jsonResponse({ ok: false, error: "query_failed", detail: error.message }, 500);
  if (!pending || pending.length === 0) return jsonResponse({ ok: true, notified: 0 });

  // Everyone currently holding the safeguarding_lead add-on permission, 
  // same permission model 0013's own "safeguarding lead reads flagged
  // messages" RLS policy and Compliance's flagged-message view already
  // use, so "who gets alerted" and "who can see it once alerted" are
  // exactly the same set of people.
  const { data: leads } = await supabase
    .from("user_permissions")
    .select("user_id, profiles(email, full_name)")
    .eq("permission", "safeguarding_lead");

  const recipients = (leads || [])
    .map((l) => l.profiles as unknown as { email: string; full_name: string } | null)
    .filter((p): p is { email: string; full_name: string } => Boolean(p?.email));

  let notified = 0;
  for (const message of pending) {
    if (recipients.length > 0) {
      const sender = (message.profiles as unknown as { full_name?: string } | null)?.full_name || "Someone";
      const keywords = (message.flagged_keywords || []).join(", ");
      const html = emailShell(`
        <h2 style="margin:0 0 12px;font-size:18px;">A message was flagged for review</h2>
        <p style="margin:0 0 12px;">A message from <strong>${sender}</strong> matched a safeguarding keyword${keywords ? ` (${keywords})` : ""} and needs a safeguarding lead to review it.</p>
        <p style="margin:0 0 20px;"><a href="${LEARN_SITE_URL}/admin/compliance" style="color:#B08E45;">Review in Compliance &rarr;</a></p>
        <p style="margin:0;font-size:12px;color:#777;">Sent ${new Date(message.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} (UK time).</p>
      `);
      for (const r of recipients) {
        await sendEmail({ to: r.email, toName: r.full_name, subject: "A message needs safeguarding review", html });
      }
    }
    await supabase.from("message_thread_messages").update({ flagged_notified_at: new Date().toISOString() }).eq("id", message.id);
    notified++;
  }

  return jsonResponse({ ok: true, notified });
});
