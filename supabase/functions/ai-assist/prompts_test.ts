// Run: deno test supabase/functions/ai-assist/

import {
  HANDLER_FOR,
  HOLDING_REPLY,
  SAFEGUARDING_REPLY,
  buildNotePrompt,
  buildReportPrompt,
  buildTriageContext,
  buildTriagePrompt,
  cleanText,
  firstNameOnly,
  hasEmDash,
  looksLikeSafeguarding,
  promisesConfidentiality,
  redactContacts,
  validateNoteInput,
  validateNoteOutput,
  validateReportInput,
  validateReportOutput,
  validateTriageOutput,
  wordCount,
} from "./prompts.ts";
import { extractJson } from "../_shared/claude.ts";

// Tiny local assertions so the tests run offline.
function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
}

const words = (n: number) => Array.from({ length: n }, (_, i) => (i % 10 === 9 ? "word." : "word")).join(" ");

Deno.test("cleanText removes em and en dashes", () => {
  const out = cleanText("Amina works hard \u2014 and it shows. Pages 3\u20135.");
  assert(!hasEmDash(out), out);
  assert(!out.includes("\u2013"), out);
  assertEquals(out, "Amina works hard, and it shows. Pages 3 to 5.");
});

Deno.test("firstNameOnly drops surnames and odd characters", () => {
  assertEquals(firstNameOnly("Yusuf Ahmed Khan"), "Yusuf");
  assertEquals(firstNameOnly("  Maryam  "), "Maryam");
  assertEquals(firstNameOnly("<b>Ali</b>"), "bAlib");
  assertEquals(firstNameOnly(42), "");
});

Deno.test("redactContacts strips emails, phones, postcodes and links", () => {
  const out = redactContacts("Email me at mum@example.co.uk or call 07700 900123, we live at B11 1AA. See https://x.y/z");
  assert(!out.includes("@"), out);
  assert(!out.includes("07700"), out);
  assert(!out.includes("B11 1AA"), out);
  assert(!out.includes("https://"), out);
});

Deno.test("report input: requires a name and something to write from", () => {
  assert(!validateReportInput({ notes: "great effort" }).ok);
  assert(!validateReportInput({ first_name: "Ali", notes: "" }).ok);
  assert(validateReportInput({ first_name: "Ali", notes: "", effort: "Good" }).ok);
  const long = validateReportInput({ first_name: "Ali", notes: "x".repeat(1501) });
  assert(!long.ok && long.error === "input_too_long");
  assert(!validateReportInput({ first_name: "Ali", notes: "kind", variant: "shorter" }).ok, "shorter needs a draft");
});

Deno.test("report input: surname dropped, numbers range-checked, RECIPE matched", () => {
  const v = validateReportInput({ first_name: "Hafsa Begum", notes: "neat work", attendance_pct: 140, assessment_avg: 72.456, recipe_value: "amanah", want_recipe_line: true });
  assert(v.ok);
  assertEquals(v.input.first_name, "Hafsa");
  assertEquals(v.input.attendance_pct, null);
  assertEquals(v.input.assessment_avg, 72.5);
  assertEquals(v.input.recipe_value, "Amanah");
  assert(v.input.want_recipe_line);
  const bad = validateReportInput({ first_name: "Hafsa", notes: "neat", recipe_value: "Kindness", want_recipe_line: true });
  assert(bad.ok && !bad.input.want_recipe_line && bad.input.recipe_value === "");
});

Deno.test("report prompt carries only the facts given, and the house rules", () => {
  const v = validateReportInput({ first_name: "Zayd", pronoun: "he", year_group: "Year 6", subject: "Maths", notes: "- quick with times tables\n- rushes word problems", attainment: "At expected", effort: "Excellent", attendance_pct: 97 });
  assert(v.ok);
  const p = buildReportPrompt(v.input);
  assert(p.system.includes("UK English"));
  assert(p.system.includes("em dashes"));
  assert(p.system.includes("60 to 120 words"));
  assert(!p.system.includes("recipe_line"));
  assert(p.user.includes("Attendance this term: 97%."));
  assert(p.user.includes("he/him"));
  assert(!p.user.includes("Homework:"), "no homework line when none given");
  assert(!hasEmDash(p.system + p.user));
});

Deno.test("report prompt: shorter and RECIPE variants", () => {
  const v = validateReportInput({ first_name: "Zayd", notes: "kind", recipe_value: "Itqan", want_recipe_line: true, variant: "shorter", current_draft: "Zayd has had a good term." });
  assert(v.ok);
  const p = buildReportPrompt(v.input);
  assert(p.system.includes("40 to 80 words"));
  assert(p.system.includes("recipe_line"));
  assert(p.user.includes("<draft>"));
});

Deno.test("report output: word range enforced and dashes cleaned", () => {
  const v = validateReportInput({ first_name: "Zayd", notes: "kind", recipe_value: "Ikhlas", want_recipe_line: true });
  assert(v.ok);
  assertEquals(validateReportOutput({ comment: words(10) }, v.input), null);
  assertEquals(validateReportOutput({ comment: words(300) }, v.input), null);
  const ok = validateReportOutput({ comment: `Zayd \u2014 a kind boy. ${words(80)}`, recipe_line: "Zayd showed ikhlas by leading dua." }, v.input);
  assert(ok && !hasEmDash(ok.comment));
  assertEquals(ok?.recipe_line, "Zayd showed ikhlas by leading dua.");
  assertEquals(validateReportOutput({ comment: 5 }, v.input), null);
});

Deno.test("tarbiyah note: input checks and prompt", () => {
  assert(!validateNoteInput({ first_name: "Sara", notes: "" }).ok);
  assert(!validateNoteInput({ first_name: "Sara", notes: "x".repeat(1001) }).ok);
  const v = validateNoteInput({ first_name: "Sara Malik", notes: "helped a classmate, late twice, lovely tajweed" });
  assert(v.ok);
  assertEquals(v.input.first_name, "Sara");
  const p = buildNotePrompt(v.input);
  assert(p.system.includes("2 to 4 short sentences"));
  assert(p.user.includes("late twice"));
  assert(!p.user.includes("Malik"));
});

Deno.test("tarbiyah note output: length checks", () => {
  assertEquals(validateNoteOutput({ note: "Good week." }), null);
  assertEquals(validateNoteOutput({ note: words(150) }), null);
  const ok = validateNoteOutput({ note: "Sara helped a classmate this week, MashaAllah. Her tajweed is lovely. She was late twice; arriving on time will help her settle." });
  assert(ok && wordCount(ok.note) > 12);
});

const ctx = (text: string, opts: { flagged?: boolean; wantReply?: boolean } = {}) =>
  buildTriageContext({ parentFirstName: "Fatima Hussain", childFirstName: "Ibrahim Hussain", staffFirstName: "Aisha Rahman", messages: [{ from: "parent", text }], flagged: !!opts.flagged, receivedAt: "Wednesday 28 October 2026 at 08:10 UK time", wantReply: opts.wantReply ?? true });

Deno.test("triage context: first names only, contacts redacted", () => {
  const c = ctx("Ibrahim is ill today. Call me on 07700 900123.");
  assertEquals(c.parentFirstName, "Fatima");
  assertEquals(c.childFirstName, "Ibrahim");
  assert(c.messages[0].text.includes("[number removed]"));
  const p = buildTriagePrompt(c);
  assert(!p.user.includes("Hussain"));
  assert(p.system.includes("safeguarding concern"));
  assert(p.system.includes("Never promise confidentiality"));
  assert(p.user.includes('latest="true"'));
});

Deno.test("triage output: unknown category becomes other; handler mapped", () => {
  const c = ctx("When is the next parents' evening?");
  const t = validateTriageOutput({ category: "events", urgency: "normal", summary: "Asks about parents' evening.", reply: "Dear Fatima, thank you. Kind regards, Aisha" }, c);
  assert(t);
  assertEquals(t.category, "other");
  assertEquals(t.handler, HANDLER_FOR.other);
  assert(!t.dsl);
});

Deno.test("triage output: safeguarding always urgent, fixed reply, DSL banner", () => {
  const c = ctx("I'm worried, my son says an older boy online is asking him to keep secrets.");
  const t = validateTriageOutput({ category: "safeguarding concern", urgency: "normal", summary: "Concern about online contact.", reply: "Don't worry, we'll keep this between us." }, c);
  assert(t);
  assertEquals(t.urgency, "urgent");
  assertEquals(t.reply, SAFEGUARDING_REPLY);
  assert(t.dsl);
  assertEquals(t.handler, "Designated Safeguarding Lead (DSL)");
});

Deno.test("triage output: keyword or flag forces DSL even if the model says otherwise", () => {
  const t = validateTriageOutput({ category: "pastoral or wellbeing", urgency: "normal", summary: "x", reply: "y" }, ctx("She has been self-harming and I don't know what to do"));
  assert(t && t.dsl && t.urgency === "urgent" && t.reply === SAFEGUARDING_REPLY);
  const f = validateTriageOutput({ category: "other", urgency: "normal", summary: "x", reply: "y" }, ctx("please call me", { flagged: true }));
  assert(f && f.dsl);
});

Deno.test("triage output: confidentiality promises are replaced", () => {
  assert(promisesConfidentiality("I promise I will not tell anyone."));
  assert(promisesConfidentiality("This will stay confidential."));
  assert(promisesConfidentiality("We won't share this."));
  assert(!promisesConfidentiality("Thank you, I will pass this to the office."));
  const t = validateTriageOutput({ category: "complaint", urgency: "normal", summary: "Unhappy with marking.", reply: "Dear Fatima, this will remain confidential. Kind regards, Aisha" }, ctx("I'm unhappy with how homework was marked."));
  assertEquals(t?.reply, HOLDING_REPLY);
});

Deno.test("triage output: classification-only mode has no reply", () => {
  const t = validateTriageOutput({ category: "absence", urgency: "urgent", summary: "Ibrahim is off ill today." }, ctx("Ibrahim is ill today", { wantReply: false }));
  assert(t);
  assertEquals(t.reply, null);
  assertEquals(t.urgency, "urgent");
  assertEquals(validateTriageOutput({}, ctx("hi")), null);
});

Deno.test("safeguarding keywords are not triggered by everyday messages", () => {
  assert(!looksLikeSafeguarding("Can I pay the fees in two instalments?"));
  assert(!looksLikeSafeguarding("The homework link isn't working"));
  assert(looksLikeSafeguarding("He said his uncle hits him"));
});

Deno.test("extractJson handles fences and prose", () => {
  assertEquals(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
  assertEquals(extractJson('Sure! {"note": "hi"} hope that helps'), { note: "hi" });
  assertEquals(extractJson("no json here"), null);
  assertEquals(extractJson("[1,2]"), null);
});
