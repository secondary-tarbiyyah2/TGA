// Uploads built booklet PDFs to the lesson-decks bucket under revision-booklets/<subject>/<year>/<unit>.pdf
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
const dir = path.resolve(process.argv[2] || "out/booklets");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
let ok = 0, bad = 0;
for (const m of manifest) {
  const pdf = path.join(dir, m.file.replace(/\.docx$/, ".pdf"));
  if (!fs.existsSync(pdf)) { bad++; continue; }
  const { error } = await sb.storage.from("lesson-decks").upload(`revision-booklets/${m.file.replace(/\.docx$/, ".pdf")}`, fs.readFileSync(pdf), { upsert: true, contentType: "application/pdf" });
  if (error) { console.warn("upload failed", m.file, error.message); bad++; } else ok++;
}
console.log(`Uploaded ${ok} booklets, ${bad} skipped/failed`);
if (!ok) process.exit(1);
