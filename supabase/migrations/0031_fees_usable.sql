-- Fees & billing: charges raised against a family (optionally one child) and
-- payments recorded against them. Paid/overdue are DERIVED (sum of payments
-- vs amount, due_date vs today) so they can never drift out of sync.
-- Headteacher/Admin manage everything; a parent reads only their own family's rows.

create table if not exists public.fee_charges (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  description text not null,
  amount numeric(10, 2) not null check (amount > 0),
  due_date date not null,
  voided_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fee_charges_parent_idx on public.fee_charges (parent_user_id);
create index if not exists fee_charges_child_idx on public.fee_charges (child_id);

create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.fee_charges(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'card')),
  paid_on date not null default current_date,
  reference text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fee_payments_charge_idx on public.fee_payments (charge_id);

alter table public.fee_charges enable row level security;
alter table public.fee_payments enable row level security;

create policy "fee_charges: headteacher/admin manage"
  on public.fee_charges for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "fee_charges: parent reads own family"
  on public.fee_charges for select
  to authenticated
  using (parent_user_id = auth.uid());

create policy "fee_payments: headteacher/admin manage"
  on public.fee_payments for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

create policy "fee_payments: parent reads own family"
  on public.fee_payments for select
  to authenticated
  using (exists (
    select 1 from public.fee_charges c
    where c.id = fee_payments.charge_id and c.parent_user_id = auth.uid()
  ));

create trigger audit_fee_charges
  after insert or update or delete on public.fee_charges
  for each row execute function public.audit_row_change();

create trigger audit_fee_payments
  after insert or update or delete on public.fee_payments
  for each row execute function public.audit_row_change();
