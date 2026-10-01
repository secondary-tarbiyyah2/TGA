-- Parent PIN: stops children on a shared device from opening the family
-- area of a parent account. Hash lives in user_pins (no client access at
-- all); everything goes through SECURITY DEFINER RPCs.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_pins enable row level security;
-- No policies: default-deny. Also remove table privileges for good measure.
revoke all on public.user_pins from anon, authenticated;

create or replace function public.has_my_pin()
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
  select exists (select 1 from public.user_pins where user_id = auth.uid());
$$;

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
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
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
      set pin_hash = crypt(p_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null, updated_at = now()
      where user_id = v_uid;
  else
    insert into public.user_pins (user_id, pin_hash) values (v_uid, crypt(p_pin, gen_salt('bf')));
  end if;
end;
$$;

-- Returns true/false. After 5 wrong tries the PIN is locked for 15 minutes
-- (a locked PIN returns false even if correct).
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
  if not found then return true; end if; -- no PIN set: nothing to verify
  if v_row.locked_until is not null and v_row.locked_until > now() then return false; end if;
  if p_pin is not null and v_row.pin_hash = crypt(p_pin, v_row.pin_hash) then
    update public.user_pins set failed_attempts = 0, locked_until = null where user_id = v_uid;
    return true;
  end if;
  update public.user_pins
    set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where user_id = v_uid;
  return false;
end;
$$;

-- Lets the UI show "locked for N minutes" without exposing the hash.
create or replace function public.my_pin_lock_remaining()
returns int
language sql
security definer
set search_path = public, extensions
stable
as $$
  select coalesce(
    (select greatest(0, ceil(extract(epoch from (locked_until - now())))::int)
       from public.user_pins where user_id = auth.uid() and locked_until > now()), 0);
$$;

-- Forgotten PIN: Headteacher / admin only. Audited.
create or replace function public.admin_reset_pin(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.current_has_role(array['head_teacher', 'admin']::public.learn_role[]) then
    raise exception 'Only the Headteacher or an admin can reset a PIN';
  end if;
  delete from public.user_pins where user_id = p_user;
  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()),
          'RESET_PIN', 'user_pins', p_user::text, null);
end;
$$;

revoke all on function public.has_my_pin() from public, anon;
revoke all on function public.set_my_pin(text, text) from public, anon;
revoke all on function public.verify_my_pin(text) from public, anon;
revoke all on function public.my_pin_lock_remaining() from public, anon;
revoke all on function public.admin_reset_pin(uuid) from public, anon;
grant execute on function public.has_my_pin() to authenticated;
grant execute on function public.set_my_pin(text, text) to authenticated;
grant execute on function public.verify_my_pin(text) to authenticated;
grant execute on function public.my_pin_lock_remaining() to authenticated;
grant execute on function public.admin_reset_pin(uuid) to authenticated;
