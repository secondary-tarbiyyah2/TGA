# Lessons v3: the owner's design feedback (9 Nov 2026, 12:39). Overrides BRIEF-LESSONS where they differ.

Lesson data (content/lessons/**). New optional fields below are being added to the schema and builder in parallel
(branch `lesson-builder-v3`); write them now, the validator will accept them once v3 merges. Until then, if the validator
rejects an unknown key, keep the content in your branch and say so in your reply (do not drop it).

1. ONE learning objective only, high level: `objectives` = exactly 1 item ("To understand how ...", "To explain why ...").
2. Success criteria: up to 3, `successCriteria` = All / Most / Some, each a concrete, checkable step towards the objective,
   never a restatement of it (the objective is the destination, the criteria are the evidence).
3. First screen = a "ponder" hook for pupils who log on early: `hook` = {"type":"ponder","text":"ONE open, thought-provoking
   question pupils can brainstorm on before the lesson starts", "options"? , "a"?}. Every lesson has one.
4. Pictures: `pictures`: [{"find":"precise search phrase for a REAL photo or diagram of the topic (Wikimedia Commons)",
   "alt":"what it shows","for":"hook" | "teach:1" (teach slide number, 1-based) | "keywords"}]. 2 to 4 per lesson, directly
   relevant to the subject and topic (a real Viking longship, a cross-section of a leaf, a real river meander). NEVER people's
   faces or figures, never prophets or living beings drawn; objects, places, plants, animals as photos, maps, diagrams only.
   Prefer pictures of key vocabulary (one picture per key word where possible, `for:"keywords"`).
5. Diagrams: use the diagram / chart / numberline / fraction / sort blocks wherever a picture of the idea helps understanding.
6. Keywords: the full keyword list for the whole unit is shown once (topic keyword list); in each lesson keep `keywords`
   (3 to 6) with child-friendly definitions; the builder shows them in a slide corner where they are used.
7. Bismillah ONLY where relevant (Qur'an, Islamic Studies, Arabic, and the start-of-day register); remove "Bismillah." from
   starters in other subjects.
8. Islamic foundation: in topics where Islam speaks to the subject (creation and the natural world, the body, ethics, money,
   history of Muslim civilisation, etc.), START from the Islamic point as the foundation: `islamicLink`:
   {"text":"...", "at":"start"}. Where the topic is a theory that conflicts with Islamic belief (e.g. Darwinian evolution of
   humans), teach the specification factually and put the Islamic position at the END: {"at":"end"}. Cite only ayat you are
   certain of (surah:ayah); never invent hadith.
9. Polls, not cold calls: Microsoft Teams has native polls (Forms). Use `routines` "teams-poll" as much as is sensible
   (starter, hinge question mid-lesson, exit); avoid "cold-call". Poll questions must be short with 2 to 4 options, one correct
   answer, plausible wrong answers, and NOT too hard.
10. Modelling: guided `practice` item 1 is a full worked model the teacher goes through ("model": "the worked answer / for
    writing subjects a model paragraph with its structure labelled, e.g. Point, Evidence, Explain, Link"); `independent`
    item 1 is also gone through by the teacher first (add "model"). Item shape: {"q","a","mins","model"}.
11. Longer written answers online: set them in the portal's response box or a Forms long-answer question, with a sentence
    starter and the paragraph frame; say which in the item's "q".
12. Timing must be realistic: the `mins` across hook, starter, teach (approx 3 to 5 min a slide), practice, independent and exit
    must add up to no more than the lesson length (30 / 45 / 50 min), with 3 min slack.
13. Cross-curricular and SMSC: one accurate, specific connection each, not several; check it is true and clearly explained.
    Leave `crossCurricular` out rather than force a weak link.
14. Every resource a lesson needs (worksheet, workbook page, frame, printable) is named in `resources` precisely enough to be
    listed in a term resource list; worksheets are printable or usable on a drawing tablet.
