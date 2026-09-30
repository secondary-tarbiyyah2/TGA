// End-to-end smoke test of our BigBlueButton integration
// (supabase/functions/_shared/bbb.ts) against a real BBB server. Run by
// .github/workflows/test-bbb.yml; results come out as GitHub annotations
// and the job summary.
//
// Server: the repo's BBB_SERVER_URL / BBB_SECRET secrets if set (your own
// server). Otherwise Blindside Networks' public test server, the same
// default Moodle's BigBlueButton plugin ships with
// (mod/bigbluebuttonbn/classes/local/config.php). That demo server is ONLY
// for this automated check: it's shared and third-party, so it must never
// be configured for real lessons with children.
//
// Run locally: deno run --allow-net --allow-env scripts/test-bbb.ts

const DEMO_URL = "https://test-moodle.blindsidenetworks.com/bigbluebutton/";
const DEMO_SECRET = "0b21fcaf34673a8c3ec8ed877d76ae34";

const usingOwnServer = Boolean(Deno.env.get("BBB_SERVER_URL") && Deno.env.get("BBB_SECRET"));
if (!usingOwnServer) {
  Deno.env.set("BBB_SERVER_URL", DEMO_URL);
  Deno.env.set("BBB_SECRET", DEMO_SECRET);
}

const bbb = await import("../supabase/functions/_shared/bbb.ts");

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`::${ok ? "notice" : "error"} title=BBB ${ok ? "PASS" : "FAIL"}: ${name}::${detail.replace(/\n/g, " ")}`);
}

function tag(xml: string, t: string) {
  return xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1] ?? null;
}

/** Follow the join URL's redirects by hand (a load balancer such as
 * Scalelite first redirects to a backend's own /api/join) until it lands
 * in BBB's client or waiting room — that's an accepted join. A rejected
 * join comes back as a 200 FAILED XML body instead. */
async function checkJoin(name: string, url: string) {
  try {
    let current = url;
    const hops: string[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch(current, { redirect: "manual" });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel().catch(() => {});
        current = new URL(loc, current).toString();
        const path = new URL(current).pathname;
        hops.push(path);
        if (/guest-?wait/i.test(current)) return record(name, true, `accepted, placed in the waiting room (${hops.join(" → ")})`);
        if (/html5client|sessionToken=/.test(current)) return record(name, true, `accepted, into the call (${hops.join(" → ")})`);
        continue;
      }
      const body = await res.text();
      if (tag(body, "returncode") === "FAILED") return record(name, false, `rejected: ${tag(body, "messageKey") || ""} ${tag(body, "message") || ""}`);
      return record(name, false, `ended at HTTP ${res.status} ${new URL(current).pathname} without reaching the client`);
    }
    record(name, false, `too many redirects (${hops.join(" → ")})`);
  } catch (e) {
    record(name, false, String(e));
  }
}

const serverBase = (Deno.env.get("BBB_SERVER_URL") || "").replace(/\/+$/, "").replace(/\/api$/, "").replace(/\/bigbluebutton$/, "");
const meetingId = `tga-ci-${Date.now()}`;

// 1. Server reachable + version (unsigned call).
try {
  const res = await fetch(`${serverBase}/bigbluebutton/api`);
  const xml = await res.text();
  const version = tag(xml, "bbbVersion") ? `BBB ${tag(xml, "bbbVersion")}` : `API ${tag(xml, "version") ?? "unknown"}`;
  record("Server reachable", tag(xml, "returncode") === "SUCCESS", `${usingOwnServer ? "your server" : "public test server"} · ${version}`);
} catch (e) {
  record("Server reachable", false, String(e));
}

// 2. Create the meeting exactly as lessons/booking calls do (waiting room,
//    no private chat, breakout rooms on, recording off by default).
const { moderatorPassword, attendeePassword } = await bbb.derivePasswords(meetingId);
const created = await bbb.ensureMeeting({ meetingId, meetingName: "TGA automated check", moderatorPassword, attendeePassword, recordingEnabled: false });
record("Create meeting (checksum + settings accepted)", created.ok, created.ok ? `meeting ${meetingId}` : created.detail || "failed");

// 3. Calling create again must be harmless (both sides of a call do it).
const again = await bbb.ensureMeeting({ meetingId, meetingName: "TGA automated check", moderatorPassword, attendeePassword, recordingEnabled: false });
record("Create is idempotent", again.ok, again.ok ? "second create returned SUCCESS" : again.detail || "failed");

// 4. Meeting settings as BBB stored them.
try {
  const res = await fetch(await bbb.signedUrl("getMeetingInfo", { meetingID: meetingId }));
  const xml = await res.text();
  record("Meeting info readable", tag(xml, "returncode") === "SUCCESS", `returncode ${tag(xml, "returncode")}${tag(xml, "messageKey") ? " · " + tag(xml, "messageKey") : ""}`);
} catch (e) {
  record("Meeting info readable", false, String(e));
}

if (created.ok) {
  // 5. Joins, exactly as the Edge Functions build them.
  await checkJoin("Teacher/staff join (moderator)", await bbb.buildJoinUrl({ meetingId, fullName: "CI Teacher", password: moderatorPassword, userId: "ci-teacher" }));
  await checkJoin("Student join (viewer)", await bbb.buildJoinUrl({ meetingId, fullName: "CI Student", password: attendeePassword, userId: "ci-student" }));
  await checkJoin("Parent guest join (admissions call)", await bbb.buildGuestJoinUrl({ meetingId, fullName: "CI Parent" }));

  // 6. Recordings list works (empty for a new meeting).
  const recs = await bbb.listRecordings(meetingId);
  record("List recordings", Array.isArray(recs), `${recs.length} recording(s)`);

  // 7. Clean up.
  await bbb.endMeeting(meetingId, moderatorPassword);
  const res = await fetch(await bbb.signedUrl("isMeetingRunning", { meetingID: meetingId }));
  const xml = await res.text();
  record("End meeting", tag(xml, "running") !== "true", `running=${tag(xml, "running")}`);
}

const passed = results.filter((r) => r.ok).length;
const summary = [
  `## BigBlueButton check: ${passed}/${results.length} passed`,
  "",
  `Server: ${usingOwnServer ? "your own (repo secrets)" : "public test server (no BBB secrets set yet)"}`,
  "",
  "| Check | Result | Detail |",
  "|---|---|---|",
  ...results.map((r) => `| ${r.name} | ${r.ok ? "✅" : "❌"} | ${r.detail.replace(/\|/g, "/")} |`),
].join("\n");
console.log(summary);
const summaryFile = Deno.env.get("GITHUB_STEP_SUMMARY");
if (summaryFile) await Deno.writeTextFile(summaryFile, summary + "\n", { append: true });
if (passed !== results.length) Deno.exit(1);
