-- School features: switches the Headteacher turns on or off (Settings, School features).
-- Owner, 11 November 2026 (docs/owner-briefs/2026-11-11-feedback-3.md): "allow this to be
-- turned on or off by headteacher ... turn off the function until it's fully developed,
-- because we are opening".
--
-- One row per switch. Everyone signed in can read them (the portal hides switched-off parts
-- for every role); only the Headteacher and Admin can change them. Switching something off
-- hides it; no data is deleted.
--
--   revision_packs          off  Revision packs, pupil revision and revision results.
--                                 Also stops the automatic draft packs (0184's trigger).
--   subject_lesson_editing  on   Only teachers of a subject (and the Headteacher) edit its
--                                 lessons. Off: every teacher edits every lesson; enforced in
--                                 curriculum_can_edit_lesson (0191), which the save uses.
--   ai_helpers              on   AI drafts (report comments, notes, revision questions,
--                                 message sorting). Also refused in the ai-assist function.
--   house_points            on   House points and Star of the Week pages and leaderboards.
--   guide_journeys          on   "A day in the life" walk-throughs in the Portal guide.
--   lesson_feedback         on   Staff notes on lessons and the Headteacher's queue of them.
--
-- Idempotent: safe to run again.

create table if not exists public.school_features (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('revision_packs', 'subject_lesson_editing', 'ai_helpers', 'house_points', 'guide_journeys', 'lesson_feedback')),
  enabled boolean not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.school_features (key, enabled) values
  ('revision_packs', false),
  ('subject_lesson_editing', true),
  ('ai_helpers', true),
  ('house_points', true),
  ('guide_journeys', true),
  ('lesson_feedback', true)
on conflict (key) do nothing;

alter table public.school_features enable row level security;

drop policy if exists "school_features: signed in read" on public.school_features;
create policy "school_features: signed in read"
  on public.school_features for select
  to authenticated
  using (true);

drop policy if exists "school_features: head and admin change" on public.school_features;
create policy "school_features: head and admin change"
  on public.school_features for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']::public.learn_role[]))
  with check (public.current_has_role(array['head_teacher', 'admin']::public.learn_role[]));
-- No insert or delete policy: the rows above are the switches.

revoke all on public.school_features from anon;

-- Who changed it and when, stamped by the database. A switch cannot be renamed.
create or replace function public.school_features_stamp()
returns trigger
language plpgsql
as $$
begin
  if new.key is distinct from old.key then
    raise exception 'a switch cannot be renamed' using errcode = '42501';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists school_features_stamp_trg on public.school_features;
create trigger school_features_stamp_trg
  before update on public.school_features
  for each row execute function public.school_features_stamp();

drop trigger if exists audit_school_features on public.school_features;
create trigger audit_school_features
  after update on public.school_features
  for each row execute function public.audit_row_change();

-- Is a switch on? Used by policies and functions. A missing row reads as its default.
create or replace function public.school_feature_on(p_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select f.enabled from public.school_features f where f.key = p_key),
    p_key <> 'revision_packs'
  );
$$;

revoke all on function public.school_feature_on(text) from public, anon;
grant execute on function public.school_feature_on(text) to authenticated, service_role;

-- ── Revision packs off: no automatic draft packs (replaces 0184's) ─────────
create or replace function public.revision_on_lesson_signoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text;
  v_no integer;
  v_unit text;
begin
  -- Revision packs switched off by the Headteacher (Settings, School features): no draft packs.
  if not public.school_feature_on('revision_packs') then
    return new;
  end if;
  if new.scope <> 'lesson' or new.status <> 'approved' or new.ref !~ '^[a-z0-9]+/[0-9]+$' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;
  end if;
  begin
    v_year := split_part(new.ref, '/', 1);
    v_no := split_part(new.ref, '/', 2)::int;
    select coalesce(l.unit, 'Lessons') into v_unit from public.curriculum_lessons l
     where l.subject_slug = new.subject_slug and l.year = v_year and l.lesson_no = v_no;
    if v_unit is null then
      return new;
    end if;
    if exists (
      select 1 from public.curriculum_lessons l
       where l.subject_slug = new.subject_slug and l.year = v_year and coalesce(l.unit, 'Lessons') = v_unit
         and not exists (
           select 1 from public.curriculum_signoffs s
            where s.subject_slug = l.subject_slug and s.scope = 'lesson' and s.ref = l.year || '/' || l.lesson_no
              and (s.status = 'approved' or s.id = new.id)
         )
    ) then
      return new;
    end if;
    perform public.revision_make_draft_pack(new.subject_slug, v_year, v_unit);
  exception when others then
    raise warning 'revision draft pack for %/% not made: %', new.subject_slug, new.ref, sqlerrm;
  end;
  return new;
end;
$$;

-- ── Only subject teachers edit lessons, unless switched off (replaces 0191's) ──
create or replace function public.curriculum_can_edit_lesson(p_lesson uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  mine text[];
  l record;
begin
  if public.current_has_role(array['head_teacher', 'admin']) then
    return true;
  end if;
  if not public.current_has_role(array['teacher']) then
    return false;
  end if;
  -- "Only subject teachers can edit lessons" switched off: every teacher edits every lesson.
  if not public.school_feature_on('subject_lesson_editing') then
    return true;
  end if;
  mine := public.curriculum_my_subject_keys();
  if coalesce(array_length(mine, 1), 0) = 0 then
    return true; -- no subject recorded for this teacher: every lesson, as before
  end if;
  select subject, subject_slug into l from public.curriculum_lessons where id = p_lesson;
  if not found then
    return false;
  end if;
  return public.curriculum_subject_matches(mine, l.subject, l.subject_slug);
end;
$$;
