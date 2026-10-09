// A short, privacy-minded log of what someone has just been doing in the
// portal, attached to feedback tickets so whoever triages one can see the
// context ("opened Homework, pressed Save, request to homework failed 403")
// without asking.
//
// What is recorded (last 40 events, this browser tab only, sessionStorage):
//   - page:    the path, with query values that look like secrets removed
//              and the #fragment never read (sign-in links put tokens there)
//   - click:   the visible label of the button or link pressed (max 60 chars)
//   - error:   uncaught script errors and promise rejections (message only)
//   - request: failed calls to our backend: method, which table/function,
//              HTTP status. Never the query values or the body.
// Never recorded: anything typed into a field, page contents, or tokens.
// The person sees the full list before sending, and it's cleared 90 days
// after the ticket is closed (0092 + scripts/compliance-retention.mjs).

export type ActivityEvent = { t: string; type: "page" | "click" | "error" | "request"; detail: string };

const KEY = "tga-activity";
const MAX = 40;
const SECRET_PARAM = /token|code|key|secret|pass|otp|auth|signature|sig/i;

function read(): ActivityEvent[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ActivityEvent[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: ActivityEvent[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage full or blocked: logging is best-effort */
  }
}

export function recordActivity(type: ActivityEvent["type"], detail: string) {
  if (typeof window === "undefined") return;
  const clean = detail.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!clean) return;
  const list = read();
  const last = list[list.length - 1];
  // Collapse exact repeats (e.g. the same error firing in a loop).
  if (last && last.type === type && last.detail === clean) return;
  list.push({ t: new Date().toISOString(), type, detail: clean });
  write(list);
}

export function getRecentActivity(): ActivityEvent[] {
  if (typeof window === "undefined") return [];
  return read();
}

/** Path plus a safe query string: secret-looking keys and email addresses removed. */
export function safePath(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const kept: string[] = [];
  params.forEach((value, key) => {
    if (SECRET_PARAM.test(key)) kept.push(`${key}=[removed]`);
    else if (value.includes("@") || value.length > 64) kept.push(`${key}=[removed]`);
    else kept.push(`${key}=${value}`);
  });
  return kept.length ? `${pathname}?${kept.join("&")}` : pathname;
}

/** "/rest/v1/homework?select=…" -> "homework"; functions and storage likewise. Never query values. */
function describeBackendUrl(url: URL): string | null {
  const m = url.pathname.match(/\/(rest|functions|storage|auth)\/v1\/(?:rpc\/)?(?:object\/(?:sign\/|public\/)?)?([^/?]+)/);
  if (!m) return null;
  const kind = m[1] === "rest" ? (url.pathname.includes("/rpc/") ? "rpc" : "table") : m[1] === "functions" ? "function" : m[1];
  return `${kind} ${decodeURIComponent(m[2])}`;
}

let installed = false;

/** Start listening. Safe to call more than once; only installs once per page load. */
export function installActivityRecorder(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    recordActivity("error", e.message || "Script error");
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string } | string | undefined;
    recordActivity("error", typeof r === "string" ? r : r?.message || "Unhandled promise rejection");
  });

  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest?.("button, a, [role='button'], [role='tab'], summary");
      if (!el || el.closest("[data-activity-ignore]")) return;
      // Links: record where they go, not their text (list rows can contain
      // names or message previews). Buttons: their label, which is UI text.
      if (el instanceof HTMLAnchorElement && el.href) {
        try {
          const u = new URL(el.href);
          recordActivity("click", u.origin === window.location.origin ? `Opened ${safePath(u.pathname, u.search)}` : `Opened external link (${u.hostname})`);
        } catch {
          /* ignore */
        }
        return;
      }
      const text = (el as HTMLElement).innerText?.trim() || "";
      const label = (el.getAttribute("aria-label") || (text.length <= 40 ? text : "") || el.getAttribute("title") || "").trim().slice(0, 60);
      if (label) recordActivity("click", `Pressed "${label}"`);
    },
    { capture: true },
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init).catch((err: unknown) => {
      try {
        const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
        if (supabaseUrl && u.href.startsWith(supabaseUrl)) recordActivity("request", `${(init?.method || "GET").toUpperCase()} ${describeBackendUrl(u) || u.pathname} failed: network error`);
      } catch {
        /* ignore */
      }
      throw err;
    });
    if (!res.ok && supabaseUrl) {
      try {
        const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
        if (u.href.startsWith(supabaseUrl)) {
          const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
          recordActivity("request", `${method} ${describeBackendUrl(u) || u.pathname} returned ${res.status}`);
        }
      } catch {
        /* ignore */
      }
    }
    return res;
  };
}
