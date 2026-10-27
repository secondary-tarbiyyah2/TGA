// Thin fetch-based client for the BigBlueButton (BBB) HTTP API.
//
// Placement note (deliberate deviation from the brief's suggested
// `src/lib/bbb.ts`): this project's Next.js site is a static export with NO
// server runtime at all (see next.config.ts `output: "export"` and
// DESIGN.md) · every file under `src/` ships to the browser bundle or runs
// only at build time on GitHub Actions. There is no server-side request
// handler in `src/` for a "server-side only" module to live in safely. The
// only place in this codebase that already holds a secret and talks to a
// third-party HTTP API on the caller's behalf is `supabase/functions/_shared`
// (see resend.ts, which does exactly this for the Resend API). This file
// follows that exact, already-established pattern instead of inventing a
// dead (or dangerous) `src/lib/bbb.ts` that nothing server-side would ever
// import. BBB_SERVER_URL / BBB_SECRET are read from Edge Function
// environment only, never referenced from src/.
//
// BBB API reference: https://docs.bigbluebutton.org/development/api
// Auth: every call is a GET/POST with its params (in insertion order) plus
// the shared secret hashed together as `checksum`– BBB rejects any request
// whose checksum doesn't match. No SDK needed; this is the documented norm.

// Accept the base URL however it's pasted: "https://bbb.example.com",
// ".../bigbluebutton/", or the full ".../bigbluebutton/api/" that BBB's own
// `bbb-conf --secret` prints. We append /bigbluebutton/api ourselves.
const BBB_SERVER_URL = (Deno.env.get("BBB_SERVER_URL") || "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/, "")
  .replace(/\/bigbluebutton$/, "");
const BBB_SECRET = Deno.env.get("BBB_SECRET") || "";
// BBB >= 2.6 defaults to sha256 checksums (api version 2.0); older servers
// need "sha1". Configurable so this doesn't silently break against an
// older self-hosted server, see SETUP.md for how to check your server's
// version.
const CHECKSUM_ALGO = (Deno.env.get("BBB_CHECKSUM_ALGORITHM") || "sha256").toLowerCase();

export function bbbConfigured(): boolean {
  return Boolean(BBB_SERVER_URL && BBB_SECRET);
}

async function sha(algo: "sha1" | "sha256", input: string): Promise<string> {
  const digestName = algo === "sha1" ? "SHA-1" : "SHA-256";
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest(digestName, bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function checksum(callName: string, query: string): Promise<string> {
  const algo = CHECKSUM_ALGO === "sha1" ? "sha1" : "sha256";
  return sha(algo, `${callName}${query}${BBB_SECRET}`);
}

/** Builds a fully-signed BBB API URL for the given call and params. Never
 * logged, never returned to a client, every caller of this module runs
 * server-side inside an Edge Function. */
export async function signedUrl(callName: string, params: Record<string, string | undefined>): Promise<string> {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, v);
  }
  const query = usp.toString();
  const sig = await checksum(callName, query);
  return `${BBB_SERVER_URL}/bigbluebutton/api/${callName}?${query}&checksum=${sig}`;
}

// Deno's std lib has no XML DOM built in without an extra import; BBB's XML
// responses are simple enough that a tiny regex-based reader is more
// dependency-free and auditable than pulling in a full XML parser for one
// field at a time. Kept deliberately minimal.
function textBetween(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}
function allBetween(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

export type BbbRole = "moderator" | "viewer";

/**
 * Idempotently ensures a meeting exists for this lesson instance and
 * returns its meetingID (the lesson_instance.id itself, deterministic, so
 * "create" is safe to call every time someone joins; BBB returns success
 * for an already-running meeting with the same ID rather than erroring).
 *
 * Safety settings applied here directly answer the ground rules:
 *  - guestPolicy=ASK_MODERATOR: BBB's waiting room, no one enters live
 *    until the moderator (teacher) admits them.
 *  - lockSettingsDisablePrivateChat=true: BBB's in-meeting chat becomes
 *    whole-class/moderated only, no unsupervised 1:1 teacher-student
 *    private channel is possible inside the call (see final report for the
 *    residual-risk note on this).
 *  - record=<recordingEnabled>, autoStartRecording=false: recording is
 *    available but never starts without an explicit action, and never
 *    silently.
 */
export async function ensureMeeting(opts: {
  meetingId: string;
  meetingName: string;
  moderatorPassword: string;
  attendeePassword: string;
  recordingEnabled: boolean;
}): Promise<{ ok: boolean; detail?: string }> {
  const url = await signedUrl("create", {
    meetingID: opts.meetingId,
    name: opts.meetingName,
    moderatorPW: opts.moderatorPassword,
    attendeePW: opts.attendeePassword,
    record: String(opts.recordingEnabled),
    autoStartRecording: "false",
    allowStartStopRecording: "true",
    guestPolicy: "ASK_MODERATOR",
    lockSettingsDisablePrivateChat: "true",
    lockSettingsDisableCam: "false",
    muteOnStart: "true",
    logoutURL: "about:blank",
    // Explicit rather than relying on BBB's own server default (which
    // varies by version/config) · the moderator's in-call toolbar gets a
    // native "Create breakout rooms" button. breakoutRoomsRecord stays
    // false: recording only ever happens in the main room, on an explicit
    // moderator action (see setRecordingStatus), never automatically in a
    // room split off into smaller, less-supervised groups.
    breakoutRoomsEnabled: "true",
    breakoutRoomsRecord: "false",
    // Same rule as the main room: no private 1:1 chat anywhere in the call.
    breakoutRoomsPrivateChatEnabled: "false",
  });
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  const returncode = textBetween(text, "returncode");
  if (returncode !== "SUCCESS") {
    return { ok: false, detail: textBetween(text, "message") || `BBB create failed (HTTP ${res.status})` };
  }
  return { ok: true };
}

/** Builds a role-scoped join URL. This is the ONLY thing ever returned to
 * the client, never the passwords, never the raw secret. */
export async function buildJoinUrl(opts: {
  meetingId: string;
  fullName: string;
  password: string;
  userId: string; // our own profile id, so BBB's userID matches our user, not guessable
}): Promise<string> {
  return signedUrl("join", {
    meetingID: opts.meetingId,
    fullName: opts.fullName,
    password: opts.password,
    userID: opts.userId,
    redirect: "true",
  });
}

/**
 * Guest join URL for someone with no Supabase account at all, a
 * prospective parent booking an admissions call, who we can't ask to sign
 * in before we've even offered them a place. Relies on guestPolicy=
 * ASK_MODERATOR (set in ensureMeeting): no password is passed, so BBB puts
 * them in its waiting room until the staff moderator admits them, same
 * safeguard as an authenticated viewer, just without the login step.
 */
export async function buildGuestJoinUrl(opts: { meetingId: string; fullName: string }): Promise<string> {
  return signedUrl("join", {
    meetingID: opts.meetingId,
    fullName: opts.fullName,
    // BBB 2.6+ requires a role (or password) on every join; a guest with
    // neither is rejected outright. VIEWER + guest=true = waiting room.
    role: "VIEWER",
    guest: "true",
    redirect: "true",
  });
}

export async function endMeeting(meetingId: string, moderatorPassword: string): Promise<void> {
  const url = await signedUrl("end", { meetingID: meetingId, password: moderatorPassword });
  await fetch(url).catch(() => undefined);
}

export async function setRecordingStatus(opts: {
  meetingId: string;
  moderatorPassword: string;
  recording: boolean;
}): Promise<{ ok: boolean }> {
  // setRecordingStatus needs meetingID (the running meeting's internal ID
  // is preferable, but BBB accepts the external meetingID here too for a
  // currently-running meeting).
  const url = await signedUrl("setRecordingStatus", {
    meetingID: opts.meetingId,
    password: opts.moderatorPassword,
    recordingState: String(opts.recording),
  });
  const res = await fetch(url);
  const text = await res.text();
  return { ok: textBetween(text, "returncode") === "SUCCESS" };
}

export type BbbRecording = {
  recordID: string;
  meetingId: string;
  startTime: number | null;
  endTime: number | null;
  playbackUrl: string | null; // streaming playback (presentation format) · never a raw download
  rawDownloadUrl: string | null; // "podcast"/raw format if published, ONLY ever surfaced by recording-export
};

/** Lists recordings for a meeting. `getRecordings` doesn't require the
 * secret to be scoped per-role, it's the caller's job (the Edge Function)
 * to decide who ever sees the result of this call. */
export async function listRecordings(meetingId: string): Promise<BbbRecording[]> {
  const url = await signedUrl("getRecordings", { meetingID: meetingId });
  return fetchRecordings(url);
}

/** Looks one recording up by its own recordID (not the meeting's), so the caller can never be handed a different recording. */
export async function getRecordingById(recordId: string): Promise<BbbRecording | null> {
  const url = await signedUrl("getRecordings", { recordID: recordId });
  const found = await fetchRecordings(url);
  return found.find((r) => r.recordID === recordId) || null;
}

async function fetchRecordings(url: string): Promise<BbbRecording[]> {
  const res = await fetch(url);
  const text = await res.text();
  if (textBetween(text, "returncode") !== "SUCCESS") return [];
  const out: BbbRecording[] = [];
  for (const recordingXml of allBetween(text, "recording")) {
    const recordID = textBetween(recordingXml, "recordID") || "";
    const startTime = textBetween(recordingXml, "startTime");
    const endTime = textBetween(recordingXml, "endTime");
    // Playback formats appear as repeated <playback><format><type>...</type><url>...</url></format></playback>
    let playbackUrl: string | null = null;
    let rawDownloadUrl: string | null = null;
    for (const formatXml of allBetween(recordingXml, "format")) {
      const type = textBetween(formatXml, "type");
      const formatUrl = textBetween(formatXml, "url");
      if (type === "presentation" && formatUrl) playbackUrl = formatUrl;
      if (type === "podcast" && formatUrl) rawDownloadUrl = formatUrl;
    }
    out.push({
      recordID,
      meetingId: textBetween(recordingXml, "meetingID") || "",
      startTime: startTime ? Number(startTime) : null,
      endTime: endTime ? Number(endTime) : null,
      playbackUrl,
      rawDownloadUrl,
    });
  }
  return out;
}

export async function deleteRecording(recordId: string): Promise<{ ok: boolean }> {
  const url = await signedUrl("deleteRecordings", { recordID: recordId });
  const res = await fetch(url);
  const text = await res.text();
  return { ok: textBetween(text, "returncode") === "SUCCESS" };
}

/** Deterministic, per-lesson-instance passwords, never stored anywhere
 * (not in the DB, not logged); derived on demand from the server secret so
 * every Edge Function call reconstructs the same pair without needing a
 * "meeting passwords" table (data minimisation: one less place holding
 * anything credential-shaped). */
export async function derivePasswords(meetingId: string): Promise<{ moderatorPassword: string; attendeePassword: string }> {
  const moderatorPassword = (await sha("sha256", `${meetingId}:moderator:${BBB_SECRET}`)).slice(0, 20);
  const attendeePassword = (await sha("sha256", `${meetingId}:attendee:${BBB_SECRET}`)).slice(0, 20);
  return { moderatorPassword, attendeePassword };
}
