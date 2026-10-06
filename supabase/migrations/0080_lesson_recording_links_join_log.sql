-- Two small things.
--
-- 1. lesson_recording_links: a staff member pastes a link to a recording that
--    lives elsewhere (Microsoft Teams / Stream / SharePoint / Drive). We never
--    store or stream the video. Posting REQUIRES a safeguarding
--    acknowledgement (teacher + shared screen only; no pupils on camera unless
--    consent is recorded), stored with who and when. Families/pupils of the
--    class see a "Watch recording" link; head/admin can see and remove all.
--
-- 2. Joining a lesson must never fail because of the attendance log.
--    lesson_joins_guard() is made tolerant, and log_lesson_join() is a
--    non-raising RPC the portal calls in the background AFTER the meeting
--    window is already open (returns false instead of an error).
--
-- Idempotent. audit_row_change() reads NEW/OLD.id, so the table keeps an id.

-- ── lesson_recording_links ───────────────────────────────────────────────
create table if not exists public.lesson_recording_links (
  id uuid primary key default gen_random_uuid(),
  lesson_instance_id uuid not null references public.lesson_instances(id) on delete cascade,
  url text not null check (char_length(url) <= 2000 and url ~* '^https://[^[:space:]]+$'),
  note text check (note is null or char_length(note) <= 300),
  consent_acknowledged boolean not null check (consent_acknowledged),
  consent_text text not null check (char_length(consent_text) between 10 and 1000),
  acknowledged_by uuid not null references public.profiles(id),
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists lesson_recording_links_lesson_idx on public.lesson_recording_links (lesson_instance_id);

alter table public.lesson_recording_links enable row level security;

drop policy if exists "lesson_recording_links: teacher of class manages" on public.lesson_recording_links;
create policy "lesson_recording_links: teacher of class manages"
  on public.lesson_recording_links for all
  to authenticated
  using (public.class_taught_by_current_user(public.lesson_instance_class_id(lesson_recording_links.lesson_instance_id)))
  with check (
    public.class_taught_by_current_user(public.lesson_instance_class_id(lesson_recording_links.lesson_instance_id))
    and acknowledged_by = auth.uid()
  );

drop policy if exists "lesson_recording_links: head_teacher/admin manage all" on public.lesson_recording_links;
create policy "lesson_recording_links: head_teacher/admin manage all"
  on public.lesson_recording_links for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']) and acknowledged_by = auth.uid());

drop policy if exists "lesson_recording_links: manage_academic staff read all" on public.lesson_recording_links;
create policy "lesson_recording_links: manage_academic staff read all"
  on public.lesson_recording_links for select
  to authenticated
  using (public.current_has_permission('manage_academic'));

drop policy if exists "lesson_recording_links: parent reads own child's lesson's" on public.lesson_recording_links;
create policy "lesson_recording_links: parent reads own child's lesson's"
  on public.lesson_recording_links for select
  to authenticated
  using (public.class_has_parents_child(public.lesson_instance_class_id(lesson_recording_links.lesson_instance_id)));

drop policy if exists "lesson_recording_links: student reads own lesson's" on public.lesson_recording_links;
create policy "lesson_recording_links: student reads own lesson's"
  on public.lesson_recording_links for select
  to authenticated
  using (public.class_has_students_own_enrolment(public.lesson_instance_class_id(lesson_recording_links.lesson_instance_id)));

-- Who/when is the server's, never the client's.
create or replace function public.lesson_recording_links_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.acknowledged_at := now();
  if auth.uid() is not null then
    new.acknowledged_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_recording_links_guard on public.lesson_recording_links;
create trigger lesson_recording_links_guard
  before insert on public.lesson_recording_links
  for each row execute function public.lesson_recording_links_guard();

drop trigger if exists audit_lesson_recording_links on public.lesson_recording_links;
create trigger audit_lesson_recording_links
  after insert or update or delete on public.lesson_recording_links
  for each row execute function public.audit_row_change();

-- ── lesson_joins: tolerant guard + non-raising logger ────────────────────
-- The join time is still always the server's. The old guard was a plain
-- assignment; this one is the same but cannot be tripped by a client-sent
-- value of any shape (the column is simply overwritten).
create or replace function public.lesson_joins_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.joined_at := date_trunc('milliseconds', now());
  return new;
end;
$$;

-- Records "I pressed Join" for the caller. Returns true when a row was
-- written, false when it was not allowed or anything went wrong. It never
-- raises, so the portal can call it fire-and-forget after opening the meeting.
create or replace function public.log_lesson_join(p_lesson_instance_id uuid, p_child_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_lesson_instance_id is null then
    return false;
  end if;

  if p_child_id is null then
    if not (public.i_teach_lesson(p_lesson_instance_id) or public.current_has_role(array['head_teacher', 'admin'])) then
      return false;
    end if;
    insert into public.lesson_joins (lesson_instance_id, user_id, child_id, role)
    values (p_lesson_instance_id, v_uid, null, 'teacher');
  else
    if not (public.child_belongs_to_parent(p_child_id) or public.child_belongs_to_student(p_child_id)) then
      return false;
    end if;
    if not exists (
      select 1 from public.enrolments e
      where e.child_id = p_child_id
        and e.class_id = public.lesson_instance_class_id(p_lesson_instance_id)
    ) then
      return false;
    end if;
    insert into public.lesson_joins (lesson_instance_id, user_id, child_id, role)
    values (p_lesson_instance_id, v_uid, p_child_id, 'child');
  end if;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.log_lesson_join(uuid, uuid) from public;
grant execute on function public.log_lesson_join(uuid, uuid) to authenticated;

-- ── storage: class-files (files a teacher attaches to a stream post or to
-- classwork material) ───────────────────────────────────────────────────
-- Private bucket. Path: '<class_id>/<file>'. Staff of the class upload; the
-- class's staff, families and pupils read. Files are opened inside the portal
-- (downloaded as a blob and shown in a viewer) so no storage address is shown.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'class-files',
  'class-files',
  false,
  26214400,
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf', 'text/rtf', 'text/plain', 'text/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "class-files: staff read" on storage.objects;
create policy "class-files: staff read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'class-files'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.current_has_permission('manage_academic')
      or public.class_taught_by_current_user(public.storage_path_uuid_part(name, 1))
    )
  );

drop policy if exists "class-files: class families read" on storage.objects;
create policy "class-files: class families read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'class-files'
    and (
      public.class_has_parents_child(public.storage_path_uuid_part(name, 1))
      or public.class_has_students_own_enrolment(public.storage_path_uuid_part(name, 1))
    )
  );

drop policy if exists "class-files: staff upload" on storage.objects;
create policy "class-files: staff upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'class-files'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.storage_path_uuid_part(name, 1))
    )
  );

drop policy if exists "class-files: staff delete" on storage.objects;
create policy "class-files: staff delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'class-files'
    and (
      public.current_has_role(array['head_teacher', 'admin'])
      or public.class_taught_by_current_user(public.storage_path_uuid_part(name, 1))
    )
  );

-- ── class_comments_for(): stream comments with author names ──────────────
-- Names live in profiles, which a pupil cannot read for classmates, so the
-- thread is read through this SECURITY DEFINER function. It applies the same
-- visibility as class_post_comments' policies: class members see live
-- comments; the class's teachers and head/admin also see removed ones.
create or replace function public.class_comments_for(p_class_id uuid)
returns table (
  id uuid,
  announcement_id uuid,
  material_id uuid,
  author_id uuid,
  author_name text,
  body text,
  created_at timestamptz,
  deleted_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.announcement_id, c.material_id, c.author_id,
         coalesce(p.full_name, 'Class member') as author_name,
         c.body, c.created_at, c.deleted_at
  from public.class_post_comments c
  left join public.profiles p on p.id = c.author_id
  where c.class_id = p_class_id
    and (
      public.class_taught_by_current_user(p_class_id)
      or public.current_has_role(array['head_teacher', 'admin'])
      or (
        c.deleted_at is null
        and (
          public.current_has_permission('manage_academic')
          or public.class_has_parents_child(p_class_id)
          or public.class_has_students_own_enrolment(p_class_id)
        )
      )
    )
  order by c.created_at;
$$;

revoke all on function public.class_comments_for(uuid) from public;
grant execute on function public.class_comments_for(uuid) to authenticated;

-- ── set_class_meeting_url(): let a class's own teacher set the class's
-- recurring meeting link (classes itself is only writable by academic admins).
create or replace function public.set_class_meeting_url(p_class_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if not (public.class_taught_by_current_user(p_class_id) or public.current_has_role(array['head_teacher', 'admin'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_url is not null and v_url !~* '^https://[^[:space:]]+$' then
    raise exception 'the meeting link must start with https://' using errcode = '22023';
  end if;
  update public.classes set meeting_url = v_url where id = p_class_id;
end;
$$;

revoke all on function public.set_class_meeting_url(uuid, text) from public;
grant execute on function public.set_class_meeting_url(uuid, text) to authenticated;
