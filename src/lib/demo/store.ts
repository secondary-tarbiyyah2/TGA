"use client";

// Portal demo only: the made-up school in memory, who is "signed in", and the
// changes made this session. Changes are kept as a short log in sessionStorage
// and replayed on top of the seed after a reload (switching role reloads the
// page), so work done in one role shows up in another. "Reset demo data"
// clears the log.

import { buildSeed, ROLE_ORDER, type DemoRole, type Seeded } from "@/lib/demo/seed";
import type { Row, Tables } from "@/lib/demo/postgrest";

const ROLE_KEY = "tga-demo-role";
const LOG_KEY = "tga-demo-log";

type LogEntry = { op: "insert"; table: string; rows: Row[] } | { op: "update"; table: string; keys: string[]; patch: Row } | { op: "delete"; table: string; keys: string[] };

let seeded: Seeded | null = null;
let log: LogEntry[] = [];
const keyOf = new WeakMap<Row, string>();
let insertN = 0;

function storage(kind: "local" | "session"): Storage | null {
  try {
    return typeof window === "undefined" ? null : kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function rowKey(table: string, row: Row): string {
  let k = keyOf.get(row);
  if (!k) {
    k = row.id != null ? `${table}:${String(row.id)}` : `${table}:new${++insertN}`;
    keyOf.set(row, k);
  }
  return k;
}

function applyEntry(t: Tables, e: LogEntry) {
  const rows = (t[e.table] ||= []);
  if (e.op === "insert") {
    for (const r of e.rows) {
      const copy = { ...r };
      rows.push(copy);
      rowKey(e.table, copy);
    }
  } else {
    const keys = new Set(e.keys);
    if (e.op === "update") for (const r of rows) if (keys.has(rowKey(e.table, r))) Object.assign(r, e.patch);
    if (e.op === "delete") t[e.table] = rows.filter((r) => !keys.has(rowKey(e.table, r)));
  }
}

export function db(): Seeded {
  if (seeded) return seeded;
  seeded = buildSeed(new Date());
  // Seeded rows without an id (portal_prefs, family_members) get a key by position.
  for (const [table, rows] of Object.entries(seeded.tables)) rows.forEach((r, i) => keyOf.set(r, r.id != null ? `${table}:${String(r.id)}` : `${table}:#${i}`));
  try {
    const raw = storage("session")?.getItem(LOG_KEY);
    log = raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    log = [];
  }
  for (const e of log) applyEntry(seeded.tables, e);
  // A table nobody has rows in yet reads as empty, never missing.
  seeded.tables = new Proxy(seeded.tables, { get: (o, p) => (typeof p === "string" ? (o[p] ||= []) : undefined) });
  return seeded;
}

function saveLog() {
  try {
    storage("session")?.setItem(LOG_KEY, JSON.stringify(log.slice(-400)));
  } catch {
    // Too big or blocked: changes still last until the page reloads.
  }
}

export function recordInsert(table: string, rows: Row[]) {
  log.push({ op: "insert", table, rows: rows.map((r) => ({ ...r })) });
  saveLog();
}
export function recordUpdate(table: string, rows: Row[], patch: Row) {
  if (!rows.length) return;
  log.push({ op: "update", table, keys: rows.map((r) => rowKey(table, r)), patch });
  saveLog();
}
export function recordDelete(table: string, rows: Row[]) {
  if (!rows.length) return;
  log.push({ op: "delete", table, keys: rows.map((r) => rowKey(table, r)) });
  saveLog();
}

let memRole: DemoRole | null | undefined;

export function getRole(): DemoRole | null {
  if (memRole !== undefined) return memRole;
  try {
    const r = storage("local")?.getItem(ROLE_KEY) ?? storage("session")?.getItem(ROLE_KEY);
    return r && (ROLE_ORDER as string[]).includes(r) ? (r as DemoRole) : null;
  } catch {
    return null;
  }
}

export function setRole(role: DemoRole | null) {
  memRole = role;
  for (const s of [storage("local"), storage("session")]) {
    try {
      if (role) s?.setItem(ROLE_KEY, role);
      else s?.removeItem(ROLE_KEY);
    } catch {
      // ignore
    }
  }
  // Per-session caches in the portal (school features, PIN unlock) start fresh.
  try {
    const ss = storage("session");
    if (ss) for (const k of Object.keys(ss)) if (k !== LOG_KEY && k !== ROLE_KEY) ss.removeItem(k);
  } catch {
    // ignore
  }
}

export function resetDemo() {
  log = [];
  try {
    storage("session")?.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}

export function whoAmI() {
  const role = getRole();
  return role ? { role, ...db().who[role] } : null;
}
