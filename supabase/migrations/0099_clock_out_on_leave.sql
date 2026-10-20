-- Clock out when you leave the portal.
--
-- While any portal tab is open, the page sends a heartbeat every minute
-- (shift_heartbeat). Close the last tab, or the computer sleeps, and the
-- heartbeats stop: within a few minutes the shift is closed at the time of
-- the last heartbeat, so the hours recorded are the hours the portal was
-- actually open. Refreshing or moving between pages never clocks anyone out
-- (the next heartbeat arrives well inside the 3-minute window), and several
-- tabs count as one session.
--
-- The existing rule still applies too: a shift open longer than the school's
-- auto_clock_out_hours is closed at that limit.

alter table public.staff_shifts
  add column if not exists last_seen_at timestamptz;

update public.staff_shifts set last_seen_at = coalesce(clocked_out_at, now()) where last_seen_at is null;
alter table public.staff_shifts alter column last_seen_at set default now();

-- "I'm still here": refreshes the caller's own open shift.
create or replace function public.shift_heartbeat()
returns void
language sql
security definer
set search_path = public
as $$
  update public.staff_shifts
  set last_seen_at = now()
  where user_id = auth.uid() and clocked_out_at is null;
$$;

revoke all on function public.shift_heartbeat() from public, anon;
grant execute on function public.shift_heartbeat() to authenticated;

create or replace function public.close_stale_shifts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours int;
  v_count int := 0;
  v_more int;
begin
  -- Left the portal: no heartbeat for 3 minutes -> out at the last heartbeat.
  update public.staff_shifts
  set clocked_out_at = greatest(last_seen_at, clocked_in_at),
      auto_closed = true
  where clocked_out_at is null
    and last_seen_at is not null
    and last_seen_at < now() - interval '3 minutes';
  get diagnostics v_count = row_count;

  -- Forgot to clock out at all: the school's maximum shift length.
  select auto_clock_out_hours into v_hours from public.lms_settings where id;
  if v_hours is not null then
    update public.staff_shifts
    set clocked_out_at = clocked_in_at + make_interval(hours => v_hours),
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

-- Close stale shifts every two minutes, even when nobody has the portal open.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'close-stale-shifts';
    perform cron.schedule('close-stale-shifts', '*/2 * * * *', 'select public.close_stale_shifts()');
  end if;
exception when others then
  raise notice 'close-stale-shifts not scheduled: %', sqlerrm;
end $$;

-- ── Parent PIN becomes optional ──────────────────────────────────────────
-- Children have their own logins, so a Parent PIN is only needed when they
-- also use a device the parent is signed in on. Parents can now turn it on
-- or off in Account (turning it off needs the current PIN).
create or replace function public.remove_my_pin(p_current text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.verify_my_pin(p_current) then
    raise exception 'That PIN isn''t right' using errcode = '28000';
  end if;
  delete from public.user_pins where user_id = v_uid;
end;
$$;

revoke all on function public.remove_my_pin(text) from public, anon;
grant execute on function public.remove_my_pin(text) to authenticated;
