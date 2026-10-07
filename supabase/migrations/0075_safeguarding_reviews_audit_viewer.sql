-- 0075: safeguarding auto-review + a masked audit-log viewer.
--
-- 1. SAFEGUARDING AUTO-REVIEW
--    When concerns repeat, a 'review required' item is opened for the
--    Designated Safeguarding Lead / Headteacher with a due date and a
--    checklist (reviewed by, decision, outcome, notes):
--      repeat_30d       2+ concerns about the same child in 30 days  (due +2 days)
--      repeat_90d       3+ concerns about the same child in 90 days  (due +5 days)
--      serious_open_24h a high/urgent concern still 'open' after 24h (due +1 day)
--    The two repeat rules run from a trigger on safeguarding_concerns (so the
--    item appears the moment the second concern is logged); the time-based
--    rule needs a clock, so safeguarding_run_review_check() is also called
--    hourly by the safeguarding-review-check Edge Function, which then emails
--    the safeguarding lead. Everything is idempotent: trigger_key is UNIQUE
--    and a repeat rule never opens a second item while one for the same child
--    and rule is still not completed.
--
--    Access: exactly the same people as the concern log itself (Safeguarding
--    Lead permission or Headteacher). Admin gets nothing. The review row holds
--    NO concern text - only ids, a generic reason and the reviewer's own
--    decision/notes - and the email never names the child.
--
-- 2. AUDIT LOG VIEWER
--    audit_row_change() stores the whole old/new row in audit_log.changes, so
--    the log contains safeguarding text and health data. Until now any
--    Headteacher/Admin could read it with a plain select (Admin included,
--    who cannot open the safeguarding log). This migration:
--      * adds audit_table_is_sensitive() - the single list of tables whose
--        content must never be shown;
--      * re-creates the two audit_log read policies so a direct select no
--        longer returns rows for those tables at all;
--      * adds audit_log_search(), a SECURITY DEFINER viewer RPC (Headteacher/
--        Admin only) with filters, paging and a server-built summary that
--        shows field NAMES only (never values, except a short allow-list of
--        harmless status-like fields) and, for sensitive tables, only that a
--        change happened.
--
-- Idempotent: safe to re-run.

-- ═══ 1. safeguarding_reviews ═══════════════════════════════════════════════

create table if not exists public.safeguarding_reviews (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references public.children(id) on delete set null,
  concern_ids uuid[] not null default '{}',
  rule text not null check (rule in ('repeat_30d', 'repeat_90d', 'serious_open_24h')),
  reason text not null, -- generic wording only, never concern content
  trigger_key text not null unique, -- idempotency: rule + child + newest triggering concern
  opened_at timestamptz not null default now(),
  due_at timestamptz not null,
  status text not null default 'required' check (status in ('required', 'in_progress', 'completed')),
  checklist jsonb not null default '[]'::jsonb, -- [{key, label, done}]
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision text check (decision is null or decision in ('no_further_action', 'monitor', 'internal_action', 'refer_external', 'escalate')),
  outcome text,
  notes text,
  notified_at timestamptz, -- first email to the safeguarding lead sent
  overdue_notified_at timestamptz, -- overdue reminder sent
  updated_at timestamptz not null default now(),
  constraint safeguarding_reviews_completed_shape check (status <> 'completed' or (reviewed_at is not null and decision is not null)),
  constraint safeguarding_reviews_checklist_array check (jsonb_typeof(checklist) = 'array')
);

create index if not exists safeguarding_reviews_open_idx
  on public.safeguarding_reviews (due_at) where status <> 'completed';
create index if not exists safeguarding_reviews_child_idx
  on public.safeguarding_reviews (child_id, rule);

alter table public.safeguarding_reviews enable row level security;

-- Read/update: Safeguarding Lead or Headteacher, same condition as
-- safeguarding_concerns (0015). No insert policy (rows are created only by
-- the SECURITY DEFINER functions below) and no delete policy, by design.
drop policy if exists "safeguarding_reviews: safeguarding lead/head_teacher read" on public.safeguarding_reviews;
create policy "safeguarding_reviews: safeguarding lead/head_teacher read"
  on public.safeguarding_reviews for select
  to authenticated
  using (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

drop policy if exists "safeguarding_reviews: safeguarding lead/head_teacher update" on public.safeguarding_reviews;
create policy "safeguarding_reviews: safeguarding lead/head_teacher update"
  on public.safeguarding_reviews for update
  to authenticated
  using (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  )
  with check (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  );

-- A signed-in user may only fill in the review form (status, checklist,
-- decision, outcome, notes). Everything that defines WHY it exists, and the
-- notification stamps, are pinned; a completed review is frozen; completing
-- needs a decision and a fully ticked checklist and stamps the reviewer.
-- auth.uid() is null for the service role / migrations, which may update
-- anything (the Edge Function stamps notified_at that way).
create or replace function public.safeguarding_reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if old.status = 'completed' then
      raise exception 'A completed safeguarding review cannot be changed' using errcode = '42501';
    end if;
    new.child_id := old.child_id;
    new.concern_ids := old.concern_ids;
    new.rule := old.rule;
    new.reason := old.reason;
    new.trigger_key := old.trigger_key;
    new.opened_at := old.opened_at;
    new.due_at := old.due_at;
    new.notified_at := old.notified_at;
    new.overdue_notified_at := old.overdue_notified_at;
    new.reviewed_by := null;
    new.reviewed_at := null;
    if new.status = 'completed' then
      if new.decision is null then
        raise exception 'A decision is required to complete a safeguarding review' using errcode = '23514';
      end if;
      if jsonb_typeof(new.checklist) <> 'array'
         or exists (
           select 1 from jsonb_array_elements(new.checklist) e
           where coalesce((e ->> 'done')::boolean, false) = false
         ) then
        raise exception 'Every checklist item must be ticked to complete a safeguarding review' using errcode = '23514';
      end if;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists safeguarding_reviews_guard on public.safeguarding_reviews;
create trigger safeguarding_reviews_guard
  before update on public.safeguarding_reviews
  for each row execute function public.safeguarding_reviews_guard();

drop trigger if exists audit_safeguarding_reviews on public.safeguarding_reviews;
create trigger audit_safeguarding_reviews
  after insert or update on public.safeguarding_reviews
  for each row execute function public.audit_row_change();

create or replace function public.safeguarding_review_default_checklist()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    jsonb_build_object('key', 'read_concerns', 'label', 'Read every linked concern and its chronology', 'done', false),
    jsonb_build_object('key', 'pattern', 'label', 'Considered whether the concerns form a pattern or escalation', 'done', false),
    jsonb_build_object('key', 'referral', 'label', 'Considered whether a referral is needed (children''s social care, LADO, Prevent, police)', 'done', false),
    jsonb_build_object('key', 'parents', 'label', 'Decided whether and how parents/carers are informed', 'done', false),
    jsonb_build_object('key', 'recorded', 'label', 'Recorded the decision and the reasons for it', 'done', false)
  );
$$;

-- Evaluate the two repeat rules for one child. Returns how many NEW review
-- items were opened (0 when nothing applies or they already exist).
create or replace function public.safeguarding_evaluate_child(p_child uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n30 int;
  v_n90 int;
  v_ids uuid[];
  v_rule text;
  v_reason text;
  v_due interval;
  v_count int;
  v_rows int := 0;
begin
  if p_child is null then
    return 0;
  end if;

  select count(*), coalesce(array_agg(id order by created_at desc), '{}')
    into v_n30, v_ids
  from public.safeguarding_concerns
  where child_id = p_child and created_at >= now() - interval '30 days';

  select count(*) into v_n90
  from public.safeguarding_concerns
  where child_id = p_child and created_at >= now() - interval '90 days';

  if v_n30 >= 2 then
    v_rule := 'repeat_30d';
    v_count := v_n30;
    v_reason := v_n30::text || ' concerns have been raised about the same child within 30 days';
    v_due := interval '2 days';
  elsif v_n90 >= 3 then
    v_rule := 'repeat_90d';
    v_count := v_n90;
    v_reason := v_n90::text || ' concerns have been raised about the same child within 90 days';
    v_due := interval '5 days';
    select coalesce(array_agg(id order by created_at desc), '{}') into v_ids
    from public.safeguarding_concerns
    where child_id = p_child and created_at >= now() - interval '90 days';
  else
    return 0;
  end if;

  insert into public.safeguarding_reviews (child_id, concern_ids, rule, reason, trigger_key, due_at, checklist)
  select p_child, v_ids, v_rule, v_reason,
         v_rule || ':' || p_child::text || ':' || v_ids[1]::text,
         now() + v_due,
         public.safeguarding_review_default_checklist()
  where not exists (
    select 1 from public.safeguarding_reviews r
    where r.child_id = p_child and r.rule = v_rule and r.status <> 'completed'
  )
  on conflict (trigger_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Time-based rule: serious concern still open after 24 hours.
create or replace function public.safeguarding_open_serious_overdue()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int := 0;
begin
  insert into public.safeguarding_reviews (child_id, concern_ids, rule, reason, trigger_key, due_at, checklist)
  select c.child_id, array[c.id], 'serious_open_24h',
         'A serious (high or urgent) concern has stayed open for more than 24 hours',
         'serious_open_24h:' || c.id::text,
         now() + interval '1 day',
         public.safeguarding_review_default_checklist()
  from public.safeguarding_concerns c
  where c.severity in ('high', 'urgent')
    and c.status = 'open'
    and c.created_at <= now() - interval '24 hours'
  on conflict (trigger_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Full sweep, called hourly by the safeguarding-review-check Edge Function
-- (service role). Returns the number of new review items opened.
create or replace function public.safeguarding_run_review_check()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid;
  v_total int := 0;
begin
  for v_child in
    select distinct child_id from public.safeguarding_concerns
    where child_id is not null and created_at >= now() - interval '90 days'
  loop
    v_total := v_total + public.safeguarding_evaluate_child(v_child);
  end loop;
  v_total := v_total + public.safeguarding_open_serious_overdue();
  return v_total;
end;
$$;

-- Fires as the table owner, so a parent or student who merely REPORTS a
-- concern still causes the review item to be created (they cannot read it).
create or replace function public.safeguarding_concerns_review_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.safeguarding_evaluate_child(new.child_id);
  return null;
end;
$$;

drop trigger if exists safeguarding_concerns_review on public.safeguarding_concerns;
create trigger safeguarding_concerns_review
  after insert or update of child_id, status, severity on public.safeguarding_concerns
  for each row execute function public.safeguarding_concerns_review_trigger();

-- None of the evaluators may be called by a client; only the trigger (owner)
-- and the service role.
revoke all on function public.safeguarding_evaluate_child(uuid) from public, anon, authenticated;
revoke all on function public.safeguarding_open_serious_overdue() from public, anon, authenticated;
revoke all on function public.safeguarding_run_review_check() from public, anon, authenticated;
revoke all on function public.safeguarding_concerns_review_trigger() from public, anon, authenticated;
grant execute on function public.safeguarding_run_review_check() to service_role;

-- The queue the Safeguarding page and dashboard show. SECURITY DEFINER only
-- so the lead sees the child's NAME even when `children` RLS would hide the
-- pupil from them (e.g. a lead who teaches another class); the same people
-- may already read the concern itself. Anyone else gets an empty result.
create or replace function public.safeguarding_review_queue()
returns table (
  id uuid,
  child_name text,
  rule text,
  reason text,
  concern_count int,
  opened_at timestamptz,
  due_at timestamptz,
  status text,
  checklist jsonb,
  reviewed_by_name text,
  reviewed_at timestamptz,
  decision text,
  outcome text,
  notes text,
  is_overdue boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
begin
  if not (
    (public.current_has_permission('safeguarding_lead') or public.current_has_role(array['head_teacher']))
    and public.current_token_fresh(15)
  ) then
    return;
  end if;

  return query
  select r.id,
         c.name,
         r.rule,
         r.reason,
         cardinality(r.concern_ids),
         r.opened_at,
         r.due_at,
         r.status,
         r.checklist,
         p.full_name,
         r.reviewed_at,
         r.decision,
         r.outcome,
         r.notes,
         (r.status <> 'completed' and r.due_at < now())
  from public.safeguarding_reviews r
  left join public.children c on c.id = r.child_id
  left join public.profiles p on p.id = r.reviewed_by
  order by (r.status = 'completed'), r.due_at asc, r.opened_at asc;
end;
$$;

revoke all on function public.safeguarding_review_queue() from public, anon;
grant execute on function public.safeguarding_review_queue() to authenticated;

-- ═══ 2. audit log: masking + viewer ════════════════════════════════════════

-- The one list of tables whose audit rows must never show content (the
-- whole row is in audit_log.changes). Any safeguarding_* table is included by
-- prefix so future ones are covered automatically.
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
      'quiz_leads', 'eligibility_responses'
    ]), false);
$$;

-- Direct reads of audit_log no longer return sensitive-table rows to
-- anyone. (The SECURITY DEFINER audit trigger and viewer RPC are unaffected:
-- they run as the table owner.)
drop policy if exists "audit_log: admin read" on public.audit_log;
create policy "audit_log: admin read"
  on public.audit_log for select
  to authenticated
  using (
    public.current_role_is(array['admin'])
    and not public.audit_table_is_sensitive(target_table)
  );

drop policy if exists "audit_log: learn head_teacher/admin read" on public.audit_log;
create policy "audit_log: learn head_teacher/admin read"
  on public.audit_log for select
  to authenticated
  using (
    public.current_has_role(array['head_teacher', 'admin'])
    and not public.audit_table_is_sensitive(target_table)
  );

drop policy if exists "audit_log: learn staff with view_compliance/safeguarding_lead read" on public.audit_log;
create policy "audit_log: learn staff with view_compliance/safeguarding_lead read"
  on public.audit_log for select
  to authenticated
  using (
    (
      public.current_has_permission('view_compliance')
      or public.current_has_permission('safeguarding_lead')
      or public.current_has_role(array['head_teacher'])
    )
    and not public.audit_table_is_sensitive(target_table)
  );

-- Human-readable, content-free description of one audit row.
create or replace function public.audit_log_describe(p_action text, p_table text, p_changes jsonb)
returns table (summary text, fields text[], masked boolean)
language plpgsql
stable
set search_path = public
as $$
declare
  v_label text := replace(coalesce(p_table, 'record'), '_', ' ');
  v_sensitive boolean := public.audit_table_is_sensitive(p_table);
  v_old jsonb;
  v_new jsonb;
  v_fields text[] := '{}';
  v_values text;
  v_text text;
  v_allow text[] := array['status', 'role', 'permission', 'active', 'enabled', 'kind', 'action_on_expiry', 'retention_months'];
begin
  masked := v_sensitive;

  if v_sensitive then
    fields := '{}';
    summary := case p_action
      when 'INSERT' then 'A record was created in ' || v_label
      when 'UPDATE' then 'A record was changed in ' || v_label
      when 'DELETE' then 'A record was deleted from ' || v_label
      when 'VIEW' then 'A record in ' || v_label || ' was viewed'
      else initcap(replace(lower(coalesce(p_action, 'change')), '_', ' ')) || ' (' || v_label || ')'
    end || ' - details hidden (restricted data)';
    return next;
    return;
  end if;

  if p_action = 'UPDATE' and p_changes is not null and p_changes ? 'old' and p_changes ? 'new'
     and jsonb_typeof(p_changes -> 'old') = 'object' and jsonb_typeof(p_changes -> 'new') = 'object' then
    v_old := p_changes -> 'old';
    v_new := p_changes -> 'new';
    select coalesce(array_agg(k order by k), '{}')
      into v_fields
    from jsonb_object_keys(v_new) as k
    where (v_new -> k) is distinct from (v_old -> k)
      and k <> 'updated_at';
    -- Values are shown ONLY for the harmless allow-listed fields.
    select string_agg(k || ' ' || coalesce(v_old ->> k, 'none') || ' -> ' || coalesce(v_new ->> k, 'none'), '; ' order by k)
      into v_values
    from unnest(v_fields) as k
    where k = any (v_allow);
    fields := v_fields;
    if cardinality(v_fields) = 0 then
      summary := 'Updated ' || v_label || ' (no field values changed)';
    else
      v_text := array_to_string(v_fields[1:8], ', ')
        || case when cardinality(v_fields) > 8 then ' and ' || (cardinality(v_fields) - 8)::text || ' more' else '' end;
      summary := 'Updated ' || v_label || ': changed ' || v_text
        || case when v_values is not null then ' (' || v_values || ')' else '' end;
    end if;
  elsif p_action = 'INSERT' then
    fields := '{}';
    summary := 'Created a record in ' || v_label;
  elsif p_action = 'DELETE' then
    fields := '{}';
    summary := 'Deleted a record from ' || v_label;
  elsif p_action = 'UPDATE' then
    fields := '{}';
    summary := 'Updated a record in ' || v_label;
  else
    fields := '{}';
    v_text := replace(lower(coalesce(p_action, 'event')), '_', ' ');
    summary := upper(left(v_text, 1)) || substr(v_text, 2) || ' (' || v_label || ')';
  end if;
  return next;
end;
$$;

revoke all on function public.audit_log_describe(text, text, jsonb) from public, anon, authenticated;

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
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or Admin can read the audit log' using errcode = '42501';
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

-- Filter dropdown values (table names and action names only).
create or replace function public.audit_log_facets()
returns table (kind text, value text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or Admin can read the audit log' using errcode = '42501';
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

-- Exporting the log is itself recorded.
create or replace function public.audit_log_record_export(p_rows int, p_filters jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.current_has_role(array['head_teacher', 'admin']) then
    raise exception 'Only the Headteacher or Admin can export the audit log' using errcode = '42501';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.audit_log (actor_id, actor_email, action, target_table, target_id, changes)
  values (auth.uid(), v_email, 'AUDIT_LOG_EXPORT', 'audit_log', null,
          jsonb_build_object('rows', coalesce(p_rows, 0), 'filters', coalesce(p_filters, '{}'::jsonb)));
end;
$$;

revoke all on function public.audit_log_record_export(int, jsonb) from public, anon;
grant execute on function public.audit_log_record_export(int, jsonb) to authenticated;
