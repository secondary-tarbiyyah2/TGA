// Shared, fetch-based client for the Claude Messages API, for any Edge
// Function that uses AI (ai-assist, and available to inbound-absence and
// others). No SDK, so it runs in Deno and Node without a download.
//
//   ANTHROPIC_API_KEY  required; without it isClaudeConfigured() is false
//                      and callClaude() returns { ok: false, error: "not_configured" }.
//   AI_MODEL           optional model override (default claude-haiku-5-5).
//
// Exports: isClaudeConfigured() (alias claudeConfigured()), claudeModel(),
// callClaude(), callClaudeJson(), extractJson().
//
// Behaviour: one request with a timeout; a 429 or 5xx (or a network error /
// timeout) is retried a small number of times with a short backoff, honouring
// a short Retry-After. Never throws.
//
// Claude 5.x models (the default claude-haiku-5-5, and claude-sonnet-5-5):
//   - reject sampling parameters, so `temperature` is NEVER sent (the field is
//     still accepted on ClaudeRequest for older callers and ignored). Sending
//     it was why every AI draft failed in November 2026 (Tafweed T32);
//   - think by default, and thinking tokens count towards max_tokens, so a
//     short draft could stop before writing any text. We turn thinking off
//     for these drafting calls and keep a sensible max_tokens floor.
// claudeErrorMessage() turns any failure into one plain-English sentence
// for staff; the technical detail goes to the function log.

export const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_API_VERSION = "2023-06-01";
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

function env(name: string): string | undefined {
  try {
    const g = globalThis as unknown as { Deno?: { env?: { get(k: string): string | undefined } }; process?: { env?: Record<string, string | undefined> } };
    if (g.Deno?.env?.get) return g.Deno.env.get(name) || undefined;
    return g.process?.env?.[name] || undefined;
  } catch {
    return undefined;
  }
}

/** True when an API key is present. Use it to answer "is AI set up?" without spending a call. */
export function isClaudeConfigured(): boolean {
  return !!env("ANTHROPIC_API_KEY");
}

/** Alias kept for callers written against the first version of this file (inbound-absence). */
export const claudeConfigured = isClaudeConfigured;

/** The model to use: AI_MODEL if set, else the default. */
export function claudeModel(): string {
  return env("AI_MODEL") || DEFAULT_CLAUDE_MODEL;
}

/** Plain text, or content blocks (e.g. a PDF: { type: "document", source: { type: "base64", media_type: "application/pdf", data } }). */
export type ClaudeContent = string | Record<string, unknown>[];
export type ClaudeMessage = { role: "user" | "assistant"; content: ClaudeContent };

export type ClaudeRequest = {
  system?: string;
  /** Either a single user prompt or a full message list. */
  user?: string;
  messages?: ClaudeMessage[];
  maxTokens?: number;
  /** Ignored: Claude 5.x models reject sampling parameters. Kept so older callers still type-check. */
  temperature?: number;
  /** Overrides AI_MODEL; null/empty means "use the default". */
  model?: string | null;
  /** Per attempt. Default 25s. */
  timeoutMs?: number;
  /** Extra attempts after the first on 429/5xx/network errors. Default 2. */
  retries?: number;
  /** Overrides the env key (tests, or callers that already read it). */
  apiKey?: string;
};

export type ClaudeUsage = { input_tokens: number; output_tokens: number };

export type ClaudeResult =
  | { ok: true; text: string; usage: ClaudeUsage; model: string; stopReason: string | null }
  | { ok: false; error: ClaudeErrorKind; model: string; status?: number; detail?: string; usage?: ClaudeUsage };

export type ClaudeErrorKind = "not_configured" | "rate_limited" | "upstream_error" | "timeout" | "bad_request" | "auth" | "model_not_found" | "refused" | "truncated" | "no_credit";

/** Claude 5.x drafting models: no sampling parameters, adaptive thinking on by default. */
export function isClaude5(model: string): boolean {
  return /^(anthropic\.)?claude-(haiku|sonnet|opus)-5(-|$)/.test(model);
}

/** Builds the Messages API body. Exported for tests. */
export function buildClaudeBody(model: string, req: Pick<ClaudeRequest, "system" | "maxTokens">, messages: ClaudeMessage[]): Record<string, unknown> {
  const five = isClaude5(model);
  const maxTokens = req.maxTokens ?? 800;
  return {
    model,
    max_tokens: five ? Math.max(maxTokens, 1024) : maxTokens,
    // Haiku and Sonnet 5.x accept thinking off; the drafts here are short and don't need it.
    ...(five && !/-opus-/.test(model) ? { thinking: { type: "disabled" } } : {}),
    ...(req.system ? { system: req.system } : {}),
    messages,
  };
}

/** The API's own error text, e.g. {"error":{"message":"..."}}, else the raw start of the body. */
function apiErrorText(raw: string): string {
  try {
    const j = JSON.parse(raw) as { error?: { message?: string; type?: string } };
    if (j?.error?.message) return `${j.error.type ? j.error.type + ": " : ""}${j.error.message}`.slice(0, 300);
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 300);
}

/** One plain-English sentence for staff. Never includes the key or raw API text. */
export function claudeErrorMessage(r: { error: string; status?: number }): string {
  switch (r.error) {
    case "not_configured":
      return "AI is not switched on yet: the school's Claude API key has not been added. Ask whoever looks after the website to add it (technical note: the ANTHROPIC_API_KEY secret).";
    case "auth":
      return "The school's Claude API key was not accepted. It may have been revoked or mistyped. Ask whoever looks after the website to replace it (technical note: the ANTHROPIC_API_KEY secret).";
    case "no_credit":
      return "The school's Claude account has run out of credit or hit its spending limit. Ask whoever manages the Anthropic account to top it up.";
    case "model_not_found":
      return "The AI model the portal asks for is not available on the school's Claude account. Ask whoever looks after the website to check the AI_MODEL setting.";
    case "rate_limited":
      return "The AI is busy right now. Wait a minute and try again.";
    case "timeout":
      return "The AI took too long to answer. Try again in a moment.";
    case "refused":
      return "The AI declined to draft this one. Please write it yourself.";
    case "truncated":
    case "bad_output":
      return "The AI's answer came back incomplete. Try again.";
    case "bad_request":
      return "The AI service rejected the request. Try again; if it keeps happening, tell whoever looks after the website (details are in the ai-assist function log).";
    default:
      return "The AI service isn't answering just now. Try again in a few minutes.";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Calls the Messages API. Never throws. */
export async function callClaude(req: ClaudeRequest): Promise<ClaudeResult> {
  const model = req.model || claudeModel();
  const apiKey = req.apiKey || env("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "not_configured", model };
  const messages: ClaudeMessage[] = req.messages && req.messages.length ? req.messages : [{ role: "user", content: req.user || "" }];
  const body = JSON.stringify(buildClaudeBody(model, req, messages));
  const retries = Math.max(0, Math.min(req.retries ?? 2, 4));
  let last: ClaudeResult = { ok: false, error: "upstream_error", model };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 25_000);
    let retryAfterMs = 0;
    try {
      const res = await fetch(CLAUDE_API_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "x-api-key": apiKey, "anthropic-version": CLAUDE_API_VERSION, "content-type": "application/json" },
        body,
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          content?: { type: string; text?: string }[];
          usage?: { input_tokens?: number; output_tokens?: number };
          model?: string;
          stop_reason?: string | null;
        } | null;
        const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
        const usage = { input_tokens: data?.usage?.input_tokens ?? 0, output_tokens: data?.usage?.output_tokens ?? 0 };
        if (data?.stop_reason === "refusal") return { ok: false, error: "refused", model, status: 200, usage };
        if (!text.trim()) {
          console.error("claude: empty reply", model, data?.stop_reason);
          return { ok: false, error: data?.stop_reason === "max_tokens" ? "truncated" : "upstream_error", model, status: 200, detail: `stop_reason=${data?.stop_reason}`, usage };
        }
        return {
          ok: true,
          text,
          usage: { input_tokens: data?.usage?.input_tokens ?? 0, output_tokens: data?.usage?.output_tokens ?? 0 },
          model: data?.model || model,
          stopReason: data?.stop_reason ?? null,
        };
      }
      const detail = apiErrorText(await res.text().catch(() => ""));
      console.error(`claude: HTTP ${res.status} from ${model}: ${detail}`);
      if (res.status === 429 || res.status >= 500) {
        last = { ok: false, error: res.status === 429 ? "rate_limited" : "upstream_error", model, status: res.status, detail };
        const ra = Number(res.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 8_000);
      } else {
        // 400/401/403/404: retrying won't help.
        const kind: ClaudeErrorKind =
          res.status === 401 || res.status === 403 ? "auth"
          : res.status === 404 ? "model_not_found"
          : /credit balance|billing|spend limit|spending limit/i.test(detail) ? "no_credit"
          : "bad_request";
        return { ok: false, error: kind, model, status: res.status, detail };
      }
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      last = { ok: false, error: aborted ? "timeout" : "upstream_error", model, detail: String(e).slice(0, 200) };
      console.error(`claude: ${aborted ? "timeout" : "network error"} calling ${model}`);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(retryAfterMs || 600 * 2 ** attempt + Math.floor(Math.random() * 250));
  }
  return last;
}

/**
 * Pulls the first JSON object out of a model reply (tolerates ```json fences
 * and stray prose). Returns null when there is none or it doesn't parse.
 */
export function extractJson<T = Record<string, unknown>>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(src.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

export type ClaudeJsonResult<T> =
  | { ok: true; data: T; usage: ClaudeUsage; model: string }
  | { ok: false; error: string; model: string; status?: number; detail?: string; usage?: ClaudeUsage };

/**
 * Asks for JSON and parses it. `validate` turns the raw object into your
 * shape or returns null to reject it. Usage is reported even on a parse
 * failure, so callers can still log the tokens spent.
 */
export async function callClaudeJson<T>(req: ClaudeRequest, validate: (raw: Record<string, unknown>) => T | null): Promise<ClaudeJsonResult<T>> {
  const res = await callClaude(req);
  if (!res.ok) return res;
  const raw = extractJson(res.text);
  const data = raw ? validate(raw) : null;
  if (!data) return { ok: false, error: "bad_output", model: res.model, detail: res.text.slice(0, 200), usage: res.usage };
  return { ok: true, data, usage: res.usage, model: res.model };
}
