// Shared Microsoft Graph client (app-only / client-credentials auth).
//
// One Entra ID app registration serves every Microsoft 365 feature:
//   - sending email from the school mailbox      (Mail.Send)            -> ./resend.ts
//   - Teams meetings for lessons                  (Calendars.ReadWrite)  -> ./teamsMeetings.ts
//   - Teams attendance reports                    (OnlineMeetings.Read.All +
//                                                  OnlineMeetingArtifact.Read.All +
//                                                  a Teams application access policy)
//   - resolving teachers' accounts (optional)     (User.Read.All)
// Secrets: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (see docs/microsoft-365-setup.md).
//
// graphFetch() adds the token, retries 429/5xx honouring Retry-After, refreshes
// the token once on 401, and turns a 403 into an error that names the Graph
// permission the caller said it needed, so the admin knows what to grant.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export function graphConfigured(): boolean {
  return Boolean(Deno.env.get("MS_TENANT_ID") && Deno.env.get("MS_CLIENT_ID") && Deno.env.get("MS_CLIENT_SECRET"));
}

let cachedToken: { value: string; exp: number } | null = null;

/** App-only access token for https://graph.microsoft.com/.default, cached until a minute before expiry. */
export async function getGraphToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  if (!graphConfigured()) throw new GraphError("Microsoft 365 is not configured (MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET must all be set).", 0, "not_configured");
  const tenant = Deno.env.get("MS_TENANT_ID")!;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    const desc = String(json.error_description || json.error || "").slice(0, 300);
    // Friendly hints for the commonest set-up mistakes.
    let hint = "";
    if (/AADSTS7000222/.test(desc)) hint = " The client secret has EXPIRED: create a new one in Entra admin centre and update MS_CLIENT_SECRET.";
    else if (/AADSTS7000215/.test(desc)) hint = " The client secret is wrong: copy the secret VALUE (not the secret ID) into MS_CLIENT_SECRET.";
    else if (/AADSTS700016/.test(desc)) hint = " MS_CLIENT_ID does not match an app in this tenant.";
    else if (/AADSTS90002|AADSTS900023/.test(desc)) hint = " MS_TENANT_ID is wrong.";
    throw new GraphError(`Could not sign in to Microsoft 365 (token HTTP ${res.status}): ${desc}.${hint}`, res.status, "token_failed");
  }
  cachedToken = { value: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3000) * 1000 };
  return cachedToken.value;
}

/** The application permissions ("roles" claim) granted in Entra ID, read from the current token. */
export async function graphTokenRoles(): Promise<string[]> {
  const token = await getGraphToken();
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)));
    return Array.isArray(json.roles) ? json.roles.map(String) : [];
  } catch {
    return [];
  }
}

export class GraphError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.code = code;
  }
  /** True when the 403 is the Teams "application access policy" refusal rather than a missing permission. */
  get isAccessPolicy(): boolean {
    return this.status === 403 && /application access policy/i.test(this.message);
  }
}

export type GraphRequest = {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  headers?: Record<string, string>;
  /** The application permission this call needs, named in the error if Graph answers 403. */
  permission?: string;
  /** Total attempts for 429/5xx (default 4). */
  attempts?: number;
  /** Retry 5xx and network errors as well as 429 (default true). Turn off for non-idempotent calls such as sendMail. */
  retryServerErrors?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_WAIT_MS = 20_000;

/** Raw Graph call with auth, retries and permission-aware errors. Returns the Response for status 2xx or 404; throws GraphError otherwise. */
export async function graphRaw(pathOrUrl: string, opts: GraphRequest = {}): Promise<Response> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  const method = opts.method || "GET";
  const attempts = Math.max(1, opts.attempts ?? 4);
  const retry5xx = opts.retryServerErrors !== false;
  let refreshed = false;
  for (let attempt = 1; ; attempt++) {
    const token = await getGraphToken();
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(opts.headers || {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      if (retry5xx && attempt < attempts) {
        await sleep(Math.min(MAX_WAIT_MS, 500 * 2 ** attempt));
        continue;
      }
      throw new GraphError(`Microsoft Graph ${method} ${shortPath(url)}: network error ${String(e).slice(0, 200)}`, 0, "network_error");
    }
    if (res.ok || res.status === 404) return res;
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await res.body?.cancel();
      await getGraphToken(true);
      continue;
    }
    if ((res.status === 429 || (retry5xx && res.status >= 500)) && attempt < attempts) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await res.body?.cancel();
      await sleep(Math.min(MAX_WAIT_MS, wait));
      continue;
    }
    const text = await res.text().catch(() => "");
    let code = `http_${res.status}`;
    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      if (j?.error?.code) code = String(j.error.code);
      if (j?.error?.message) message = String(j.error.message).slice(0, 300);
    } catch {
      /* not JSON */
    }
    let explained = `Microsoft Graph ${method} ${shortPath(url)} failed (HTTP ${res.status} ${code}): ${message}`;
    if (res.status === 403) {
      if (/application access policy/i.test(message)) {
        explained += " — the Teams application access policy has not been granted to this organiser yet (New-CsApplicationAccessPolicy / Grant-CsApplicationAccessPolicy; allow up to 30 minutes after granting).";
      } else if (opts.permission) {
        explained += ` — the app registration needs the "${opts.permission}" APPLICATION permission with admin consent (or, if mailbox access is scoped with Exchange RBAC for Applications, this mailbox is outside that scope).`;
      }
    }
    throw new GraphError(explained, res.status, code);
  }
}

/** JSON Graph call. Returns null for 404 and for empty (202/204) responses. */
export async function graphFetch<T = Record<string, unknown>>(pathOrUrl: string, opts: GraphRequest = {}): Promise<T | null> {
  const res = await graphRaw(pathOrUrl, opts);
  if (res.status === 404 || res.status === 202 || res.status === 204) {
    await res.body?.cancel();
    return null;
  }
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

/** Follows @odata.nextLink and returns every item of a collection (capped by maxPages). */
export async function graphFetchAll<T>(pathOrUrl: string, opts: GraphRequest = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = pathOrUrl;
  for (let page = 0; next && page < maxPages; page++) {
    const json: { value?: T[]; "@odata.nextLink"?: string } | null = await graphFetch(next, opts);
    if (!json) break;
    out.push(...(json.value || []));
    next = json["@odata.nextLink"] || null;
  }
  return out;
}

function shortPath(url: string): string {
  // Never echo query strings (join URLs, filters) into logs/UI in full.
  return url.replace(GRAPH_BASE, "").split("?")[0].slice(0, 120);
}
