# Syllabus and specification data

One JSON file per subject, in two folders. These files are the single source of truth for the
"Syllabus & specifications" pack (PowerPoint + PDF decks, matrices). Nothing here describes the
school itself: it records what each curriculum or qualification requires, and how subjects connect.

```
content/syllabus/
  ks4/<slug>.json        examination specification (Years 10-11)      kind: "spec"
  ks1-3/<slug>.json      National Curriculum / programme (Reception-Year 9)   kind: "syllabus"
  matrices/*.json        cross-curricular hubs, year maps, spiral threads
```

## Rules (all files)

* **Never invent.** Every board name, code, paper length, mark total, weighting and spec point must come from an
  official source you opened (awarding body specification page/PDF, gov.uk National Curriculum programme of study).
  If you could not open it, put the item in `gaps` and set `status` to `"Provisional"`.
* `status`: `"Verified"` only when the structure (papers, marks, weights) AND the content list were read from the
  official source. Otherwise `"Provisional"`. `statusNote` says plainly what was and was not verified.
* `sources`: every page/PDF you actually opened: `{ "title", "url" }`.
* **Paraphrase.** Spec and National Curriculum text is copyright / Crown: write short paraphrased statements
  (maximum 18 words each). Do not paste paragraphs. Short exact terms (topic titles, spec references) are fine.
* British spelling. No Islamic claims beyond what the subject needs; never invent hadith, ayat or scholars' words.
* Keep JSON valid (no comments, no trailing commas). Validate with `node scripts/syllabus/validate.mjs`.

## ks4/<slug>.json  (kind "spec")

```json
{
  "kind": "spec",
  "subject": "Geography", "slug": "geography",
  "board": "AQA", "qualification": "GCSE Geography (9-1)", "code": "8035",
  "specVersion": "e.g. 'Version 1.3, 2022' or 'not stated on pages opened'",
  "status": "Verified", "statusNote": "…",
  "sources": [{ "title": "AQA 8035 specification at a glance", "url": "https://…" }],
  "years": "Years 10 to 11",
  "tiers": "None | Foundation/Higher | …",
  "assessment": [
    { "paper": "Paper 1", "title": "Living with the physical environment", "duration": "1 hour 30 minutes",
      "marks": 88, "weight": "35%", "content": "Which units it examines", "format": "Question types" }
  ],
  "nonExam": "Coursework / NEA / practical endorsement / fieldwork requirement, or \"None\"",
  "aos": [{ "code": "AO1", "desc": "Demonstrate knowledge…", "weight": "30%" }],
  "units": [
    { "ref": "3.1.1", "title": "The challenge of natural hazards", "paper": "Paper 1",
      "year": "Y10", "term": "Autumn",
      "points": ["3 to 10 short paraphrased spec statements"],
      "keyTerms": ["optional", "terms"] }
  ],
  "commandWords": [{ "word": "Explain", "meaning": "Give reasons or causes" }],
  "skills": ["Examined skills: graph reading, map skills…"],
  "prerequisites": [{ "from": "KS3 topic or earlier unit", "to": "ref of the spec unit it supports" }],
  "links": [{ "with": "Science", "topic": "Atmosphere and energy transfer", "unitRef": "3.1.1", "how": "one line on what each subject contributes" }],
  "contextNote": "optional: where the spec requires content to be taught accurately that may need careful framing (e.g. evolution): say what must be taught, not what to believe",
  "gaps": ["anything not verified"]
}
```
`year` is `Y10` or `Y11` (the recommended teaching year; the board allows two-year or flexible sequencing).

Optional `examEntry`: set it when the course is taught from this (UK GCSE) specification but pupils are entered
for a different qualification (TGA pupils sit Pearson Edexcel International GCSEs). Shape:
`{ "summary", "board", "qualification", "code", "label", "tier", "papers", "series", "privateCandidates",
"choice" (optional: why this version), "notes": ["what teachers must add or change for the exam"], "regulation",
"checked", "sources": [{ "title", "url" }] }`. The portal then shows "Taught: … · Exam: …", the syllabus pack adds
an exam-entry section, and lesson files carry `exam` / `examShort`. Verify every code and paper from the board's own
specification, like the rest of the file.
Every spec unit the board lists at section level must appear in `units` so the coverage list is complete.

## ks1-3/<slug>.json  (kind "syllabus")

```json
{
  "kind": "syllabus",
  "subject": "Mathematics", "slug": "mathematics",
  "framework": "National Curriculum in England (2014): Mathematics programmes of study",
  "status": "Verified", "statusNote": "…",
  "sources": [{ "title": "…", "url": "https://…" }],
  "purpose": ["2 to 4 short paraphrased aims of the subject"],
  "keyStages": [
    { "ks": "KS1", "years": "Reception to Year 2",
      "strands": [{ "strand": "Number and place value", "statements": ["short paraphrased statutory statements"] }] }
  ],
  "yearMap": {
    "y7": [{ "unit": "Unit title", "focus": ["3 to 6 topics"], "skills": ["…"], "keyTerms": ["…"],
             "assess": "how it is checked", "prereq": "Year 6: …", "leadsTo": "Year 8: …" }]
  },
  "progression": [{ "thread": "Fractions", "steps": { "Y1": "…", "Y3": "…", "Y6": "…", "Y9": "…" } }],
  "toKS4": "How the key stage 3 programme sets up the KS4 specification, naming the board unit refs",
  "links": [{ "with": "Geography", "topic": "…", "years": "Y7-Y9", "how": "…" }],
  "gaps": ["…"]
}
```
`yearMap` keys: `reception`, `y1` … `y9`. Statutory statements are by key stage; the year allocation is a
recommended sequence. Say so in `statusNote`. Provide EVERY year the subject runs.
