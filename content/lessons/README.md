# Lesson content format

One JSON file per subject + year group: `content/lessons/<subject-slug>/<year>.json`
(`year` is `reception`, `y1` ... `y11`). Each file is an object:

```json
{
  "subject": "Mathematics",
  "year": "y9",
  "board": "Edexcel",
  "lessons": [ { ...lesson... } ]
}
```

## Lesson

```json
{
  "unit": "Unit 1: Number and proportion",
  "n": 1,
  "title": "Ratio and sharing in a ratio",
  "duration": 50,
  "objectives": ["Simplify a ratio", "Share an amount in a given ratio"],
  "keywords": [{ "term": "ratio", "def": "compares the size of two or more quantities" }],
  "starter": ["Retrieval question 1", "Retrieval question 2", "Retrieval question 3"],
  "teach": [
    { "heading": "Slide heading", "bullets": ["short point", "short point"], "note": "teacher script / what to say and ask" }
  ],
  "practice": ["Guided question 1", "Guided question 2"],
  "independent": ["Task 1", "Task 2", "Task 3"],
  "exit": ["Exit ticket question 1", "Exit ticket question 2"],
  "homework": "One sentence of homework",
  "send": "One line: adaptation for SEND / EAL / stretch for most able"
}
```

Rules: 4-6 `teach` slides, each with 2-5 bullets of at most 14 words; real, accurate,
age-appropriate content only; British spelling; Islamic ethos woven in where natural
(bismillah starter, adab) and never contradicting Islamic belief; no invented facts.
Questions must have concrete content (real numbers, real sentences), not placeholders.
