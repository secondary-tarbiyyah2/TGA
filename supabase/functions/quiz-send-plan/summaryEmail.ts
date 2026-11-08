// Lays out the "Is it right for us?" summary email (version 2): the same
// sections, in the same order, as the result page the family has just seen
// (src/components/eligibility/FitCheck.tsx, buildEmailSummary). Every string
// from the client is length-capped and HTML-escaped, and links may only point
// at pages on the Academy's own site.

const SITE = "https://globalacademy.tarbiyyah.co.uk";

const C = {
  ink: "#1B1E21",
  muted: "#5B5F63",
  gold: "#B08E45",
  goldDark: "#5E4B1E",
  goldSoft: "#F7F1E3",
  goldLine: "#E8DCC0",
  cream: "#FDFBF6",
  teal: "#2F6F62",
  tealSoft: "#E6F2EF",
  amber: "#8A5A00",
  amberSoft: "#FFF4DD",
  red: "#7A1F1F",
  redSoft: "#FDECEC",
};

const FONT = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function esc(s: unknown, max = 1200): string {
  return String(s ?? "")
    .slice(0, max)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Only our own pages: "/book-a-call?year=Year%203#book" becomes a full link; anything else is dropped. */
function siteLink(href: unknown): string | null {
  const h = String(href ?? "");
  if (h.length > 1500 || !/^\/[A-Za-z0-9\-._~/?#=&%+:,;]*$/.test(h) || h.startsWith("//")) return null;
  return SITE + h;
}

function list<T>(v: unknown, max = 30): T[] {
  return Array.isArray(v) ? (v.slice(0, max) as T[]) : [];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

function heading(text: unknown): string {
  return `<h2 style="font-family:${FONT};font-size:19px;line-height:1.3;margin:0 0 12px;color:${C.ink};">${esc(text, 120)}</h2>`;
}

function section(inner: string): string {
  return `<tr><td style="padding:24px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.goldLine};"><tr><td style="padding-top:22px;">${inner}</td></tr></table></td></tr>`;
}

function bullets(items: unknown[]): string {
  if (items.length === 0) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${items
    .map(
      (t) => `<tr><td width="18" valign="top" style="padding:3px 0;color:${C.gold};font-size:13px;line-height:1.5;">&#9670;</td><td style="padding:3px 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${C.ink};">${esc(t)}</td></tr>`,
    )
    .join("")}</table>`;
}

function button(label: unknown, href: string, primary: boolean): string {
  const bg = primary ? C.gold : "#ffffff";
  const fg = primary ? C.ink : C.goldDark;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 8px 8px 0;"><tr><td style="border-radius:999px;background:${bg};border:1.5px solid ${C.gold};">
    <a href="${esc(href, 1600)}" style="display:inline-block;padding:11px 20px;font-family:${SANS};font-size:14px;font-weight:bold;color:${fg};text-decoration:none;border-radius:999px;">${esc(label, 60)}${primary ? " &rarr;" : ""}</a>
  </td></tr></table>`;
}

const VERDICT_STYLE: Record<string, { bg: string; fg: string; sub: string; kicker: string; border: string }> = {
  strong: { bg: C.tealSoft, fg: C.ink, sub: C.muted, kicker: C.teal, border: C.teal },
  sort: { bg: C.goldSoft, fg: C.ink, sub: C.muted, kicker: C.goldDark, border: C.gold },
  talk: { bg: C.ink, fg: "#ffffff", sub: "#E9E4D8", kicker: "#E3CB8F", border: C.ink },
};

const REASON_STYLE: Record<string, { mark: string; bg: string; fg: string; sr: string }> = {
  good: { mark: "&#10003;", bg: C.tealSoft, fg: C.teal, sr: "Fits well" },
  info: { mark: "i", bg: C.goldSoft, fg: C.goldDark, sr: "Worth knowing" },
  sort: { mark: "!", bg: C.amberSoft, fg: C.amber, sr: "To sort out" },
  talk: { mark: "!", bg: C.redSoft, fg: C.red, sr: "To talk through" },
};

const NEED_STYLE: Record<string, { bg: string; fg: string }> = {
  ready: { bg: C.tealSoft, fg: C.teal },
  arrange: { bg: C.amberSoft, fg: C.amber },
  missing: { bg: C.redSoft, fg: C.red },
  check: { bg: C.goldSoft, fg: C.goldDark },
};

/** Returns the email body (inside the branded shell), a preheader and a subject. */
export function renderSummaryEmail(summary: Obj, firstName: string): { html: string; preheader: string; subject: string } {
  const verdict = obj(summary.verdict);
  const vKey = String(verdict.key ?? "sort");
  const vs = VERDICT_STYLE[vKey] ?? VERDICT_STYLE.sort;
  const rows: string[] = [];

  // Greeting and verdict.
  rows.push(`<tr><td>
    <p style="font-family:${FONT};font-size:20px;margin:0 0 8px;color:${C.ink};">Assalamu alaikum ${esc(firstName, 60)},</p>
    <p style="font-family:${SANS};font-size:14px;line-height:1.6;margin:0 0 20px;color:${C.muted};">Thank you for taking the &ldquo;Is it right for us?&rdquo; check. Here is your summary to keep: our honest answer, your child&rsquo;s school day in your time, the costs and the dates.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${vs.bg};border-radius:14px;border-left:4px solid ${vs.border};"><tr><td style="padding:20px 22px;">
      <p style="font-family:${SANS};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:bold;margin:0 0 6px;color:${vs.kicker};">${esc(verdict.label, 80)}</p>
      <p style="font-family:${FONT};font-size:21px;line-height:1.3;margin:0 0 8px;color:${vs.fg};">${esc(verdict.heading, 200)}</p>
      <p style="font-family:${SANS};font-size:14px;line-height:1.6;margin:0;color:${vs.sub};">${esc(verdict.body, 600)}</p>
    </td></tr></table>
  </td></tr>`);

  // Facts.
  const facts = list<Obj>(summary.facts, 4);
  if (facts.length) {
    rows.push(`<tr><td style="padding-top:14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${facts
      .map(
        (f) => `<td valign="top" style="padding:10px 12px 10px 0;"><p style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${C.muted};margin:0 0 3px;">${esc(f.label, 40)}</p><p style="font-family:${SANS};font-size:14px;font-weight:bold;color:${C.ink};margin:0;">${esc(f.value, 160)}</p></td>`,
      )
      .join("")}</tr></table></td></tr>`);
  }

  // Why we say this.
  const reasons = list<Obj>(summary.reasons, 12);
  if (reasons.length) {
    rows.push(
      section(
        heading(summary.reasonsTitle || "Why we say this") +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${reasons
            .map((r) => {
              const st = REASON_STYLE[String(r.tone)] ?? REASON_STYLE.info;
              return `<tr><td width="34" valign="top" style="padding:6px 0;"><div title="${st.sr}" style="width:24px;height:24px;line-height:24px;border-radius:12px;text-align:center;background:${st.bg};color:${st.fg};font-family:${SANS};font-size:13px;font-weight:bold;">${st.mark}</div></td><td style="padding:6px 0;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.ink};">${esc(r.text)}</td></tr>`;
            })
            .join("")}</table>`,
      ),
    );
  }

  // The school day.
  const day = obj(summary.day);
  const dayRows = list<Obj>(day.rows, 4);
  if (dayRows.length) {
    const showUk = day.showUk === true;
    const th = (t: string, align = "left") => `<td align="${align}" style="padding:0 0 8px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${C.muted};border-bottom:1px solid ${C.goldLine};">${t}</td>`;
    rows.push(
      section(
        heading(day.title || "Your child's day") +
          `<p style="font-family:${SANS};font-size:13px;color:${C.muted};margin:-4px 0 12px;">${esc(day.lead, 160)}</p>` +
          (day.concern === true
            ? `<p style="font-family:${SANS};font-size:13px;line-height:1.5;background:${C.redSoft};color:${C.red};border-radius:10px;padding:10px 14px;margin:0 0 12px;"><strong>Worth talking through first:</strong> these hours fall outside the times most children learn well.</p>`
            : "") +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${th("&nbsp;")}${th(esc(day.yourLabel, 40))}${showUk ? th("UK time", "right") : ""}</tr>${dayRows
            .map(
              (r) => `<tr><td style="padding:10px 10px 10px 0;font-family:${SANS};font-size:14px;color:${C.muted};border-bottom:1px solid ${C.goldLine};">${esc(r.day, 40)}</td><td style="padding:10px 10px 10px 0;font-family:${FONT};font-size:17px;font-weight:bold;color:${C.ink};border-bottom:1px solid ${C.goldLine};">${esc(r.yours, 80)}</td>${
                showUk ? `<td align="right" style="padding:10px 0;font-family:${SANS};font-size:13px;color:${C.muted};border-bottom:1px solid ${C.goldLine};">${esc(r.uk, 40)}</td>` : ""
              }</tr>`,
            )
            .join("")}</table>` +
          bullets(list(day.notes, 14)),
      ),
    );
  }

  // What you'd need.
  const need = obj(summary.need);
  const needs = list<Obj>(need.items, 10);
  if (needs.length) {
    rows.push(
      section(
        heading(need.title || "What you would need") +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${needs
            .map((n) => {
              const st = NEED_STYLE[String(n.status)] ?? NEED_STYLE.check;
              return `<tr><td style="padding:9px 12px 9px 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${C.ink};border-bottom:1px solid ${C.goldLine};">${esc(n.text)}</td><td align="right" valign="top" style="padding:9px 0;border-bottom:1px solid ${C.goldLine};white-space:nowrap;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${st.bg};color:${st.fg};font-family:${SANS};font-size:12px;font-weight:bold;">${esc(n.statusLabel, 20)}</span></td></tr>`;
            })
            .join("")}</table>`,
      ),
    );
  }

  // Cost.
  const cost = obj(summary.cost);
  const costRows = list<Obj>(cost.rows, 10);
  if (costRows.length) {
    const link = obj(cost.link);
    const href = siteLink(link.href);
    rows.push(
      section(
        heading(cost.title || "What it would cost") +
          `<p style="font-family:${SANS};font-size:13px;color:${C.muted};margin:-4px 0 10px;">${esc(cost.period, 80)}</p>` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${costRows
            .map(
              (r) => `<tr><td style="padding:8px 10px 8px 0;font-family:${SANS};font-size:14px;color:${C.ink};border-bottom:1px solid ${C.goldLine};">${esc(r.label, 60)}${r.detail ? `<br><span style="font-size:12px;color:${C.muted};">${esc(r.detail, 80)}</span>` : ""}</td><td align="right" style="padding:8px 0;font-family:${SANS};font-size:14px;color:${String(r.amount).startsWith("-") ? C.teal : C.ink};border-bottom:1px solid ${C.goldLine};white-space:nowrap;">${esc(r.amount, 30)}</td></tr>`,
            )
            .join("")}<tr><td style="padding:10px 10px 0 0;font-family:${SANS};font-size:14px;font-weight:bold;color:${C.ink};">${esc(cost.totalLabel, 40)}</td><td align="right" style="padding:10px 0 0;font-family:${FONT};font-size:19px;font-weight:bold;color:${C.ink};white-space:nowrap;">${esc(cost.total, 30)}</td></tr></table>` +
          `<p style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${C.goldDark};font-weight:bold;margin:18px 0 8px;">${esc(cost.plansTitle, 40)}</p>` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list<Obj>(cost.plans, 4)
            .map(
              (pl) => `<tr><td style="padding:10px 14px;background:${C.goldSoft};border-radius:10px;font-family:${SANS};"><span style="font-size:12px;color:${C.muted};">${esc(pl.label, 40)}</span><br><span style="font-family:${FONT};font-size:16px;font-weight:bold;color:${C.ink};">${esc(pl.amount, 120)}</span>${pl.note ? `<br><span style="font-size:12px;color:${C.muted};">${esc(pl.note, 120)}</span>` : ""}</td></tr><tr><td style="height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>`,
            )
            .join("")}</table>` +
          bullets(list(cost.notes, 6)) +
          (href ? `<p style="font-family:${SANS};font-size:14px;margin:12px 0 0;"><a href="${esc(href, 1600)}" style="color:${C.goldDark};font-weight:bold;">${esc(link.label, 60)} &rarr;</a></p>` : ""),
      ),
    );
  }

  // What we offer.
  const offer = obj(summary.offer);
  const offers = list<Obj>(offer.items, 8);
  if (offers.length) {
    rows.push(
      section(
        heading(offer.title || "What we offer") +
          (offer.intro ? `<p style="font-family:${SANS};font-size:13px;color:${C.muted};margin:-4px 0 12px;">${esc(offer.intro, 200)}</p>` : "") +
          offers
            .map(
              (o) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr><td style="background:${C.goldSoft};border-radius:10px;padding:12px 16px;font-family:${SANS};"><strong style="font-size:14px;color:${C.ink};">${esc(o.label, 60)}</strong><br><span style="font-size:14px;line-height:1.55;color:${C.ink};">${esc(o.body)}</span></td></tr></table>`,
            )
            .join("") +
          (list(offer.honest).length
            ? `<p style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${C.goldDark};font-weight:bold;margin:16px 0 0;">${esc(offer.honestTitle, 40)}</p>` + bullets(list(offer.honest, 8))
            : ""),
      ),
    );
  }

  // Next steps and dates.
  const next = obj(summary.next);
  const buttons = list<Obj>(next.buttons, 4)
    .map((b) => ({ label: b.label, href: siteLink(b.href) }))
    .filter((b): b is { label: unknown; href: string } => !!b.href);
  const dates = list<Obj>(next.dates, 10);
  rows.push(
    section(
      heading(next.title || "Next steps") +
        (next.text ? `<p style="font-family:${SANS};font-size:14px;line-height:1.6;margin:0 0 16px;color:${C.ink};">${esc(next.text, 600)}</p>` : "") +
        buttons.map((b, i) => button(b.label, b.href, i === 0)).join("") +
        (dates.length
          ? `<p style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${C.goldDark};font-weight:bold;margin:18px 0 6px;">${esc(next.datesTitle || "Dates", 60)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dates
              .map(
                (d) => `<tr><td style="padding:8px 12px 8px 0;font-family:${SANS};font-size:14px;color:${C.ink};border-bottom:1px solid ${C.goldLine};">${esc(d.label, 80)}</td><td align="right" style="padding:8px 0;font-family:${SANS};font-size:14px;font-weight:bold;color:${C.ink};border-bottom:1px solid ${C.goldLine};">${esc(d.when, 80)}</td></tr>`,
              )
              .join("")}</table>`
          : ""),
    ),
  );

  // Close.
  rows.push(`<tr><td style="padding-top:26px;">
    <p style="font-family:${SANS};font-size:14px;line-height:1.6;margin:0 0 12px;color:${C.ink};">Any questions? Just reply to this email and our admissions team will get back to you, in sha Allah.</p>
    <p style="font-family:${SANS};font-size:14px;line-height:1.6;margin:0 0 18px;color:${C.ink};">Jazakumullahu khayran,<br><strong>Admissions, Tarbiyyah Global Academy</strong></p>
    <p style="font-family:${SANS};font-size:12px;line-height:1.5;margin:0;color:${C.muted};">${esc(summary.disclaimer, 400)}</p>
  </td></tr>`);

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
  const label = String(verdict.label ?? "").slice(0, 80);
  return {
    html,
    preheader: `${label}. Your child's school day in your time, the costs and the dates for January 2027.`,
    subject: label ? `Your summary: ${label} | Tarbiyyah Global Academy` : "Your \"Is it right for us?\" summary | Tarbiyyah Global Academy",
  };
}
