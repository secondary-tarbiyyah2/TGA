// Run: deno test supabase/functions/inbound-absence/
//
// "Now" in these tests is Wednesday 28 October 2026 (UK winter time, so UK =
// UTC) unless a case says otherwise. Handy dates:
//   Mon 26 Oct, Tue 27, Wed 28 (today), Thu 29, Fri 30, Sat 31,
//   Sun 1 Nov, Mon 2 Nov, Tue 3, Wed 4, Thu 5, Fri 6, Mon 9 Nov.

import { parseAbsenceEmail, type ChildRef, type ParseResult } from "./parse.ts";
import { cleanEmailBody, htmlToText, normaliseForParsing } from "./text.ts";
import { decide } from "./decide.ts";

// Tiny local assertions so the tests run offline (no jsr/deno.land download).
function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
}

const YUSUF: ChildRef = { id: "c-yusuf", name: "Yusuf Khan" };
const MARYAM: ChildRef = { id: "c-maryam", name: "Maryam Khan" };
const MUH_ALI: ChildRef = { id: "c-ali", name: "Muhammad Ali Rahman" };
const MUH_UMAR: ChildRef = { id: "c-umar", name: "Muhammad Umar Rahman" };
const AISHA: ChildRef = { id: "c-aisha", name: "Aishah Rahman" };
const ZAK: ChildRef = { id: "c-zak", name: "Zakariya Ahmed" };
const IBRAHIM: ChildRef = { id: "c-ibrahim", name: "Ibrahim Ahmed" };

const ONE = [YUSUF];
const TWO = [YUSUF, MARYAM];
const THREE = [MUH_ALI, MUH_UMAR, AISHA];
const ZI = [ZAK, IBRAHIM];

const WED_8AM = new Date("2026-10-28T08:00:00Z");

function p(body: string, opts: { children?: ChildRef[]; at?: Date | string; subject?: string; senderName?: string } = {}): ParseResult {
  const at = typeof opts.at === "string" ? new Date(opts.at) : opts.at || WED_8AM;
  return parseAbsenceEmail({ subject: opts.subject ?? "Absence", body, receivedAt: at, children: opts.children ?? ONE, senderName: opts.senderName });
}
const r1 = (from: string, to = from) => [{ from, to }];
const ok = (r: ParseResult) => assertEquals(r.flags, [], `unexpected flags: ${r.flags.join(", ")}`);

// ── dates ────────────────────────────────────────────────────────────────
Deno.test("today, tomorrow, yesterday", () => {
  assertEquals(p("Yusuf is unwell today").ranges, r1("2026-10-28"));
  assertEquals(p("Yusuf won't be in tomorrow, he has a dentist appointment").ranges, r1("2026-10-29"));
  assertEquals(p("Yusuf was sick yesterday").ranges, r1("2026-10-27"));
  assertEquals(p("off sick today and tomorrow").ranges, r1("2026-10-28", "2026-10-29"));
});

Deno.test("text-speak and misspelt relative words", () => {
  assertEquals(p("yusuf sik 2day").ranges, r1("2026-10-28"));
  assertEquals(p("wont be in 2moro, docters appointmant").ranges, r1("2026-10-29"));
  assertEquals(p("not attending tmrw has temprature").ranges, r1("2026-10-29"));
  assertEquals(p("Yusuf is off school tommorow").ranges, r1("2026-10-29"));
  assertEquals(p("he was poorly yday").ranges, r1("2026-10-27"));
});

Deno.test("weekday names: bare, this, next, last, misspelt", () => {
  assertEquals(p("Yusuf will be off on Friday for a hospital appointment").ranges, r1("2026-10-30"));
  assertEquals(p("dentist appt this friday").ranges, r1("2026-10-30"));
  assertEquals(p("Yusuf was unwell on Monday").ranges, r1("2026-10-26"));
  assertEquals(p("He missed last Tuesday as he was ill").ranges, r1("2026-10-27"));
  assertEquals(p("hospital appointment next Monday").ranges, r1("2026-11-02")); // Monday has passed this week: unambiguous
  assertEquals(p("dentist on wensday next week").ranges, r1("2026-11-04"));
  assertEquals(p("dentist next week on Tuesday").ranges, r1("2026-11-03"));
  assertEquals(p("Doctor's appointment on thurs").ranges, r1("2026-10-29"));
  assertEquals(p("dentist appointmnet thrusday").ranges, r1("2026-10-29"));
});

Deno.test("'next Friday' said earlier the same week is flagged as ambiguous", () => {
  const r = p("Yusuf has an appointment next Friday");
  assertEquals(r.ranges, r1("2026-11-06"));
  assert(r.flags.includes("next_weekday_ambiguous"));
});

Deno.test("weekday ranges incl. mon-wed and misspellings", () => {
  assertEquals(p("Yusuf will be off Mon to Wed next week with chickenpox").ranges, r1("2026-11-02", "2026-11-04"));
  assertEquals(p("off mon-wed, chicken pox", { at: "2026-10-31T10:00:00Z" }).ranges, r1("2026-11-02", "2026-11-04"));
  assertEquals(p("off from thursday till friday, temperature").ranges, r1("2026-10-29", "2026-10-30"));
  assertEquals(p("Off between Thursday and Friday as unwell").ranges, r1("2026-10-29", "2026-10-30"));
});

Deno.test("UK numeric dates dd/mm and written dates", () => {
  assertEquals(p("Yusuf will be absent on 12/11 for an eye test").ranges, r1("2026-11-12"));
  assertEquals(p("Yusuf will be absent on 12/11/26 for an eye test").ranges, r1("2026-11-12"));
  assertEquals(p("absent 12.11.2026 dental appointment").ranges, r1("2026-11-12"));
  assertEquals(p("Appointment on 12 Nov").ranges, r1("2026-11-12"));
  assertEquals(p("Appointment on the 12th of November").ranges, r1("2026-11-12"));
  assertEquals(p("Appointment on November 12th").ranges, r1("2026-11-12"));
  assertEquals(p("Appointment on 2 febuary").ranges.length, 1);
  assertEquals(p("Appointment on 2 febuary").ranges[0].from, "2027-02-02");
  assertEquals(p("dentist on the 3rd").ranges, r1("2026-11-03"));
  assertEquals(p("off from 2/11 until 4/11 for umrah").ranges, r1("2026-11-02", "2026-11-04"));
  assertEquals(p("off 2/11 - 4/11, umrah").ranges, r1("2026-11-02", "2026-11-04"));
});

Deno.test("explicit date next to a weekday: kept, and a mismatch is flagged", () => {
  assertEquals(p("dentist on Monday 2nd November").ranges, r1("2026-11-02"));
  assert(!p("dentist on Monday 2nd November").flags.includes("weekday_date_mismatch"));
  assert(p("dentist on Tuesday 2nd November").flags.includes("weekday_date_mismatch"));
});

Deno.test("times, durations and counts are not mistaken for dates", () => {
  assertEquals(p("dentist appointment at 9.30 tomorrow").ranges, r1("2026-10-29"));
  assertEquals(p("appointment tomorrow 1-2pm").ranges, r1("2026-10-29"));
  assertEquals(p("unwell, probably off for 3-4 days").flags.includes("invalid_date"), false);
});

Deno.test("US-looking dates and impossible dates go to review", () => {
  assert(p("absent 11/25 dentist").flags.includes("us_date_order"));
  assert(p("absent on 31/02 dentist").flags.includes("invalid_date"));
});

Deno.test("until / back on / for N days / rest of week / next week / w/c", () => {
  assertEquals(p("Yusuf is unwell and will be off until Thursday").ranges, r1("2026-10-28", "2026-10-29"));
  assertEquals(p("Yusuf has flu, he should be back on Monday").ranges, r1("2026-10-28", "2026-10-30"));
  assertEquals(p("Yusuf has a temperature, keeping him off for 3 days").ranges, r1("2026-10-28", "2026-10-30"));
  assertEquals(p("off for three days from Thursday, chickenpox").ranges, r1("2026-10-29", "2026-11-02"));
  assertEquals(p("off sick for the rest of the week").ranges, r1("2026-10-28", "2026-10-30"));
  assertEquals(p("He will be away next week for umrah").ranges, r1("2026-11-02", "2026-11-06"));
  assertEquals(p("Umrah w/c 9 Nov").ranges, r1("2026-11-09", "2026-11-13"));
  assertEquals(p("off for a week with chickenpox").ranges, r1("2026-10-28", "2026-11-03"));
  assertEquals(p("Yusuf has been off sick since Monday").ranges, r1("2026-10-26", "2026-10-28"));
  assertEquals(p("ill, back next week inshallah").ranges, r1("2026-10-28", "2026-10-30"));
});

Deno.test("no date: before 15:00 on a school day means today", () => {
  const r = p("Yusuf has a fever");
  assertEquals(r.ranges, r1("2026-10-28"));
  assertEquals(r.dateHow, "default_today");
  ok(r);
});

Deno.test("no date: after 15:00 means the next school day", () => {
  const r = p("Yusuf has a high temperature and won't be in", { at: "2026-10-28T19:30:00Z" });
  assertEquals(r.ranges, r1("2026-10-29"));
  assertEquals(r.dateHow, "default_next_school_day");
  const fri = p("Yusuf has a high temperature and won't be in", { at: "2026-10-30T17:00:00Z" });
  assertEquals(fri.ranges, r1("2026-11-02"));
});

Deno.test("no date: past tense after 15:00 means today", () => {
  assertEquals(p("Sorry, Yusuf was unwell and missed school", { at: "2026-10-28T16:30:00Z" }).ranges, r1("2026-10-28"));
});

Deno.test("weekend: no date means Monday; 'today' on a Saturday is flagged", () => {
  const r = p("Yusuf has been vomiting and won't be in", { at: "2026-10-31T09:00:00Z" });
  assertEquals(r.ranges, r1("2026-11-02"));
  ok(r);
  const sat = p("Yusuf is unwell today", { at: "2026-10-31T09:00:00Z" });
  assert(sat.flags.includes("non_school_day"));
  const past = p("Yusuf was unwell", { at: "2026-10-31T09:00:00Z" });
  assert(past.flags.includes("past_absence_no_date_at_weekend"));
});

Deno.test("UK clocks: 15:00 cut-off uses UK summer time", () => {
  // 14:30 UTC on 14 Oct 2026 is 15:30 in the UK (BST): next school day.
  assertEquals(p("Yusuf is unwell", { at: "2026-10-14T14:30:00Z" }).ranges, r1("2026-10-15"));
  // 23:30 UTC on Tue 13 Oct is 00:30 Wed in the UK: "today" is Wednesday.
  assertEquals(p("Yusuf is unwell today", { at: "2026-10-13T23:30:00Z" }).ranges, r1("2026-10-14"));
});

Deno.test("dates far away go to review", () => {
  assert(p("He was ill on 1 September").flags.includes("date_out_of_window"));
  assert(p("Holiday 1/3/27 - 20/3/27").flags.includes("date_out_of_window"));
});

Deno.test("Friday and Monday merge across the weekend", () => {
  assertEquals(p("off Friday and Monday, wedding").ranges, r1("2026-10-30", "2026-11-02"));
});

Deno.test("separate days stay separate", () => {
  assertEquals(p("appointments on Thursday and next Wednesday").ranges.length, 2);
});

// ── children ─────────────────────────────────────────────────────────────
Deno.test("only child is the default", () => {
  const r = p("He is unwell today");
  assertEquals(r.childIds, ["c-yusuf"]);
  assertEquals(r.childHow, "only_child");
});

Deno.test("first name, full name, possessive, lower case and ALL CAPS", () => {
  assertEquals(p("Maryam is unwell today", { children: TWO }).childIds, ["c-maryam"]);
  assertEquals(p("maryam is unwell today", { children: TWO }).childIds, ["c-maryam"]);
  assertEquals(p("MARYAM IS SICK TODAY", { children: TWO }).childIds, ["c-maryam"]);
  assertEquals(p("Maryam's temperature is high", { children: TWO }).childIds, ["c-maryam"]);
  assertEquals(p("Yusuf Khan is ill", { children: TWO }).childIds, ["c-yusuf"]);
});

Deno.test("typos, spelling variants and nicknames", () => {
  assertEquals(p("Yusef is ill", { children: TWO }).childIds, ["c-yusuf"]);
  assertEquals(p("Yousuf is ill", { children: TWO }).childIds, ["c-yusuf"]);
  assertEquals(p("Mariam is ill", { children: TWO }).childIds, ["c-maryam"]);
  assertEquals(p("Zak has a dentist appointment", { children: ZI }).childIds, ["c-zak"]);
  assertEquals(p("Ibby has a cold", { children: ZI }).childIds, ["c-ibrahim"]);
  assertEquals(p("Aisha has a cold", { children: THREE }).childIds, ["c-aisha"]);
  assertEquals(p("Ayesha has a cold", { children: THREE }).childIds, ["c-aisha"]);
});

Deno.test("both / all / the kids / plural pronouns mean all children", () => {
  assertEquals(p("Both are unwell today", { children: TWO }).childIds, ["c-yusuf", "c-maryam"]);
  assertEquals(p("The kids have a sickness bug", { children: TWO }).childIds, ["c-yusuf", "c-maryam"]);
  assertEquals(p("all my children have flu", { children: THREE }).childIds.length, 3);
  assertEquals(p("They are both unwell", { children: TWO }).childIds.length, 2);
  assertEquals(p("keeping them home today, d&v", { children: TWO }).childIds.length, 2);
  assertEquals(p("Yusuf and Maryam have colds", { children: TWO }).childHow, "named");
  assertEquals(p("Yusuf and Maryam have colds", { children: TWO }).childIds.length, 2);
});

Deno.test("'both' in a family of three is ambiguous", () => {
  assert(p("Both have a cold", { children: THREE }).flags.includes("children_ambiguous"));
});

Deno.test("shared first names resolve with the second name, otherwise ambiguous", () => {
  assertEquals(p("Muhammad Umar is unwell", { children: THREE }).childIds, ["c-umar"]);
  assertEquals(p("Umar is unwell", { children: THREE }).childIds, ["c-umar"]);
  assert(p("Muhammad is unwell", { children: THREE }).flags.includes("children_ambiguous"));
  assert(p("Mohammed is unwell", { children: THREE }).flags.includes("children_ambiguous"));
});

Deno.test("no name in a family of two goes to review", () => {
  assert(p("He is unwell today", { children: TWO }).flags.includes("children_unknown"));
  // "let them know" is not a plural pronoun about the absence
  assert(p("He is unwell today, please let them know", { children: TWO }).flags.includes("children_unknown"));
});

Deno.test("a name that is not one of the family's children goes to review", () => {
  const r = p("Bilal is unwell today", { children: TWO });
  assert(r.flags.includes("unknown_name"));
  assertEquals(r.childIds, []);
});

Deno.test("the parent's own name in the sign-off is not taken for a child", () => {
  const r = p("Salaam, Yusuf is unwell today.\nAmina", { children: [YUSUF, { id: "c-aminah", name: "Aminah Khan" }], senderName: "Amina Khan" });
  assertEquals(r.childIds, ["c-yusuf"]);
});

Deno.test("'all my children' but only one named is a conflict", () => {
  assert(p("All my children are off, Umar has flu", { children: THREE }).flags.includes("children_conflict"));
});

// ── reasons ──────────────────────────────────────────────────────────────
Deno.test("reason categories incl. misspellings and Arabic/Urdu terms", () => {
  const cat = (s: string) => p(s).category;
  assertEquals(cat("Yusuf is sik today"), "Unwell");
  assertEquals(cat("he has a temprature"), "Unwell");
  assertEquals(cat("Yusuf has been vommiting all night"), "Unwell");
  assertEquals(cat("he is bimar today"), "Unwell");
  assertEquals(cat("docters appointmant at 10"), "Medical or dental appointment");
  assertEquals(cat("dentist appt tomorrow"), "Medical or dental appointment");
  assertEquals(cat("taking him to the doctors"), "Medical or dental appointment");
  assertEquals(cat("Orthodontist for his braces"), "Medical or dental appointment");
  assertEquals(cat("dentist because of toothache"), "Medical or dental appointment");
  assertEquals(cat("We have a janazah to attend"), "Family emergency");
  assertEquals(cat("Inna lillahi, his grandmother passed away"), "Family emergency");
  assertEquals(cat("family emergency"), "Family emergency");
  assertEquals(cat("Eid tomorrow inshallah"), "Religious observance");
  assertEquals(cat("going for umrah next week"), "Religious observance");
  assertEquals(cat("Our internet is down"), "Other");
  assertEquals(cat("family wedding in Pakistan"), "Other");
  assertEquals(cat("he won't be in tomorrow"), null);
});

Deno.test("gist drops greetings, filler and thanks", () => {
  const r = p("Assalamu alaikum,\n\nI am writing to let you know that Yusuf has a temperature and will stay home today.\n\nJazakAllah khair");
  assertEquals(r.gist, "Yusuf has a temperature and will stay home today.");
});

Deno.test("no punctuation, all caps", () => {
  const r = p("SALAM YUSUF NOT WELL WONT BE IN TODAY HAS FEVER", { children: TWO });
  assertEquals(r.childIds, ["c-yusuf"]);
  assertEquals(r.ranges, r1("2026-10-28"));
  assertEquals(r.category, "Unwell");
  ok(r);
});

Deno.test("corrections and cancellations go to review", () => {
  assert(p("Please ignore my last email, Yusuf is coming in after all").flags.includes("correction_or_cancellation"));
});

Deno.test("late arrival is noted but not blocking", () => {
  const r = p("Yusuf has a dentist appointment tomorrow and will be late");
  assert(r.notes.includes("partial_day"));
  ok(r);
});

// ── quoted replies and signatures ────────────────────────────────────────
Deno.test("quoted earlier emails and signatures are ignored", () => {
  const body = [
    "Maryam is unwell today, sorry.",
    "",
    "Kind regards",
    "Amina Khan",
    "07700 900123",
    "",
    "Sent from my iPhone",
    "",
    "On Tue, 27 Oct 2026 at 08:01, Tarbiyyah Global Academy <noreply@globalacademy.tarbiyyah.co.uk> wrote:",
    "> Absence recorded for Yusuf on Fri 30 Oct 2026: Unwell",
    "> Dentist appointment next Friday",
  ].join("\n");
  const r = p(body, { children: TWO });
  assertEquals(r.cleanedBody, "Maryam is unwell today, sorry.");
  assertEquals(r.childIds, ["c-maryam"]);
  assertEquals(r.ranges, r1("2026-10-28"));
  ok(r);
});

Deno.test("Outlook-style quoted header and wrapped Gmail header are cut", () => {
  assertEquals(cleanEmailBody("Off today, flu\n\nFrom: School <x@y.com>\nSent: 27 October 2026\nTo: me\nSubject: hi\n\nold text Friday"), "Off today, flu");
  assertEquals(cleanEmailBody("Off today, flu\nOn Tue, 27 Oct 2026 at 08:01, Tarbiyyah Global Academy <\nnoreply@x.uk> wrote:\nold"), "Off today, flu");
  assertEquals(cleanEmailBody("Off today\n-- \nAmina\nMum of Yusuf"), "Off today");
  assertEquals(cleanEmailBody("Off today\n\nGet Outlook for Android"), "Off today");
});

Deno.test("HTML-only email", () => {
  const html = `<html><head><style>p{}</style></head><body><p>Yusuf is unwell&nbsp;today.</p><div class="gmail_quote">On Mon wrote: <blockquote>old Friday</blockquote></div></body></html>`;
  assertEquals(cleanEmailBody(htmlToText(html)), "Yusuf is unwell today.");
});

Deno.test("subject line counts (Re: stripped)", () => {
  const r = p("", { subject: "Re: Yusuf absent tomorrow - dentist" });
  assertEquals(r.ranges, r1("2026-10-29"));
  assertEquals(r.category, "Medical or dental appointment");
});

Deno.test("normaliser fixes misspellings but leaves ordinary words alone", () => {
  assertEquals(normaliseForParsing("never cold could general"), "never cold could general");
  assertEquals(normaliseForParsing("tommorow wensday febuary"), "tomorrow wednesday february");
});

// ── decision gate (deterministic only) ───────────────────────────────────
Deno.test("decide: confident simple case records; anything unclear goes to review", () => {
  const good = decide(p("Yusuf is unwell today"), null, ONE, new Date(WED_8AM));
  assertEquals(good.status, "recorded");
  const noReason = decide(p("Yusuf won't be in today"), null, ONE, WED_8AM);
  assertEquals(noReason.status, "needs_review");
  const amb = decide(p("He is unwell", { children: TWO }), null, TWO, WED_8AM);
  assertEquals(amb.status, "needs_review");
});

Deno.test("decide: model output is validated and reconciled", () => {
  const det = p("Yusuf is unwell today");
  // Agreeing model result: recorded.
  assertEquals(decide(det, { childNames: ["Yusuf Khan"], allChildren: false, ranges: r1("2026-10-28"), category: "Unwell", gist: "Has a temperature.", needsHuman: false, confidence: "high" }, ONE, WED_8AM).status, "recorded");
  // Model invents a child: never accepted.
  const inv = decide(det, { childNames: ["Bilal"], allChildren: false, ranges: r1("2026-10-28"), category: "Unwell", gist: "", needsHuman: false, confidence: "high" }, ONE, WED_8AM);
  assertEquals(inv.status, "needs_review");
  // Model disagrees on the dates: review.
  assertEquals(decide(det, { childNames: ["Yusuf"], allChildren: false, ranges: r1("2026-10-29"), category: "Unwell", gist: "", needsHuman: false, confidence: "high" }, ONE, WED_8AM).status, "needs_review");
  // Model date outside the window: review.
  assertEquals(decide(p("Yusuf is unwell"), { childNames: ["Yusuf"], allChildren: false, ranges: r1("2027-06-01"), category: "Unwell", gist: "", needsHuman: false, confidence: "high" }, ONE, WED_8AM).status, "needs_review");
  // Model fills in the reason the rules missed, for a clear child and date: recorded.
  const det2 = p("Yusuf won't be in today, he hurt his foot playing football");
  const filled = decide(det2, { childNames: ["Yusuf"], allChildren: false, ranges: r1("2026-10-28"), category: "Unwell", gist: "Hurt his foot playing football.", needsHuman: false, confidence: "high" }, ONE, WED_8AM);
  assertEquals(filled.status, "recorded");
  assertEquals(filled.category, "Unwell");
});

Deno.test("a child mentioned as attending is left out", () => {
  const r = p("Yusuf has a bad cough so I'm keeping him home today. Maryam will be in as normal.", { children: TWO });
  assertEquals(r.childIds, ["c-yusuf"]);
  ok(r);
});

Deno.test("no punctuation: 'not feeling well he will be back monday'", () => {
  assertEquals(p("yusuf is not feeling well he will be back monday").ranges, r1("2026-10-28", "2026-10-30"));
  assertEquals(p("he won't be back until monday, flu").ranges, r1("2026-10-28", "2026-11-02"));
});

Deno.test("greeting with honorific is dropped from the gist", () => {
  assertEquals(p("Salam sister, Yusuf has a hospital appt on 4th nov").gist, "Yusuf has a hospital appt on 4th nov");
});

Deno.test("a question that isn't an absence goes to review", () => {
  const r = p("Can you tell me when half term is?", { children: TWO });
  assert(r.flags.includes("no_reason"));
});
