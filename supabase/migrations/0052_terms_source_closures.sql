-- 0052: portal-managed terms, half-term breaks and school closures.
--
-- Terms can now be created in the portal calendar (Headteacher / Admin with
-- manage_academic) as well as synced from Sanity. `source` records who owns
-- a row: 'sanity' rows belong to scripts/sync-terms-from-sanity.mjs and are
-- read-only in the portal; 'portal' rows are never touched by the sync.

alter table public.terms
  add column if not exists source text not null default 'portal',
  add column if not exists half_term_starts_on date,
  add column if not exists half_term_ends_on date;

-- Anything already synced from Sanity keeps being sanity-owned.
update public.terms set source = 'sanity' where sanity_document_id is not null and source <> 'sanity';

alter table public.terms drop constraint if exists terms_source_check;
alter table public.terms add constraint terms_source_check check (source in ('portal', 'sanity'));

alter table public.terms drop constraint if exists terms_half_term_check;
alter table public.terms add constraint terms_half_term_check check (
  (half_term_starts_on is null and half_term_ends_on is null)
  or (
    half_term_starts_on is not null and half_term_ends_on is not null
    and half_term_ends_on >= half_term_starts_on
    and half_term_starts_on >= starts_on and half_term_ends_on <= ends_on
  )
);

-- Keep Sanity rows protected, now keyed on `source` as well.
create or replace function public.protect_sanity_owned_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := current_setting('request.jwt.claims', true)::json->>'role';
begin
  if coalesce(v_jwt_role, '') = 'service_role' then
    return new; -- the sync script is the source of truth for these rows
  end if;
  if tg_op = 'UPDATE' and (old.sanity_document_id is not null or old.source = 'sanity') then
    raise exception 'terms: rows synced from Sanity cannot be edited directly — edit the term date in Sanity instead';
  end if;
  if tg_op = 'INSERT' and (new.sanity_document_id is not null or new.source = 'sanity') then
    raise exception 'terms: Sanity-sourced rows can only be created by the sync script';
  end if;
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    raise exception 'terms: source cannot be changed';
  end if;
  return new;
end;
$$;

-- Deleting a Sanity-owned row from the portal is also blocked.
create or replace function public.protect_sanity_owned_terms_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := current_setting('request.jwt.claims', true)::json->>'role';
begin
  if coalesce(v_jwt_role, '') <> 'service_role' and (old.sanity_document_id is not null or old.source = 'sanity') then
    raise exception 'terms: rows synced from Sanity cannot be deleted here';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_sanity_owned_terms_delete on public.terms;
create trigger protect_sanity_owned_terms_delete
  before delete on public.terms
  for each row execute function public.protect_sanity_owned_terms_delete();

-- ── school_closures: INSET days, holidays, unplanned closures ───────────
create table if not exists public.school_closures (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid references public.academic_years(id) on delete set null,
  kind text not null default 'closure' check (kind in ('inset', 'holiday', 'closure')),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint school_closures_date_order check (ends_on >= starts_on)
);

create index if not exists school_closures_dates_idx on public.school_closures (starts_on, ends_on);

alter table public.school_closures enable row level security;

drop policy if exists "school_closures: authenticated read" on public.school_closures;
create policy "school_closures: authenticated read"
  on public.school_closures for select
  to authenticated
  using (true);

drop policy if exists "school_closures: staff with manage_academic write" on public.school_closures;
create policy "school_closures: staff with manage_academic write"
  on public.school_closures for all
  to authenticated
  using (public.current_has_permission('manage_academic'))
  with check (public.current_has_permission('manage_academic'));
