# Brief: turn a curriculum pack markdown file into a Claude Doc (tabbed)

You have the Claude Docs tools (mcp__Claude_Docs__*). First call mcp__Claude_Docs__guide with items ["topic.index", "topic.tabs"]
and follow its rules exactly.

Input: one markdown file (path in your task). It has several H1 sections: the first is "# Year N: overview", then one H1 per subject.

Create ONE new doc titled "TGA Year N Curriculum Pack" (N from the file), in ONE birth `batch`:
- main tab "Overview" (order "a0") = the overview section; one further tab per subject H1, named exactly as the H1 text,
  orders "a1", "a2", ... in file order. Set the doc's tabs to display on the left like the Year 1 pack
  (if the guide offers a display/tabsLocation setting, use "left").
- In each tab, the H1 heading line itself is dropped (the tab name carries it); keep every other line of that section
  VERBATIM, including tables, bullets and Arabic script. Do not rewrite, shorten, summarise or reorder anything.
- Under the Overview tab's first lines, add one line: "Part of the TGA Curriculum Plan 2027: https://claude.ai/artifact/2WAihVvg7Jg9LWz2d99ha1. Draft for Headteacher review; items marked TO CONFIRM or CHECK IN MAESTRO are open."
If one batch is too large, create the doc with the Overview first, then add each subject tab with its own batch (topic.tabs ex.1).
After creating, read the doc's tab list once to confirm every tab exists and has content.

Do NOT open/publish anything else, do not edit any other doc, do not touch git.
Reply with ONLY: the doc's claude.ai link, and the list of tab names, plus any problem in one line.
