-- Curriculum editor (owner request, November 2026): staff edit the curriculum
-- in the portal, and their changes flow to the slides, lesson plans and the
-- syllabus pack with no downloading or re-uploading.
--
-- 1. curriculum_units: each subject's units per year group and half term (the
--    long-term plan), with a week-by-week medium-term plan per unit. Seeded
--    from content/syllabus/** by scripts/curriculum/sync.mjs (workflow "Sync
--    curriculum from the portal"), which also copies portal edits back into
--    content/syllabus/**.json so the existing "Build syllabus pack" workflow
--    rebuilds the pack. Once seeded, the database is the source of truth:
--    the sync only brings in a repo change when nobody has edited that part
--    of the curriculum in the portal since the last sync.
-- 2. curriculum_lessons.content: the lesson itself (the lesson object from
--    content/lessons/<subject>/<year>.json, see content/lessons/README.md),
--    edited in the Lesson library through curriculum_save_lesson_content.
--    The sync copies it into content/lessons/**.json and "Build lesson decks"
--    rebuilds the slides, lesson plan and PDFs. The upload-your-own-deck
--    route (curriculum_replace_deck) keeps working: an uploaded deck is never
--    replaced by a rebuilt one unless a teacher asks for that in the editor.
-- 3. History: every change to a unit and to a lesson's content is kept
--    (curriculum_unit_versions, curriculum_lesson_content_versions) so staff
--    can see who changed what and restore it, besides the audit log.
-- 4. curriculum_sync_state / curriculum_sync_runs: the sync's bookkeeping
--    (service role only) and a run log staff can read ("last sent at …").
--
-- Idempotent: safe to run again.

-- ── 1. Units (long-term and medium-term plans) ──────────────────────────────
create table if not exists public.curriculum_units (
  id uuid primary key default gen_random_uuid(),
  subject_slug text not null check (subject_slug ~ '^[a-z0-9-]{2,60}$'),
  subject text not null check (char_length(subject) between 1 and 80),
  -- 'syllabus': content/syllabus/ks1-3/<slug>.json yearMap.<year>[]
  -- 'spec'    : content/syllabus/ks4/<slug>.json units[] (Years 10 and 11)
  kind text not null check (kind in ('syllabus', 'spec')),
  year text not null check (year ~ '^(reception|y([1-9]|10|11))$'),
  half_term text check (half_term is null or half_term in ('autumn1', 'autumn2', 'spring1', 'spring2', 'summer1', 'summer2')),
  -- KS4 spec units: the board-recommended term as written ("Autumn", "Spring to Summer").
  term text check (term is null or char_length(term) <= 60),
  position integer not null default 0,
  ref text check (ref is null or char_length(ref) <= 40),
  paper text check (paper is null or char_length(paper) <= 120),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  -- KS1-3: what the unit covers. KS4: the specification points.
  focus text[] not null default '{}',
  skills text[] not null default '{}',
  key_terms text[] not null default '{}',
  assess text,
  prereq text,
  leads_to text,
  -- Medium-term plan: [{ "week": 1, "lessons": ["…"], "vocabulary": ["…"], "home": "…" }]
  weeks jsonb not null default '[]'::jsonb check (jsonb_typeof(weeks) = 'array'),
  resources text,
  founding_year text,
  -- Keys from the repo JSON this table has no column for (kept so the export loses nothing),
  -- and the order the keys were in, so an exported file only changes where someone edited it.
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  key_order text[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists curriculum_units_browse_idx on public.curriculum_units (year, subject_slug, position);
create index if not exists curriculum_units_scope_idx on public.curriculum_units (subject_slug, kind, year);

comment on table public.curriculum_units is 'Curriculum units (long-term plan) with their week-by-week plan. Source of truth once seeded; copied to content/syllabus by scripts/curriculum/sync.mjs.';

-- Every change keeps the previous state, so it can be seen and restored.
create table if not exists public.curriculum_unit_versions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  subject_slug text not null,
  year text not null,
  action text not null check (action in ('update', 'delete')),
  snapshot jsonb not null,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_by_name text,
  edited_at timestamptz not null default now()
);

create index if not exists curriculum_unit_versions_unit_idx on public.curriculum_unit_versions (unit_id, edited_at desc);
create index if not exists curriculum_unit_versions_year_idx on public.curriculum_unit_versions (subject_slug, year, edited_at desc);

-- Stamp who changed a unit. The sync (service role, no auth.uid()) sets updated_by_name itself.
create or replace function public.curriculum_units_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
  if auth.uid() is not null then
    select full_name into who from public.profiles where id = auth.uid();
    new.updated_by := auth.uid();
    new.updated_by_name := coalesce(who, 'A member of staff');
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists curriculum_units_stamp on public.curriculum_units;
create trigger curriculum_units_stamp
  before insert or update on public.curriculum_units
  for each row execute function public.curriculum_units_stamp();

create or replace function public.curriculum_units_keep_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Moving a unit up or down only changes its position: not worth a history entry.
    if (to_jsonb(new) - array['position', 'updated_at', 'updated_by', 'updated_by_name']) = (to_jsonb(old) - array['position', 'updated_at', 'updated_by', 'updated_by_name']) then
      return new;
    end if;
    insert into public.curriculum_unit_versions (unit_id, subject_slug, year, action, snapshot, edited_by, edited_by_name, edited_at)
    values (old.id, old.subject_slug, old.year, 'update', to_jsonb(old), old.updated_by, old.updated_by_name, old.updated_at);
    return new;
  end if;
  insert into public.curriculum_unit_versions (unit_id, subject_slug, year, action, snapshot, edited_by, edited_by_name, edited_at)
  values (old.id, old.subject_slug, old.year, 'delete', to_jsonb(old), old.updated_by, old.updated_by_name, old.updated_at);
  return old;
end;
$$;

drop trigger if exists curriculum_units_keep_history on public.curriculum_units;
create trigger curriculum_units_keep_history
  before update or delete on public.curriculum_units
  for each row execute function public.curriculum_units_keep_history();

drop trigger if exists audit_curriculum_units on public.curriculum_units;
create trigger audit_curriculum_units
  after insert or update or delete on public.curriculum_units
  for each row execute function public.audit_row_change();

alter table public.curriculum_units enable row level security;
alter table public.curriculum_unit_versions enable row level security;

-- All staff read; teachers, the Headteacher and admins edit (teachers are trusted staff).
drop policy if exists "curriculum_units: staff read" on public.curriculum_units;
create policy "curriculum_units: staff read"
  on public.curriculum_units for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));

drop policy if exists "curriculum_units: teachers insert" on public.curriculum_units;
create policy "curriculum_units: teachers insert"
  on public.curriculum_units for insert
  to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']));

drop policy if exists "curriculum_units: teachers update" on public.curriculum_units;
create policy "curriculum_units: teachers update"
  on public.curriculum_units for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']));

drop policy if exists "curriculum_units: teachers delete" on public.curriculum_units;
create policy "curriculum_units: teachers delete"
  on public.curriculum_units for delete
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']));

drop policy if exists "curriculum_unit_versions: staff read" on public.curriculum_unit_versions;
create policy "curriculum_unit_versions: staff read"
  on public.curriculum_unit_versions for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));
-- No insert/update/delete policies: history rows are written only by the trigger above.

-- Staff change only the fields the planner shows. extra and key_order (repo keys with no
-- column, and the repo's key order) are the sync's to write, so a client cannot corrupt the
-- export. Column grants only bite once the table-wide grants are taken away.
revoke insert, update on public.curriculum_units from anon, authenticated;
grant insert (subject_slug, subject, kind, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year)
  on public.curriculum_units to authenticated;
grant update (subject, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year)
  on public.curriculum_units to authenticated;

-- "Put it back": restore a removed unit exactly as it was (same id, with its extra and
-- key_order), once.
alter table public.curriculum_unit_versions add column if not exists restored_at timestamptz;

create or replace function public.curriculum_restore_unit(p_version uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.curriculum_unit_versions%rowtype;
  s public.curriculum_units%rowtype;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v from public.curriculum_unit_versions where id = p_version and action = 'delete' for update;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v.restored_at is not null or exists (select 1 from public.curriculum_units where id = v.unit_id) then
    raise exception 'already restored' using errcode = '23505';
  end if;
  s := jsonb_populate_record(null::public.curriculum_units, v.snapshot);
  insert into public.curriculum_units (id, subject_slug, subject, kind, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year, extra, key_order)
  values (s.id, s.subject_slug, s.subject, s.kind, s.year, s.half_term, s.term, s.position, s.ref, s.paper, s.title, coalesce(s.focus, '{}'), coalesce(s.skills, '{}'), coalesce(s.key_terms, '{}'), s.assess, s.prereq, s.leads_to,
          coalesce(s.weeks, '[]'), s.resources, s.founding_year, coalesce(s.extra, '{}'), coalesce(s.key_order, '{}'));
  update public.curriculum_unit_versions set restored_at = now() where id = v.id;
  return s.id;
end;
$$;

revoke all on function public.curriculum_restore_unit(uuid) from public, anon;
grant execute on function public.curriculum_restore_unit(uuid) to authenticated;

-- ── 2. Lesson content, edited in the browser ────────────────────────────────
-- custom_deck: a teacher uploaded their own slides (curriculum_replace_deck) or restored an
-- older version; rebuilt slides never replace them until a teacher asks in the editor.
-- rebuild_requested: rebuild this lesson's slides and plan on the next "Build lesson decks" run.
-- built_hash / plan_hash: the lesson content the current slides / plan were built from
-- (scripts/lessons/content-hash.mjs), so a change to the content rebuilds them.
do $$
declare
  had_custom boolean;
  had_source boolean;
begin
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'curriculum_lessons' and column_name = 'custom_deck') into had_custom;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'curriculum_lesson_versions' and column_name = 'source') into had_source;

  alter table public.curriculum_lessons
    add column if not exists content jsonb check (content is null or jsonb_typeof(content) = 'object'),
    add column if not exists content_updated_at timestamptz,
    add column if not exists content_updated_by uuid references public.profiles(id) on delete set null,
    add column if not exists content_updated_by_name text,
    add column if not exists custom_deck boolean not null default false,
    add column if not exists rebuild_requested boolean not null default false,
    add column if not exists built_hash text,
    add column if not exists plan_hash text;

  alter table public.curriculum_lesson_versions
    add column if not exists source text not null default 'generated' check (source in ('generated', 'uploaded'));

  -- One-off backfill, only when the columns are first added: until now every
  -- version after the first was a teacher's upload (or a restore of one).
  if not had_custom then
    update public.curriculum_lessons set custom_deck = true where version > 1;
  end if;
  if not had_source then
    update public.curriculum_lesson_versions set source = 'uploaded' where version > 1;
  end if;
end;
$$;

create table if not exists public.curriculum_lesson_content_versions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  content jsonb not null,
  note text check (note is null or char_length(note) <= 500),
  edited_by uuid references public.profiles(id) on delete set null,
  edited_by_name text,
  edited_at timestamptz not null default now(),
  replaced_at timestamptz not null default now()
);

create index if not exists curriculum_lesson_content_versions_idx on public.curriculum_lesson_content_versions (lesson_id, replaced_at desc);

alter table public.curriculum_lesson_content_versions enable row level security;

drop policy if exists "curriculum_lesson_content_versions: staff read" on public.curriculum_lesson_content_versions;
create policy "curriculum_lesson_content_versions: staff read"
  on public.curriculum_lesson_content_versions for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));

-- Save a lesson's content as the signed-in teacher. p_expected is the content_updated_at
-- the editor loaded; if someone else saved in between, the save is refused ('edited_elsewhere')
-- rather than silently overwriting their work. Returns the new content_updated_at.
create or replace function public.curriculum_save_lesson_content(p_lesson uuid, p_content jsonb, p_note text, p_rebuild_slides boolean, p_expected timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.curriculum_lessons%rowtype;
  who text;
  c jsonb;
  stamp timestamptz := now();
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'invalid content' using errcode = '22023';
  end if;
  if coalesce(btrim(p_content ->> 'title'), '') = '' or coalesce(btrim(p_content ->> 'unit'), '') = '' then
    raise exception 'title and unit are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_content -> 'objectives') is distinct from 'array' or jsonb_array_length(p_content -> 'objectives') < 1 then
    raise exception 'at least one objective is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_content -> 'teach') is distinct from 'array' or jsonb_array_length(p_content -> 'teach') not between 3 and 7 then
    raise exception 'a lesson needs 3 to 7 teaching slides' using errcode = '22023';
  end if;
  if octet_length(p_content::text) > 200000 then
    raise exception 'lesson too long' using errcode = '22023';
  end if;
  select * into l from public.curriculum_lessons where id = p_lesson for update;
  if not found then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;
  if p_expected is not null and l.content_updated_at is distinct from p_expected then
    raise exception 'edited_elsewhere' using errcode = '40001';
  end if;
  -- The lesson keeps its number: it is how the slides, plans and sign-offs find it.
  c := jsonb_set(p_content, '{n}', to_jsonb(l.lesson_no));
  if c = l.content and not coalesce(p_rebuild_slides, false) then
    return l.content_updated_at;
  end if;
  select full_name into who from public.profiles where id = auth.uid();
  if l.content is not null then
    insert into public.curriculum_lesson_content_versions (lesson_id, content, note, edited_by, edited_by_name, edited_at, replaced_at)
    values (l.id, l.content, nullif(btrim(p_note), ''), l.content_updated_by, l.content_updated_by_name, coalesce(l.content_updated_at, l.created_at), stamp);
  end if;
  update public.curriculum_lessons
     set content = c,
         title = btrim(c ->> 'title'),
         unit = btrim(c ->> 'unit'),
         objectives = c -> 'objectives',
         duration = case when jsonb_typeof(c -> 'duration') = 'number' then (c ->> 'duration')::numeric::integer else duration end,
         content_updated_at = stamp,
         content_updated_by = auth.uid(),
         content_updated_by_name = coalesce(who, 'A member of staff'),
         rebuild_requested = true,
         custom_deck = case when coalesce(p_rebuild_slides, false) then false else custom_deck end
   where id = l.id;
  return stamp;
end;
$$;

revoke all on function public.curriculum_save_lesson_content(uuid, jsonb, text, boolean, timestamptz) from public, anon;
grant execute on function public.curriculum_save_lesson_content(uuid, jsonb, text, boolean, timestamptz) to authenticated;

-- The audit log for curriculum_lessons: the same record as audit_row_change() (0003) but
-- without the lesson content itself (its history is curriculum_lesson_content_versions), and
-- nothing at all for an update that changes nothing, so a deck build does not copy every
-- lesson into the log.
create or replace function public.audit_curriculum_lesson_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'content' end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'content' end;
begin
  if tg_op = 'UPDATE' then
    if o = n and old.content is not distinct from new.content then
      return new;
    end if;
    n := n || jsonb_build_object('content_changed', old.content is distinct from new.content);
  end if;
  select email into v_email from public.profiles where id = v_actor;
  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (
    v_actor, v_email, tg_op, tg_table_name, coalesce(new.id, old.id)::text,
    case when tg_op = 'DELETE' then jsonb_build_object('old', o) when tg_op = 'INSERT' then jsonb_build_object('new', n) else jsonb_build_object('old', o, 'new', n) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_curriculum_lessons on public.curriculum_lessons;
create trigger audit_curriculum_lessons
  after insert or update or delete on public.curriculum_lessons
  for each row execute function public.audit_curriculum_lesson_change();

-- For "Build lesson decks" (service role): record a newly built deck, in one transaction.
-- Nothing is written (null is returned) if a teacher's own deck is in place or the lesson's
-- version moved since the build read it (an upload or restore meanwhile). A generated current
-- version may be re-rendered in place (p_new_version false, e.g. a design refresh); otherwise,
-- or when the current version is an uploaded deck, the build becomes a new version. A version
-- row marked 'uploaded' is never overwritten: a clash on the version number fails.
create or replace function public.curriculum_store_generated_deck(p_lesson uuid, p_expected_version integer, p_deck_path text, p_pdf_path text, p_new_version boolean, p_built_hash text, p_note text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.curriculum_lessons%rowtype;
  src text;
  v integer;
begin
  select * into l from public.curriculum_lessons where id = p_lesson for update;
  if not found or l.custom_deck or l.version <> p_expected_version then
    return null;
  end if;
  select source into src from public.curriculum_lesson_versions where lesson_id = l.id and version = l.version;
  if not p_new_version and coalesce(src, 'generated') = 'generated' then
    v := l.version;
    if src is null then
      insert into public.curriculum_lesson_versions (lesson_id, version, deck_path, pdf_path, note, source)
      values (l.id, v, p_deck_path, p_pdf_path, coalesce(p_note, 'Original'), 'generated');
    else
      update public.curriculum_lesson_versions set deck_path = p_deck_path, pdf_path = p_pdf_path
       where lesson_id = l.id and version = v and source = 'generated';
    end if;
  else
    v := l.version + 1;
    insert into public.curriculum_lesson_versions (lesson_id, version, deck_path, pdf_path, note, source)
    values (l.id, v, p_deck_path, p_pdf_path, p_note, 'generated');
  end if;
  update public.curriculum_lessons set deck_path = p_deck_path, pdf_path = p_pdf_path, version = v, built_hash = p_built_hash where id = l.id;
  return v;
end;
$$;

revoke all on function public.curriculum_store_generated_deck(uuid, integer, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.curriculum_store_generated_deck(uuid, integer, text, text, boolean, text, text) to service_role;

-- Uploading your own deck (0091) now also marks the lesson as using its own slides,
-- so a later rebuild from the lesson content never replaces them.
create or replace function public.curriculum_replace_deck(p_lesson uuid, p_deck_path text, p_pdf_path text, p_note text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.curriculum_lessons%rowtype;
  v integer;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into l from public.curriculum_lessons where id = p_lesson for update;
  if not found then
    raise exception 'lesson not found' using errcode = 'P0002';
  end if;
  if p_deck_path is null or p_deck_path not like (l.subject_slug || '/' || l.year || '/%') then
    raise exception 'invalid deck path' using errcode = '22023';
  end if;
  if p_pdf_path is not null and p_pdf_path not like (l.subject_slug || '/' || l.year || '/%') then
    raise exception 'invalid pdf path' using errcode = '22023';
  end if;
  v := l.version + 1;
  insert into public.curriculum_lesson_versions (lesson_id, version, deck_path, pdf_path, note, uploaded_by, source)
  values (l.id, v, p_deck_path, p_pdf_path, nullif(btrim(p_note), ''), auth.uid(), 'uploaded');
  update public.curriculum_lessons
     set deck_path = p_deck_path, pdf_path = p_pdf_path, version = v, edited_by = auth.uid(), edited_at = now(), custom_deck = true
   where id = l.id;
  return v;
end;
$$;

revoke all on function public.curriculum_replace_deck(uuid, text, text, text) from public, anon;
grant execute on function public.curriculum_replace_deck(uuid, text, text, text) to authenticated;

-- Restoring an earlier deck keeps it (custom_deck) until a teacher asks for slides built
-- from the lesson content again.
create or replace function public.curriculum_restore_version(p_version uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  old public.curriculum_lesson_versions%rowtype;
  cur_v integer;
  v integer;
begin
  if not public.current_has_role(array['head_teacher', 'admin', 'teacher']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into old from public.curriculum_lesson_versions where id = p_version;
  if not found then
    raise exception 'version not found' using errcode = 'P0002';
  end if;
  select version into cur_v from public.curriculum_lessons where id = old.lesson_id for update;
  v := cur_v + 1;
  insert into public.curriculum_lesson_versions (lesson_id, version, deck_path, pdf_path, note, uploaded_by, source)
  values (old.lesson_id, v, old.deck_path, old.pdf_path, 'Restored version ' || old.version, auth.uid(), old.source);
  update public.curriculum_lessons
     set deck_path = old.deck_path, pdf_path = old.pdf_path, version = v, edited_by = auth.uid(), edited_at = now(), custom_deck = true
   where id = old.lesson_id;
  return v;
end;
$$;

revoke all on function public.curriculum_restore_version(uuid) from public, anon;
grant execute on function public.curriculum_restore_version(uuid) to authenticated;

-- ── 3. Sync bookkeeping ─────────────────────────────────────────────────────
-- scope: 'syllabus:<slug>:<year>', 'spec:<slug>' or 'lesson:<slug>/<year>/<n>'.
-- hash: the content as it was when the repo and the portal last agreed.
create table if not exists public.curriculum_sync_state (
  scope text primary key check (char_length(scope) <= 200),
  hash text not null,
  synced_at timestamptz not null default now()
);

-- For unit parts: the agreed list unit by unit, [{ "id": "<curriculum_units.id>", "h": "<hash>" }],
-- so a portal edit to one unit and a repo edit to another are both kept.
alter table public.curriculum_sync_state add column if not exists units jsonb;

alter table public.curriculum_sync_state enable row level security;
-- No policies: only the sync (service role) reads or writes it.

-- Replace one part's units (one subject's year, or one KS4 specification) in a single
-- transaction, for the sync. p_expected maps each of the part's unit ids to the updated_at the
-- sync read; if anything in the part changed since (a teacher saved meanwhile), nothing is
-- written and null is returned. p_rows is the final list in teaching order: { "id", "keep": true }
-- leaves a unit as it is (only its position may change), { "id", …fields } replaces it, and a
-- row without an id is added. Units of the part not in the list are removed. Returns the ids
-- in order.
create or replace function public.curriculum_apply_units(p_kind text, p_slug text, p_year text, p_expected jsonb, p_rows jsonb, p_editor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur record;
  elem jsonb;
  i integer := 0;
  v_id uuid;
  ids uuid[] := '{}';
  seen integer := 0;
begin
  for cur in
    select id, updated_at from public.curriculum_units
     where subject_slug = p_slug and kind = p_kind and (p_kind = 'spec' or year = p_year)
     for update
  loop
    if not (p_expected ? cur.id::text) or (p_expected ->> cur.id::text)::timestamptz is distinct from cur.updated_at then
      return null;
    end if;
    seen := seen + 1;
  end loop;
  if seen <> (select count(*) from jsonb_object_keys(p_expected)) then
    return null;
  end if;

  for elem in select value from jsonb_array_elements(p_rows) loop
    if elem ? 'id' and coalesce((elem ->> 'keep')::boolean, false) then
      v_id := (elem ->> 'id')::uuid;
      update public.curriculum_units set position = i where id = v_id and position <> i;
    elsif elem ? 'id' then
      v_id := (elem ->> 'id')::uuid;
      update public.curriculum_units u
         set (subject, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year, extra, key_order, updated_by, updated_by_name) =
             (select x.subject, coalesce(x.year, u.year), x.half_term, x.term, i, x.ref, x.paper, x.title, coalesce(x.focus, '{}'), coalesce(x.skills, '{}'), coalesce(x.key_terms, '{}'), x.assess, x.prereq, x.leads_to,
                     coalesce(x.weeks, '[]'), x.resources, x.founding_year, coalesce(x.extra, '{}'), coalesce(x.key_order, '{}'), null::uuid, p_editor
                from jsonb_populate_record(null::public.curriculum_units, elem) x)
       where u.id = v_id;
    else
      insert into public.curriculum_units (subject_slug, subject, kind, year, half_term, term, position, ref, paper, title, focus, skills, key_terms, assess, prereq, leads_to, weeks, resources, founding_year, extra, key_order, updated_by_name)
      select p_slug, x.subject, p_kind, coalesce(x.year, p_year), x.half_term, x.term, i, x.ref, x.paper, x.title, coalesce(x.focus, '{}'), coalesce(x.skills, '{}'), coalesce(x.key_terms, '{}'), x.assess, x.prereq, x.leads_to,
             coalesce(x.weeks, '[]'), x.resources, x.founding_year, coalesce(x.extra, '{}'), coalesce(x.key_order, '{}'), p_editor
        from jsonb_populate_record(null::public.curriculum_units, elem - 'id') x
      returning id into v_id;
    end if;
    ids := ids || v_id;
    i := i + 1;
  end loop;

  delete from public.curriculum_units
   where subject_slug = p_slug and kind = p_kind and (p_kind = 'spec' or year = p_year) and not (id = any(ids));
  return to_jsonb(ids);
end;
$$;

revoke all on function public.curriculum_apply_units(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.curriculum_apply_units(text, text, text, jsonb, jsonb, text) to service_role;

create table if not exists public.curriculum_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default true,
  trigger text,
  sent_units integer not null default 0,
  sent_lessons integer not null default 0,
  received_units integer not null default 0,
  received_lessons integer not null default 0,
  commit_sha text,
  -- Plain-English notes: parts that could not be sent yet and why, and clashes between a
  -- portal edit and a repo edit (the portal edit is kept).
  problems jsonb not null default '[]'::jsonb,
  message text
);

create index if not exists curriculum_sync_runs_recent_idx on public.curriculum_sync_runs (started_at desc);

alter table public.curriculum_sync_runs enable row level security;

drop policy if exists "curriculum_sync_runs: staff read" on public.curriculum_sync_runs;
create policy "curriculum_sync_runs: staff read"
  on public.curriculum_sync_runs for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));
