-- 0195: the Tarbiyyah Compass gets the Academy's own six values (owner,
-- 10 November 2026: "we want primary, secondary and Al-Banaat to differ";
-- "don't structure it so each first letter spells a word").
--
-- Old values (shared with the other Tarbiyyah schools): Resilience, Eeman,
-- Contentment, Integrity, Progress, Excellence.
-- New values, in three strands of two, one per half term:
--   Faith      Ikhlas (Sincerity, Spring 1), Shukr (Gratitude, Summer 2)
--   Knowledge  Ilm (Love of learning, Autumn 2), Itqan (Care and mastery, Spring 2)
--   Character  Adab (Good manners, Autumn 1), Amanah (Trustworthiness, Summer 1)
-- Source of truth in code: src/content/compass.ts and
-- content/policies/23-tarbiyyah-compass-character-framework.md.
--
-- Live copies updated here:
--   * policy 23: whole text (same as the markdown) and its header fields;
--   * policies 07 and 20: the sentences that named the old values;
--   * faq_entries: any answer naming the old values;
--   * about_content.recipe_items: emptied (the About page now takes the values
--     from code, so the website, reports and policy always agree).
-- The body-changed trigger is off for the policy updates so families are not
-- asked to re-sign for this; body_updated_at is set so the PDFs rebuild.
-- Idempotent.

alter table public.policy_links disable trigger policy_links_body_changed;

update public.policy_links
set body_md = $pol23$## 1. Purpose

Tarbiyyah means nurturing of the heart, the mind and the character. The Tarbiyyah Compass is the Academy's own set of six values that guide that nurturing. Like a compass, they help a pupil find the right way wherever they are in the world. The values are grouped in three strands, faith, knowledge and character, with two values in each, and each value is the focus of one half term. This framework sets out what each value means, what it looks like online, and how staff teach, model and recognise it.

## 2. The Tarbiyyah Compass Values

### Faith: who we do it for

| Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- |
| Ikhlas | Sincerity: doing what is right for the sake of Allah, whether or not anyone is watching | Brings a good intention to learning; behaves the same with camera on or off; prays on time | Spring 1 |
| Shukr | Gratitude: noticing our blessings and thanking Allah and the people around us | Thanks teachers and family; is glad of others' success; uses screen time and devices wisely | Summer 2 |

### Knowledge: how we learn

| Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- |
| Ilm | Love of learning: curiosity, good questions and the effort to really understand | Asks questions; reads beyond the lesson; acts on feedback | Autumn 2 |
| Itqan | Care and mastery: doing each piece of work carefully and completely, and keeping going when it is hard | Finishes and checks work; takes care with presentation; perseveres with patience (sabr) | Spring 2 |

### Character: how we treat others

| Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- |
| Adab | Good manners: respect and kindness in how we speak, listen and behave, online and at home | Greets with salam; follows microphone and chat etiquette; speaks kindly to teachers and classmates | Autumn 1 |
| Amanah | Trustworthiness: being honest and reliable, and looking after what we are trusted with | Does their own work; tells the truth; keeps passwords and devices safe; keeps promises | Summer 1 |

> **Why "online" matters**
>
> In an online school, much of a pupil's conduct happens without an adult in the room. Ikhlas and amanah, doing right because Allah sees us and keeping the trust others place in us, are therefore not abstract ideas but the daily foundation of how our pupils learn.

## 3. How the Values are Taught

- **Assemblies:** each half term focuses on one Tarbiyyah Compass value, with Qur'anic verses, hadith and stories from the seerah and from inspiring Muslims past and present.
- **Form time:** short discussions and reflection prompts linked to the value of the half term.
- **Curriculum:** subject leads identify where their subject develops each value, for example itqan in problem-solving in Mathematics and amanah in honest scientific method.
- **Staff modelling:** every member of staff models the values in their conduct and communication.

## 4. How the Values are Recognised

- Merits (M1–M3) are linked to specific values, as set out in the Behaviour and Online Conduct Policy.
- Each half term, a "Compass Star" is recognised in each class for the value of the half term.
- Termly reports include a short comment on character and values.
- Families are invited to share examples of their child living the values at home.

## 5. Measuring Impact

Pupil and parent surveys, merit data and pastoral records are reviewed each term to see how well the values are being lived and where more support is needed.

## 6. Review

This framework is reviewed annually by the Headteacher with staff, pupils and parents.$pol23$,
    meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
      'dateOfIssue', '1 September 2026 (version 2.0, updated 10 November 2026: the Academy''s own six values in three strands replace the values shared with the other Tarbiyyah schools)',
      'basis', 'Written for Tarbiyyah Global Academy. Its values are the Academy''s own and differ from those of Tarbiyyah Primary, Tarbiyyah Secondary School for Boys and Tarbiyyah Al-Banaat'
    ),
    body_updated_at = now()
where number = '23' and body_md is distinct from $pol23$## 1. Purpose

Tarbiyyah means nurturing of the heart, the mind and the character. The Tarbiyyah Compass is the Academy's own set of six values that guide that nurturing. Like a compass, they help a pupil find the right way wherever they are in the world. The values are grouped in three strands, faith, knowledge and character, with two values in each, and each value is the focus of one half term. This framework sets out what each value means, what it looks like online, and how staff teach, model and recognise it.

## 2. The Tarbiyyah Compass Values

### Faith: who we do it for

| Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- |
| Ikhlas | Sincerity: doing what is right for the sake of Allah, whether or not anyone is watching | Brings a good intention to learning; behaves the same with camera on or off; prays on time | Spring 1 |
| Shukr | Gratitude: noticing our blessings and thanking Allah and the people around us | Thanks teachers and family; is glad of others' success; uses screen time and devices wisely | Summer 2 |

### Knowledge: how we learn

| Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- |
| Ilm | Love of learning: curiosity, good questions and the effort to really understand | Asks questions; reads beyond the lesson; acts on feedback | Autumn 2 |
| Itqan | Care and mastery: doing each piece of work carefully and completely, and keeping going when it is hard | Finishes and checks work; takes care with presentation; perseveres with patience (sabr) | Spring 2 |

### Character: how we treat others

| Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- |
| Adab | Good manners: respect and kindness in how we speak, listen and behave, online and at home | Greets with salam; follows microphone and chat etiquette; speaks kindly to teachers and classmates | Autumn 1 |
| Amanah | Trustworthiness: being honest and reliable, and looking after what we are trusted with | Does their own work; tells the truth; keeps passwords and devices safe; keeps promises | Summer 1 |

> **Why "online" matters**
>
> In an online school, much of a pupil's conduct happens without an adult in the room. Ikhlas and amanah, doing right because Allah sees us and keeping the trust others place in us, are therefore not abstract ideas but the daily foundation of how our pupils learn.

## 3. How the Values are Taught

- **Assemblies:** each half term focuses on one Tarbiyyah Compass value, with Qur'anic verses, hadith and stories from the seerah and from inspiring Muslims past and present.
- **Form time:** short discussions and reflection prompts linked to the value of the half term.
- **Curriculum:** subject leads identify where their subject develops each value, for example itqan in problem-solving in Mathematics and amanah in honest scientific method.
- **Staff modelling:** every member of staff models the values in their conduct and communication.

## 4. How the Values are Recognised

- Merits (M1–M3) are linked to specific values, as set out in the Behaviour and Online Conduct Policy.
- Each half term, a "Compass Star" is recognised in each class for the value of the half term.
- Termly reports include a short comment on character and values.
- Families are invited to share examples of their child living the values at home.

## 5. Measuring Impact

Pupil and parent surveys, merit data and pastoral records are reviewed each term to see how well the values are being lived and where more support is needed.

## 6. Review

This framework is reviewed annually by the Headteacher with staff, pupils and parents.$pol23$;

update public.policy_links
set body_md = replace(replace(replace(body_md,
      'in our Tarbiyyah Compass values — Resilience, Eeman, Contentment, Integrity, Progress and Excellence — and are applied',
      'in our Tarbiyyah Compass values (Ikhlas, Shukr, Ilm, Itqan, Adab and Amanah) and are applied'),
      'in our Tarbiyyah Compass values - Resilience, Eeman, Contentment, Integrity, Progress and Excellence - and are applied',
      'in our Tarbiyyah Compass values (Ikhlas, Shukr, Ilm, Itqan, Adab and Amanah) and are applied'),
      'Integrity is one of our Tarbiyyah Compass values.',
      'Amanah (trustworthiness) is one of our Tarbiyyah Compass values.'),
    body_updated_at = now()
where number in ('07', '20')
  and (body_md like '%Resilience, Eeman, Contentment%' or body_md like '%Integrity is one of our Tarbiyyah Compass values.%');

alter table public.policy_links enable trigger policy_links_body_changed;

update public.faq_entries
set answer = replace(replace(answer,
      'Resilience, Eeman, Contentment, Integrity, Progress and Excellence',
      'Ikhlas, Shukr, Ilm, Itqan, Adab and Amanah'),
      'Resilience, Eeman, Contentment, Integrity, Progress, Excellence',
      'Ikhlas, Shukr, Ilm, Itqan, Adab, Amanah')
where answer like '%Resilience, Eeman, Contentment%';

update public.about_content
set recipe_items = '[]'::jsonb
where recipe_items <> '[]'::jsonb;
