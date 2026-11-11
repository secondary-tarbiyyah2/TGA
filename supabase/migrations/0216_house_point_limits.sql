-- House points as a proper system (owner feedback 11 Nov 2026, item 21): limits the head teacher sets, enforced
-- by the database. House points are merits (behaviour_records, kind 'merit', 0039) counted for the pupil's house
-- by house_standings() (0073); every award and every void is already in the audit log (audit_behaviour_records).
--
--  * house_point_settings: one row. The most points one award may give, and the most points one member of staff
--    may give one pupil in a day. Staff read it (so the award panel can say so); the head teacher and admin change it.
--  * A trigger refuses a merit over either limit, unless the head teacher or admin gives it. Existing policies are
--    unchanged.

create table if not exists public.house_point_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  max_per_award int not null default 5 check (max_per_award between 1 and 50),
  daily_cap_per_pupil int not null default 10 check (daily_cap_per_pupil between 1 and 200),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.house_point_settings (singleton) values (true) on conflict (singleton) do nothing;
alter table public.house_point_settings enable row level security;

drop policy if exists "house_point_settings: staff read" on public.house_point_settings;
create policy "house_point_settings: staff read" on public.house_point_settings for select to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover']));
drop policy if exists "house_point_settings: head updates" on public.house_point_settings;
create policy "house_point_settings: head updates" on public.house_point_settings for update to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create or replace function public.house_point_settings_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists house_point_settings_stamp on public.house_point_settings;
create trigger house_point_settings_stamp before update on public.house_point_settings
  for each row execute function public.house_point_settings_stamp();

drop trigger if exists audit_house_point_settings on public.house_point_settings;
create trigger audit_house_point_settings after insert or update or delete on public.house_point_settings
  for each row execute function public.audit_row_change();

-- The limits, checked on every new merit. SECURITY DEFINER so the day's total counts every merit the member of
-- staff gave that pupil, whatever they can read.
create or replace function public.behaviour_records_merit_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_max int;
  v_cap int;
  v_today int;
begin
  -- Not a merit, given by the head teacher or admin, or written by the system (no signed-in user): no limit.
  if new.kind <> 'merit' or new.voided_at is not null or auth.uid() is null or public.current_has_role(array['head_teacher', 'admin']) then
    return new;
  end if;
  select max_per_award, daily_cap_per_pupil into v_max, v_cap from public.house_point_settings where singleton limit 1;
  v_max := coalesce(v_max, 5);
  v_cap := coalesce(v_cap, 10);
  if new.points > v_max then
    raise exception 'One award can give at most % house points.', v_max using errcode = 'P0001';
  end if;
  select coalesce(sum(points), 0) into v_today
    from public.behaviour_records
   where child_id = new.child_id and recorded_by = new.recorded_by and kind = 'merit'
     and voided_at is null and occurred_on = new.occurred_on;
  if v_today + new.points > v_cap then
    raise exception 'You can give one pupil at most % house points a day (% given today).', v_cap, v_today using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists behaviour_records_merit_limits on public.behaviour_records;
create trigger behaviour_records_merit_limits before insert on public.behaviour_records
  for each row execute function public.behaviour_records_merit_limits();
