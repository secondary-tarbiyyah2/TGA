-- T36 (owner, 9 November 2026): a drawing tablet with a stylus is RECOMMENDED for every
-- pupil, so they can write on worksheets and the lesson PDF each day; a pupil without one
-- needs a PRINTER at home (REQUIRED). Website copy held in the database is brought into
-- line with src/content/seed.ts and content/policies/*.md:
--   * faq_entries: "What equipment do we need?" and "What is not included in the fees?".
--   * policy_links: Admissions (24), Fees (25), Online Safety (02), Live Lesson Protocols (03)
--     and Behaviour (07): the requirement line and the dateOfIssue version line. The
--     body-changed trigger stays on, so the PDFs are rebuilt on the next site deploy.
-- Each update matches the exact current wording and skips text already mentioning a stylus,
-- so text edited in the portal is never overwritten and running it again changes nothing.

-- ── FAQs ────────────────────────────────────────────────────────────────
update public.faq_entries
set answer = E'A computer or iPad with a webcam and headset, reliable internet and a quiet place to work, plus a way to write on worksheets.\n\n- A Windows or Mac laptop or desktop, or an iPad\n- Webcam, microphone and headset\n- A wired connection or good Wi-Fi\n- Microsoft Teams (free), and Safe Exam Browser for secure assessments\n- **Recommended:** a tablet with a stylus, so your child can write on worksheets and the lesson PDF each day. Any tablet that takes a stylus will do, or a basic graphics tablet that plugs into the laptop.\n- **Required if there is no tablet with a stylus:** a printer at home, to print the worksheets and the lesson PDF.\n\nWe check your setup with you during induction week.'
where question = 'What equipment do we need?'
  and answer = E'A computer or iPad with a webcam and headset, reliable internet and a quiet place to work.\n\n- A Windows or Mac laptop or desktop, or an iPad\n- Webcam, microphone and headset\n- A wired connection or good Wi-Fi\n- Microsoft Teams (free), and Safe Exam Browser for secure assessments\n\nWe check your setup with you during induction week.';

-- Edited in the portal since: add the two lines as a paragraph at the end instead.
update public.faq_entries
set answer = answer || E'\n\n**Recommended:** a tablet with a stylus, so your child can write on worksheets and the lesson PDF each day (any tablet that takes a stylus, or a basic graphics tablet that plugs into the laptop). **Required if there is no tablet with a stylus:** a printer at home.'
where question = 'What equipment do we need?'
  and answer not like '%stylus%';

update public.faq_entries
set answer = replace(answer, '- Your own device and internet connection',
  '- Your own equipment at home: a device, internet connection, and a tablet with a stylus or a printer')
where question = 'What is not included in the fees?'
  and answer like '%- Your own device and internet connection%'
  and answer not like '%stylus%';

-- ── Policies ────────────────────────────────────────────────────────────
-- 24-admissions.md
update public.policy_links
set body_md = replace(body_md, $t$- a quiet, suitable space for study;
$t$, $t$- a quiet, suitable space for study;
- a way for the pupil to write on worksheets and the lesson PDF each day: a tablet with a stylus is recommended for every pupil (any tablet that takes a stylus, or a basic graphics tablet that plugs into the laptop), and where the pupil does not have one, a printer at home is required;
$t$),
    meta = case when meta->>'dateOfIssue' = $t$1 September 2026 (version 1.1, updated 28 October 2026 for the January 2027 launch)$t$
                then jsonb_set(meta, '{dateOfIssue}', to_jsonb($t$1 September 2026 (version 1.2, updated 9 November 2026: a tablet with a stylus is recommended for every pupil, and a printer at home is required without one)$t$::text))
                else meta end
where position($t$- a quiet, suitable space for study;
$t$ in body_md) > 0
  and body_md not like '%stylus%';

-- 25-fees.md
update public.policy_links
set body_md = replace(body_md, $t$Families provide a suitable device, reliable internet and a quiet study space, to the published minimum specification.$t$, $t$Families provide a suitable device, reliable internet, a quiet study space and a way to write on worksheets and the lesson PDF (a tablet with a stylus is recommended; without one, a printer at home is required), to the published minimum specification.$t$),
    meta = case when meta->>'dateOfIssue' = $t$1 September 2026 (version 1.2, updated 28 October 2026 for the January 2027 launch)$t$
                then jsonb_set(meta, '{dateOfIssue}', to_jsonb($t$1 September 2026 (version 1.3, updated 9 November 2026: a tablet with a stylus is recommended for every pupil, and a printer at home is required without one)$t$::text))
                else meta end
where position($t$Families provide a suitable device, reliable internet and a quiet study space, to the published minimum specification.$t$ in body_md) > 0
  and body_md not like '%stylus%';

-- 02-online-safety-and-acceptable-use.md
update public.policy_links
set body_md = replace(body_md, $t$- providing a suitable device, a reliable connection and a quiet, appropriate study space;$t$, $t$- providing a suitable device, a reliable connection and a quiet, appropriate study space, with a tablet with a stylus (recommended) or, without one, a printer at home (required) for worksheets and the lesson PDF;$t$),
    meta = case when meta->>'dateOfIssue' = $t$1 September 2026 (version 1.1, updated 28 October 2026 for the January 2027 launch)$t$
                then jsonb_set(meta, '{dateOfIssue}', to_jsonb($t$1 September 2026 (version 1.2, updated 9 November 2026: a tablet with a stylus is recommended for every pupil, and a printer at home is required without one)$t$::text))
                else meta end
where position($t$- providing a suitable device, a reliable connection and a quiet, appropriate study space;$t$ in body_md) > 0
  and body_md not like '%stylus%';

-- 03-live-lesson-protocols.md
update public.policy_links
set body_md = replace(body_md, $t$- Have books, stationery, headphones and a charged device ready.$t$, $t$- Have books, stationery, headphones and a charged device ready, with the day's worksheets and lesson PDF open on a tablet with a stylus or printed out.$t$),
    meta = case when meta->>'dateOfIssue' = $t$1 September 2026 (version 1.1, updated 28 October 2026 for the January 2027 launch)$t$
                then jsonb_set(meta, '{dateOfIssue}', to_jsonb($t$1 September 2026 (version 1.2, updated 9 November 2026: a tablet with a stylus is recommended for every pupil, and a printer at home is required without one)$t$::text))
                else meta end
where position($t$- Have books, stationery, headphones and a charged device ready.$t$ in body_md) > 0
  and body_md not like '%stylus%';

-- 07-behaviour-and-online-conduct.md
update public.policy_links
set body_md = replace(body_md, $t$| Parents | Provide a suitable study space and device; $t$, $t$| Parents | Provide a suitable study space and device, and a tablet with a stylus (recommended) or a printer at home (required without one) for worksheets and the lesson PDF; $t$),
    meta = case when meta->>'dateOfIssue' = $t$1 September 2026 (version 1.1, updated 28 October 2026 for the January 2027 launch)$t$
                then jsonb_set(meta, '{dateOfIssue}', to_jsonb($t$1 September 2026 (version 1.2, updated 9 November 2026: a tablet with a stylus is recommended for every pupil, and a printer at home is required without one)$t$::text))
                else meta end
where position($t$| Parents | Provide a suitable study space and device; $t$ in body_md) > 0
  and body_md not like '%stylus%';

