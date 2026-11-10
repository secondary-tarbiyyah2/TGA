-- 0197: the Tarbiyyah Compass values spell IHSAN (owner, 10 November 2026:
-- "I need an acronym for the values"). Replaces 0195's six values.
--   I Ilm (love of learning, Autumn 2)     H Honesty (sidq and amanah, Summer 1)
--   S Sabr and shukr (Spring 2)            A Adab (good manners, Autumn 1)
--   N Niyyah (sincere intention, Spring 1) Summer 2: Ihsan, all five together
-- Source in code: src/content/compass.ts and policy 23's markdown.
-- Updates the live text of policies 23, 07 and 20 and any FAQ naming the 0195
-- values. Trigger off so nobody is asked to re-sign. Idempotent.

alter table public.policy_links disable trigger policy_links_body_changed;

update public.policy_links
set body_md = $pol23$## 1. Purpose

Tarbiyyah means nurturing of the heart, the mind and the character. The Tarbiyyah Compass is the Academy's own set of values that guide that nurturing. Like a compass, they help a pupil find the right way wherever they are in the world. The five values spell **IHSAN**: worshipping Allah as though you see Him. Each value is the focus of one half term, and the year ends with Ihsan itself, all five together. This framework sets out what each value means, what it looks like online, and how staff teach, model and recognise it.

## 2. The IHSAN Values

| Letter | Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- | --- |
| I | Ilm | Love of learning: curiosity, good questions and the effort to really understand | Asks questions; reads beyond the lesson; acts on feedback | Autumn 2 |
| H | Honesty | Sidq and amanah: telling the truth, doing your own work and keeping the trust others place in you | Does their own work; tells the truth; keeps passwords and devices safe; keeps promises | Summer 1 |
| S | Sabr and shukr | Patience and gratitude: keeping going when things are hard, and thanking Allah and others when they are easy | Perseveres with hard work; manages technical problems calmly; thanks teachers and family; uses screen time wisely | Spring 2 |
| A | Adab | Good manners: respect and kindness in how we speak, listen and behave, online and at home | Greets with salam; follows microphone and chat etiquette; speaks kindly to teachers and classmates | Autumn 1 |
| N | Niyyah | Sincere intention: doing what is right for the sake of Allah, whether or not anyone is watching | Brings a good intention to learning; behaves the same with camera on or off; prays on time | Spring 1 |

**Summer 2: Ihsan.** The final half term brings the five together: doing everything as well as we can, because Allah sees us.

> **Why "online" matters**
>
> In an online school, much of a pupil's conduct happens without an adult in the room. Niyyah and honesty, doing right because Allah sees us and keeping the trust others place in us, are therefore not abstract ideas but the daily foundation of how our pupils learn, and the road to ihsan.

## 3. How the Values are Taught

- **Assemblies:** each half term focuses on one Tarbiyyah Compass value, with Qur'anic verses, hadith and stories from the seerah and from inspiring Muslims past and present.
- **Form time:** short discussions and reflection prompts linked to the value of the half term.
- **Curriculum:** subject leads identify where their subject develops each value, for example sabr in problem-solving in Mathematics and honesty in scientific method.
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
      'dateOfIssue', '1 September 2026 (version 2.1, updated 10 November 2026: the Academy''s own values, which spell IHSAN, replace the values shared with the other Tarbiyyah schools)'
    ),
    body_updated_at = now()
where number = '23' and body_md is distinct from $pol23$## 1. Purpose

Tarbiyyah means nurturing of the heart, the mind and the character. The Tarbiyyah Compass is the Academy's own set of values that guide that nurturing. Like a compass, they help a pupil find the right way wherever they are in the world. The five values spell **IHSAN**: worshipping Allah as though you see Him. Each value is the focus of one half term, and the year ends with Ihsan itself, all five together. This framework sets out what each value means, what it looks like online, and how staff teach, model and recognise it.

## 2. The IHSAN Values

| Letter | Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- | --- |
| I | Ilm | Love of learning: curiosity, good questions and the effort to really understand | Asks questions; reads beyond the lesson; acts on feedback | Autumn 2 |
| H | Honesty | Sidq and amanah: telling the truth, doing your own work and keeping the trust others place in you | Does their own work; tells the truth; keeps passwords and devices safe; keeps promises | Summer 1 |
| S | Sabr and shukr | Patience and gratitude: keeping going when things are hard, and thanking Allah and others when they are easy | Perseveres with hard work; manages technical problems calmly; thanks teachers and family; uses screen time wisely | Spring 2 |
| A | Adab | Good manners: respect and kindness in how we speak, listen and behave, online and at home | Greets with salam; follows microphone and chat etiquette; speaks kindly to teachers and classmates | Autumn 1 |
| N | Niyyah | Sincere intention: doing what is right for the sake of Allah, whether or not anyone is watching | Brings a good intention to learning; behaves the same with camera on or off; prays on time | Spring 1 |

**Summer 2: Ihsan.** The final half term brings the five together: doing everything as well as we can, because Allah sees us.

> **Why "online" matters**
>
> In an online school, much of a pupil's conduct happens without an adult in the room. Niyyah and honesty, doing right because Allah sees us and keeping the trust others place in us, are therefore not abstract ideas but the daily foundation of how our pupils learn, and the road to ihsan.

## 3. How the Values are Taught

- **Assemblies:** each half term focuses on one Tarbiyyah Compass value, with Qur'anic verses, hadith and stories from the seerah and from inspiring Muslims past and present.
- **Form time:** short discussions and reflection prompts linked to the value of the half term.
- **Curriculum:** subject leads identify where their subject develops each value, for example sabr in problem-solving in Mathematics and honesty in scientific method.
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
set body_md = replace(replace(replace(replace(body_md,
      'in our Tarbiyyah Compass values (Ikhlas, Shukr, Ilm, Itqan, Adab and Amanah) and are applied',
      'in our Tarbiyyah Compass values, which spell IHSAN (Ilm, Honesty, Sabr and shukr, Adab, Niyyah), and are applied'),
      'in our Tarbiyyah Compass values — Resilience, Eeman, Contentment, Integrity, Progress and Excellence — and are applied',
      'in our Tarbiyyah Compass values, which spell IHSAN (Ilm, Honesty, Sabr and shukr, Adab, Niyyah), and are applied'),
      'Amanah (trustworthiness) is one of our Tarbiyyah Compass values.',
      'Honesty (sidq and amanah) is one of our Tarbiyyah Compass values.'),
      'Integrity is one of our Tarbiyyah Compass values.',
      'Honesty (sidq and amanah) is one of our Tarbiyyah Compass values.'),
    body_updated_at = now()
where number in ('07', '20')
  and (body_md like '%(Ikhlas, Shukr, Ilm, Itqan, Adab and Amanah)%' or body_md like '%Resilience, Eeman, Contentment%'
       or body_md like '%Amanah (trustworthiness) is one of%' or body_md like '%Integrity is one of our Tarbiyyah Compass values.%');

alter table public.policy_links enable trigger policy_links_body_changed;

update public.faq_entries
set answer = replace(replace(answer,
      'Ikhlas, Shukr, Ilm, Itqan, Adab and Amanah', 'Ilm, Honesty, Sabr and shukr, Adab and Niyyah (IHSAN)'),
      'Resilience, Eeman, Contentment, Integrity, Progress and Excellence', 'Ilm, Honesty, Sabr and shukr, Adab and Niyyah (IHSAN)')
where answer like '%Ikhlas, Shukr, Ilm%' or answer like '%Resilience, Eeman, Contentment%';
