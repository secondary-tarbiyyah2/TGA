-- Absence reasons + follow-up workflow.
--  * absence_reasons: staff-recorded reason code/note per child per day
--    (kept separate from attendance_records so it works from the register
--    or the Absences page and is never exposed to parents).
--  * absence_followups: one case per child+day for unexplained absences.
--  * absence_followup_events: contact log / status history (staff only).
-- Parents see only the status of their own child's follow-up, never the log.
-- A parent's absence note (absence_notes insert) closes the loop automatically.

create table public.absence_reasons (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  absence_date date not null,
  reason_code text not null check (reason_code in ('illness','medical_appointment','family_emergency','religious_observance','holiday','unknown','other')),
  note text,
  recorded_by uuid not null default auth.uid() references public.profiles(id),
  recorded_at timestamptz not null default now(),
  unique (child_id, absence_date)
);
create index absence_reasons_date_idx on public.absence_reasons (absence_date);
alter table public.absence_reasons enable row level security;

create policy "absence_reasons: head_teacher/admin manage all"
  on public.absence_reasons for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "absence_reasons: teacher manages own class's children"
  on public.absence_reasons for all to authenticated
  using (public.child_enrolled_in_teachers_class(absence_reasons.child_id))
  with check (public.child_enrolled_in_teachers_class(absence_reasons.child_id));

create table public.absence_followups (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  absence_date date not null,
  status text not null default 'open' check (status in ('open','contacted','explained','escalated','closed')),
  assigned_to uuid references public.profiles(id),
  contact_method text check (contact_method in ('call','sms','email')),
  next_action_due date,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (child_id, absence_date)
);
create index absence_followups_status_idx on public.absence_followups (status, absence_date);
alter table public.absence_followups enable row level security;

create policy "absence_followups: head_teacher/admin manage all"
  on public.absence_followups for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "absence_followups: teacher manages own class's children"
  on public.absence_followups for all to authenticated
  using (public.child_enrolled_in_teachers_class(absence_followups.child_id))
  with check (public.child_enrolled_in_teachers_class(absence_followups.child_id));

create policy "absence_followups: parent reads own children's status"
  on public.absence_followups for select to authenticated
  using (public.child_belongs_to_parent(absence_followups.child_id));

create table public.absence_followup_events (
  id uuid primary key default gen_random_uuid(),
  followup_id uuid not null references public.absence_followups(id) on delete cascade,
  kind text not null check (kind in ('contact','status','note')),
  method text check (method in ('call','sms','email')),
  outcome text check (outcome in ('reached','no_answer','left_message','wrong_number','other')),
  note text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index absence_followup_events_idx on public.absence_followup_events (followup_id, created_at);
alter table public.absence_followup_events enable row level security;

create policy "absence_followup_events: head_teacher/admin manage all"
  on public.absence_followup_events for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "absence_followup_events: teacher manages own class's children"
  on public.absence_followup_events for all to authenticated
  using (exists (select 1 from public.absence_followups f where f.id = followup_id and public.child_enrolled_in_teachers_class(f.child_id)))
  with check (exists (select 1 from public.absence_followups f where f.id = followup_id and public.child_enrolled_in_teachers_class(f.child_id)));

-- Stamp updated_at / closed_at.
create or replace function public.absence_followups_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status in ('explained','closed') then
    new.closed_at := coalesce(old.closed_at, now());
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;
create trigger absence_followups_guard before update on public.absence_followups
  for each row execute function public.absence_followups_guard();

-- Recording a real reason explains the follow-up.
create or replace function public.absence_reason_explains()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reason_code <> 'unknown' then
    update public.absence_followups
       set status = 'explained'
     where child_id = new.child_id and absence_date = new.absence_date
       and status in ('open','contacted','escalated');
  end if;
  return new;
end;
$$;
create trigger absence_reason_explains after insert or update on public.absence_reasons
  for each row execute function public.absence_reason_explains();

-- A parent's note closes the loop for every day it covers.
create or replace function public.absence_note_closes_followups()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  with updated as (
    update public.absence_followups
       set status = 'explained'
     where child_id = new.child_id
       and absence_date between new.from_date and new.to_date
       and status in ('open','contacted','escalated')
     returning id
  )
  insert into public.absence_followup_events (followup_id, kind, note, created_by)
  select id, 'status', 'Parent replied with a note; marked explained.', new.parent_user_id from updated;
  return new;
end;
$$;
create trigger absence_note_closes_followups after insert on public.absence_notes
  for each row execute function public.absence_note_closes_followups();

create trigger audit_absence_reasons after insert or update or delete on public.absence_reasons
  for each row execute function public.audit_row_change();
create trigger audit_absence_followups after insert or update or delete on public.absence_followups
  for each row execute function public.audit_row_change();
create trigger audit_absence_followup_events after insert or update or delete on public.absence_followup_events
  for each row execute function public.audit_row_change();
