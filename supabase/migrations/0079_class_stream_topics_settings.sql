-- Class pages, Google-Classroom style: Stream, Classwork (grouped by topic),
-- People, Grades, plus a per-class settings page.
--
--  * class_topics           Classwork headings. homework.topic_id and
--                           class_materials.topic_id point at one.
--  * class_materials        Non-assessed classwork a teacher posts: a
--                           'material' (notes, links) or a 'question' (a
--                           prompt students answer in the comment thread).
--  * announcements          gains: attachments (links), allow_comments,
--                           publish_at (schedule for later), audience_child_ids
--                           (null = whole class, otherwise only those pupils
--                           and their families), body_format ('markup' = the
--                           tiny **bold** / *italic* / ++underline++ / "- "
--                           list markup rendered by the portal; never HTML).
--  * class_post_comments    Stream comments on an announcement or material.
--                           Soft-deleted (deleted_at) so staff can see what
--                           was removed. Pupils can only comment when the
--                           class setting is on AND the post allows it;
--                           parents read but do not post (they have Messages).
--  * class_settings         One row per class: details, the comment/deleted
--                           toggles, auto draft grade for missing work, overall
--                           grade display and calculation.
--  * class_grade_categories Optional weights; a category may be linked to an
--                           assessment type so the weighted overall can be
--                           computed from assessments.
--  * homework_review_queue  READ-ONLY view for the teacher "To review" page:
--                           handed in, not yet returned (no released mark, no
--                           feedback given). Does not write to homework tables.
--
-- Safeguarding default: pupils CANNOT comment on the stream until a teacher
-- turns it on for that class.
--
-- Idempotent: safe to run more than once. audit_row_change() reads NEW/OLD.id,
-- so every table keeps a real id.

-- ── class_topics ─────────────────────────────────────────────────────────
create table if not exists public.class_topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create index if not exists class_topics_class_idx on public.class_topics (class_id, position);

alter table public.class_topics enable row level security;

drop policy if exists "class_topics: teacher of class manages" on public.class_topics;
create policy "class_topics: teacher of class manages"
  on public.class_topics for all
  to authenticated
  using (public.class_taught_by_current_user(class_topics.class_id))
  with check (public.class_taught_by_current_user(class_topics.class_id));

drop policy if exists "class_topics: head_teacher/admin manage all" on public.class_topics;
create policy "class_topics: head_teacher/admin manage all"
  on public.class_topics for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "class_topics: manage_academic staff read all" on public.class_topics;
create policy "class_topics: manage_academic staff read all"
  on public.class_topics for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

drop policy if exists "class_topics: parent reads own child's class" on public.class_topics;
create policy "class_topics: parent reads own child's class"
  on public.class_topics for select
  to authenticated
  using (public.class_has_parents_child(class_topics.class_id));

drop policy if exists "class_topics: student reads own class" on public.class_topics;
create policy "class_topics: student reads own class"
  on public.class_topics for select
  to authenticated
  using (public.class_has_students_own_enrolment(class_topics.class_id));

drop trigger if exists audit_class_topics on public.class_topics;
create trigger audit_class_topics
  after insert or update or delete on public.class_topics
  for each row execute function public.audit_row_change();

-- Homework can sit under a topic. A column only: no change to homework RLS
-- (teachers already manage their own class's homework rows).
alter table public.homework
  add column if not exists topic_id uuid references public.class_topics(id) on delete set null;

-- ── class_materials ──────────────────────────────────────────────────────
create table if not exists public.class_materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  topic_id uuid references public.class_topics(id) on delete set null,
  kind text not null default 'material' check (kind in ('material', 'question')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text check (body is null or char_length(body) <= 8000),
  resources jsonb not null default '[]'::jsonb, -- [{label, url}], same shape as homework.resources
  allow_comments boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_materials_class_idx on public.class_materials (class_id, created_at desc);

alter table public.class_materials enable row level security;

drop policy if exists "class_materials: teacher of class manages" on public.class_materials;
create policy "class_materials: teacher of class manages"
  on public.class_materials for all
  to authenticated
  using (public.class_taught_by_current_user(class_materials.class_id))
  with check (public.class_taught_by_current_user(class_materials.class_id));

drop policy if exists "class_materials: head_teacher/admin manage all" on public.class_materials;
create policy "class_materials: head_teacher/admin manage all"
  on public.class_materials for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "class_materials: manage_academic staff read all" on public.class_materials;
create policy "class_materials: manage_academic staff read all"
  on public.class_materials for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

drop policy if exists "class_materials: parent reads own child's class" on public.class_materials;
create policy "class_materials: parent reads own child's class"
  on public.class_materials for select
  to authenticated
  using (public.class_has_parents_child(class_materials.class_id));

drop policy if exists "class_materials: student reads own class" on public.class_materials;
create policy "class_materials: student reads own class"
  on public.class_materials for select
  to authenticated
  using (public.class_has_students_own_enrolment(class_materials.class_id));

drop trigger if exists audit_class_materials on public.class_materials;
create trigger audit_class_materials
  after insert or update or delete on public.class_materials
  for each row execute function public.audit_row_change();

-- ── class_settings ───────────────────────────────────────────────────────
create table if not exists public.class_settings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.classes(id) on delete cascade,
  description text check (description is null or char_length(description) <= 1000),
  section text check (section is null or char_length(section) <= 60),
  room text check (room is null or char_length(room) <= 120),
  meeting_link text check (meeting_link is null or meeting_link ~* '^https://[^[:space:]]+$'),
  students_can_comment boolean not null default false,
  show_deleted_to_staff boolean not null default true,
  auto_draft_missing boolean not null default false,
  auto_draft_percent int not null default 0 check (auto_draft_percent between 0 and 100),
  show_overall_grade boolean not null default false,
  grade_calculation text not null default 'average' check (grade_calculation in ('average', 'weighted')),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.class_settings enable row level security;

drop policy if exists "class_settings: teacher of class manages" on public.class_settings;
create policy "class_settings: teacher of class manages"
  on public.class_settings for all
  to authenticated
  using (public.class_taught_by_current_user(class_settings.class_id))
  with check (public.class_taught_by_current_user(class_settings.class_id));

drop policy if exists "class_settings: head_teacher/admin manage all" on public.class_settings;
create policy "class_settings: head_teacher/admin manage all"
  on public.class_settings for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "class_settings: manage_academic staff read all" on public.class_settings;
create policy "class_settings: manage_academic staff read all"
  on public.class_settings for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

drop policy if exists "class_settings: parent reads own child's class" on public.class_settings;
create policy "class_settings: parent reads own child's class"
  on public.class_settings for select
  to authenticated
  using (public.class_has_parents_child(class_settings.class_id));

drop policy if exists "class_settings: student reads own class" on public.class_settings;
create policy "class_settings: student reads own class"
  on public.class_settings for select
  to authenticated
  using (public.class_has_students_own_enrolment(class_settings.class_id));

drop trigger if exists audit_class_settings on public.class_settings;
create trigger audit_class_settings
  after insert or update or delete on public.class_settings
  for each row execute function public.audit_row_change();

-- ── class_grade_categories ───────────────────────────────────────────────
create table if not exists public.class_grade_categories (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  weight numeric(5, 2) not null default 0 check (weight >= 0 and weight <= 100),
  assessment_type_id uuid references public.assessment_types(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

alter table public.class_grade_categories enable row level security;

drop policy if exists "class_grade_categories: teacher of class manages" on public.class_grade_categories;
create policy "class_grade_categories: teacher of class manages"
  on public.class_grade_categories for all
  to authenticated
  using (public.class_taught_by_current_user(class_grade_categories.class_id))
  with check (public.class_taught_by_current_user(class_grade_categories.class_id));

drop policy if exists "class_grade_categories: head_teacher/admin manage all" on public.class_grade_categories;
create policy "class_grade_categories: head_teacher/admin manage all"
  on public.class_grade_categories for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "class_grade_categories: manage_academic staff read all" on public.class_grade_categories;
create policy "class_grade_categories: manage_academic staff read all"
  on public.class_grade_categories for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

drop policy if exists "class_grade_categories: parent reads own child's class" on public.class_grade_categories;
create policy "class_grade_categories: parent reads own child's class"
  on public.class_grade_categories for select
  to authenticated
  using (public.class_has_parents_child(class_grade_categories.class_id));

drop policy if exists "class_grade_categories: student reads own class" on public.class_grade_categories;
create policy "class_grade_categories: student reads own class"
  on public.class_grade_categories for select
  to authenticated
  using (public.class_has_students_own_enrolment(class_grade_categories.class_id));

drop trigger if exists audit_class_grade_categories on public.class_grade_categories;
create trigger audit_class_grade_categories
  after insert or update or delete on public.class_grade_categories
  for each row execute function public.audit_row_change();

-- ── announcements: attachments, comments, scheduling, audience ──────────
alter table public.announcements
  add column if not exists body_format text not null default 'plain' check (body_format in ('plain', 'markup')),
  add column if not exists attachments jsonb not null default '[]'::jsonb, -- [{label, url}]
  add column if not exists allow_comments boolean not null default false,
  add column if not exists publish_at timestamptz,
  add column if not exists audience_child_ids uuid[];

-- Can the signed-in parent/student see a class post addressed to these
-- pupils (null = the whole class)? SECURITY DEFINER for the same reason as
-- class_has_parents_child(): the policy must not recurse through RLS.
create or replace function public.class_post_for_my_family(p_class_id uuid, p_audience uuid[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.enrolments e
    join public.children c on c.id = e.child_id
    where e.class_id = p_class_id
      and (p_audience is null or e.child_id = any (p_audience))
      and (
        c.parent_user_id = auth.uid()
        or exists (select 1 from public.student_accounts sa where sa.child_id = e.child_id and sa.profile_id = auth.uid())
      )
  );
$$;

revoke all on function public.class_post_for_my_family(uuid, uuid[]) from public;
grant execute on function public.class_post_for_my_family(uuid, uuid[]) to authenticated;

-- Readers see neither recalled nor not-yet-published notices; the author and
-- head/admin always do. Class notices also respect the chosen audience.
drop policy if exists "announcements: school-wide readable by all learn users" on public.announcements;
create policy "announcements: school-wide readable by all learn users"
  on public.announcements for select
  to authenticated
  using (
    scope = 'school'
    and (
      (recalled_at is null and (publish_at is null or publish_at <= now()))
      or author_id = auth.uid()
      or public.current_has_role(array['head_teacher', 'admin'])
    )
  );

drop policy if exists "announcements: class-wide readable by class members" on public.announcements;
create policy "announcements: class-wide readable by class members"
  on public.announcements for select
  to authenticated
  using (
    scope = 'class'
    and (
      (recalled_at is null and (publish_at is null or publish_at <= now()))
      or author_id = auth.uid()
      or public.current_has_role(array['head_teacher', 'admin'])
    )
    and (
      public.class_taught_by_current_user(announcements.class_id)
      or public.current_has_permission('manage_academic')
      or public.class_post_for_my_family(announcements.class_id, announcements.audience_child_ids)
    )
  );

-- ── class_post_comments ──────────────────────────────────────────────────
create table if not exists public.class_post_comments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  material_id uuid references public.class_materials(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint class_post_comments_one_target check ((announcement_id is not null) <> (material_id is not null))
);

create index if not exists class_post_comments_ann_idx on public.class_post_comments (announcement_id, created_at);
create index if not exists class_post_comments_mat_idx on public.class_post_comments (material_id, created_at);

alter table public.class_post_comments enable row level security;

-- May the signed-in user add a comment to this post? Teachers of the class
-- and head/admin: whenever the post allows comments. Pupils: only when the
-- class setting is on as well. Parents never (they use Messages).
create or replace function public.class_comment_allowed(p_class_id uuid, p_announcement_id uuid, p_material_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    case
      when p_announcement_id is not null then exists (
        select 1 from public.announcements a
        where a.id = p_announcement_id and a.class_id = p_class_id and a.allow_comments and a.recalled_at is null
      )
      else exists (
        select 1 from public.class_materials m
        where m.id = p_material_id and m.class_id = p_class_id and m.allow_comments
      )
    end
    and (
      public.class_taught_by_current_user(p_class_id)
      or public.current_has_role(array['head_teacher', 'admin'])
      or (
        public.class_has_students_own_enrolment(p_class_id)
        and coalesce((select cs.students_can_comment from public.class_settings cs where cs.class_id = p_class_id), false)
      )
    );
$$;

revoke all on function public.class_comment_allowed(uuid, uuid, uuid) from public;
grant execute on function public.class_comment_allowed(uuid, uuid, uuid) to authenticated;

drop policy if exists "class_post_comments: members read live comments" on public.class_post_comments;
create policy "class_post_comments: members read live comments"
  on public.class_post_comments for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.class_taught_by_current_user(class_post_comments.class_id)
      or public.current_has_permission('manage_academic')
      or public.class_has_parents_child(class_post_comments.class_id)
      or public.class_has_students_own_enrolment(class_post_comments.class_id)
    )
  );

-- Staff also see removed comments (the "show deleted items" toggle is a
-- display choice on top of this).
drop policy if exists "class_post_comments: staff read removed" on public.class_post_comments;
create policy "class_post_comments: staff read removed"
  on public.class_post_comments for select
  to authenticated
  using (
    public.class_taught_by_current_user(class_post_comments.class_id)
    or public.current_has_role(array['head_teacher', 'admin'])
  );

drop policy if exists "class_post_comments: allowed members add own" on public.class_post_comments;
create policy "class_post_comments: allowed members add own"
  on public.class_post_comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and deleted_at is null
    and public.class_comment_allowed(class_post_comments.class_id, class_post_comments.announcement_id, class_post_comments.material_id)
  );

-- Remove: the author their own, a teacher of the class or head/admin any.
drop policy if exists "class_post_comments: author or staff remove" on public.class_post_comments;
create policy "class_post_comments: author or staff remove"
  on public.class_post_comments for update
  to authenticated
  using (
    author_id = auth.uid()
    or public.class_taught_by_current_user(class_post_comments.class_id)
    or public.current_has_role(array['head_teacher', 'admin'])
  )
  with check (
    author_id = auth.uid()
    or public.class_taught_by_current_user(class_post_comments.class_id)
    or public.current_has_role(array['head_teacher', 'admin'])
  );

drop policy if exists "class_post_comments: head_teacher/admin delete" on public.class_post_comments;
create policy "class_post_comments: head_teacher/admin delete"
  on public.class_post_comments for delete
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- An update may only stamp the removal; text, author and target never change.
create or replace function public.class_post_comments_guard()
returns trigger
language plpgsql
as $$
begin
  new.class_id := old.class_id;
  new.announcement_id := old.announcement_id;
  new.material_id := old.material_id;
  new.author_id := old.author_id;
  new.body := old.body;
  new.created_at := old.created_at;
  if new.deleted_at is not null and old.deleted_at is null then
    new.deleted_by := coalesce(auth.uid(), new.deleted_by);
  else
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

drop trigger if exists class_post_comments_guard on public.class_post_comments;
create trigger class_post_comments_guard
  before update on public.class_post_comments
  for each row execute function public.class_post_comments_guard();

drop trigger if exists audit_class_post_comments on public.class_post_comments;
create trigger audit_class_post_comments
  after insert or update or delete on public.class_post_comments
  for each row execute function public.audit_row_change();

-- ── homework_review_queue (READ-ONLY, for the teacher "To review" page) ──
-- One row per handed-in submission that has not been returned: no released
-- mark and no feedback given. A requested resubmission is waiting on the
-- pupil, so it is not in the queue; once resubmitted it is again.
-- security_invoker: a teacher sees their own classes, head/admin everything,
-- a pupil/parent only their own child's rows (which the page never asks for).
create or replace view public.homework_review_queue
  with (security_invoker = true) as
  select
    hs.id as submission_id,
    hs.homework_id,
    h.title as homework_title,
    h.class_id,
    c.name as class_name,
    hs.child_id,
    ch.name as child_name,
    h.due_at,
    hs.submitted_at,
    (hs.submitted_at > h.due_at) as is_late
  from public.homework_submissions hs
  join public.homework h on h.id = hs.homework_id
  left join public.classes c on c.id = h.class_id
  left join public.children ch on ch.id = hs.child_id
  where hs.submitted_at is not null
    and h.archived_at is null
    and not exists (select 1 from public.homework_marks m where m.submission_id = hs.id and m.released)
    and not exists (
      select 1 from public.homework_feedback f
      where f.submission_id = hs.id and f.status in ('feedback_given', 'resubmission_requested')
    );

grant select on public.homework_review_queue to authenticated;
