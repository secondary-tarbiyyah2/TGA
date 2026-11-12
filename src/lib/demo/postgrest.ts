// Portal demo only: a small in-memory PostgREST. Reads the same URLs supabase-js
// sends (select with embeds, filters, or/and, order, range, count, single) and
// answers them from the made-up school in ./seed. Relationships come from the
// migrations (schema.generated.json); views and unknown tables fall back to
// "<name>_id" columns.

import schemaJson from "@/lib/demo/schema.generated.json";

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
type Schema = { tables: Record<string, { cols: string[]; fks: Record<string, string> }>; views: string[] };
const schema = schemaJson as Schema;

// ── select parsing ────────────────────────────────────────────────────────
export type Field =
  | { kind: "star" }
  | { kind: "col"; name: string; alias: string; path?: string[]; text?: boolean }
  | { kind: "count"; alias: string }
  | { kind: "embed"; name: string; alias: string; hint?: string; inner: boolean; spread: boolean; fields: Field[] };

function splitTop(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = "";
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === "(") depth++;
    if (!quote && ch === ")") depth--;
    if (!quote && depth === 0 && ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(sel: string | null): Field[] {
  if (!sel || sel === "*") return [{ kind: "star" }];
  return splitTop(sel.replace(/\s+/g, " ")).map(parseField);
}

function parseField(f: string): Field {
  f = f.trim();
  const spread = f.startsWith("...");
  if (spread) f = f.slice(3);
  const paren = f.indexOf("(");
  if (paren > 0 && f.endsWith(")")) {
    const head = f.slice(0, paren);
    const inside = f.slice(paren + 1, -1);
    let alias = "";
    let rest = head;
    const colon = head.indexOf(":");
    if (colon > 0) {
      alias = head.slice(0, colon).trim();
      rest = head.slice(colon + 1).trim();
    }
    const parts = rest.split("!").map((x) => x.trim());
    const name = parts[0];
    if (name === "count" && !inside) return { kind: "count", alias: alias || "count" };
    let hint: string | undefined;
    let inner = false;
    for (const p of parts.slice(1)) {
      if (p === "inner") inner = true;
      else if (p === "left") inner = false;
      else hint = p;
    }
    return { kind: "embed", name, alias: alias || name, hint, inner, spread, fields: parseSelect(inside || "*") };
  }
  if (f === "*") return { kind: "star" };
  let alias = "";
  let rest = f;
  const colon = f.search(/:(?!:)/);
  if (colon > 0 && f[colon - 1] !== ":") {
    alias = f.slice(0, colon).trim();
    rest = f.slice(colon + 1).trim();
  }
  rest = rest.replace(/::[a-z_ ]+(\[\])?$/i, "");
  if (rest === "count") return { kind: "count", alias: alias || "count" };
  const arrow = rest.split(/->>?/);
  if (arrow.length > 1) {
    const path = arrow.slice(1).map((x) => x.replace(/'/g, ""));
    return { kind: "col", name: arrow[0], alias: alias || path[path.length - 1], path, text: rest.includes("->>") };
  }
  return { kind: "col", name: rest, alias: alias || rest };
}

// ── relationships ─────────────────────────────────────────────────────────
const baseTable = (t: string) => (t === "auth.users" ? "profiles" : t.replace(/^auth\./, ""));
const singular = (t: string) => t.replace(/ies$/, "y").replace(/(ch|sh|ss|x)es$/, "$1").replace(/ren$/, "").replace(/s$/, "");

export type Rel = { kind: "one"; table: string; local: string; remote: string } | { kind: "many"; table: string; local: string; remote: string };

export function resolveRel(from: string, name: string, hint: string | undefined, sample: Row | undefined, tables: Tables): Rel | null {
  const S = schema.tables;
  const fromFks = S[from]?.fks || {};
  const fkOf = (t: string, c: string) => (S[t]?.fks?.[c] ? baseTable(S[t].fks[c]) : undefined);
  // "alias:column_id(...)" names the foreign key column itself.
  const asCol = fromFks[name] ? baseTable(fromFks[name]) : undefined;
  if (asCol) return { kind: "one", table: asCol, local: name, remote: "id" };
  const target = name;
  const exists = !!S[target] || schema.views.includes(target) || !!tables[target];
  if (!exists) {
    // "teacher:teacher_id" without schema info, or a guessed column.
    if (sample && `${name}` in sample && typeof sample[name] === "string") return null;
    return null;
  }
  if (hint) {
    const h = hint.replace(new RegExp(`^${from}_`), "").replace(/_fkey$/, "");
    if (fkOf(from, h) === target || (sample && h in sample && !S[target]?.fks?.[h])) return { kind: "one", table: target, local: h, remote: "id" };
    if (fkOf(target, h) === from || S[target]?.cols.includes(h)) return { kind: "many", table: target, local: "id", remote: h };
    const h2 = hint.replace(new RegExp(`^${target}_`), "").replace(/_fkey$/, "");
    if (fkOf(target, h2) === from) return { kind: "many", table: target, local: "id", remote: h2 };
  }
  const ones = Object.keys(fromFks).filter((c) => baseTable(fromFks[c]) === target);
  if (ones.length) {
    const pref = ones.find((c) => c === `${singular(target)}_id`) || ones[0];
    return { kind: "one", table: target, local: pref, remote: "id" };
  }
  const tFks = S[target]?.fks || {};
  const manys = Object.keys(tFks).filter((c) => baseTable(tFks[c]) === baseTable(from));
  if (manys.length) {
    const pref = manys.find((c) => c === `${singular(from)}_id`) || manys[0];
    return { kind: "many", table: target, local: "id", remote: pref };
  }
  // Views and tables the migrations don't describe: by naming.
  const guessOne = `${singular(target)}_id`;
  if (sample && guessOne in sample) return { kind: "one", table: target, local: guessOne, remote: "id" };
  if (S[from]?.cols.includes(guessOne)) return { kind: "one", table: target, local: guessOne, remote: "id" };
  const guessMany = `${singular(from)}_id`;
  const tRows = tables[target] || [];
  if (S[target]?.cols.includes(guessMany) || (tRows[0] && guessMany in tRows[0])) return { kind: "many", table: target, local: "id", remote: guessMany };
  if (from === "profiles" || from === "auth.users") {
    for (const c of ["user_id", "parent_user_id", "teacher_user_id", "staff_user_id"]) if (S[target]?.cols.includes(c) || (tRows[0] && c in tRows[0])) return { kind: "many", table: target, local: "id", remote: c };
  }
  return null;
}

// ── filters ───────────────────────────────────────────────────────────────
type Cond = { col: string; path?: string[]; op: string; not: boolean; val: string } | { logic: "or" | "and"; not: boolean; items: Cond[] };

function unquote(s: string) {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

export function parseCond(key: string, value: string): Cond {
  // key "or" / "and" / "not.or", value "(a.eq.1,b.eq.2)"
  const lk = key.replace(/^not\./, "");
  if (lk === "or" || lk === "and") return { logic: lk, not: key.startsWith("not."), items: parseLogicList(value) };
  const m = value.match(/^(not\.)?([a-z]+)(\([a-z,]+\))?\.([\s\S]*)$/i);
  const [col, ...path] = key.split(/->>?/);
  if (!m) return { col, path: path.length ? path : undefined, op: "eq", not: false, val: value };
  return { col, path: path.length ? path : undefined, op: m[2].toLowerCase(), not: !!m[1], val: m[4] };
}

function parseLogicList(v: string): Cond[] {
  const inner = v.trim().replace(/^\(/, "").replace(/\)$/, "");
  return splitTop(inner).map((part) => {
    const lm = part.match(/^(not\.)?(or|and)\(([\s\S]*)\)$/);
    if (lm) return { logic: lm[2] as "or" | "and", not: !!lm[1], items: parseLogicList(`(${lm[3]})`) };
    // col.op.value or col.not.op.value
    const dot = part.indexOf(".");
    const col = part.slice(0, dot);
    const rest = part.slice(dot + 1);
    return parseCond(col, rest);
  });
}

function getPath(row: Row, col: string, path?: string[]): unknown {
  let v: unknown = row[col];
  for (const p of path || []) {
    if (v && typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        return undefined;
      }
    }
    v = v && typeof v === "object" ? (v as Record<string, unknown>)[p] : undefined;
  }
  return v;
}

function parseList(s: string): string[] {
  const inner = s.trim().replace(/^[({[]/, "").replace(/[)}\]]$/, "");
  if (!inner) return [];
  if (s.trim().startsWith("[")) {
    try {
      return (JSON.parse(s) as unknown[]).map(String);
    } catch {
      /* fall through */
    }
  }
  return splitTop(inner).map(unquote);
}

const isNum = (x: unknown) => typeof x === "number" || (typeof x === "string" && x.trim() !== "" && !isNaN(Number(x)) && !/^\d{4}-\d{2}-\d{2}/.test(x));
function cmp(a: unknown, b: string): number {
  if (typeof a === "number" || (isNum(a) && isNum(b))) return Number(a) - Number(b);
  if (typeof a === "boolean") return Number(a) - Number(b === "true");
  const as = String(a);
  // Dates: compare as times when both look like dates.
  if (/^\d{4}-\d{2}-\d{2}/.test(as) && /^\d{4}-\d{2}-\d{2}/.test(b)) {
    const ta = Date.parse(as.length === 10 ? `${as}T00:00:00Z` : as);
    const tb = Date.parse(b.length === 10 ? `${b}T00:00:00Z` : b);
    if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
  }
  return as < b ? -1 : as > b ? 1 : 0;
}
const likeRe = (p: string, i: boolean) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".")}$`, i ? "is" : "s");
const eqv = (a: unknown, b: string) => {
  if (a === null || a === undefined) return false;
  if (typeof a === "boolean") return String(a) === b;
  if (typeof a === "number") return a === Number(b);
  return String(a) === b;
};

function test(c: Cond, row: Row): boolean {
  if ("logic" in c) {
    const r = c.logic === "or" ? c.items.some((x) => test(x, row)) : c.items.every((x) => test(x, row));
    return c.not ? !r : r;
  }
  const v = getPath(row, c.col, c.path);
  let r: boolean;
  const val = unquote(c.val);
  switch (c.op) {
    case "eq":
      r = eqv(v, val);
      break;
    case "neq":
      r = v !== null && v !== undefined && !eqv(v, val);
      break;
    case "gt":
      r = v != null && cmp(v, val) > 0;
      break;
    case "gte":
      r = v != null && cmp(v, val) >= 0;
      break;
    case "lt":
      r = v != null && cmp(v, val) < 0;
      break;
    case "lte":
      r = v != null && cmp(v, val) <= 0;
      break;
    case "like":
      r = v != null && likeRe(val, false).test(String(v));
      break;
    case "ilike":
      r = v != null && likeRe(val, true).test(String(v));
      break;
    case "match":
    case "imatch":
      r = v != null && new RegExp(val, c.op === "imatch" ? "i" : "").test(String(v));
      break;
    case "is":
      r = val === "null" ? v === null || v === undefined : val === "true" ? v === true : val === "false" ? v === false : v === undefined;
      break;
    case "isdistinct":
      r = String(v) !== val;
      break;
    case "in": {
      const list = parseList(val);
      r = v != null && list.some((x) => eqv(v, x));
      break;
    }
    case "cs":
    case "cd":
    case "ov": {
      const list = parseList(val);
      const arr = Array.isArray(v) ? v.map(String) : v && typeof v === "object" ? [] : v == null ? [] : [String(v)];
      if (c.op === "cs" && v && typeof v === "object" && !Array.isArray(v) && val.trim().startsWith("{") && val.includes(":")) {
        try {
          const want = JSON.parse(val) as Record<string, unknown>;
          r = Object.entries(want).every(([k, w]) => JSON.stringify((v as Record<string, unknown>)[k]) === JSON.stringify(w));
        } catch {
          r = false;
        }
        break;
      }
      r = c.op === "cs" ? list.every((x) => arr.includes(x)) : c.op === "cd" ? arr.every((x) => list.includes(x)) : list.some((x) => arr.includes(x));
      break;
    }
    case "fts":
    case "plfts":
    case "phfts":
    case "wfts": {
      const words = val.toLowerCase().split(/[\s&|!:*']+/).filter(Boolean);
      const hay = String(v ?? "").toLowerCase();
      r = words.every((w) => hay.includes(w));
      break;
    }
    default:
      r = true;
  }
  return c.not ? !r : r;
}

// ── the query ─────────────────────────────────────────────────────────────
export type Query = {
  table: string;
  fields: Field[];
  conds: Cond[];
  embedConds: Record<string, Cond[]>; // by embed alias path "a" or "a.b"
  order: { col: string; path?: string[]; asc: boolean; nullsFirst: boolean }[];
  embedOrder: Record<string, { col: string; asc: boolean; nullsFirst: boolean }[]>;
  embedLimit: Record<string, number>;
  limit?: number;
  offset?: number;
};

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

export function parseQuery(table: string, params: URLSearchParams): Query {
  const q: Query = { table, fields: parseSelect(params.get("select")), conds: [], embedConds: {}, order: [], embedOrder: {}, embedLimit: {} };
  for (const [k, v] of params) {
    if (k === "select" || k === "on_conflict" || k === "columns") continue;
    if (k === "order") {
      q.order = parseOrder(v);
      continue;
    }
    if (k === "limit") {
      q.limit = Number(v);
      continue;
    }
    if (k === "offset") {
      q.offset = Number(v);
      continue;
    }
    const dot = k.lastIndexOf(".");
    const bare = k.replace(/^not\./, "");
    if (dot > 0 && !(bare === "or" || bare === "and") && !k.includes("->")) {
      const emb = k.slice(0, dot);
      const last = k.slice(dot + 1);
      if (last === "order") {
        q.embedOrder[emb] = parseOrder(v);
        continue;
      }
      if (last === "limit") {
        q.embedLimit[emb] = Number(v);
        continue;
      }
      if (last === "offset") continue;
      (q.embedConds[emb] ||= []).push(parseCond(last, v));
      continue;
    }
    if (dot > 0 && (k.endsWith(".or") || k.endsWith(".and"))) {
      const emb = k.slice(0, dot);
      (q.embedConds[emb] ||= []).push(parseCond(k.slice(dot + 1), v));
      continue;
    }
    if (RESERVED.has(k)) continue;
    q.conds.push(parseCond(k, v));
  }
  return q;
}

function parseOrder(v: string) {
  return splitTop(v).map((part) => {
    const bits = part.split(".");
    let col = bits[0];
    let path: string[] | undefined;
    if (col.includes("->")) {
      const [c, ...p] = col.split(/->>?/);
      col = c;
      path = p;
    }
    const asc = !bits.includes("desc");
    const nullsFirst = bits.includes("nullsfirst") || (!asc && !bits.includes("nullslast"));
    return { col, path, asc, nullsFirst };
  });
}

function sortRows(rows: Row[], order: { col: string; path?: string[]; asc: boolean; nullsFirst: boolean }[]) {
  if (!order.length) return rows;
  return [...rows].sort((a, b) => {
    for (const o of order) {
      const va = getPath(a, o.col, o.path);
      const vb = getPath(b, o.col, o.path);
      const na = va === null || va === undefined;
      const nb = vb === null || vb === undefined;
      if (na && nb) continue;
      if (na) return o.nullsFirst ? -1 : 1;
      if (nb) return o.nullsFirst ? 1 : -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : cmp(va, String(vb));
      if (c !== 0) return o.asc ? c : -c;
    }
    return 0;
  });
}

/** One table's rows after filters, with embeds attached (for !inner and embedded filters). */
export function runSelect(db: Tables, q: Query): Row[] {
  let rows = (db[q.table] || []).filter((r) => q.conds.every((c) => test(c, r)));
  rows = sortRows(rows, q.order);
  const out: Row[] = [];
  for (const r of rows) {
    const shaped = shape(db, q.table, r, q.fields, q, "");
    if (shaped) out.push(shaped);
  }
  const off = q.offset || 0;
  return q.limit !== undefined ? out.slice(off, off + q.limit) : out.slice(off);
}

function shape(db: Tables, table: string, row: Row, fields: Field[], q: Query, prefix: string): Row | null {
  const out: Row = {};
  for (const f of fields) {
    if (f.kind === "star") Object.assign(out, row);
  }
  for (const f of fields) {
    if (f.kind === "col") {
      const v = f.path ? getPath(row, f.name, f.path) : row[f.name];
      out[f.alias] = v === undefined ? null : f.text && v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    } else if (f.kind === "count") {
      out[f.alias] = 1;
    } else if (f.kind === "embed") {
      const key = prefix ? `${prefix}.${f.alias}` : f.alias;
      const keyByName = prefix ? `${prefix}.${f.name}` : f.name;
      const conds = [...(q.embedConds[key] || []), ...(key !== keyByName ? q.embedConds[keyByName] || [] : [])];
      const rel = resolveRel(table, f.name, f.hint, row, db);
      if (!rel) {
        if (f.inner) return null;
        out[f.alias] = null;
        continue;
      }
      if (rel.kind === "one") {
        const target = (db[rel.table] || []).find((t) => row[rel.local] != null && eqv(t[rel.remote], String(row[rel.local])));
        const ok = target && conds.every((c) => test(c, target));
        const shaped = ok ? shape(db, rel.table, target!, f.fields, q, key) : null;
        if (f.inner && !shaped) return null;
        if (f.spread && shaped) Object.assign(out, shaped);
        else out[f.alias] = shaped;
      } else {
        let kids = (db[rel.table] || []).filter((t) => t[rel.remote] != null && eqv(t[rel.remote], String(row[rel.local])) && conds.every((c) => test(c, t)));
        kids = sortRows(kids, q.embedOrder[key] || []);
        if (q.embedLimit[key] !== undefined) kids = kids.slice(0, q.embedLimit[key]);
        if (f.fields.length === 1 && f.fields[0].kind === "count") {
          if (f.inner && !kids.length) return null;
          out[f.alias] = [{ [f.fields[0].alias]: kids.length }];
          continue;
        }
        const shapedKids = kids.map((k) => shape(db, rel.table, k, f.fields, q, key)).filter(Boolean) as Row[];
        if (f.inner && !shapedKids.length) return null;
        out[f.alias] = shapedKids;
      }
    }
  }
  return out;
}

export function matchRows(db: Tables, q: Query): Row[] {
  return (db[q.table] || []).filter((r) => q.conds.every((c) => test(c, r)));
}

export function tableColumns(table: string): string[] {
  return schema.tables[table]?.cols || [];
}

export function isKnownRelation(name: string): boolean {
  return !!schema.tables[name] || schema.views.includes(name);
}
