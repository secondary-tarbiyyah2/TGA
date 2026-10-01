-- Positive-only rewards: streaks and "Star of the week".
--
--  * child_streaks(): consecutive days at lessons, and consecutive homework
--    handed in on time. Computed live from attendance_records (0009) and
--    homework_submissions (0010); nothing is stored. Positive only: the app
--    hides a streak of zero and never shows a "broken" streak. A day with a
--    parent-submitted absence note (0040, not rejected) neither extends nor
--    breaks the attendance streak, and days with no lessons marked are
--    skipped, so holidays and weekends never break it.
--  * star_of_the_week: a teacher nominates one pupil per class per week
--    (or Headteacher/Admin does), Headteacher/Admin approve. star_suggestions()
--    offers the week's top merit earners to staff. After approval a branded
--    A4-landscape PDF certificate is generated on demand by the
--    `star-certificate` Edge Function (staff only), stored in the private
--    `star-certificates` bucket and readable by the child's family.
--  * star_of_the_week_board(): the public shout-out. It NEVER includes a
--    child with hide_from_leaderboard (0068); that child's family still gets
--    their own certificate privately.
--
-- Conventions follow 0039/0067/0068: RLS default deny, SECURITY DEFINER
-- helpers, audit_row_change(). Idempotent.

-- ── child_streaks ───────────────────────────────────────────────────────
create or replace function public.child_streaks(p_child_id uuid)
returns table (
  attendance_days int,
  homework_on_time int
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_ok boolean;
  v_att int;
  v_hw int;
begin
  if v_uid is null then
    raise exception 'Sign in to see streaks' using errcode = '42501';
  end if;

  v_ok := public.current_has_role(array['head_teacher', 'admin'])
    or exists (select 1 from public.children c where c.id = p_child_id and c.parent_user_id = v_uid)
    or exists (select 1 from public.student_accounts sa where sa.child_id = p_child_id and sa.profile_id = v_uid)
    or exists (
      select 1 from public.enrolments e
      where e.child_id = p_child_id and public.class_taught_by_current_user(e.class_id)
    );
  if not v_ok then
    raise exception 'Not allowed to see this child''s streaks' using errcode = '42501';
  end if;

  -- Attendance: one verdict per lesson day (attended = present or late for
  -- at least one marked lesson). Count attended days back from the latest
  -- counted day until the first day that was missed without a note.
  with days as (
    select li.date as dt, bool_or(ar.status in ('present', 'late')) as attended
    from public.attendance_records ar
    join public.lesson_instances li on li.id = ar.lesson_instance_id
    where ar.child_id = p_child_id and li.date <= current_date
    group by li.date
  ),
  counted as (
    select d.dt, d.attended
    from days d
    where d.attended
       or not exists (
         select 1 from public.absence_notes an
         where an.child_id = p_child_id and an.status <> 'unauthorised'
           and d.dt between an.from_date and an.to_date
       )
  ),
  brk as (
    select coalesce(max(c.dt), date '0001-01-01') as last_break from counted c where not c.attended
  )
  select count(*)::int into v_att
  from counted c, brk
  where c.attended and c.dt > brk.last_break;

  -- Homework: every item already due for the child's classes (and set since
  -- they enrolled), newest first; count on-time hand-ins until the first
  -- one that was late or missing.
  with hw as (
    select h.due_at as due_at,
           (hs.submitted_at is not null and hs.submitted_at <= h.due_at) as on_time
    from public.homework h
    join public.enrolments e on e.class_id = h.class_id and e.child_id = p_child_id
    left join public.homework_submissions hs on hs.homework_id = h.id and hs.child_id = p_child_id
    where h.due_at <= now() and h.due_at >= e.created_at
  ),
  brk as (
    select coalesce(max(w.due_at), '-infinity'::timestamptz) as last_break from hw w where not w.on_time
  )
  select count(*)::int into v_hw
  from hw w, brk
  where w.on_time and w.due_at > brk.last_break;

  return query select coalesce(v_att, 0), coalesce(v_hw, 0);
end;
$$;

revoke all on function public.child_streaks(uuid) from public, anon;
grant execute on function public.child_streaks(uuid) to authenticated;

-- ── star_of_the_week ────────────────────────────────────────────────────
create table if not exists public.star_of_the_week (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1), -- the Monday
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  nominated_by uuid not null default auth.uid() references public.profiles(id),
  status text not null default 'nominated' check (status in ('nominated', 'approved', 'declined')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  certificate_path text, -- object name in the private star-certificates bucket: <child_id>/<id>.pdf
  certificate_at timestamptz,
  certificate_emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, week_start)
);

create index if not exists star_of_the_week_child_idx on public.star_of_the_week (child_id, week_start desc);

alter table public.star_of_the_week enable row level security;

-- Is this child enrolled in this class? (SECURITY DEFINER so a teacher's
-- policy check does not depend on their own enrolments visibility.)
create or replace function public.star_child_in_class(p_child_id uuid, p_class_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.enrolments e where e.child_id = p_child_id and e.class_id = p_class_id);
$$;

revoke all on function public.star_child_in_class(uuid, uuid) from public, anon;
grant execute on function public.star_child_in_class(uuid, uuid) to authenticated;

drop policy if exists "star_of_the_week: head_teacher/admin all" on public.star_of_the_week;
create policy "star_of_the_week: head_teacher/admin all"
  on public.star_of_the_week for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "star_of_the_week: teacher reads own classes" on public.star_of_the_week;
create policy "star_of_the_week: teacher reads own classes"
  on public.star_of_the_week for select
  to authenticated
  using (public.class_taught_by_current_user(star_of_the_week.class_id));

drop policy if exists "star_of_the_week: teacher nominates for own classes" on public.star_of_the_week;
create policy "star_of_the_week: teacher nominates for own classes"
  on public.star_of_the_week for insert
  to authenticated
  with check (
    public.class_taught_by_current_user(class_id)
    and nominated_by = auth.uid()
    and status = 'nominated'
    and public.star_child_in_class(child_id, class_id)
  );

drop policy if exists "star_of_the_week: teacher edits pending nominations" on public.star_of_the_week;
create policy "star_of_the_week: teacher edits pending nominations"
  on public.star_of_the_week for update
  to authenticated
  using (public.class_taught_by_current_user(class_id) and status = 'nominated')
  with check (
    public.class_taught_by_current_user(class_id)
    and status = 'nominated'
    and public.star_child_in_class(child_id, class_id)
  );

drop policy if exists "star_of_the_week: teacher withdraws pending nominations" on public.star_of_the_week;
create policy "star_of_the_week: teacher withdraws pending nominations"
  on public.star_of_the_week for delete
  to authenticated
  using (public.class_taught_by_current_user(class_id) and status = 'nominated');

drop policy if exists "star_of_the_week: parent reads own child's approved" on public.star_of_the_week;
create policy "star_of_the_week: parent reads own child's approved"
  on public.star_of_the_week for select
  to authenticated
  using (status = 'approved' and public.child_belongs_to_parent(star_of_the_week.child_id));

drop policy if exists "star_of_the_week: student reads own approved" on public.star_of_the_week;
create policy "star_of_the_week: student reads own approved"
  on public.star_of_the_week for select
  to authenticated
  using (status = 'approved' and public.child_belongs_to_student(star_of_the_week.child_id));

-- Teachers may only change the child and the reason of a pending nomination;
-- Headteacher/Admin edit freely; the service role (auth.uid() is null: the
-- certificate function) may set the certificate columns. A decision stamps
-- who/when, and changing the child or reason invalidates a made certificate
-- so a stale PDF can never be served for a different child.
create or replace function public.star_of_the_week_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.status in ('approved', 'declined') and auth.uid() is not null then
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.current_has_role(array['head_teacher', 'admin']) then
    if new.class_id is distinct from old.class_id
       or new.week_start is distinct from old.week_start
       or new.nominated_by is distinct from old.nominated_by
       or new.status is distinct from old.status
       or new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at
       or new.certificate_path is distinct from old.certificate_path
       or new.certificate_at is distinct from old.certificate_at
       or new.certificate_emailed_at is distinct from old.certificate_emailed_at then
      raise exception 'Teachers can only change the pupil or reason of a pending nomination';
    end if;
  end if;

  if new.child_id is distinct from old.child_id or new.reason is distinct from old.reason then
    new.certificate_path := null;
    new.certificate_at := null;
    new.certificate_emailed_at := null;
  end if;

  if new.status is distinct from old.status and new.status in ('approved', 'declined') and auth.uid() is not null then
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists star_of_the_week_guard on public.star_of_the_week;
create trigger star_of_the_week_guard
  before insert or update on public.star_of_the_week
  for each row execute function public.star_of_the_week_guard();

drop trigger if exists audit_star_of_the_week on public.star_of_the_week;
create trigger audit_star_of_the_week
  after insert or update or delete on public.star_of_the_week
  for each row execute function public.audit_row_change();

-- ── star_suggestions (staff only) ───────────────────────────────────────
-- The class's top merit earners for the week starting p_week_start (a
-- Monday). Staff see opted-out children too, flagged `hidden`, so they know
-- the child will get a private certificate but no public shout-out.
create or replace function public.star_suggestions(p_class_id uuid, p_week_start date)
returns table (
  child_id uuid,
  child_name text,
  merits int,
  hidden boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Sign in to see suggestions' using errcode = '42501';
  end if;
  if not (public.current_has_role(array['head_teacher', 'admin']) or public.class_taught_by_current_user(p_class_id)) then
    raise exception 'Not allowed to see suggestions for this class' using errcode = '42501';
  end if;
  if p_week_start is null then
    raise exception 'A week is required' using errcode = '22023';
  end if;

  return query
  select c.id, btrim(c.name), sum(b.points)::int, c.hide_from_leaderboard
  from public.enrolments e
  join public.children c on c.id = e.child_id
  join public.behaviour_records b on b.child_id = c.id
  where e.class_id = p_class_id
    and b.kind = 'merit' and b.points > 0 and b.voided_at is null
    and b.occurred_on >= p_week_start and b.occurred_on < p_week_start + 7
  group by c.id, c.name, c.hide_from_leaderboard
  order by sum(b.points) desc, btrim(c.name)
  limit 3;
end;
$$;

revoke all on function public.star_suggestions(uuid, date) from public, anon;
grant execute on function public.star_suggestions(uuid, date) to authenticated;

-- ── star_of_the_week_board (the shout-out) ──────────────────────────────
-- Approved stars for the last p_weeks weeks (1-8), first name + surname
-- initial only, never a child who opted out of the leaderboard. Allowed:
-- head_teacher/admin, teachers, and any parent or student.
create or replace function public.star_of_the_week_board(p_weeks int default 1)
returns table (
  week_start date,
  class_name text,
  first_name text,
  surname_initial text,
  reason text,
  is_mine boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_weeks int;
  v_from date;
  v_ok boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to see the stars of the week' using errcode = '42501';
  end if;

  v_ok := public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover'])
    or exists (
      select 1 from public.children c
      where c.parent_user_id = v_uid
         or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = v_uid)
    );
  if not v_ok then
    raise exception 'Not allowed to see the stars of the week' using errcode = '42501';
  end if;

  v_weeks := least(greatest(coalesce(p_weeks, 1), 1), 8);
  v_from := date_trunc('week', current_date)::date - (v_weeks - 1) * 7;

  return query
  select
    s.week_start,
    cl.name,
    split_part(btrim(c.name), ' ', 1),
    case when btrim(c.name) ~ '\s' then upper((regexp_match(btrim(c.name), '(\S)\S*$'))[1]) else null end,
    s.reason,
    (c.parent_user_id = v_uid
      or exists (select 1 from public.student_accounts sa where sa.child_id = c.id and sa.profile_id = v_uid))
  from public.star_of_the_week s
  join public.children c on c.id = s.child_id
  join public.classes cl on cl.id = s.class_id
  where s.status = 'approved'
    and c.hide_from_leaderboard = false
    and s.week_start >= v_from
  order by s.week_start desc, cl.name;
end;
$$;

revoke all on function public.star_of_the_week_board(int) from public, anon;
grant execute on function public.star_of_the_week_board(int) to authenticated;

-- ── certificate storage ─────────────────────────────────────────────────
-- Object path: <child_id>/<star_id>.pdf. Written only by the star-certificate
-- Edge Function (service role). Readable while an APPROVED star row points
-- at exactly that path (so a stale file is unreachable), by the child's
-- family, Headteacher/Admin and the class's teachers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('star-certificates', 'star-certificates', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];

create or replace function public.star_certificate_readable(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.star_of_the_week s
    where s.certificate_path = p_name
      and s.status = 'approved'
      and (
        public.current_has_role(array['head_teacher', 'admin'])
        or public.class_taught_by_current_user(s.class_id)
        or public.child_belongs_to_parent(s.child_id)
        or public.child_belongs_to_student(s.child_id)
      )
  );
$$;

revoke all on function public.star_certificate_readable(text) from public, anon;
grant execute on function public.star_certificate_readable(text) to authenticated;

drop policy if exists "star-certificates: read approved" on storage.objects;
create policy "star-certificates: read approved" on storage.objects
  for select to authenticated
  using (bucket_id = 'star-certificates' and public.star_certificate_readable(name));

-- No insert/update/delete policies: only the service role (Edge Function) writes.
