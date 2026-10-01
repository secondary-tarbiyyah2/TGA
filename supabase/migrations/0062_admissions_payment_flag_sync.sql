-- 0062: keep the fee-received flags in step with VERIFIED payment proofs.
--   * registration_fee proof verified  -> admissions_applications.admin_fee_received
--   * first_payment proof verified     -> admissions_applications.deposit_received
--     (the "deposit" column now means the first payment: see the Fees Policy)
--   * application_fee proof verified   -> admissions_stage_details.application_fee_received
-- Flags are only ever switched ON here. If staff later reject a proof they had
-- verified, the flags stay (staff can untick them by hand) and the UI warns.
-- The existing acceptance gate (acceptanceBlockers + Headteacher override) keeps
-- working unchanged because it reads these same flags.

create or replace function public.admissions_sync_payment_flags(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app boolean;
  v_reg boolean;
  v_first boolean;
begin
  select
    bool_or(status = 'verified' and 'application_fee' = any(covers)),
    bool_or(status = 'verified' and 'registration_fee' = any(covers)),
    bool_or(status = 'verified' and 'first_payment' = any(covers))
  into v_app, v_reg, v_first
  from public.admissions_payment_proofs
  where application_id = p_application_id;

  if coalesce(v_reg, false) then
    update public.admissions_applications
       set admin_fee_received = true,
           admin_fee_received_at = coalesce(admin_fee_received_at, current_date)
     where id = p_application_id and admin_fee_received is not true;
  end if;
  if coalesce(v_first, false) then
    update public.admissions_applications
       set deposit_received = true,
           deposit_received_at = coalesce(deposit_received_at, current_date)
     where id = p_application_id and deposit_received is not true;
  end if;
  if coalesce(v_app, false) then
    insert into public.admissions_stage_details (application_id, application_fee_received, application_fee_received_at)
    values (p_application_id, true, current_date)
    on conflict (application_id) do update
      set application_fee_received = true,
          application_fee_received_at = coalesce(public.admissions_stage_details.application_fee_received_at, current_date)
      where public.admissions_stage_details.application_fee_received is not true;
  end if;
end;
$$;
revoke all on function public.admissions_sync_payment_flags(uuid) from public, anon;
grant execute on function public.admissions_sync_payment_flags(uuid) to authenticated;

create or replace function public.admissions_payment_proofs_sync_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'verified' then
    perform public.admissions_sync_payment_flags(new.application_id);
  end if;
  return new;
end;
$$;

create trigger admissions_payment_proofs_sync
  after insert or update of status, covers on public.admissions_payment_proofs
  for each row execute function public.admissions_payment_proofs_sync_trg();
