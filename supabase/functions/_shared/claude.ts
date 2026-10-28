// Shared, fetch-based client for the Claude Messages API, for any Edge
// Function that uses AI (ai-assist, and available to inbound-absence and
// others). No SDK, so it runs in Deno and Node without a download.
//
//   ANTHROPIC_API_KEY  required; without it isClaudeConfigured() is false
//                      and callClaude() returns { ok: false, error: "not_configured" }.
//   AI_MODEL           optional model override (default claude-haiku-5-5).
//
// Behaviour: one request with a timeout; a 429 or 5xx (or a network error /
// timeout) is retried a small number of times with a short backoff, honouring
// a short Retry-After. Never throws.

export const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_API_VERSION = "2023-06-01";
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

function env(name: string): string | undefined {
  try {
    // deno-lint-ignore no-explicit-any
    const d = (globalThis as any).Deno;
    if (d?.env?.get) return d.env.get(name) || undefined;
    // deno-lint-ignore no-explicit-any
    const p = (globalThis as any).process;
    return p?.env?.[name] || undefined;
  } catch {
    return undefined;
  }
}

/** True when an API key is present. Use it to answer "is AI set up?" without spending a call. */
export function isClaudeConfigured(): boolean {
  return !!env("ANTHROPIC_API_KEY");
}

/** The model to use: AI_MODEL if set, else the default. */
export function claudeModel(): string {
  return env("AI_MODEL") || DEFAULT_CLAUDE_MODEL;
}

export type ClaudeMessage = { role: "user" | "assistant"; content: string };

export type ClaudeRequest = {
  system?: string;
  /** Either a single user prompt or a full message list. */
  user?: string;
  messages?: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
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
  | { ok: false; error: "not_configured" | "rate_limited" | "upstream_error" | "timeout" | "bad_request"; status?: number; detail?: string; usage?: ClaudeUsage };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Calls the Messages API. Never throws. */
export async function callClaude(req: ClaudeRequest): Promise<ClaudeResult> {
  const apiKey = req.apiKey || env("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "not_configured" };
  const model = req.model || claudeModel();
  const messages: ClaudeMessage[] = req.messages && req.messages.length ? req.messages : [{ role: "user", content: req.user || "" }];
  const body = JSON.stringify({
    model,
    max_tokens: req.maxTokens ?? 800,
    temperature: req.temperature ?? 0.4,
    ...(req.system ? { system: req.system } : {}),
    messages,
  });
  const retries = Math.max(0, Math.min(req.retries ?? 2, 4));
  let last: ClaudeResult = { ok: false, error: "upstream_error" };

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
        return {
          ok: true,
          text,
          usage: { input_tokens: data?.usage?.input_tokens ?? 0, output_tokens: data?.usage?.output_tokens ?? 0 },
          model: data?.model || model,
          stopReason: data?.stop_reason ?? null,
        };
      }
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 429 || res.status >= 500) {
        last = { ok: false, error: res.status === 429 ? "rate_limited" : "upstream_error", status: res.status, detail };
        const ra = Number(res.headers.get("retry-after"));
        if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 8_000);
      } else {
        // 400/401/403/404: retrying won't help.
        return { ok: false, error: "bad_request", status: res.status, detail };
      }
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      last = { ok: false, error: aborted ? "timeout" : "upstream_error", detail: String(e).slice(0, 200) };
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
  | { ok: false; error: string; status?: number; detail?: string; usage?: ClaudeUsage };

/**
 * Asks for JSON and parses it. `validate` turns the raw object into your
 * shape or returns null to reject it. Usage is reported even on a parse
 * failure, so callers can still log the tokens spent.
 */
export async function callClaudeJson<T>(req: ClaudeRequest, validate: (raw: Record<string, unknown>) => T | null): Promise<ClaudeJsonResult<T>> {
  const res = await callClaude({ temperature: 0.3, ...req });
  if (!res.ok) return res;
  const raw = extractJson(res.text);
  const data = raw ? validate(raw) : null;
  if (!data) return { ok: false, error: "bad_output", detail: res.text.slice(0, 200), usage: res.usage };
  return { ok: true, data, usage: res.usage, model: res.model };
}
