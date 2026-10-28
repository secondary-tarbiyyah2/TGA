-- Report an absence by email.
--
-- Parents email absence@globalacademy.tarbiyyah.co.uk. Resend receives it and
-- calls the inbound-absence Edge Function, which stores every message here,
-- reads it, and either records absence_notes (source 'email') or leaves it
-- for staff review on the Absences page ("Emails" tab).
--
-- Default deny, as elsewhere: only the Headteacher and Admin can read these
-- rows. There are no client write policies at all; every write goes through
-- the Edge Function with the service-role key (webhook) or after it has
-- re-checked the signed-in user's role (staff confirm / dismiss).

-- ── inbound_absence_emails ──────────────────────────────────────────────
create table if not exists public.inbound_absence_emails (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  -- Resend's email id: unique, so webhook retries never create a second row.
  provider_email_id text not null unique,
  message_id text,
  received_at timestamptz not null default now(),
  from_email text not null,
  from_name text,
  to_email text,
  subject text not null default '',
  body_text text not null default '' check (char_length(body_text) <= 8000),
  -- SPF / DKIM / DMARC as reported by Resend's receiving server.
  auth jsonb,
  sender_verified boolean not null default false,
  parent_user_id uuid references public.profiles(id) on delete set null,
  -- The children this sender may report for (their own, or as a second contact).
  candidate_child_ids uuid[] not null default '{}',
  -- Cleaned text, the rules' reading, the model's reading (if used) and the suggestion.
  parsed jsonb not null default '{}'::jsonb,
  status text not null default 'needs_review'
    check (status in ('recorded', 'needs_review', 'rejected', 'duplicate', 'dismissed')),
  review_reasons text[] not null default '{}',
  note_ids uuid[] not null default '{}',
  reply_sent boolean not null default false,
  reply_detail text,
  error text,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  staff_note text,
  created_at timestamptz not null default now()
);

create index if not exists inbound_absence_emails_status_idx on public.inbound_absence_emails (status, received_at desc);
create index if not exists inbound_absence_emails_from_idx on public.inbound_absence_emails (lower(from_email), received_at desc);

alter table public.inbound_absence_emails enable row level security;

drop policy if exists "inbound_absence_emails: head_teacher/admin read" on public.inbound_absence_emails;
create policy "inbound_absence_emails: head_teacher/admin read"
  on public.inbound_absence_emails for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop trigger if exists audit_inbound_absence_emails on public.inbound_absence_emails;
create trigger audit_inbound_absence_emails
  after update or delete on public.inbound_absence_emails
  for each row execute function public.audit_row_change();

comment on table public.inbound_absence_emails is 'Absence emails received at absence@globalacademy.tarbiyyah.co.uk (Resend Inbound) and what the portal did with them.';

-- ── absence_notes: where a note came from ───────────────────────────────
alter table public.absence_notes
  add column if not exists source text not null default 'portal',
  add column if not exists inbound_email_id uuid references public.inbound_absence_emails(id) on delete set null;

alter table public.absence_notes drop constraint if exists absence_notes_source_check;
alter table public.absence_notes add constraint absence_notes_source_check check (source in ('portal', 'email', 'staff'));

create index if not exists absence_notes_inbound_email_idx on public.absence_notes (inbound_email_id) where inbound_email_id is not null;

-- Parents (and teachers) can't label their own notes as coming from email or
-- point them at an inbound message; only the service role (Edge Functions,
-- where auth.uid() is null) and the Headteacher/Admin can.
create or replace function public.absence_notes_source_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.current_has_role(array['head_teacher', 'admin']) then
    if tg_op = 'INSERT' then
      new.source := 'portal';
      new.inbound_email_id := null;
    else
      new.source := old.source;
      new.inbound_email_id := old.inbound_email_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists absence_notes_source_guard on public.absence_notes;
create trigger absence_notes_source_guard
  before insert or update on public.absence_notes
  for each row execute function public.absence_notes_source_guard();
