import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tables = ["about_content", "curriculum_content", "differentiators", "faq_entries", "fee_bands", "homepage_content", "site_settings", "site_term_dates", "team_profiles", "testimonials", "bursary_seats_public", "year_group_places"];
const out = {};
for (const t of tables) {
  const { data, error } = await sb.from(t).select("*");
  out[t] = error ? { error: error.message } : data;
}
fs.mkdirSync("research/out", { recursive: true });
fs.writeFileSync("research/out/content.json", JSON.stringify(out, null, 1));
