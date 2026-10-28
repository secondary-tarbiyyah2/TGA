# Report an absence by email: setup

Parents email **absence@globalacademy.tarbiyyah.co.uk** from their registered address. The portal reads the email, records the absence (one note per child, marked "(by email)") and emails the parent to confirm exactly what it recorded. Anything unclear waits for the office on **Absences → Emails**.

It takes about 20 minutes, plus DNS propagation. Nothing changes for families until all the steps are done.

---

## 1. Turn on receiving in Resend

The school already sends email through Resend, so the domain is probably already in the Resend account.

1. Sign in at **https://resend.com** and open **Domains**.
2. Open **globalacademy.tarbiyyah.co.uk** (add and verify it first if it isn't there).
3. In the **Receiving** section, switch receiving **on**. Resend shows an **MX record**. Copy its **name**, **value** and **priority** exactly (the value looks like `inbound-smtp.<region>.amazonaws.com` or `receive...rmta.net`; use what Resend shows, not this example).

## 2. Add the MX record (DNS)

At the DNS provider for **tarbiyyah.co.uk**, add:

| Type | Name / host | Value | Priority |
|---|---|---|---|
| MX | `globalacademy` (i.e. `globalacademy.tarbiyyah.co.uk`) | the value Resend showed | the priority Resend showed (use the lowest number on that name) |

Before you add it, check that `globalacademy.tarbiyyah.co.uk` has **no other MX record**. The school's normal mailboxes (e.g. `globalacademy@tarbiyyah.co.uk`) live on the main domain `tarbiyyah.co.uk`, which is not touched. Sending records (SPF/DKIM, and any `send.` or `bounce.` subdomain used for outgoing mail) stay exactly as they are.

> **If `globalacademy.tarbiyyah.co.uk` already receives email somewhere else**, don't add a second MX record (mail would go to one or the other unpredictably). Instead either use a new subdomain just for this, e.g. `absence@in.globalacademy.tarbiyyah.co.uk` (add that subdomain in Resend, put the MX on `in.globalacademy`, and set the `ABSENCE_INBOX_EMAIL` variable in step 4), or forward `absence@...` from the existing mail system to an address on a Resend-verified receiving domain. If you change the address, ask for the two places it is shown in the portal to be updated (Parent Portal absences page and the staff Emails tab).

Back in Resend, click **I've added the record** and wait for the receiving record to show **Verified** (minutes to a few hours).

## 3. Create the webhook in Resend

1. In Resend open **Webhooks → Add Webhook**.
2. **Endpoint URL**: `https://<project-ref>.supabase.co/functions/v1/inbound-absence`
   (the project ref is in the Supabase dashboard URL for the "TGA" project, or under Project Settings → General).
3. **Events**: tick only **`email.received`**.
4. Click **Add**, then open the webhook and copy its **Signing secret** (it starts with `whsec_`).

## 4. Add the secrets to GitHub

In the GitHub repository: **Settings → Secrets and variables → Actions**.

| Name | Where | Value | Required? |
|---|---|---|---|
| `RESEND_INBOUND_WEBHOOK_SECRET` | Secrets | the `whsec_...` signing secret from step 3 | **Yes.** Without it every email is rejected. |
| `ANTHROPIC_API_KEY` | Secrets | a Claude API key from console.anthropic.com | Optional. Adds an AI second reader for messy emails (see below). |
| `AI_MODEL` | Variables | model for all AI features | Optional (default `claude-haiku-5-5`). |
| `ABSENCE_PARSER_MODEL` | Variables | model just for absence emails | Optional (default: `AI_MODEL`). |
| `ABSENCE_INBOX_EMAIL` | Variables | the inbox address | Optional (default `absence@globalacademy.tarbiyyah.co.uk`). |

`RESEND_API_KEY` is already set; the function uses it to fetch each email's text from Resend.

Then run the **Deploy Supabase backend** workflow (Actions tab → Run workflow), or push any change under `supabase/`. It applies the database migration (`0172_absence_by_email.sql`), copies the secrets to Supabase and deploys the `inbound-absence` function.

## 5. Test it

1. From a **parent account's registered email address**, send to `absence@globalacademy.tarbiyyah.co.uk`:
   *"Salaam, Yusuf has a temperature and won't be in today."* (use a real child's first name).
2. Within a minute the parent should get *"Absence recorded for Yusuf on ...: Unwell"*, and the note appears on the Parent Portal and under **Absences → Parent notes** marked "(by email)".
3. Send one from an unregistered address: nothing is recorded, a polite reply explains why, and it is listed under **Absences → Emails → Not recorded**.
4. If nothing arrives, check Resend → Webhooks → the webhook's delivery log (a 401 means the signing secret doesn't match), and Supabase → Edge Functions → inbound-absence → Logs.

---

## How it decides (for the office)

- **Who sent it.** The sender must match, ignoring capitals, a parent's registered email, or an emergency contact marked as having parental responsibility (for that child only). Resend's SPF/DKIM/DMARC checks must also pass; a message that could be spoofed is never recorded automatically, it goes to review.
- **What it says.** Rules built into the portal read the child, dates and reason, allowing for misspellings, text-speak and missing punctuation. If `ANTHROPIC_API_KEY` is set, Claude reads it as well; its answer is checked against the family's real children and sensible dates, and if it and the rules disagree, the email goes to review.
- **When it records automatically.** Only when the child (or children) is clear and belongs to that family, the dates are real school days between two weeks ago and two months ahead, the reason fits the portal's list, and nothing looks like a correction. Everything else waits on **Absences → Emails**, and the parent is told the office will check it.
- **Duplicates.** Resend retries are ignored, and an email for days already covered by a note is not recorded twice.
- **Replies** go to at most 5 per address per day, and never to automatic replies or bulk mail, so two auto-responders can't loop.
