-- SEND support plans (October 2026).
--
-- The FAQ promises families "an individual support plan, adjustments in
-- lessons, extra time and reader or scribe arrangements in assessments, and
-- regular reviews with you". Until now the portal only held a free-text
-- "Additional learning needs" box on the pupil record. This adds:
--
--   * a SENCo add-on permission ('senco'), granted by the Headteacher or an
--     admin (set_senco), like the Designated Safeguarding Lead;
--   * send_support_plans: one plan per pupil (needs, strengths, classroom
--     adjustments, assessment access arrangements, SENCo and key adult,
--     next review date), status draft / active / closed;
--   * send_plan_targets: SMART targets with a review status;
--   * send_plan_reviews: review meetings (date, who attended, parent there,
--     pupil's views, notes, outcomes, next review date);
--   * send_plan_family_responses: a parent's comments and "I agree", with
--     the school's reply.
--
-- Who sees what (RLS, not just the UI):
--   * Headteacher, admin and SENCo: read and write everything.
--   * The pupil's teachers (and the named key adult): read ACTIVE plans and
--     their targets for pupils they teach, so adjustments and access
--     arrangements are used in lessons. Not the review notes or family
--     comments.
--   * Parents: read their own child's plan once it is active (or closed),
--     its targets and the reviews marked as shared; add comments and agree.
--   * Pupils: nothing.
--
-- Applications: when an accepted applicant's pupil record is linked
-- (admissions_applications.child_id), the "Special educational needs,
-- medical needs or anything else" answer starts a DRAFT plan as its needs
-- summary, with any entry-assessment access arrangements copied across, so
-- nothing is retyped and the SENCo sees the new pupil on the register.
-- Idempotent.

-- ── SENCo permission ────────────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in select conname from pg_constraint where contypid = 'public.learn_permission'::regtype and contype = 'c' loop
    execute format('alter domain public.learn_permission drop constraint %I', c.conname);
  end loop;
  for c in
    select conname from pg_constraint
    where conrelid = 'public.user_permissions'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%permission%'
  loop
    execute format('alter table public.user_permissions drop constraint %I', c.conname);
  end loop;
end;
$$;

alter domain public.learn_permission add constraint learn_permission_check
  check (value in (
    'manage_admissions', 'manage_people_accounts', 'grant_sensitive_roles',
    'manage_academic', 'manage_website_content', 'view_compliance', 'manage_permissions_matrix',
    'view_own_classes', 'manage_own_classes',
    'view_own_children', 'view_own_records',
    'timetabler', 'safeguarding_lead', 'can_export_data', 'assessment_lead', 'senco'
  ));

alter table public.user_permissions add constraint user_permissions_permission_check
  check (permission in ('timetabler', 'safeguarding_lead', 'can_export_data', 'assessment_lead', 'senco'));

create or replace function public.set_senco(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or an admin can name the SENCo' using errcode = '42501';
  end if;
  if not public.is_staff_member(p_user) then
    raise exception 'Only a member of staff can be the SENCo';
  end if;
  if coalesce(p_on, false) then
    insert into public.user_permissions (user_id, permission, granted_by)
    values (p_user, 'senco', auth.uid())
    on conflict (user_id, permission) do nothing;
  else
    delete from public.user_permissions where user_id = p_user and permission = 'senco';
  end if;
end;
$$;
revoke all on function public.set_senco(uuid, boolean) from public, anon;
grant execute on function public.set_senco(uuid, boolean) to authenticated;

-- Who may write support plans and see the whole SEND register.
create or replace function public.send_can_manage()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_has_role(array['head_teacher', 'admin']) or public.current_has_permission('senco');
$$;
revoke all on function public.send_can_manage() from public, anon;
grant execute on function public.send_can_manage() to authenticated;

-- "None", "n/a" and the like are answers, not needs.
create or replace function public.send_meaningful(t text)
returns boolean
language sql
immutable
as $$
  select coalesce(btrim(t), '') <> ''
     and lower(btrim(t, E' .!\t\n\r')) not in ('none', 'n/a', 'na', 'no', 'nil', '-', 'nothing', 'none known', 'not applicable', 'no needs', 'nope');
$$;
grant execute on function public.send_meaningful(text) to authenticated;

-- ── send_support_plans ──────────────────────────────────────────────────
create table if not exists public.send_support_plans (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null unique references public.children(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  support_level text not null default 'sen_support' check (support_level in ('monitoring', 'sen_support', 'ehcp')),
  primary_need text check (primary_need in ('cognition_learning', 'communication_interaction', 'semh', 'sensory_physical')),
  needs_summary text check (char_length(needs_summary) <= 4000),
  needs_source text check (char_length(needs_source) <= 200),
  strengths text check (char_length(strengths) <= 3000),
  pupil_views text check (char_length(pupil_views) <= 3000),
  adjustments text[] not null default '{}',
  adjustments_other text check (char_length(adjustments_other) <= 2000),
  access_extra_time_pct int not null default 0 check (access_extra_time_pct between 0 and 100),
  access_reader boolean not null default false,
  access_scribe boolean not null default false,
  access_rest_breaks boolean not null default false,
  access_word_processor boolean not null default false,
  access_separate_room boolean not null default false,
  access_other text check (char_length(access_other) <= 1000),
  senco_id uuid references public.profiles(id) on delete set null,
  key_adult_id uuid references public.profiles(id) on delete set null,
  next_review_due date,
  last_reviewed_on date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.send_support_plans enable row level security;
create index if not exists send_support_plans_review_idx on public.send_support_plans (status, next_review_due);

create table if not exists public.send_plan_targets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.send_support_plans(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  target text not null check (char_length(target) between 1 and 1000),
  success_criteria text check (char_length(success_criteria) <= 1000),
  support text check (char_length(support) <= 1000),
  by_when date,
  status text not null default 'working_towards' check (status in ('not_started', 'working_towards', 'achieved', 'partly_achieved', 'not_achieved')),
  review_note text check (char_length(review_note) <= 1500),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.send_plan_targets enable row level security;
create index if not exists send_plan_targets_plan_idx on public.send_plan_targets (plan_id, sort);

create table if not exists public.send_plan_reviews (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.send_support_plans(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  held_on date not null default current_date,
  attendees text check (char_length(attendees) <= 500),
  parent_attended boolean not null default false,
  pupil_views text check (char_length(pupil_views) <= 2000),
  notes text check (char_length(notes) <= 5000),
  outcomes text check (char_length(outcomes) <= 3000),
  next_review_due date,
  shared_with_family boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.send_plan_reviews enable row level security;
create index if not exists send_plan_reviews_plan_idx on public.send_plan_reviews (plan_id, held_on desc);

create table if not exists public.send_plan_family_responses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.send_support_plans(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  review_id uuid references public.send_plan_reviews(id) on delete set null,
  parent_id uuid references public.profiles(id) on delete set null,
  agreed boolean not null default false,
  comment text check (char_length(comment) <= 3000),
  plan_updated_at timestamptz,
  reply text check (char_length(reply) <= 3000),
  replied_by uuid references public.profiles(id) on delete set null,
  replied_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint send_plan_family_responses_has_content check (agreed or coalesce(btrim(comment), '') <> '')
);
alter table public.send_plan_family_responses enable row level security;
create index if not exists send_plan_family_responses_plan_idx on public.send_plan_family_responses (plan_id, created_at desc);

-- ── guards ──────────────────────────────────────────────────────────────
create or replace function public.send_support_plans_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.child_id := old.child_id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  else
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.adjustments := coalesce(new.adjustments, '{}');
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
drop trigger if exists send_support_plans_guard on public.send_support_plans;
create trigger send_support_plans_guard
  before insert or update on public.send_support_plans
  for each row execute function public.send_support_plans_guard();

-- Children rows take their pupil from the plan, never from the client.
create or replace function public.send_plan_child_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.plan_id := old.plan_id;
  end if;
  select p.child_id into new.child_id from public.send_support_plans p where p.id = new.plan_id;
  if tg_table_name in ('send_plan_targets', 'send_plan_reviews') then
    new.updated_at := now();
  end if;
  if tg_table_name = 'send_plan_reviews' and tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists send_plan_targets_guard on public.send_plan_targets;
create trigger send_plan_targets_guard before insert or update on public.send_plan_targets
  for each row execute function public.send_plan_child_guard();
drop trigger if exists send_plan_reviews_guard on public.send_plan_reviews;
create trigger send_plan_reviews_guard before insert or update on public.send_plan_reviews
  for each row execute function public.send_plan_child_guard();

-- A review moves the plan on: last reviewed date and the next one due.
create or replace function public.send_plan_reviews_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.send_support_plans p
  set last_reviewed_on = greatest(coalesce(p.last_reviewed_on, new.held_on), new.held_on),
      next_review_due = case
        when new.held_on >= coalesce(p.last_reviewed_on, new.held_on) and new.next_review_due is not null then new.next_review_due
        else p.next_review_due
      end
  where p.id = new.plan_id;
  return new;
end;
$$;
drop trigger if exists send_plan_reviews_after on public.send_plan_reviews;
create trigger send_plan_reviews_after after insert or update of held_on, next_review_due on public.send_plan_reviews
  for each row execute function public.send_plan_reviews_after();

-- Family responses: the parent, pupil and plan version come from the server.
-- Parents can only add; the school can only reply or mark as seen.
create or replace function public.send_plan_family_responses_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select p.child_id, p.updated_at into new.child_id, new.plan_updated_at from public.send_support_plans p where p.id = new.plan_id;
    new.parent_id := auth.uid();
    new.created_at := now();
    new.reply := null;
    new.replied_by := null;
    new.replied_at := null;
    new.seen_at := null;
  else
    new.plan_id := old.plan_id;
    new.child_id := old.child_id;
    new.review_id := old.review_id;
    new.parent_id := old.parent_id;
    new.agreed := old.agreed;
    new.comment := old.comment;
    new.plan_updated_at := old.plan_updated_at;
    new.created_at := old.created_at;
    if new.reply is distinct from old.reply then
      new.replied_by := auth.uid();
      new.replied_at := now();
      new.seen_at := coalesce(new.seen_at, now());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists send_plan_family_responses_guard on public.send_plan_family_responses;
create trigger send_plan_family_responses_guard before insert or update on public.send_plan_family_responses
  for each row execute function public.send_plan_family_responses_guard();

-- ── visibility helpers ──────────────────────────────────────────────────
create or replace function public.send_plan_visible_to_teacher(p_plan uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.send_support_plans p
    where p.id = p_plan and p.status = 'active'
      and (public.child_enrolled_in_teachers_class(p.child_id) or p.key_adult_id = auth.uid())
  );
$$;
revoke all on function public.send_plan_visible_to_teacher(uuid) from public, anon;
grant execute on function public.send_plan_visible_to_teacher(uuid) to authenticated;

create or replace function public.send_plan_visible_to_parent(p_plan uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.send_support_plans p
    where p.id = p_plan and p.status in ('active', 'closed') and public.child_belongs_to_parent(p.child_id)
  );
$$;
revoke all on function public.send_plan_visible_to_parent(uuid) from public, anon;
grant execute on function public.send_plan_visible_to_parent(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────
drop policy if exists "send_support_plans: managers all" on public.send_support_plans;
create policy "send_support_plans: managers all" on public.send_support_plans for all to authenticated
  using (public.send_can_manage()) with check (public.send_can_manage());
drop policy if exists "send_support_plans: teachers read active for their pupils" on public.send_support_plans;
create policy "send_support_plans: teachers read active for their pupils" on public.send_support_plans for select to authenticated
  using (status = 'active' and (public.child_enrolled_in_teachers_class(child_id) or key_adult_id = auth.uid()));
drop policy if exists "send_support_plans: parent reads own child's" on public.send_support_plans;
create policy "send_support_plans: parent reads own child's" on public.send_support_plans for select to authenticated
  using (status in ('active', 'closed') and public.child_belongs_to_parent(child_id));

drop policy if exists "send_plan_targets: managers all" on public.send_plan_targets;
create policy "send_plan_targets: managers all" on public.send_plan_targets for all to authenticated
  using (public.send_can_manage()) with check (public.send_can_manage());
drop policy if exists "send_plan_targets: teachers read" on public.send_plan_targets;
create policy "send_plan_targets: teachers read" on public.send_plan_targets for select to authenticated
  using (public.send_plan_visible_to_teacher(plan_id));
drop policy if exists "send_plan_targets: parent reads" on public.send_plan_targets;
create policy "send_plan_targets: parent reads" on public.send_plan_targets for select to authenticated
  using (public.send_plan_visible_to_parent(plan_id));

drop policy if exists "send_plan_reviews: managers all" on public.send_plan_reviews;
create policy "send_plan_reviews: managers all" on public.send_plan_reviews for all to authenticated
  using (public.send_can_manage()) with check (public.send_can_manage());
drop policy if exists "send_plan_reviews: parent reads shared" on public.send_plan_reviews;
create policy "send_plan_reviews: parent reads shared" on public.send_plan_reviews for select to authenticated
  using (shared_with_family and public.send_plan_visible_to_parent(plan_id));

drop policy if exists "send_plan_family_responses: managers read and reply" on public.send_plan_family_responses;
create policy "send_plan_family_responses: managers read and reply" on public.send_plan_family_responses for select to authenticated
  using (public.send_can_manage());
drop policy if exists "send_plan_family_responses: managers reply" on public.send_plan_family_responses;
create policy "send_plan_family_responses: managers reply" on public.send_plan_family_responses for update to authenticated
  using (public.send_can_manage()) with check (public.send_can_manage());
drop policy if exists "send_plan_family_responses: parent reads own child's" on public.send_plan_family_responses;
create policy "send_plan_family_responses: parent reads own child's" on public.send_plan_family_responses for select to authenticated
  using (public.send_plan_visible_to_parent(plan_id));
drop policy if exists "send_plan_family_responses: parent adds" on public.send_plan_family_responses;
create policy "send_plan_family_responses: parent adds" on public.send_plan_family_responses for insert to authenticated
  with check (public.send_plan_visible_to_parent(plan_id) and parent_id = auth.uid());

-- ── audit ───────────────────────────────────────────────────────────────
drop trigger if exists audit_send_support_plans on public.send_support_plans;
create trigger audit_send_support_plans after insert or update or delete on public.send_support_plans
  for each row execute function public.audit_row_change();
drop trigger if exists audit_send_plan_targets on public.send_plan_targets;
create trigger audit_send_plan_targets after insert or update or delete on public.send_plan_targets
  for each row execute function public.audit_row_change();
drop trigger if exists audit_send_plan_reviews on public.send_plan_reviews;
create trigger audit_send_plan_reviews after insert or update or delete on public.send_plan_reviews
  for each row execute function public.audit_row_change();
drop trigger if exists audit_send_plan_family_responses on public.send_plan_family_responses;
create trigger audit_send_plan_family_responses after insert or update or delete on public.send_plan_family_responses
  for each row execute function public.audit_row_change();

-- ── SEND register ───────────────────────────────────────────────────────
-- Every pupil with a plan, plus every pupil whose application or record
-- mentions a need but has no plan yet ("flagged"). Empty for anyone who
-- can't manage plans, so the Action centre can call it for every staff user.
create or replace function public.send_register()
returns table (
  child_id uuid,
  child_name text,
  year_group text,
  plan_id uuid,
  status text,
  support_level text,
  primary_need text,
  next_review_due date,
  last_reviewed_on date,
  senco_name text,
  key_adult_name text,
  has_access boolean,
  adjustments_count int,
  open_targets int,
  flagged boolean,
  family_agreed_at timestamptz,
  unseen_comments int,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  with kids as (
    select c.id, c.name, yg.name as yg
    from public.children c
    left join public.year_groups yg on yg.id = c.year_group_id
    where public.send_can_manage() and not c.is_test
  ),
  flags as (
    select k.id,
      exists (select 1 from public.pupil_details d where d.child_id = k.id and public.send_meaningful(d.sen_notes))
      or exists (select 1 from public.admissions_applications a where a.child_id = k.id and public.send_meaningful(a.send_or_medical_notes)) as flagged
    from kids k
  )
  select k.id, k.name, k.yg, p.id, p.status, p.support_level, p.primary_need, p.next_review_due, p.last_reviewed_on,
    (select full_name from public.profiles where id = p.senco_id),
    (select full_name from public.profiles where id = p.key_adult_id),
    coalesce(p.access_extra_time_pct > 0 or p.access_reader or p.access_scribe or p.access_rest_breaks or p.access_word_processor or p.access_separate_room or public.send_meaningful(p.access_other), false),
    coalesce(cardinality(p.adjustments), 0) + case when public.send_meaningful(p.adjustments_other) then 1 else 0 end,
    (select count(*)::int from public.send_plan_targets t where t.plan_id = p.id and t.status in ('not_started', 'working_towards', 'partly_achieved')),
    f.flagged,
    (select max(r.created_at) from public.send_plan_family_responses r where r.plan_id = p.id and r.agreed and r.plan_updated_at >= p.updated_at - interval '1 second'),
    (select count(*)::int from public.send_plan_family_responses r where r.plan_id = p.id and r.seen_at is null and coalesce(btrim(r.comment), '') <> ''),
    p.updated_at
  from kids k
  join flags f on f.id = k.id
  left join public.send_support_plans p on p.child_id = k.id
  where p.id is not null or f.flagged
  order by k.name;
$$;
revoke all on function public.send_register() from public, anon;
grant execute on function public.send_register() to authenticated;

-- What the family and admissions already told us, to start a plan from.
create or replace function public.send_sources(p_child uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.send_can_manage() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'application_notes', (select a.send_or_medical_notes from public.admissions_applications a where a.child_id = p_child and public.send_meaningful(a.send_or_medical_notes) order by a.created_at desc limit 1),
    'application_ref', (select a.reference from public.admissions_applications a where a.child_id = p_child order by a.created_at desc limit 1),
    'record_sen_notes', (select d.sen_notes from public.pupil_details d where d.child_id = p_child),
    'record_medical', (select d.medical_conditions from public.pupil_details d where d.child_id = p_child),
    'assessment_access', (select e.access from public.entry_assessments e where e.child_id = p_child and e.access <> '{}'::jsonb order by e.created_at desc limit 1),
    'assessment_notes', (select e.send_notes from public.entry_assessments e where e.child_id = p_child and public.send_meaningful(e.send_notes) order by e.created_at desc limit 1)
  ) into v;
  return v;
end;
$$;
revoke all on function public.send_sources(uuid) from public, anon;
grant execute on function public.send_sources(uuid) to authenticated;

-- Staff to choose as SENCo or key adult.
create or replace function public.send_staff_options()
returns table (user_id uuid, full_name text, is_senco boolean)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name,
    exists (select 1 from public.user_permissions up where up.user_id = p.id and up.permission = 'senco')
  from public.profiles p
  where public.send_can_manage()
    and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('head_teacher', 'admin', 'teacher', 'teaching_assistant_cover'))
  order by p.full_name;
$$;
revoke all on function public.send_staff_options() from public, anon;
grant execute on function public.send_staff_options() to authenticated;

-- Names of staff named on a plan, for teachers and parents who can't read profiles.
create or replace function public.send_staff_names(p_ids uuid[])
returns table (user_id uuid, full_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.full_name from public.profiles p
  where p.id = any(p_ids) and public.is_staff_member(p.id);
$$;
revoke all on function public.send_staff_names(uuid[]) from public, anon;
grant execute on function public.send_staff_names(uuid[]) to authenticated;

-- Access arrangements only, for whoever sets up an assessment for the pupil
-- (admissions staff and the assessment lead included), so extra time and a
-- reader are applied without opening the whole plan.
create or replace function public.send_access_arrangements(p_child uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'extra_time_pct', p.access_extra_time_pct, 'reader', p.access_reader, 'scribe', p.access_scribe,
    'rest_breaks', p.access_rest_breaks, 'word_processor', p.access_word_processor,
    'separate_room', p.access_separate_room, 'other', p.access_other, 'status', p.status)
  from public.send_support_plans p
  where p.child_id = p_child and p.status = 'active'
    and (
      public.send_can_manage()
      or public.current_has_role(array['admissions'])
      or public.current_has_permission('assessment_lead')
      or public.child_enrolled_in_teachers_class(p_child)
    );
$$;
revoke all on function public.send_access_arrangements(uuid) from public, anon;
grant execute on function public.send_access_arrangements(uuid) to authenticated;

-- ── from the application to a draft plan ────────────────────────────────
create or replace function public.send_seed_plan_from_application(p_app uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.admissions_applications;
  acc jsonb;
begin
  select * into a from public.admissions_applications where id = p_app;
  if a.id is null or a.child_id is null or not public.send_meaningful(a.send_or_medical_notes) then
    return;
  end if;
  if exists (select 1 from public.send_support_plans where child_id = a.child_id) then
    return;
  end if;
  select e.access into acc from public.entry_assessments e
  where (e.application_id = a.id or e.child_id = a.child_id) and e.access <> '{}'::jsonb
  order by e.created_at desc limit 1;
  insert into public.send_support_plans (child_id, status, needs_summary, needs_source, access_extra_time_pct, access_reader, access_rest_breaks, access_other, next_review_due)
  values (
    a.child_id, 'draft', left(a.send_or_medical_notes, 4000),
    'From the application' || coalesce(' ' || a.reference, '') || ', in the family''s words',
    least(100, greatest(0, coalesce(round((acc->>'extraTimePct')::numeric)::int, 0))),
    coalesce((acc->>'readAloud')::boolean, false),
    coalesce(acc ? 'breaks', false),
    nullif(left(coalesce(acc->>'other', ''), 1000), ''),
    current_date + 42
  )
  on conflict (child_id) do nothing;
exception when others then
  -- Never let this block accepting an applicant.
  raise warning 'send_seed_plan_from_application(%): %', p_app, sqlerrm;
end;
$$;
revoke all on function public.send_seed_plan_from_application(uuid) from public, anon, authenticated;

create or replace function public.admissions_seed_send_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.child_id is not null and (tg_op = 'INSERT' or old.child_id is distinct from new.child_id) then
    perform public.send_seed_plan_from_application(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists admissions_seed_send_plan on public.admissions_applications;
create trigger admissions_seed_send_plan
  after insert or update of child_id on public.admissions_applications
  for each row execute function public.admissions_seed_send_plan();

-- Pupils already accepted before this migration.
do $$
declare
  r record;
begin
  for r in select id from public.admissions_applications where child_id is not null and public.send_meaningful(send_or_medical_notes) loop
    perform public.send_seed_plan_from_application(r.id);
  end loop;
end;
$$;
