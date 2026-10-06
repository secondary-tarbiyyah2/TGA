-- Parent PIN: compulsory and exactly 6 digits.
--
--  * set_my_pin() now accepts only 6 digits (was 4-6).
--  * user_pins.needs_reset marks a PIN created under the old 4-6 digit rule.
--    The hash can't tell us the length, but verify_my_pin() sees the
--    plaintext at the moment of a correct entry, so a correct non-6-digit
--    PIN flips needs_reset on; the client then forces a re-set (using the
--    old PIN as p_current) before the family area opens. A correct 6-digit
--    entry clears it.
--  * my_pin_status() lets the UI tell 'none' / 'ok' / 'reset' in one call.
--
-- Idempotent. Table stays default-deny with no client privileges (0053).

alter table public.user_pins add column if not exists needs_reset boolean not null default false;

create or replace function public.set_my_pin(p_pin text, p_current text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_pins%rowtype;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits';
  end if;

  select * into v_row from public.user_pins where user_id = v_uid for update;
  if found then
    if v_row.locked_until is not null and v_row.locked_until > now() then
      raise exception 'Too many wrong attempts. Try again later.';
    end if;
    if p_current is null or v_row.pin_hash <> crypt(p_current, v_row.pin_hash) then
      update public.user_pins
        set failed_attempts = failed_attempts + 1,
            locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
        where user_id = v_uid;
      raise exception 'Current PIN is incorrect';
    end if;
    update public.user_pins
      set pin_hash = crypt(p_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null,
          needs_reset = false, updated_at = now()
      where user_id = v_uid;
  else
    insert into public.user_pins (user_id, pin_hash, needs_reset) values (v_uid, crypt(p_pin, gen_salt('bf')), false);
  end if;
end;
$$;

create or replace function public.verify_my_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_pins%rowtype;
begin
  if v_uid is null then return false; end if;
  select * into v_row from public.user_pins where user_id = v_uid for update;
  if not found then return true; end if; -- no PIN set: nothing to verify (the UI forces one to be created)
  if v_row.locked_until is not null and v_row.locked_until > now() then return false; end if;
  if p_pin is not null and v_row.pin_hash = crypt(p_pin, v_row.pin_hash) then
    update public.user_pins
      set failed_attempts = 0, locked_until = null, needs_reset = (p_pin !~ '^[0-9]{6}$')
      where user_id = v_uid;
    return true;
  end if;
  update public.user_pins
    set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where user_id = v_uid;
  return false;
end;
$$;

-- 'none' (must create one), 'reset' (old-format PIN: must choose a 6-digit one), 'ok'.
create or replace function public.my_pin_status()
returns text
language sql
security definer
set search_path = public, extensions
stable
as $$
  select case
    when not exists (select 1 from public.user_pins where user_id = auth.uid()) then 'none'
    when exists (select 1 from public.user_pins where user_id = auth.uid() and needs_reset) then 'reset'
    else 'ok'
  end;
$$;

revoke all on function public.set_my_pin(text, text) from public, anon;
revoke all on function public.verify_my_pin(text) from public, anon;
revoke all on function public.my_pin_status() from public, anon;
grant execute on function public.set_my_pin(text, text) to authenticated;
grant execute on function public.verify_my_pin(text) to authenticated;
grant execute on function public.my_pin_status() to authenticated;
