// Node-side twin of supabase/functions/_shared/bbb.ts, for the two
// scheduled GitHub Actions scripts that talk to BBB directly (same reason
// generate-timetable.yml's solver talks to Supabase directly with the
// service-role key rather than going through an Edge Function: a scheduled
// batch job with no end user in the loop doesn't need the "re-check the
// caller's own permission" layer an Edge Function exists for — trust here
// comes from the job holding BBB_SECRET as a GitHub Actions secret, exactly
// like SUPABASE_SERVICE_ROLE_KEY above it).
//
// Deliberately NOT a shared import between the Deno Edge Functions and this
// Node script (Deno's `jsr:`/relative-import module resolution and Node's
// npm resolution don't share a module graph in this repo's setup) — kept in
// sync by hand; both implement the same small, stable BBB HTTP API.
import { createHash } from "node:crypto";

const BBB_SERVER_URL = (process.env.BBB_SERVER_URL || "").replace(/\/$/, "");
const BBB_SECRET = process.env.BBB_SECRET || "";
const CHECKSUM_ALGO = (process.env.BBB_CHECKSUM_ALGORITHM || "sha256").toLowerCase() === "sha1" ? "sha1" : "sha256";

export function bbbConfigured() {
  return Boolean(BBB_SERVER_URL && BBB_SECRET);
}

function checksum(callName, query) {
  return createHash(CHECKSUM_ALGO).update(`${callName}${query}${BBB_SECRET}`).digest("hex");
}

function signedUrl(callName, params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") usp.set(k, v);
  const query = usp.toString();
  return `${BBB_SERVER_URL}/bigbluebutton/api/${callName}?${query}&checksum=${checksum(callName, query)}`;
}

function textBetween(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}
function allBetween(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/** Lists every recording BBB currently holds (no meetingID filter — the
 * retention job needs to see all of them to reconcile against our DB). */
export async function listAllRecordings() {
  const url = signedUrl("getRecordings", {});
  const res = await fetch(url);
  const text = await res.text();
  if (textBetween(text, "returncode") !== "SUCCESS") return [];
  const out = [];
  for (const recordingXml of allBetween(text, "recording")) {
    const recordID = textBetween(recordingXml, "recordID") || "";
    const meetingID = textBetween(recordingXml, "meetingID") || "";
    const startTime = textBetween(recordingXml, "startTime");
    const endTime = textBetween(recordingXml, "endTime");
    out.push({
      recordID,
      meetingID,
      startTime: startTime ? Number(startTime) : null,
      endTime: endTime ? Number(endTime) : null,
    });
  }
  return out;
}

export async function deleteRecording(recordId) {
  const url = signedUrl("deleteRecordings", { recordID: recordId });
  const res = await fetch(url);
  const text = await res.text();
  return textBetween(text, "returncode") === "SUCCESS";
}
