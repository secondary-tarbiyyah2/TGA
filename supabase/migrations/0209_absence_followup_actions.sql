-- Pupil absences you can act on (owner feedback 11 Nov 2026, item 20): the follow-up queue gains a decision
-- (authorised or not) and a portal message as a way of contacting the family. Everything else (log a call,
-- reason, escalate to the head teacher, close, reminders through next_action_due, the history in
-- absence_followup_events) already exists (0049, 0130). Policies are unchanged: the head teacher and admin
-- manage follow-ups; teachers read their own pupils' (0098); parents see only the status.

alter table public.absence_followups
  add column if not exists authorised boolean,
  add column if not exists decided_by uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at timestamptz;

alter table public.absence_followups drop constraint if exists absence_followups_contact_method_check;
alter table public.absence_followups add constraint absence_followups_contact_method_check
  check (contact_method is null or contact_method in ('call', 'sms', 'email', 'message'));

alter table public.absence_followup_events drop constraint if exists absence_followup_events_method_check;
alter table public.absence_followup_events add constraint absence_followup_events_method_check
  check (method is null or method in ('call', 'sms', 'email', 'message'));

-- Who decided, and when, is stamped by the database.
create or replace function public.absence_followups_decision_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.authorised is distinct from (case when tg_op = 'UPDATE' then old.authorised else null end) then
    new.decided_by := auth.uid();
    new.decided_at := case when new.authorised is null then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists absence_followups_decision_stamp on public.absence_followups;
create trigger absence_followups_decision_stamp before insert or update on public.absence_followups
  for each row execute function public.absence_followups_decision_stamp();
