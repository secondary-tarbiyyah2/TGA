// Run: deno test supabase/functions/inbound-absence/
import { svixSign, verifySvix } from "./svix.ts";
import { senderAuthenticated } from "./sender.ts";

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

const SECRET = "whsec_" + btoa("a-test-secret-of-some-length-123");
const BODY = JSON.stringify({ type: "email.received", data: { email_id: "abc" } });

Deno.test("valid Svix signature is accepted", async () => {
  const now = 1_800_000_000;
  const sig = await svixSign(SECRET, "msg_1", String(now), BODY);
  const r = await verifySvix(SECRET, { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` }, BODY, now);
  assert(r.ok, r.reason);
  // Several signatures (secret rotation): any match is enough.
  const r2 = await verifySvix(SECRET, { id: "msg_1", timestamp: String(now), signature: `v1,AAAA v1,${sig}` }, BODY, now);
  assert(r2.ok);
});

Deno.test("tampered body, wrong secret, stale timestamp, missing headers are rejected", async () => {
  const now = 1_800_000_000;
  const sig = await svixSign(SECRET, "msg_1", String(now), BODY);
  assert(!(await verifySvix(SECRET, { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` }, BODY + " ", now)).ok);
  assert(!(await verifySvix("whsec_" + btoa("other"), { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` }, BODY, now)).ok);
  assert(!(await verifySvix(SECRET, { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` }, BODY, now + 3600)).ok);
  assert(!(await verifySvix(SECRET, { id: null, timestamp: String(now), signature: `v1,${sig}` }, BODY, now)).ok);
  assert(!(await verifySvix("", { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` }, BODY, now)).ok);
});

Deno.test("sender authentication: DMARC pass, or aligned DKIM/SPF pass", () => {
  assert(senderAuthenticated({ spf: "pass", dkim: "pass", dmarc: "pass" }, {}, "a@gmail.com"));
  assert(!senderAuthenticated({ spf: "fail", dkim: "fail", dmarc: "fail" }, {}, "a@gmail.com"));
  assert(!senderAuthenticated(null, {}, "a@gmail.com"));
  // No DMARC record, but DKIM signed by the From domain.
  assert(senderAuthenticated({ spf: "none", dkim: "pass", dmarc: "none" }, { "dkim-signature": "v=1; a=rsa-sha256; d=example.org; s=s1" }, "mum@example.org"));
  // DKIM pass for some other domain does not count.
  assert(!senderAuthenticated({ spf: "none", dkim: "pass", dmarc: "none" }, { "dkim-signature": "v=1; d=evil.com; s=s1" }, "mum@example.org"));
  // SPF pass with an aligned Return-Path.
  assert(senderAuthenticated({ spf: "pass", dkim: "none", dmarc: "none" }, { "return-path": "<bounce@mail.example.org>" }, "mum@example.org"));
  assert(!senderAuthenticated({ spf: "pass", dkim: "none", dmarc: "none" }, { "return-path": "<x@evil.com>" }, "mum@example.org"));
});
