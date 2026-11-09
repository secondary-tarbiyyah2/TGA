// Tafweed T29: the portal and website use the site's own dropdown, never the
// browser's bare <select>, and icons from the icon set, never emojis.
// Run: node --test --experimental-strip-types src/lib/learn/uiControls.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(tsx?|json)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

function hits(re: RegExp, keep: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const f of files(SRC).filter(keep)) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        // Comments that mention the element or a symbol are fine.
        if (re.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) out.push(`${f.slice(SRC.length + 1)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
  }
  return out;
}

test("no bare <select> in the portal or the website (use Select from components/learn/Select or components/ui/Dropdown)", () => {
  const found = hits(/<select[\s>]/, (f) => f.endsWith(".tsx"));
  assert.deepEqual(found, []);
});

test("no emojis in the portal or website UI (use the Icon set in components/learn/Icon)", () => {
  // Country flags (regional indicators) in the country picker data are not pictographs and are allowed;
  // so are the ©, ® and ™ signs.
  const found = hits(/(?![©®™])\p{Extended_Pictographic}/u, (f) => !f.endsWith("countryZones.generated.ts"));
  assert.deepEqual(found, []);
});
