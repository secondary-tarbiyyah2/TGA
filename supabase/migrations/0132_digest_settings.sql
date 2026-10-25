-- Weekly parent digest: which sections go in the Friday email.
--
-- One row (id = true). Headteacher/Admin read and change it from the
-- Weekly digest page's Settings view; the weekly-digest Edge Function reads it
-- with the service role and leaves out any section switched off. With no row
-- every section is included, exactly as before.

create table if not exists public.digest_settings (
  id boolean primary key default true check (id),
  include_attendance boolean not null default true,
  include_homework boolean not null default true,
  include_merits boolean not null default true,
  include_comments boolean not null default true,
  include_star boolean not null default true,
  include_next_week boolean not null default true,
  intro text check (intro is null or char_length(intro) <= 600),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.digest_settings enable row level security;

drop policy if exists "digest_settings: head_teacher/admin manage" on public.digest_settings;
create policy "digest_settings: head_teacher/admin manage"
  on public.digest_settings for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create or replace function public.digest_settings_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists digest_settings_stamp on public.digest_settings;
create trigger digest_settings_stamp
  before insert or update on public.digest_settings
  for each row execute function public.digest_settings_stamp();

insert into public.digest_settings (id) values (true) on conflict (id) do nothing;
