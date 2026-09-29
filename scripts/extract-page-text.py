"""Extracts readable nav links / headings / body text from a saved HTML
file at /tmp/page.html, for research-competitor-site.yml. Standalone
script (not an inline workflow heredoc) so it isn't at the mercy of YAML
block-scalar indentation rules.
"""
from bs4 import BeautifulSoup

with open("/tmp/page.html", "r", encoding="utf-8", errors="ignore") as f:
    soup = BeautifulSoup(f.read(), "lxml")

for tag in soup(["script", "style", "noscript", "svg"]):
    tag.decompose()

print("--- NAV LINKS ---")
for a in soup.select("nav a, header a"):
    text = a.get_text(strip=True)
    href = a.get("href", "")
    if text:
        print(f"{text} -> {href}")

print()
print("--- HEADINGS ---")
for h in soup.find_all(["h1", "h2", "h3"]):
    print(f"{h.name}: {h.get_text(strip=True)}")

print()
print("--- BODY TEXT (first ~4000 chars) ---")
body_text = soup.get_text(separator=" | ", strip=True)
print(body_text[:4000])
