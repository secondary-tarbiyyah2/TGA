-- 0217: online payments through Stripe (T71, owner 11 Nov 2026: "we want all
-- payments to be online ... think about references for students and generate a
-- system so it's easy to ensure payments have been done, account for everything").
-- See docs/payments.md.
--
--  1. fee_accounts: one billing account per family, with a permanent payment
--     reference (TGA-F-1001 onwards) and its Stripe Customer id. An account is
--     found for an application by: the parent's portal account, then the
--     admissions family (siblings applied together), then the parent's email.
--  2. children.pupil_number: a permanent pupil number (TGA-P-10001 onwards).
--     No pupil number existed before; the application reference (TGA-2026-0001)
--     stays the admissions reference.
--  3. fee_charges: each charge gets an invoice number (TGA-INV-27-00001: 27 is
--     the academic year 2026-27), amount in pence, kind, plan, instalment, the
--     application it came from, and a stored status kept up to date by
--     fee_charge_refresh(): due, overdue, processing, paid, part_paid, failed,
--     refunded, waived (waived needs a reason and a head teacher or admin).
--  4. fee_payments: Stripe ids, fee and net in pence, refunds, and a reason for
--     any payment staff record by hand (only through fee_record_manual_payment).
--  5. payment_attempts (Checkout Sessions and Direct Debit collections we
--     created, with the exact amount for each charge: the webhook checks every
--     payment against these, never against Stripe metadata alone),
--     stripe_events (every webhook event id, so each is processed once),
--     payment_alerts (failures, refunds, disputes and anything unmatched, shown
--     in the Action centre), payment_reminders (one email per charge per kind),
--     payment_reconciliation_runs (the daily check against Stripe).
--  6. site_settings.payments_direct_debit_enabled (off by default).
--  7. The application fee is charged when an application arrives; the
--     application's charges follow the family into the portal when accounts
--     are created.
-- Finance is head teacher and admin only (there is no finance role). Families
-- read only their own account's rows. Every new table has RLS.

-- ── helpers ──────────────────────────────────────────────────────────────
create or replace function public.is_finance_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_has_role(array['head_teacher', 'admin']::public.learn_role[]);
$$;
grant execute on function public.is_finance_staff() to authenticated;

-- ── 1. fee accounts ──────────────────────────────────────────────────────
create sequence if not exists public.fee_account_ref_seq start 1001;

create table if not exists public.fee_accounts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('TGA-F-' || nextval('public.fee_account_ref_seq')::text),
  parent_user_id uuid unique references public.profiles(id) on delete set null,
  admissions_family_id uuid unique references public.admissions_families(id) on delete set null,
  billing_name text not null check (char_length(billing_name) between 1 and 160),
  billing_email text not null check (char_length(billing_email) between 3 and 254 and position('@' in billing_email) > 1),
  stripe_customer_id text unique check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  -- Bacs Direct Debit (monthly plan, behind payments_direct_debit_enabled)
  dd_payment_method_id text check (dd_payment_method_id is null or dd_payment_method_id ~ '^pm_[A-Za-z0-9]+$'),
  dd_mandate_status text check (dd_mandate_status is null or dd_mandate_status in ('pending', 'active', 'inactive')),
  dd_mandate_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fee_accounts_email_idx on public.fee_accounts (lower(billing_email));
alter table public.fee_accounts enable row level security;

create policy "fee_accounts: finance read" on public.fee_accounts for select to authenticated
  using (public.is_finance_staff());
create policy "fee_accounts: finance update" on public.fee_accounts for update to authenticated
  using (public.is_finance_staff()) with check (public.is_finance_staff());
create policy "fee_accounts: parent reads own" on public.fee_accounts for select to authenticated
  using (parent_user_id = auth.uid());

create trigger audit_fee_accounts
  after insert or update or delete on public.fee_accounts
  for each row execute function public.audit_row_change();

create or replace function public.fee_account_is_mine(p_account uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.fee_accounts a where a.id = p_account and a.parent_user_id = auth.uid());
$$;
grant execute on function public.fee_account_is_mine(uuid) to authenticated;

-- One account per parent account. Creates it when missing.
create or replace function public.fee_account_for_parent(p_parent uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_email text;
begin
  select id into v_id from public.fee_accounts where parent_user_id = p_parent;
  if v_id is not null then return v_id; end if;
  select full_name, email into v_name, v_email from public.profiles where id = p_parent;
  if v_email is null then return null; end if;
  -- An account made from an application with the same email is taken over.
  select id into v_id from public.fee_accounts
   where parent_user_id is null and lower(billing_email) = lower(v_email)
   order by created_at limit 1;
  if v_id is not null then
    update public.fee_accounts set parent_user_id = p_parent, updated_at = now() where id = v_id;
    return v_id;
  end if;
  insert into public.fee_accounts (parent_user_id, billing_name, billing_email)
  values (p_parent, coalesce(nullif(trim(v_name), ''), v_email), v_email)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fee_account_for_parent(uuid) from public, anon, authenticated;
grant execute on function public.fee_account_for_parent(uuid) to service_role;

create or replace function public.fee_account_for_application(p_application uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_id uuid;
begin
  select id, family_id, parent_profile_id, parent_name, parent_email into a
    from public.admissions_applications where id = p_application;
  if a.id is null then return null; end if;
  if a.parent_profile_id is not null then
    return public.fee_account_for_parent(a.parent_profile_id);
  end if;
  if a.family_id is not null then
    select id into v_id from public.fee_accounts where admissions_family_id = a.family_id;
    if v_id is not null then return v_id; end if;
  end if;
  select id into v_id from public.fee_accounts where lower(billing_email) = lower(a.parent_email) order by created_at limit 1;
  if v_id is not null then
    if a.family_id is not null then
      update public.fee_accounts set admissions_family_id = coalesce(admissions_family_id, a.family_id), updated_at = now()
       where id = v_id and admissions_family_id is null
         and not exists (select 1 from public.fee_accounts x where x.admissions_family_id = a.family_id);
    end if;
    return v_id;
  end if;
  insert into public.fee_accounts (admissions_family_id, billing_name, billing_email)
  values (a.family_id, a.parent_name, a.parent_email)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fee_account_for_application(uuid) from public, anon, authenticated;
grant execute on function public.fee_account_for_application(uuid) to service_role;

-- ── 2. pupil numbers ─────────────────────────────────────────────────────
create sequence if not exists public.pupil_number_seq start 10001;
alter table public.children add column if not exists pupil_number text unique;
update public.children set pupil_number = 'TGA-P-' || nextval('public.pupil_number_seq')::text
 where pupil_number is null and not is_test;
alter table public.children alter column pupil_number set default ('TGA-P-' || nextval('public.pupil_number_seq')::text);
comment on column public.children.pupil_number is 'Permanent pupil number (TGA-P-10001 onwards), used on fee charges and in finance search.';

-- ── 3. charges ───────────────────────────────────────────────────────────
create sequence if not exists public.fee_invoice_seq;

alter table public.fee_charges alter column parent_user_id drop not null;
alter table public.fee_charges
  add column if not exists fee_account_id uuid references public.fee_accounts(id) on delete restrict,
  add column if not exists application_id uuid references public.admissions_applications(id) on delete set null,
  add column if not exists invoice_number text unique,
  add column if not exists amount_pence int generated always as (round(amount * 100)::int) stored,
  add column if not exists kind text not null default 'other'
    check (kind in ('application_fee', 'first_payment', 'instalment', 'adjustment', 'other')),
  add column if not exists plan text check (plan is null or plan in ('annual', 'termly', 'monthly')),
  add column if not exists instalment_no int check (instalment_no is null or instalment_no between 1 and 12),
  add column if not exists instalment_count int check (instalment_count is null or instalment_count between 1 and 12),
  add column if not exists status text not null default 'due'
    check (status in ('due', 'overdue', 'processing', 'paid', 'part_paid', 'failed', 'refunded', 'waived', 'void')),
  add column if not exists paid_pence int not null default 0,
  add column if not exists processing_since timestamptz,
  add column if not exists last_failed_at timestamptz,
  add column if not exists failure_reason text check (char_length(failure_reason) <= 500),
  add column if not exists waived_reason text check (char_length(waived_reason) <= 1000),
  add column if not exists waived_by uuid references public.profiles(id) on delete set null,
  add column if not exists waived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.fee_charges drop constraint if exists fee_charges_owner_check;
alter table public.fee_charges add constraint fee_charges_owner_check
  check (parent_user_id is not null or application_id is not null or fee_account_id is not null);
alter table public.fee_charges drop constraint if exists fee_charges_waived_check;
alter table public.fee_charges add constraint fee_charges_waived_check
  check (status <> 'waived' or (waived_reason is not null and char_length(trim(waived_reason)) >= 3 and waived_by is not null and waived_at is not null));

create index if not exists fee_charges_account_idx on public.fee_charges (fee_account_id);
create index if not exists fee_charges_application_idx on public.fee_charges (application_id);
create index if not exists fee_charges_status_due_idx on public.fee_charges (status, due_date);
create unique index if not exists fee_charges_plan_slot_uidx on public.fee_charges (application_id, plan, instalment_no)
  where application_id is not null and plan is not null and voided_at is null;
create unique index if not exists fee_charges_application_fee_uidx on public.fee_charges (application_id)
  where kind = 'application_fee' and voided_at is null;

-- Academic year of a date: Sept onwards belongs to the next year's number (2026-27 -> 27).
create or replace function public.fee_academic_year_short(p_date date)
returns text
language sql
immutable
as $$
  select to_char(case when extract(month from p_date) >= 9 then p_date + interval '1 year' else p_date end, 'YY');
$$;

create or replace function public.fee_charges_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.invoice_number := 'TGA-INV-' || public.fee_academic_year_short(coalesce(new.due_date, current_date)) || '-'
      || lpad(nextval('public.fee_invoice_seq')::text, 5, '0');
    new.paid_pence := 0;
    if new.fee_account_id is null then
      if new.parent_user_id is not null then
        new.fee_account_id := public.fee_account_for_parent(new.parent_user_id);
      elsif new.application_id is not null then
        new.fee_account_id := public.fee_account_for_application(new.application_id);
      end if;
    end if;
    if new.parent_user_id is null and new.fee_account_id is not null then
      select parent_user_id into new.parent_user_id from public.fee_accounts where id = new.fee_account_id;
    end if;
    if new.status not in ('due', 'overdue') then new.status := 'due'; end if;
    new.waived_reason := null; new.waived_by := null; new.waived_at := null;
  else
    -- The invoice number and the money already received never change by hand.
    if old.invoice_number is not null then new.invoice_number := old.invoice_number; end if;
    if new.amount <> old.amount and old.paid_pence > 0 then
      raise exception 'A charge with payments against it cannot change its amount. Void it and raise a new one.' using errcode = '23514';
    end if;
  end if;
  if new.voided_at is not null then new.status := 'void'; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists fee_charges_before_write on public.fee_charges;
create trigger fee_charges_before_write before insert or update on public.fee_charges
  for each row execute function public.fee_charges_before_write();

-- Backfill the existing charges (made by staff before today).
update public.fee_charges c set fee_account_id = public.fee_account_for_parent(c.parent_user_id)
 where c.fee_account_id is null and c.parent_user_id is not null;
update public.fee_charges set invoice_number = 'TGA-INV-' || public.fee_academic_year_short(due_date) || '-' || lpad(nextval('public.fee_invoice_seq')::text, 5, '0')
 where invoice_number is null;
alter table public.fee_charges alter column invoice_number set not null;

-- Families read their account's charges as well as the ones in their name.
drop policy if exists "fee_charges: parent reads own account" on public.fee_charges;
create policy "fee_charges: parent reads own account" on public.fee_charges for select to authenticated
  using (fee_account_id is not null and public.fee_account_is_mine(fee_account_id));

-- Waiving: head teacher or admin, with a reason (audited by audit_fee_charges).
create or replace function public.fee_charge_waive(p_charge uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_finance_staff() then raise exception 'Only a head teacher or admin can waive a charge.' using errcode = '42501'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then raise exception 'Give a reason for waiving the charge.' using errcode = '23514'; end if;
  update public.fee_charges
     set status = 'waived', waived_reason = trim(p_reason), waived_by = auth.uid(), waived_at = now()
   where id = p_charge and status not in ('paid', 'void', 'waived');
  if not found then raise exception 'That charge cannot be waived (it is already paid, void or waived).' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.fee_charge_waive(uuid, text) from public, anon;
grant execute on function public.fee_charge_waive(uuid, text) to authenticated;

-- ── 4. payments ──────────────────────────────────────────────────────────
alter table public.fee_payments
  add column if not exists amount_pence int generated always as (round(amount * 100)::int) stored,
  add column if not exists payment_method_type text check (payment_method_type is null or payment_method_type in ('pay_by_bank', 'card', 'bacs_debit', 'link', 'other')),
  add column if not exists stripe_payment_intent_id text check (stripe_payment_intent_id is null or stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  add column if not exists stripe_charge_id text check (stripe_charge_id is null or stripe_charge_id ~ '^(ch|py)_[A-Za-z0-9]+$'),
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_fee_pence int check (stripe_fee_pence is null or stripe_fee_pence >= 0),
  add column if not exists net_pence int,
  add column if not exists refunded_pence int not null default 0 check (refunded_pence >= 0),
  add column if not exists disputed boolean not null default false,
  add column if not exists livemode boolean,
  add column if not exists recorded_reason text check (char_length(recorded_reason) <= 1000);

-- One row per Stripe payment and charge, so a repeated webhook can never record it twice.
alter table public.fee_payments add constraint fee_payments_stripe_once unique (stripe_payment_intent_id, charge_id);
create index if not exists fee_payments_stripe_charge_idx on public.fee_payments (stripe_charge_id);

-- Staff no longer write payments directly: Stripe payments come from the
-- webhook (service role), and the rare manual record goes through
-- fee_record_manual_payment (reason required, audited).
drop policy if exists "fee_payments: headteacher/admin manage" on public.fee_payments;
drop policy if exists "fee_payments: finance read" on public.fee_payments;
create policy "fee_payments: finance read" on public.fee_payments for select to authenticated
  using (public.is_finance_staff());
drop policy if exists "fee_payments: parent reads own account" on public.fee_payments;
create policy "fee_payments: parent reads own account" on public.fee_payments for select to authenticated
  using (exists (select 1 from public.fee_charges c where c.id = fee_payments.charge_id and c.fee_account_id is not null and public.fee_account_is_mine(c.fee_account_id)));

-- Recompute a charge's money and status. Called after every payment change,
-- by the webhook, and daily (for due -> overdue).
create or replace function public.fee_charge_refresh(p_charge uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_paid int;
  v_refunded int;
  v_status text;
  v_today date := (now() at time zone 'Europe/London')::date;
begin
  select * into c from public.fee_charges where id = p_charge for update;
  if c.id is null then return null; end if;
  select coalesce(sum(amount_pence - refunded_pence), 0), coalesce(sum(refunded_pence), 0)
    into v_paid, v_refunded from public.fee_payments where charge_id = p_charge;
  if c.voided_at is not null then v_status := 'void';
  elsif c.status = 'waived' then v_status := 'waived';
  elsif v_paid >= c.amount_pence then v_status := 'paid';
  elsif v_paid <= 0 and v_refunded > 0 then v_status := 'refunded';
  elsif v_paid > 0 then v_status := 'part_paid';
  elsif c.processing_since is not null and c.processing_since > now() - interval '10 days' then v_status := 'processing';
  elsif c.last_failed_at is not null and c.last_failed_at > coalesce(c.processing_since, '-infinity'::timestamptz) and c.due_date >= v_today then v_status := 'failed';
  elsif c.due_date < v_today then v_status := 'overdue';
  else v_status := 'due';
  end if;
  update public.fee_charges set paid_pence = v_paid, status = v_status
   where id = p_charge and (paid_pence is distinct from v_paid or status is distinct from v_status);
  return v_status;
end;
$$;
revoke all on function public.fee_charge_refresh(uuid) from public, anon, authenticated;
grant execute on function public.fee_charge_refresh(uuid) to service_role;

create or replace function public.fee_charges_refresh_open()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.fee_charges where status in ('due', 'overdue', 'processing', 'part_paid', 'failed') loop
    perform public.fee_charge_refresh(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.fee_charges_refresh_open() from public, anon, authenticated;
grant execute on function public.fee_charges_refresh_open() to service_role;

create or replace function public.fee_payments_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fee_charge_refresh(coalesce(new.charge_id, old.charge_id));
  if tg_op = 'UPDATE' and new.charge_id <> old.charge_id then perform public.fee_charge_refresh(old.charge_id); end if;
  return null;
end;
$$;
drop trigger if exists fee_payments_after_change on public.fee_payments;
create trigger fee_payments_after_change after insert or update or delete on public.fee_payments
  for each row execute function public.fee_payments_after_change();

-- A refreshed status for every existing charge.
select public.fee_charge_refresh(id) from public.fee_charges;

-- The rare manual record: a Stripe payment the webhook could not match (for
-- example made through the old payment link). Head teacher or admin, a
-- reason and the Stripe reference are required; the row is audited. There is
-- no other way to pay (owner, 11 Nov 2026): bank transfer, standing order and
-- cash are not options.
create or replace function public.fee_record_manual_payment(p_charge uuid, p_amount_pence int, p_stripe_reference text, p_reason text, p_paid_on date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_balance int;
begin
  if not public.is_finance_staff() then raise exception 'Only a head teacher or admin can record a payment.' using errcode = '42501'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 5 then raise exception 'Give a reason for recording this payment by hand.' using errcode = '23514'; end if;
  if p_stripe_reference is null or trim(p_stripe_reference) !~ '^(pi|ch|py|cs)_[A-Za-z0-9_]+$' then
    raise exception 'Give the Stripe payment reference (it starts pi_, ch_, py_ or cs_).' using errcode = '23514';
  end if;
  select amount_pence - paid_pence into v_balance from public.fee_charges where id = p_charge and voided_at is null and status <> 'waived';
  if v_balance is null then raise exception 'Charge not found, void or waived.' using errcode = 'P0002'; end if;
  if p_amount_pence is null or p_amount_pence <= 0 or p_amount_pence > v_balance then
    raise exception 'The amount must be more than 0 and no more than the balance (% pence).', v_balance using errcode = '23514';
  end if;
  insert into public.fee_payments (charge_id, amount, method, paid_on, reference, recorded_by, recorded_reason)
  values (p_charge, p_amount_pence / 100.0, 'online', coalesce(p_paid_on, (now() at time zone 'Europe/London')::date), trim(p_stripe_reference), auth.uid(), trim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.fee_record_manual_payment(uuid, int, text, text, date) from public, anon;
grant execute on function public.fee_record_manual_payment(uuid, int, text, text, date) to authenticated;

-- ── 5. Stripe bookkeeping ────────────────────────────────────────────────
create table if not exists public.payment_attempts (
  id text primary key,                                   -- cs_... (Checkout Session) or pi_... (Direct Debit collection)
  kind text not null check (kind in ('checkout', 'setup', 'direct_debit')),
  fee_account_id uuid not null references public.fee_accounts(id) on delete restrict,
  allocations jsonb not null default '[]'::jsonb         -- [{ "charge_id": uuid, "amount_pence": int }], what this attempt pays
    check (jsonb_typeof(allocations) = 'array'),
  amount_pence int not null check (amount_pence >= 0),
  currency text not null default 'gbp' check (currency = 'gbp'),
  status text not null default 'open' check (status in ('open', 'processing', 'paid', 'failed', 'expired', 'complete')),
  payment_intent_id text,
  source text not null check (source in ('portal', 'public_link', 'direct_debit', 'mandate')),
  created_by uuid references public.profiles(id) on delete set null,
  livemode boolean,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists payment_attempts_account_idx on public.payment_attempts (fee_account_id, created_at desc);
create index if not exists payment_attempts_pi_idx on public.payment_attempts (payment_intent_id);
alter table public.payment_attempts enable row level security;
create policy "payment_attempts: finance read" on public.payment_attempts for select to authenticated
  using (public.is_finance_staff());

create table if not exists public.stripe_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null,
  livemode boolean not null default false,
  stripe_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text check (outcome is null or outcome in ('processed', 'ignored', 'error')),
  detail text check (char_length(detail) <= 1000),
  object_id text
);
create index if not exists stripe_events_received_idx on public.stripe_events (received_at desc);
alter table public.stripe_events enable row level security;
create policy "stripe_events: finance read" on public.stripe_events for select to authenticated
  using (public.is_finance_staff());

create table if not exists public.payment_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('payment_failed', 'refund', 'dispute', 'unmatched', 'amount_mismatch', 'overpaid', 'missing_here', 'missing_in_stripe', 'payout_failed', 'mandate', 'reconcile_error')),
  urgency text not null default 'soon' check (urgency in ('now', 'soon', 'info')),
  title text not null check (char_length(title) <= 200),
  detail text check (char_length(detail) <= 2000),
  fee_account_id uuid references public.fee_accounts(id) on delete set null,
  charge_id uuid references public.fee_charges(id) on delete set null,
  stripe_object_id text,
  livemode boolean,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text check (char_length(resolution_note) <= 1000)
);
-- One alert per Stripe object and kind (NULL object ids never clash).
alter table public.payment_alerts add constraint payment_alerts_dedupe unique (kind, stripe_object_id);
create index if not exists payment_alerts_open_idx on public.payment_alerts (created_at desc) where resolved_at is null;
alter table public.payment_alerts enable row level security;
create policy "payment_alerts: finance read" on public.payment_alerts for select to authenticated
  using (public.is_finance_staff());
create policy "payment_alerts: finance resolve" on public.payment_alerts for update to authenticated
  using (public.is_finance_staff()) with check (public.is_finance_staff());
create trigger audit_payment_alerts
  after update on public.payment_alerts
  for each row execute function public.audit_row_change();

create table if not exists public.payment_reminders (
  charge_id uuid not null references public.fee_charges(id) on delete cascade,
  kind text not null check (kind in ('before_due', 'overdue')),
  sent_at timestamptz not null default now(),
  email_ok boolean not null default false,
  primary key (charge_id, kind)
);
alter table public.payment_reminders enable row level security;
create policy "payment_reminders: finance read" on public.payment_reminders for select to authenticated
  using (public.is_finance_staff());

create table if not exists public.payment_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  ok boolean not null,
  livemode boolean,
  summary jsonb not null default '{}'::jsonb check (pg_column_size(summary) < 20000)
);
alter table public.payment_reconciliation_runs enable row level security;
create policy "payment_reconciliation_runs: finance read" on public.payment_reconciliation_runs for select to authenticated
  using (public.is_finance_staff());

-- ── 6. settings ──────────────────────────────────────────────────────────
alter table public.site_settings
  add column if not exists payments_direct_debit_enabled boolean not null default false;
comment on column public.site_settings.payments_direct_debit_enabled is
  'Bacs Direct Debit for the monthly plan (head teacher switch). Off until Stripe has enabled Bacs on the account.';

-- Only a head teacher (or admin) may turn Direct Debit on or off.
create or replace function public.site_settings_guard_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payments_direct_debit_enabled is distinct from old.payments_direct_debit_enabled
     and auth.uid() is not null and not public.is_finance_staff() then
    raise exception 'Only a head teacher or admin can change Direct Debit.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists site_settings_guard_payments on public.site_settings;
create trigger site_settings_guard_payments before update on public.site_settings
  for each row execute function public.site_settings_guard_payments();

-- ── 7. admissions ────────────────────────────────────────────────────────
-- Application fee on arrival (one per child), from site_settings.application_fee.
create or replace function public.admissions_application_fee_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric;
begin
  select application_fee into v_fee from public.site_settings where id = true;
  if coalesce(v_fee, 0) <= 0 then return new; end if;
  -- Never let billing stop an application from arriving: a failure here is
  -- logged and the office can raise the charge from the Payments page.
  begin
    insert into public.fee_charges (application_id, description, amount, due_date, kind)
    values (new.id, 'Application fee: ' || new.child_first_name || ' ' || new.child_last_name, v_fee,
            (now() at time zone 'Europe/London')::date, 'application_fee')
    on conflict do nothing;
  exception when others then
    raise warning 'application fee charge not created for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists admissions_application_fee_charge on public.admissions_applications;
create trigger admissions_application_fee_charge after insert on public.admissions_applications
  for each row execute function public.admissions_application_fee_charge();

-- Open applications whose fee is not yet recorded get their charge now.
insert into public.fee_charges (application_id, description, amount, due_date, kind)
select a.id, 'Application fee: ' || a.child_first_name || ' ' || a.child_last_name, s.application_fee,
       (now() at time zone 'Europe/London')::date, 'application_fee'
  from public.admissions_applications a
  cross join public.site_settings s
  left join public.admissions_stage_details d on d.application_id = a.id
 where s.id = true and coalesce(s.application_fee, 0) > 0
   and a.status not in ('declined', 'withdrawn', 'accepted')
   and not coalesce(d.application_fee_received, false)
on conflict do nothing;

-- When the family's portal accounts are made, their charges follow them.
create or replace function public.admissions_link_fee_charges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  if new.parent_profile_id is null then return new; end if;
  if new.parent_profile_id is not distinct from old.parent_profile_id and new.child_id is not distinct from old.child_id then return new; end if;
  select fee_account_id into v_account from public.fee_charges where application_id = new.id and fee_account_id is not null limit 1;
  if v_account is not null then
    update public.fee_accounts set parent_user_id = new.parent_profile_id, updated_at = now()
     where id = v_account and parent_user_id is null
       and not exists (select 1 from public.fee_accounts x where x.parent_user_id = new.parent_profile_id);
  end if;
  update public.fee_charges
     set parent_user_id = new.parent_profile_id,
         child_id = coalesce(child_id, new.child_id)
   where application_id = new.id;
  return new;
end;
$$;
drop trigger if exists admissions_link_fee_charges on public.admissions_applications;
create trigger admissions_link_fee_charges after update of parent_profile_id, child_id on public.admissions_applications
  for each row execute function public.admissions_link_fee_charges();

-- A paid charge from an application ticks the admissions flags: the
-- application fee, and the first payment, which secures the place.
create or replace function public.fee_charges_sync_admissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.application_id is null or new.status <> 'paid' or old.status = 'paid' then return new; end if;
  if new.kind = 'application_fee' then
    insert into public.admissions_stage_details (application_id, application_fee_received, application_fee_received_at)
    values (new.application_id, true, (now() at time zone 'Europe/London')::date)
    on conflict (application_id) do update
      set application_fee_received = true,
          application_fee_received_at = coalesce(public.admissions_stage_details.application_fee_received_at, excluded.application_fee_received_at);
  elsif new.kind = 'first_payment' then
    update public.admissions_applications
       set deposit_received = true,
           deposit_received_at = coalesce(deposit_received_at, (now() at time zone 'Europe/London')::date)
     where id = new.application_id and deposit_received is not true;
  end if;
  return new;
end;
$$;
drop trigger if exists fee_charges_sync_admissions on public.fee_charges;
create trigger fee_charges_sync_admissions after update of status on public.fee_charges
  for each row execute function public.fee_charges_sync_admissions();

-- ── finance search view (staff only through RLS on the base tables) ─────
create or replace view public.fee_charges_finance
with (security_invoker = true) as
select
  c.id, c.invoice_number, c.description, c.amount_pence, c.paid_pence, greatest(c.amount_pence - c.paid_pence, 0) as balance_pence,
  c.due_date, c.status, c.kind, c.plan, c.instalment_no, c.instalment_count, c.created_at, c.voided_at, c.waived_reason,
  c.fee_account_id, a.reference as family_reference, a.billing_name, a.billing_email, a.stripe_customer_id,
  c.child_id, ch.name as child_name, ch.pupil_number, yg.name as year_group,
  c.application_id, ap.reference as application_reference,
  coalesce(ch.name, nullif(trim(coalesce(ap.child_first_name, '') || ' ' || coalesce(ap.child_last_name, '')), '')) as pupil_name,
  coalesce(yg.name, ap.year_group_applying) as year_group_label
from public.fee_charges c
left join public.fee_accounts a on a.id = c.fee_account_id
left join public.children ch on ch.id = c.child_id
left join public.year_groups yg on yg.id = ch.year_group_id
left join public.admissions_applications ap on ap.id = c.application_id;
grant select on public.fee_charges_finance to authenticated;

-- ── 8. emails: pay online from the family's personal link ───────────────
-- The stored copies of the default templates (admissions_email_templates)
-- are brought in line with admissions-correspond/templating.ts. Templates the
-- office has rewritten are left alone where the old wording is not found.
update public.admissions_email_templates
   set body = replace(body, E'{{/family_fees}}\n\nOur admissions team',
     E'{{/family_fees}}\n\n{{#pay_online_link}}\nPAY THE APPLICATION FEE ONLINE\nYou can pay the application fee now, straight from your bank app or by card, on your secure payment page:\n{{pay_online_link}}\n{{/pay_online_link}}\n\nOur admissions team')
 where key = 'received' and body not like '%{{pay_online_link}}%';

update public.admissions_email_templates
   set body = regexp_replace(body, E'UPLOAD YOUR PROOF OF PAYMENT\\n.*?\\{\\{/payment_link\\}\\}',
     E'YOUR SECURE PAYMENT PAGE\n{{payment_link}}\nPlease do not share this link. Your child''s place is secured as soon as the first payment reaches us, and you will see every later payment, with its reference, on the Fees page of the parent portal.\n{{/payment_link}}', 's')
 where key = 'offer' and body like '%UPLOAD YOUR PROOF OF PAYMENT%';

update public.admissions_email_templates
   set body = replace(body, E'\nPlease use {{child_name}} (the child''s full name) as the payment reference.', '')
 where key = 'offer';

update public.admissions_email_templates
   set body = replace(body, 'Your child''s place is held only once the payments above have been received and verified.',
                            'Your child''s place is held only once the first payment above has been received.')
 where key = 'offer';

-- ── 9. Fees Policy: Stripe is the only way to pay (owner, 11 Nov 2026) ───
update public.policy_links set body_md = replace(body_md, $t$Fees are paid online, on the Academy's secure payment page, by debit or credit card or directly from a bank app. The link is sent with your offer and is on the Fees page of the Parent Portal. Please give your child's full name as the payment reference.$t$, $t$Fees are paid online only, through Stripe, the Academy's payment provider: directly from a bank app (Pay by Bank) or by debit or credit card. No other way of paying is accepted. Each family has a payment reference and each charge its own invoice number. New families pay the application fee and the first payment from the personal secure link in their emails; every later payment is listed, and paid, on the Fees page of the Parent Portal. Stripe emails a receipt for every payment.$t$)
 where position($t$Fees are paid online, on the Academy's secure payment page, by debit or credit card or directly from a bank app. The link is sent with your offer and is on the Fees page of the Parent Portal. Please give your child's full name as the payment reference.$t$ in body_md) > 0;
update public.policy_links set body_md = replace(body_md, $t$The payment details are emailed after the application is made, and the fee must be paid before a place is confirmed.$t$, $t$A personal secure link to pay it online is emailed when the application is made, and the fee must be paid before a place is confirmed.$t$)
 where position($t$The payment details are emailed after the application is made, and the fee must be paid before a place is confirmed.$t$ in body_md) > 0;
