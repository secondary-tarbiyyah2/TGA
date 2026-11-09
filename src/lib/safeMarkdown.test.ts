import { test } from "node:test";
import assert from "node:assert/strict";
import { renderSafeMarkdown, safeUrl } from "./safeMarkdown.ts";

test("ordinary policy markdown renders as before", () => {
  const html = renderSafeMarkdown("## 1. Intent\n\nSee [the FAQ](/faqs/), [section](#scope), [email](mailto:a@b.org) and **bold**.\n\n| a | b |\n|---|---|\n| 1 | 2 |");
  assert.match(html, /<h2>1\. Intent<\/h2>/);
  assert.match(html, /<a href="\/faqs\/">the FAQ<\/a>/);
  assert.match(html, /<a href="#scope">section<\/a>/);
  assert.match(html, /<a href="mailto:a@b.org">email<\/a>/);
  assert.match(html, /<table>/);
});

test("raw HTML is shown as text, never as markup", () => {
  const html = renderSafeMarkdown("<script>alert(1)</script>\n\nHi <img src=x onerror=alert(1)>");
  assert.doesNotMatch(html, /<script|<img/i);
  assert.match(html, /&lt;script&gt;/);
});

test("unsafe link targets are dropped", () => {
  const html = renderSafeMarkdown("[a](javascript:alert(1)) [b](<java\tscript:alert(1)>) [c](data:text/html,x) ![d](javascript:x)");
  assert.doesNotMatch(html, /href=|src=/);
  assert.equal(safeUrl("//evil.example"), null);
  assert.equal(safeUrl("https://example.org/x"), "https://example.org/x");
});
