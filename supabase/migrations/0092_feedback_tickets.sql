-- Feedback and improvement tickets.
--
-- Anyone signed in to /learn (staff, parents, pupils) can send the school a
-- problem report, an idea or a question, with up to 5 files attached. The
-- browser also attaches a short log of what the person was just doing in
-- the portal (pages opened, buttons pressed, errors and failed requests),
-- so the team triaging it can see the context without a back-and-forth.
-- The person sees exactly what is attached before sending.
--
-- This is NOT the safeguarding route: worries about a child go through
-- Report a concern (safeguarding_concerns, 0015), which is locked to the
-- Safeguarding Lead and Headteacher. The form says so prominently.
--
-- Who can see what:
--   - The person who sent a ticket: their own tickets, including status
--     and the school's reply.
--   - Headteacher/admin: every ticket, and they alone can update/delete.
--   - Nobody else. Default deny.

create table if not exists public.feedback_tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  submitted_by uuid default auth.uid() references public.profiles(id) on delete set null,
  -- Snapshotted server-side by the trigger below, never trusted from the client.
  submitter_roles text[] not null default '{}',
  kind text not null check (kind in ('problem', 'idea', 'question')),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  details text not null check (char_length(details) between 1 and 5000),
  page_path text check (page_path is null or char_length(page_path) <= 500),
  -- [{t, type, detail}] — recorded by src/lib/learn/activityLog.ts
  activity jsonb not null default '[]'::jsonb check (jsonb_typeof(activity) = 'array' and jsonb_array_length(activity) <= 80),
  -- {userAgent, viewport, language, timeZone, online}
  environment jsonb check (environment is null or (jsonb_typeof(environment) = 'object' and pg_column_size(environment) < 4096)),
  -- [{path, name, mime, size}] in the feedback-attachments bucket
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5),
  status text not null default 'new' check (status in ('new', 'in_progress', 'planned', 'done', 'wont_fix')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  -- Reply shown to the person who sent it.
  response text check (response is null or char_length(response) <= 5000),
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_tickets_activity_size check (pg_column_size(activity) < 65536)
);

create index if not exists feedback_tickets_status_idx on public.feedback_tickets (status, created_at desc);
create index if not exists feedback_tickets_submitter_idx on public.feedback_tickets (submitted_by, created_at desc);

alter table public.feedback_tickets enable row level security;

-- ── Integrity: who sent it, and what a sender may set ──────────────────
create or replace function public.feedback_tickets_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb;
begin
  if auth.uid() is not null then
    new.submitted_by := auth.uid();
    new.submitter_roles := coalesce((select array_agg(distinct ur.role::text) from public.user_roles ur where ur.user_id = auth.uid()), '{}');
    -- A sender can only open a ticket; triage fields start blank.
    new.status := 'new';
    new.priority := 'normal';
    new.response := null;
    new.responded_by := null;
    new.responded_at := null;
    new.resolved_at := null;
    -- Attachments must be files the sender uploaded into their own folder.
    for a in select * from jsonb_array_elements(new.attachments) loop
      if coalesce(a->>'path', '') not like (auth.uid()::text || '/%') then
        raise exception 'attachment path not allowed' using errcode = '42501';
      end if;
    end loop;
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists feedback_tickets_before_insert on public.feedback_tickets;
create trigger feedback_tickets_before_insert
  before insert on public.feedback_tickets
  for each row execute function public.feedback_tickets_before_insert();

create or replace function public.feedback_tickets_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- What the sender wrote and what was attached never change after sending.
  new.number := old.number;
  new.submitted_by := old.submitted_by;
  new.submitter_roles := old.submitter_roles;
  new.kind := old.kind;
  new.title := old.title;
  new.details := old.details;
  new.page_path := old.page_path;
  new.attachments := old.attachments;
  new.created_at := old.created_at;
  -- activity/environment may only be cleared (retention), never rewritten.
  if new.activity is distinct from old.activity and new.activity <> '[]'::jsonb then
    new.activity := old.activity;
  end if;
  if new.environment is distinct from old.environment and new.environment is not null then
    new.environment := old.environment;
  end if;
  if new.response is distinct from old.response then
    new.responded_by := auth.uid();
    new.responded_at := case when new.response is null then null else now() end;
  end if;
  if new.status in ('done', 'wont_fix') and old.status not in ('done', 'wont_fix') then
    new.resolved_at := now();
  elsif new.status not in ('done', 'wont_fix') then
    new.resolved_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists feedback_tickets_before_update on public.feedback_tickets;
create trigger feedback_tickets_before_update
  before update on public.feedback_tickets
  for each row execute function public.feedback_tickets_before_update();

drop trigger if exists audit_feedback_tickets on public.feedback_tickets;
create trigger audit_feedback_tickets
  after insert or update or delete on public.feedback_tickets
  for each row execute function public.audit_row_change();

-- ── Policies ───────────────────────────────────────────────────────────
drop policy if exists "feedback_tickets: anyone signed in can send" on public.feedback_tickets;
create policy "feedback_tickets: anyone signed in can send"
  on public.feedback_tickets for insert
  to authenticated
  with check (submitted_by = auth.uid());

drop policy if exists "feedback_tickets: read own" on public.feedback_tickets;
create policy "feedback_tickets: read own"
  on public.feedback_tickets for select
  to authenticated
  using (submitted_by = auth.uid());

drop policy if exists "feedback_tickets: head/admin read all" on public.feedback_tickets;
create policy "feedback_tickets: head/admin read all"
  on public.feedback_tickets for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "feedback_tickets: head/admin update" on public.feedback_tickets;
create policy "feedback_tickets: head/admin update"
  on public.feedback_tickets for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "feedback_tickets: head/admin delete" on public.feedback_tickets;
create policy "feedback_tickets: head/admin delete"
  on public.feedback_tickets for delete
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- ── storage: feedback-attachments (private) ────────────────────────────
-- Path: '<sender user id>/<upload batch uuid>/<file>'. People can only write
-- into, read from and tidy up their own folder; head/admin can read all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments',
  'feedback-attachments',
  false,
  10485760, -- 10MB per file
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "feedback-attachments: upload own" on storage.objects;
create policy "feedback-attachments: upload own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'feedback-attachments' and public.storage_path_uuid_part(name, 1) = auth.uid());

drop policy if exists "feedback-attachments: read own or head/admin" on storage.objects;
create policy "feedback-attachments: read own or head/admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and (public.storage_path_uuid_part(name, 1) = auth.uid() or public.current_has_role(array['head_teacher', 'admin']))
  );

drop policy if exists "feedback-attachments: delete own or head/admin" on storage.objects;
create policy "feedback-attachments: delete own or head/admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and (public.storage_path_uuid_part(name, 1) = auth.uid() or public.current_has_role(array['head_teacher', 'admin']))
  );

-- ── Retention (registered with the central registry, 0015) ─────────────
insert into public.retention_schedule (data_type, description, retention_period, action_on_expiry, owner_job)
values
  ('Feedback ticket activity logs', 'feedback_tickets.activity and environment (pages visited, errors, browser details)', 'Cleared 90 days after the ticket is closed', 'delete', 'scripts/compliance-retention.mjs'),
  ('Feedback tickets', 'feedback_tickets rows and their files in feedback-attachments', '2 years after the ticket is closed', 'delete', 'scripts/compliance-retention.mjs')
on conflict (data_type) do nothing;
