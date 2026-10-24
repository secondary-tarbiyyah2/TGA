-- The eligibility quiz used a crescent ("moon") icon on several options; the
-- brand avoids crescent motifs (DESIGN.md), so published and draft quiz
-- versions get the new, varied icon set. Copy is left as the admin wrote it.
-- Idempotent.
with mapping(qkey, oval, icon) as (values
  ('arabic_level', 'none', 'sprout'), ('arabic_level', 'beginner', 'letters'), ('arabic_level', 'conversational', 'speech'), ('arabic_level', 'fluent', 'book'),
  ('quran_level', 'none', 'sprout'), ('quran_level', 'reading', 'letters'), ('quran_level', 'reading-fluent', 'pages'), ('quran_level', 'hifz-in-progress', 'bookmark'),
  ('hifz_role', 'central', 'target'), ('hifz_role', 'alongside', 'scales'), ('hifz_role', 'not-yet', 'graduation-cap'),
  ('parent_available', 'yes', 'user-check'), ('parent_available', 'sometimes', 'users'), ('parent_available', 'no', 'user-away')
), rebuilt as (
  select v.id,
    jsonb_set(v.content, '{questions}', (
      select jsonb_agg(
        case when q ? 'options' then jsonb_set(q, '{options}', (
          select coalesce(jsonb_agg(
            case when m.icon is not null then o || jsonb_build_object('icon', m.icon)
                 when o->>'icon' = 'moon' then o || jsonb_build_object('icon', 'pages')
                 else o end order by ord), '[]'::jsonb)
          from jsonb_array_elements(q->'options') with ordinality as t(o, ord)
          left join mapping m on m.qkey = q->>'key' and m.oval = o->>'value'
        )) else q end order by qord)
      from jsonb_array_elements(v.content->'questions') with ordinality as s(q, qord)
    )) as content
  from public.quiz_config_versions v
  where v.content->'questions' is not null and v.content::text like '%"moon"%'
)
update public.quiz_config_versions v set content = r.content from rebuilt r where r.id = v.id;
