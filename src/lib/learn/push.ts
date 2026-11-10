"use client";

// Phone and browser notifications for the portal (Web Push, migration 0199,
// supabase/functions/push-notify). The public VAPID key is baked into the
// build (NEXT_PUBLIC_VAPID_PUBLIC_KEY); without it notifications are simply
// not offered.

import { getEdgeFunctionUrl, getSupabaseClient } from "@/lib/supabase/client";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export type PushState = "unsupported" | "not-configured" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  } catch {
    return null;
  }
}

/** Whether this device can, may and does receive notifications. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Asks for permission, subscribes this device and stores it. Returns the new state. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const supabase = getSupabaseClient();
  if (!supabase || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "off";
  // The same device may already be stored (e.g. after signing in again): replace it.
  await supabase.from("push_subscriptions").delete().eq("endpoint", json.endpoint);
  const { error } = await supabase
    .from("push_subscriptions")
    .insert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 300) });
  return error ? "off" : "on";
}

/** Turns notifications off on this device. */
export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const supabase = getSupabaseClient();
    await supabase?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => undefined);
  }
  return pushState();
}

/** Asks push-notify to tell the others in a conversation about a message this user just sent. Never throws. */
export async function notifyMessage(messageId: string): Promise<void> {
  await callPush({ kind: "message", id: messageId });
}

/** Sends a test notification to this user's own devices. */
export async function sendTestPush(): Promise<boolean> {
  const res = await callPush({ kind: "test" });
  return !!res?.ok && (res.sent ?? 0) > 0;
}

async function callPush(body: Record<string, unknown>): Promise<{ ok?: boolean; sent?: number } | null> {
  try {
    if (!VAPID_PUBLIC_KEY) return null;
    const supabase = getSupabaseClient();
    const url = getEdgeFunctionUrl("push-notify");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabase || !url || !anonKey) return null;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ok?: boolean; sent?: number };
  } catch {
    return null;
  }
}
