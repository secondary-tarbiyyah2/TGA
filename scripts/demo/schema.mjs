// Portal demo: reads supabase/migrations/*.sql and writes the tables' columns and
// foreign keys to src/lib/demo/schema.generated.json, so the in-browser mock can
// answer PostgREST embeds ("classes(name)", "submission:submission_id!inner(...)")
// the way the real database would. Rough SQL reading, good enough for embeds.
//   node scripts/demo/schema.mjs [repoRoot]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
const dir = path.join(root, "supabase/migrations");
const tables = {};
const views = new Set();
const T = (name) => (tables[name] ||= { cols: [], fks: {} });
const clean = (s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const ident = (s) => s.replace(/"/g, "").replace(/^public\./i, "").toLowerCase();

function body(sql, start) {
  let depth = 0;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return [sql.slice(start + 1, i), i];
    }
  }
  return [sql.slice(start + 1), sql.length];
}
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function column(t, def) {
  const m = def.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i);
  if (!m) return;
  const col = m[1].toLowerCase();
  if (["constraint", "primary", "unique", "check", "foreign", "exclude", "like"].includes(col)) {
    const fk = def.match(/foreign\s+key\s*\(\s*"?([a-z0-9_]+)"?\s*\)\s*references\s+([a-z0-9_."]+)/i);
    if (fk) T(t).fks[fk[1].toLowerCase()] = ident(fk[2]);
    return;
  }
  if (!T(t).cols.includes(col)) T(t).cols.push(col);
  const ref = def.match(/references\s+([a-z0-9_."]+)/i);
  if (ref) T(t).fks[col] = ident(ref[1]);
}

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const sql = clean(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)\s*\(/gi)) {
    const t = ident(m[1]);
    const [b] = body(sql, m.index + m[0].length - 1);
    for (const def of splitTop(b)) column(t, def);
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z0-9_."]+)\s+([\s\S]*?);/gi)) {
    const t = ident(m[1]);
    for (const part of splitTop(m[2])) {
      const add = part.match(/^add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]*)$/i);
      if (add) column(t, add[1]);
      const con = part.match(/^add\s+(?:constraint\s+\S+\s+)?foreign\s+key\s*\(\s*"?([a-z0-9_]+)"?\s*\)\s*references\s+([a-z0-9_."]+)/i);
      if (con) T(t).fks[con[1].toLowerCase()] = ident(con[2]);
      const ren = part.match(/^rename\s+column\s+"?([a-z0-9_]+)"?\s+to\s+"?([a-z0-9_]+)"?/i);
      if (ren && tables[t]) {
        const c = tables[t].cols;
        const i = c.indexOf(ren[1].toLowerCase());
        if (i >= 0) c[i] = ren[2].toLowerCase();
        if (tables[t].fks[ren[1]]) {
          tables[t].fks[ren[2]] = tables[t].fks[ren[1]];
          delete tables[t].fks[ren[1]];
        }
      }
    }
  }
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+([a-z0-9_."]+)/gi)) views.add(ident(m[1]));
  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)/gi)) delete tables[ident(m[1])];
}

const out = { tables, views: [...views].sort() };
const file = path.join(root, "src/lib/demo/schema.generated.json");
fs.writeFileSync(file, JSON.stringify(out));
console.log(`schema: ${Object.keys(tables).length} tables, ${views.size} views -> ${path.relative(root, file)}`);
