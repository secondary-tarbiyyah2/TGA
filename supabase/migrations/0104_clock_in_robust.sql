-- Clock-in rules, made robust.
--  1. Real use only: the page sends "active" heartbeats while someone is using it. A tab left open
--     (no mouse, keyboard or touch for 30 minutes) stops refreshing the shift, so it closes at the
--     last real activity instead of running overnight.
--  2. A realistic grace window: a shift closes after 10 minutes with no heartbeat (was 3), because
--     browsers slow background tabs and laptops nap. The hours recorded are still up to the LAST
--     heartbeat, so the grace never adds time.
--  3. Works without a scheduler: every heartbeat also closes anyone else's stale shift, so it does not
--     rely on pg_cron being enabled.
--  4. The maximum shift length still applies, and a closed shift can never end before it started.

alter table public.lms_settings
  add column if not exists heartbeat_grace_minutes int not null default 10 check (heartbeat_grace_minutes between 3 and 60);

create or replace function public.close_stale_shifts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours int;
  v_grace int;
  v_count int := 0;
  v_more int;
begin
  select auto_clock_out_hours, heartbeat_grace_minutes into v_hours, v_grace from public.lms_settings where id;
  v_grace := coalesce(v_grace, 10);

  -- Stopped being active: out at the last real activity.
  update public.staff_shifts
  set clocked_out_at = greatest(last_seen_at, clocked_in_at),
      auto_closed = true
  where clocked_out_at is null
    and last_seen_at is not null
    and last_seen_at < now() - make_interval(mins => v_grace);
  get diagnostics v_count = row_count;

  -- Forgot to clock out at all: the school's maximum shift length.
  if v_hours is not null then
    update public.staff_shifts
    set clocked_out_at = least(clocked_in_at + make_interval(hours => v_hours), greatest(coalesce(last_seen_at, clocked_in_at), clocked_in_at)),
        auto_closed = true
    where clocked_out_at is null
      and clocked_in_at + make_interval(hours => v_hours) < now();
    get diagnostics v_more = row_count;
    v_count := v_count + v_more;
  end if;
  return v_count;
end;
$$;

revoke all on function public.close_stale_shifts() from public, anon;
grant execute on function public.close_stale_shifts() to authenticated;

drop function if exists public.shift_heartbeat();

-- "I'm still here". p_active false means the page is open but nobody is using it: the shift is not refreshed.
create or replace function public.shift_heartbeat(p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_active then
    update public.staff_shifts
    set last_seen_at = now()
    where user_id = auth.uid() and clocked_out_at is null;
  end if;
  perform public.close_stale_shifts();
end;
$$;

revoke all on function public.shift_heartbeat(boolean) from public, anon;
grant execute on function public.shift_heartbeat(boolean) to authenticated;

-- Coming back within 15 minutes of being closed for inactivity (a laptop that slept, a long call away
-- from the keyboard) resumes the same shift instead of starting a new one, so there are no tiny gaps.
-- A shift closed by the maximum length, or by an admin, is never resumed.
create or replace function public.clock_in_or_resume(p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hours int;
  v_last public.staff_shifts;
begin
  if v_uid is null or not public.is_staff_member(v_uid) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_shifts where user_id = v_uid and clocked_out_at is null) then
    return 'already_in';
  end if;
  select auto_clock_out_hours into v_hours from public.lms_settings where id;
  v_hours := coalesce(v_hours, 12);
  select * into v_last from public.staff_shifts where user_id = v_uid order by clocked_in_at desc limit 1;
  if found
     and v_last.auto_closed
     and v_last.clocked_out_by is null
     and v_last.clocked_out_at is not null
     and v_last.clocked_out_at > now() - interval '15 minutes'
     and v_last.clocked_in_at + make_interval(hours => v_hours) > now() then
    update public.staff_shifts set clocked_out_at = null, auto_closed = false, last_seen_at = now() where id = v_last.id;
    return 'resumed';
  end if;
  insert into public.staff_shifts (user_id, note) values (v_uid, nullif(btrim(p_note), ''));
  return 'started';
end;
$$;

revoke all on function public.clock_in_or_resume(text) from public, anon;
grant execute on function public.clock_in_or_resume(text) to authenticated;
