-- Absence follow-up: escalation happens on the case itself.
--
-- Before this, "Escalate to Headteacher" on an absence card set the status
-- and then sent the member of staff to "Report a concern", which is the
-- safeguarding form. Most escalations are not safeguarding matters (a family
-- that cannot be reached for two days, say), so the escalation is now recorded
-- on the follow-up case: who escalated, when, an optional note, and when the
-- Headteacher / safeguarding lead were emailed (absence-escalate Edge
-- Function). Raising a safeguarding concern stays a separate, deliberate step.
--
-- Who may write is unchanged: head_teacher/admin manage follow-ups (0049,
-- 0098). escalated_by / escalated_at are stamped by the database, never
-- trusted from the client.

alter table public.absence_followups
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_by uuid references public.profiles(id) on delete set null,
  add column if not exists escalation_note text check (escalation_note is null or char_length(escalation_note) <= 1000),
  add column if not exists escalation_notified_at timestamptz;

create or replace function public.absence_followups_escalation_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'escalated' and (tg_op = 'INSERT' or old.status is distinct from 'escalated') then
    new.escalated_at := now();
    new.escalated_by := coalesce(auth.uid(), new.escalated_by);
    -- A fresh escalation needs a fresh email.
    if tg_op = 'UPDATE' then
      new.escalation_notified_at := null;
    end if;
  elsif tg_op = 'UPDATE' and auth.uid() is not null then
    -- Clients cannot rewrite who escalated or when.
    new.escalated_at := old.escalated_at;
    new.escalated_by := old.escalated_by;
  end if;
  return new;
end;
$$;

drop trigger if exists absence_followups_escalation_stamp on public.absence_followups;
create trigger absence_followups_escalation_stamp
  before insert or update on public.absence_followups
  for each row execute function public.absence_followups_escalation_stamp();

create index if not exists absence_followups_escalated_idx on public.absence_followups (escalated_at desc) where status = 'escalated';
