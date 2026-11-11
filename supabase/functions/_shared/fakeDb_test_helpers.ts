// A tiny in-memory stand-in for the Supabase client, for the payments tests.
// Supports the calls the payments code makes: select/insert/update/upsert with
// eq, in, is, not(is null), gt, lte, or (simple "col.eq.x" lists), order,
// limit, maybeSingle and single, and rpc with handlers given by the test.
// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase and Stripe JSON */

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcs: Record<string, (args: any) => any> = {};
  uniques: Record<string, string[][]> = {};
  /** Generated columns, worked out on insert (e.g. amount_pence from amount). */
  generated: Record<string, (r: Row) => Row> = {};

  constructor(init: Record<string, Row[]> = {}) {
    for (const [k, v] of Object.entries(init)) this.tables[k] = v.map((r) => ({ ...r }));
  }
  rows(t: string): Row[] {
    return (this.tables[t] ||= []);
  }
  from(t: string) {
    return new Query(this, t);
  }
  rpc(name: string, args: any) {
    const fn = this.rpcs[name];
    return Promise.resolve(fn ? { data: fn(args), error: null } : { data: null, error: null });
  }
}

class Query {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: any = null;
  private opts: any = {};
  private single: "none" | "maybe" | "one" = "none";
  private limitN: number | null = null;
  private headCount = false;
  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, o?: { count?: string; head?: boolean }) {
    if (this.op === "select" && o?.head) this.headCount = true;
    return this;
  }
  insert(p: any) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: any) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  upsert(p: any, o: any = {}) {
    this.op = "upsert";
    this.payload = p;
    this.opts = o;
    return this;
  }
  eq(c: string, v: any) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  in(c: string, v: any[]) {
    this.filters.push((r) => v.includes(r[c]));
    return this;
  }
  is(c: string, v: any) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  not(c: string, _op: string, _v: any) {
    this.filters.push((r) => r[c] !== null && r[c] !== undefined);
    return this;
  }
  gt(c: string, v: any) {
    this.filters.push((r) => r[c] > v);
    return this;
  }
  gte(c: string, v: any) {
    this.filters.push((r) => r[c] >= v);
    return this;
  }
  lte(c: string, v: any) {
    this.filters.push((r) => r[c] <= v);
    return this;
  }
  like(_c: string, _v: string) {
    return this;
  }
  or(expr: string) {
    const parts = expr.split(",").map((p) => p.split(".eq."));
    this.filters.push((r) => parts.some(([c, v]) => String(r[c]) === v));
    return this;
  }
  filter(c: string, op: string, v: string) {
    if (op === "cs") {
      const want = JSON.parse(v) as Row[];
      this.filters.push((r) => want.every((w) => (r[c] || []).some((x: Row) => Object.entries(w).every(([k, val]) => x[k] === val))));
    }
    return this;
  }
  contains(c: string, v: any) {
    return this.filter(c, "cs", JSON.stringify(v));
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.single = "maybe";
    return this;
  }
  then(res: (v: any) => any, rej?: (e: any) => any) {
    try {
      return Promise.resolve(this.run()).then(res, rej);
    } catch (e) {
      return Promise.reject(e).then(res, rej);
    }
  }

  private match(): Row[] {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }
  private clash(row: Row, cols: string[]): Row | undefined {
    return this.db.rows(this.table).find((r) => cols.every((c) => r[c] !== null && r[c] !== undefined && r[c] === row[c]));
  }
  private run(): any {
    const t = this.db.rows(this.table);
    if (this.op === "select") {
      let rows = this.match();
      if (this.headCount) return { count: rows.length, data: null, error: null };
      if (this.limitN !== null) rows = rows.slice(0, this.limitN);
      if (this.single === "maybe") return { data: rows[0] ? { ...rows[0] } : null, error: null };
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      const keys = this.op === "upsert" ? String(this.opts.onConflict || "id").split(",") : ["id"];
      const extra = this.db.uniques[this.table] || [];
      const out: Row[] = [];
      for (const p of list) {
        const gen = this.db.generated[this.table];
        const base = { id: p.id ?? crypto.randomUUID(), ...p };
        const row = gen ? { ...base, ...gen(base) } : base;
        const existing = this.clash(row, keys) || extra.map((u) => this.clash(row, u)).find(Boolean);
        if (existing) {
          if (this.op === "insert") return { data: null, error: { message: "duplicate key", code: "23505" } };
          if (!this.opts.ignoreDuplicates) Object.assign(existing, p);
          continue;
        }
        t.push(row);
        out.push(row);
      }
      return { data: out.map((r) => ({ ...r })), error: null };
    }
    if (this.op === "update") {
      const rows = this.match();
      for (const r of rows) Object.assign(r, this.payload);
      return { data: rows, error: null };
    }
    return { data: null, error: null };
  }
}

/** A fake fetch for the Stripe API: give a handler per "METHOD path" (path without /v1/ and query). */
export function fakeStripe(routes: Record<string, (body: URLSearchParams, headers: Headers) => { status?: number; json: any }>) {
  const calls: { method: string; path: string; body: URLSearchParams; headers: Headers }[] = [];
  const f = (input: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(input);
    const path = u.pathname.replace(/^\/v1\//, "");
    const method = init?.method || "GET";
    const body = new URLSearchParams(method === "GET" ? u.search : String(init?.body || ""));
    const headers = new Headers(init?.headers);
    calls.push({ method, path, body, headers });
    const route = routes[`${method} ${path}`];
    if (!route) return Promise.resolve(new Response(JSON.stringify({ error: { message: `no route ${method} ${path}` } }), { status: 404 }));
    const r = route(body, headers);
    return Promise.resolve(new Response(JSON.stringify(r.json), { status: r.status || 200 }));
  };
  return { fetch: f, calls };
}
