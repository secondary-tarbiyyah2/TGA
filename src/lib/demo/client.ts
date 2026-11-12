"use client";

// Portal demo only: stands in for "@/lib/supabase/client" (the demo build
// aliases it here). The real supabase-js client, talking to an in-browser
// mock instead of the network: REST, auth, functions and storage all answer
// from ./server. Signed file links are made in the browser (blob/data URLs).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_URL, DEMO_HOST, demoSession, handleDemoRequest } from "@/lib/demo/server";
import { demoFile } from "@/lib/demo/files";

let cached: SupabaseClient | null = null;
let patched = false;

/** Points window.fetch and XMLHttpRequest at the mock for the demo host, and quietens browser features the demo can't use. */
export function installDemoNetwork() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const u = input instanceof Request ? input.url : String(input);
    if (u.startsWith(DEMO_URL)) return handleDemoRequest(input, init);
    return realFetch(input, init);
  };
  // Uploads with progress (homework files) use XMLHttpRequest.
  const XHR = window.XMLHttpRequest;
  const open = XHR.prototype.open;
  const send = XHR.prototype.send;
  XHR.prototype.open = function (this: XMLHttpRequest & { __demo?: boolean }, method: string, url: string | URL, ...rest: unknown[]) {
    this.__demo = String(url).includes(DEMO_HOST);
    return (open as (...a: unknown[]) => void).call(this, method, this.__demo ? "data:application/json,{}" : url, ...rest);
  } as typeof XHR.prototype.open;
  XHR.prototype.send = function (this: XMLHttpRequest & { __demo?: boolean }, body?: Document | XMLHttpRequestBodyInit | null) {
    if (!this.__demo) return send.call(this, body);
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the request object, used in the timer below
    const xhr = this;
    const total = body instanceof Blob ? body.size : 1000;
    setTimeout(() => {
      xhr.upload?.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: total, total }));
      Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
      Object.defineProperty(xhr, "status", { value: 200, configurable: true });
      Object.defineProperty(xhr, "responseText", { value: JSON.stringify({ Key: "demo/upload", Id: crypto.randomUUID() }), configurable: true });
      Object.defineProperty(xhr, "response", { value: JSON.stringify({ Key: "demo/upload" }), configurable: true });
      xhr.dispatchEvent(new Event("readystatechange"));
      xhr.dispatchEvent(new ProgressEvent("load"));
      xhr.dispatchEvent(new ProgressEvent("loadend"));
      xhr.onreadystatechange?.(new Event("readystatechange"));
      xhr.onload?.(new ProgressEvent("load"));
    }, 120);
  } as typeof XHR.prototype.send;
  // No service worker, push or install prompt in the demo.
  try {
    if ("serviceWorker" in navigator) {
      Object.defineProperty(navigator.serviceWorker, "register", { value: () => Promise.reject(new Error("demo")), configurable: true });
      Object.defineProperty(navigator.serviceWorker, "getRegistration", { value: () => Promise.resolve(undefined), configurable: true });
      Object.defineProperty(navigator.serviceWorker, "getRegistrations", { value: () => Promise.resolve([]), configurable: true });
    }
  } catch {
    // ignore
  }
}

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;

function demoBucket(bucket: string): Bucket {
  const ok = <T,>(data: T) => Promise.resolve({ data, error: null });
  const api = {
    upload: (path: string) => ok({ id: crypto.randomUUID(), path, fullPath: `${bucket}/${path}` }),
    update: (path: string) => ok({ id: crypto.randomUUID(), path, fullPath: `${bucket}/${path}` }),
    uploadToSignedUrl: (path: string) => ok({ path, fullPath: `${bucket}/${path}` }),
    createSignedUploadUrl: (path: string) => ok({ signedUrl: `${DEMO_URL}/storage/v1/object/upload/sign/${bucket}/${path}?token=demo`, token: "demo", path }),
    createSignedUrl: (path: string) => ok({ signedUrl: demoFile(path, bucket) }),
    createSignedUrls: (paths: string[]) => ok(paths.map((path) => ({ path, signedUrl: demoFile(path, bucket), error: null }))),
    getPublicUrl: (path: string) => ({ data: { publicUrl: demoFile(path, bucket) } }),
    download: (path: string) => fetch(demoFile(path, bucket)).then((r) => r.blob()).then((b) => ({ data: b, error: null })),
    list: () => ok([]),
    remove: (paths: string[]) => ok(paths.map((name) => ({ name }))),
    move: () => ok({ message: "moved" }),
    copy: (_from: string, to: string) => ok({ path: to }),
    info: (path: string) => ok({ name: path, size: 1024 }),
    exists: () => ok(true),
  };
  return api as unknown as Bucket;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  installDemoNetwork();
  if (!cached) {
    cached = createClient(DEMO_URL, "demo-anon-key", {
      global: { fetch: (input, init) => handleDemoRequest(input, init) },
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        // The "signed in" session always follows the role chosen in the demo bar.
        storage: {
          getItem: (k: string) => (k.endsWith("-auth-token") ? JSON.stringify(demoSession()) : null),
          setItem: () => {},
          removeItem: () => {},
        },
      },
    });
    const storage = cached.storage as unknown as { from: (b: string) => Bucket };
    storage.from = (b: string) => demoBucket(b);
    // No realtime connections in the demo.
    const c = cached as unknown as { channel: (n: string) => unknown; removeChannel: () => Promise<string>; removeAllChannels: () => Promise<string[]> };
    const channel = { on: () => channel, subscribe: (cb?: (s: string) => void) => (cb?.("SUBSCRIBED"), channel), unsubscribe: () => Promise.resolve("ok"), send: () => Promise.resolve("ok"), track: () => Promise.resolve("ok") };
    c.channel = () => channel;
    c.removeChannel = () => Promise.resolve("ok");
    c.removeAllChannels = () => Promise.resolve([]);
  }
  return cached;
}

export function getEdgeFunctionUrl(functionName: string): string | null {
  return `${DEMO_URL}/functions/v1/${functionName}`;
}

export const ADMISSIONS_TEAMS_URL = "";
