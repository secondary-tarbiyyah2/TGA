-- ── Booking reminders actually run ─────────────────────────────────────────
-- 0001_init.sql left the cron.schedule() for send-reminders to a manual
-- Studio step that SETUP.md never spelled out, so the 24h/1h admissions-call
-- reminders were deployed but never fired. This schedules them from the
-- database (pg_cron + pg_net, both already created in 0001), reading the
-- two values it needs from Vault so nothing secret is committed:
--
--   edge_functions_url               https://<ref>.supabase.co/functions/v1
--   edge_functions_service_role_key  the service_role key
--
-- deploy-supabase.yml writes both into Vault on every deploy (step "Store
-- cron secrets in Vault"), so there is no one-time manual step. Until they
-- exist, invoke_edge_function() raises a notice and does nothing.

create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_functions_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'edge_functions_service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise notice 'invoke_edge_function(%): Vault secrets edge_functions_url / edge_functions_service_role_key not set', p_name;
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_body,
    timeout_milliseconds := 30000
  );
end;
$$;

-- Only the scheduler (postgres) ever calls this: it holds the service-role key.
revoke all on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- Upserts both Vault secrets. Called by deploy-supabase.yml through the
-- Management API, so the key never passes through a migration file.
create or replace function public.set_edge_function_cron_secrets(p_url text, p_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'edge_functions_url' limit 1;
  if v_id is null then perform vault.create_secret(p_url, 'edge_functions_url', 'Edge Functions base URL for pg_cron jobs');
  else perform vault.update_secret(v_id, p_url, 'edge_functions_url', 'Edge Functions base URL for pg_cron jobs'); end if;

  select id into v_id from vault.secrets where name = 'edge_functions_service_role_key' limit 1;
  if v_id is null then perform vault.create_secret(p_key, 'edge_functions_service_role_key', 'service_role key for pg_cron jobs');
  else perform vault.update_secret(v_id, p_key, 'edge_functions_service_role_key', 'service_role key for pg_cron jobs'); end if;
end;
$$;

revoke all on function public.set_edge_function_cron_secrets(text, text) from public, anon, authenticated;

-- Every 15 minutes: the function's ±15-minute window around the 24h and 1h
-- marks means no booking can fall between two ticks, and the
-- reminder_*_sent_at columns make a second tick a no-op.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'send-reminders';
    perform cron.schedule('send-reminders', '*/15 * * * *', $job$select public.invoke_edge_function('send-reminders')$job$);
  end if;
exception when others then
  raise notice 'send-reminders not scheduled: %', sqlerrm;
end $$;
