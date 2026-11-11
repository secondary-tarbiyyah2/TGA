-- Tafweed T52: a Digital Lead role (owner, 11 November 2026: "build digital lead role").
--
-- Policy 02 names a Digital Lead who reviews the audit logs monthly and on any
-- concern, checks accounts and access, does a termly settings check and keeps
-- a record of each review. Until now only the Headteacher and Admin could open
-- the audit log, so a Digital Lead who was neither could not do the job.
--
-- This adds:
--
--   * a staff role 'digital_lead' ("Digital Lead"), set by the Headteacher in
--     People › Staff like the other staff roles (admin_set_staff_roles) or
--     chosen when inviting the account. It can be held alongside any other
--     role (a teacher who is also the Digital Lead).
--   * can_review_audit_log(): Headteacher, Admin or Digital Lead. The audit
--     log viewer, its filters and its export (0075) now admit it. The viewer
--     still masks restricted records exactly as before, and the Digital Lead
--     gets no direct SELECT on audit_log: only the masked viewer.
--   * access_review_accounts(): every staff account with its roles, add-on
--     permissions, whether it is active and when it last signed in.
--     access_review_counts(): family and pupil accounts as totals only (no
--     names), with how many never signed in or not in the last 90 days.
--   * access_review_sign_ins(days): sign-in attempts per email address over
--     the last days (failed, succeeded, last failure, how many networks),
--     read from login_attempts. Network addresses stay hashed.
--   * digital_reviews: the record of reviews policy 02 asks for (date, kind,
--     what was checked, findings, actions). Headteacher, Admin and Digital
--     Lead read and add; nobody edits or deletes (a review is a record).
--     Each one is written to the audit log.
--
-- Read only on purpose: the Digital Lead gets nothing that changes grades,
-- money, safeguarding records, pupil records or anyone's roles. No existing
-- policy is widened beyond the lines above. Idempotent.

-- ── the role ────────────────────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in select conname from pg_constraint where contypid = 'public.learn_role'::regtype and contype = 'c' loop
    execute format('alter domain public.learn_role drop constraint %I', c.conname);
  end loop;
end;
$$;

-- NOT VALID for the same reason as 0186 (the domain is also used in arrays).
alter domain public.learn_role add constraint learn_role_check
  check (value in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco', 'digital_lead', 'parent', 'student')) not valid;

-- A Digital Lead is a member of staff (staff lists, clock-in, staff messages).
create or replace function public.is_staff_member(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco', 'digital_lead')
  );
$$;
revoke execute on function public.is_staff_member(uuid) from public, anon;
grant execute on function public.is_staff_member(uuid) to authenticated, service_role;

-- Same as 0186, listing Digital Lead accounts too.
create or replace function public.admin_staff_directory()
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  display_title text,
  roles text[],
  active boolean,
  is_dsl boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or an admin can view the staff list' using errcode = '42501';
  end if;
  return query
  select ur.user_id,
         coalesce(nullif(p.full_name, ''), 'Unnamed')::text,
         p.email::text,
         sp.phone::text,
         sp.display_title::text,
         array_agg(distinct ur.role::text order by ur.role::text),
         coalesce(sp.active, true),
         exists (select 1 from public.user_permissions up where up.user_id = ur.user_id and up.permission = 'safeguarding_lead')
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join public.staff_profiles sp on sp.user_id = ur.user_id
  where ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco', 'digital_lead')
  group by ur.user_id, p.full_name, p.email, sp.phone, sp.display_title, sp.active
  order by 2;
end;
$$;
revoke all on function public.admin_staff_directory() from public, anon;
grant execute on function public.admin_staff_directory() to authenticated;

-- Same as 0186, with 'digital_lead' among the roles the Headteacher can set.
-- Only the Headteacher sets roles (unchanged): the Digital Lead reviews what
-- admins do, so admins do not choose their own reviewer.
create or replace function public.admin_set_staff_roles(p_user uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed constant text[] := array['admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco', 'digital_lead'];
  v_role text;
begin
  if not public.current_has_role(array['head_teacher']) then
    raise exception 'Only the Headteacher can change staff roles' using errcode = '42501';
  end if;
  if not public.is_staff_member(p_user) then
    raise exception 'That person is not a member of staff';
  end if;
  p_roles := coalesce(p_roles, array[]::text[]);
  foreach v_role in array p_roles loop
    if not (v_role = any (v_allowed)) then
      raise exception 'Role % cannot be set here', v_role;
    end if;
  end loop;

  delete from public.user_roles ur
   where ur.user_id = p_user
     and ur.role::text = any (v_allowed)
     and not (ur.role::text = any (p_roles));

  insert into public.user_roles (user_id, role, scope_type, scope_id, granted_by)
  select distinct p_user, r, 'none'::text, null::uuid, auth.uid()
    from unnest(p_roles) as r
   where not exists (select 1 from public.user_roles x where x.user_id = p_user and x.role::text = r);

  if not public.is_staff_member(p_user) then
    raise exception 'A member of staff needs at least one role';
  end if;
end;
$$;
revoke all on function public.admin_set_staff_roles(uuid, text[]) from public, anon;
grant execute on function public.admin_set_staff_roles(uuid, text[]) to authenticated;

-- ── who may review the audit log ────────────────────────────────────────
create or replace function public.can_review_audit_log()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_has_role(array['head_teacher', 'admin', 'digital_lead']);
$$;
revoke all on function public.can_review_audit_log() from public, anon;
grant execute on function public.can_review_audit_log() to authenticated;

-- The record of reviews is restricted in the audit log (its findings may name people).
create or replace function public.audit_table_is_sensitive(p_table text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_table like 'safeguarding%', false)
    or coalesce(p_table = any (array[
      'pupil_details', 'pupil_emergency_contacts',
      'message_threads', 'message_thread_messages',
      'admissions_applications', 'admissions_messages', 'admissions_stage_details', 'admissions_payment_proofs',
      'absence_notices', 'absence_notes', 'absence_followups', 'absence_followup_events',
      'behaviour_records', 'detentions', 'term_reports',
      'data_rights_requests', 'incident_breach_log', 'incident_checklist_items',
      'staff_vetting_records', 'user_pins', 'trusted_devices', 'login_attempts',
      'quiz_leads', 'eligibility_responses',
      'digital_reviews'
    ]), false);
$$;

-- Same as 0075, admitting the Digital Lead.
create or replace function public.audit_log_search(
  p_actor text default null,
  p_table text default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id bigint,
  created_at timestamptz,
  actor_email text,
  action text,
  target_table text,
  target_id text,
  summary text,
  changed_fields text[],
  masked boolean,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.can_review_audit_log() then
    raise exception 'Only the Headteacher, Admin or Digital Lead can read the audit log' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select a.id, a.created_at, a.actor_email, a.action, a.target_table, a.target_id, a.changes
    from public.audit_log a
    where (coalesce(p_actor, '') = '' or strpos(lower(coalesce(a.actor_email, '')), lower(p_actor)) > 0)
      and (coalesce(p_table, '') = '' or a.target_table = p_table)
      and (coalesce(p_action, '') = '' or a.action = p_action)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
  ),
  total as (select count(*) as n from filtered),
  page as (
    select * from filtered order by created_at desc, id desc limit v_limit offset v_offset
  )
  select g.id, g.created_at, g.actor_email, g.action, g.target_table, g.target_id,
         d.summary, d.fields, d.masked, t.n
  from page g
  cross join total t
  cross join lateral public.audit_log_describe(g.action, g.target_table, g.changes) d
  order by g.created_at desc, g.id desc;
end;
$$;
revoke all on function public.audit_log_search(text, text, text, timestamptz, timestamptz, int, int) from public, anon;
grant execute on function public.audit_log_search(text, text, text, timestamptz, timestamptz, int, int) to authenticated;

create or replace function public.audit_log_facets()
returns table (kind text, value text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.can_review_audit_log() then
    raise exception 'Only the Headteacher, Admin or Digital Lead can read the audit log' using errcode = '42501';
  end if;
  return query
  select 'table'::text, t from (select distinct a.target_table as t from public.audit_log a) x where t is not null
  union all
  select 'action'::text, t from (select distinct a.action as t from public.audit_log a) y where t is not null
  order by 1, 2;
end;
$$;
revoke all on function public.audit_log_facets() from public, anon;
grant execute on function public.audit_log_facets() to authenticated;

create or replace function public.audit_log_record_export(p_rows int, p_filters jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.can_review_audit_log() then
    raise exception 'Only the Headteacher, Admin or Digital Lead can export the audit log' using errcode = '42501';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (auth.uid(), v_email, 'AUDIT_LOG_EXPORT', 'audit_log', null,
          jsonb_build_object('rows', coalesce(p_rows, 0), 'filters', coalesce(p_filters, '{}'::jsonb)));
end;
$$;
revoke all on function public.audit_log_record_export(int, jsonb) from public, anon;
grant execute on function public.audit_log_record_export(int, jsonb) to authenticated;

-- ── accounts and access (read only) ─────────────────────────────────────
-- Every staff account: roles, add-on permissions, active, last sign-in.
create or replace function public.access_review_accounts()
returns table (
  user_id uuid,
  full_name text,
  email text,
  roles text[],
  permissions text[],
  active boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.can_review_audit_log() then
    raise exception 'Only the Headteacher, Admin or Digital Lead can review accounts' using errcode = '42501';
  end if;
  return query
  select ur.user_id,
         coalesce(nullif(p.full_name, ''), 'Unnamed')::text,
         coalesce(p.email, au.email)::text,
         array_agg(distinct ur.role::text order by ur.role::text),
         coalesce((select array_agg(up.permission::text order by up.permission::text) from public.user_permissions up where up.user_id = ur.user_id), array[]::text[]),
         coalesce(sp.active, true),
         au.last_sign_in_at,
         au.created_at
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join auth.users au on au.id = ur.user_id
  left join public.staff_profiles sp on sp.user_id = ur.user_id
  where ur.role in ('head_teacher', 'admin', 'admissions', 'teacher', 'teaching_assistant_cover', 'senco', 'digital_lead')
  group by ur.user_id, p.full_name, p.email, au.email, sp.active, au.last_sign_in_at, au.created_at
  order by 2;
end;
$$;
revoke all on function public.access_review_accounts() from public, anon;
grant execute on function public.access_review_accounts() to authenticated;

-- Family and pupil accounts as totals only: no names or addresses.
create or replace function public.access_review_counts()
returns table (kind text, accounts int, never_signed_in int, not_in_90_days int)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.can_review_audit_log() then
    raise exception 'Only the Headteacher, Admin or Digital Lead can review accounts' using errcode = '42501';
  end if;
  return query
  select k.kind,
         count(*)::int,
         count(*) filter (where au.last_sign_in_at is null)::int,
         count(*) filter (where au.last_sign_in_at is not null and au.last_sign_in_at < now() - interval '90 days')::int
  from (
    select distinct ur.user_id, ur.role::text as kind
    from public.user_roles ur
    where ur.role in ('parent', 'student')
  ) k
  left join auth.users au on au.id = k.user_id
  group by k.kind
  order by k.kind;
end;
$$;
revoke all on function public.access_review_counts() from public, anon;
grant execute on function public.access_review_counts() to authenticated;

-- Sign-in attempts per email address over the last p_days (1 to 90; the
-- log itself is kept 90 days). Network addresses are never returned.
create or replace function public.access_review_sign_ins(p_days int default 30)
returns table (email text, failed int, succeeded int, last_failed_at timestamptz, last_attempt_at timestamptz, networks int)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if not public.can_review_audit_log() then
    raise exception 'Only the Headteacher, Admin or Digital Lead can review sign-ins' using errcode = '42501';
  end if;
  return query
  select lower(la.email)::text,
         count(*) filter (where not la.success)::int,
         count(*) filter (where la.success)::int,
         max(la.attempted_at) filter (where not la.success),
         max(la.attempted_at),
         count(distinct la.ip_hash)::int
  from public.login_attempts la
  where la.attempted_at >= now() - make_interval(days => v_days)
  group by lower(la.email)
  order by 2 desc, 5 desc
  limit 200;
end;
$$;
revoke all on function public.access_review_sign_ins(int) from public, anon;
grant execute on function public.access_review_sign_ins(int) to authenticated;

-- ── the record of reviews ───────────────────────────────────────────────
create table if not exists public.digital_reviews (
  id uuid primary key default gen_random_uuid(),
  review_date date not null default current_date,
  kind text not null default 'monthly' check (kind in ('monthly', 'termly', 'concern', 'other')),
  checked text not null check (char_length(btrim(checked)) between 1 and 4000),
  findings text not null check (char_length(btrim(findings)) between 1 and 4000),
  actions text check (actions is null or char_length(actions) <= 4000),
  reviewed_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists digital_reviews_date_idx on public.digital_reviews (review_date desc, created_at desc);

alter table public.digital_reviews enable row level security;

drop policy if exists "digital_reviews: reviewers read" on public.digital_reviews;
create policy "digital_reviews: reviewers read"
  on public.digital_reviews for select
  to authenticated
  using (public.can_review_audit_log());

drop policy if exists "digital_reviews: reviewers add their own" on public.digital_reviews;
create policy "digital_reviews: reviewers add their own"
  on public.digital_reviews for insert
  to authenticated
  with check (public.can_review_audit_log() and reviewed_by = auth.uid());
-- No update or delete policy: a review, once recorded, stays as written.

-- The time it was recorded is the server's, whatever the client sends, and
-- the review date can't be in the future.
create or replace function public.digital_reviews_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  if new.review_date > (now() at time zone 'Europe/London')::date then
    raise exception 'The review date cannot be in the future' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists digital_reviews_stamp on public.digital_reviews;
create trigger digital_reviews_stamp
  before insert on public.digital_reviews
  for each row execute function public.digital_reviews_stamp();

drop trigger if exists audit_digital_reviews on public.digital_reviews;
create trigger audit_digital_reviews
  after insert or update or delete on public.digital_reviews
  for each row execute function public.audit_row_change();

-- The list with the reviewer's name (profiles are not readable by every reviewer).
create or replace function public.digital_review_list(p_limit int default 50)
returns table (
  id uuid,
  review_date date,
  kind text,
  checked text,
  findings text,
  actions text,
  reviewer_name text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.can_review_audit_log() then
    raise exception 'Only the Headteacher, Admin or Digital Lead can read the record of reviews' using errcode = '42501';
  end if;
  return query
  select r.id, r.review_date, r.kind, r.checked, r.findings, r.actions,
         coalesce(nullif(p.full_name, ''), p.email, 'Unknown')::text,
         r.created_at
  from public.digital_reviews r
  left join public.profiles p on p.id = r.reviewed_by
  order by r.review_date desc, r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$$;
revoke all on function public.digital_review_list(int) from public, anon;
grant execute on function public.digital_review_list(int) to authenticated;

grant select, insert on public.digital_reviews to authenticated;
