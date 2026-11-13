-- Scheduled jobs run by Supabase itself (pg_cron + pg_net), not GitHub Actions.
--
-- 13 Nov 2026: the GitHub account that owns the repo was locked over billing,
-- so no GitHub workflow (deploys or schedules) could start. Every scheduled job
-- that only calls an Edge Function now runs here instead, on the same timetable
-- (UTC) its workflow used. See docs/cloudflare-hosting.md.
--
-- IMPORTANT: when GitHub Actions works again, DISABLE the matching workflows
-- (Actions tab > workflow > "..." > Disable workflow) or each job runs twice:
-- message-digest, noshow-alerts, notify-flagged-messages,
-- open-evening-reminders, safeguarding-review-check, payments-daily,
-- teams-sync, weekly-digest.
--
-- The service-role key is read from Supabase Vault (secret name
-- 'tga_service_role_key'), stored once by hand, never in this repo:
--   select vault.create_secret('<service role key>', 'tga_service_role_key');

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.call_edge_function(fn text, body jsonb default '{}'::jsonb, timeout_ms integer default 60000)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  key text;
begin
  if fn !~ '^[a-z0-9-]+$' then
    raise exception 'bad function name %', fn;
  end if;
  select decrypted_secret into key from vault.decrypted_secrets where name = 'tga_service_role_key' limit 1;
  if key is null then
    raise warning 'call_edge_function(%): vault secret tga_service_role_key is missing', fn;
    return null;
  end if;
  return net.http_post(
    url := 'https://bgtspjhdajqheaktudip.supabase.co/functions/v1/' || fn,
    body := body,
    headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'apikey', key, 'Content-Type', 'application/json'),
    timeout_milliseconds := timeout_ms
  );
end
$$;
revoke all on function public.call_edge_function(text, jsonb, integer) from public, anon, authenticated;

-- cron.schedule(name, ...) replaces a job of the same name, so this is safe to re-run.
select cron.schedule('message-digest', '5 16 * * *', $$select public.call_edge_function('message-email', '{"kind":"digest"}')$$);
select cron.schedule('noshow-alerts', '10,40 8-16 * * 1-5', $$select public.call_edge_function('noshow-alerts')$$);
select cron.schedule('notify-flagged-messages', '5 */3 * * *', $$select public.call_edge_function('notify-flagged-messages')$$);
select cron.schedule('open-evening-reminders', '17 */6 * * *', $$select public.call_edge_function('open-evening-reminders')$$);
select cron.schedule('safeguarding-review-check', '47 */3 * * *', $$select public.call_edge_function('safeguarding-review-check')$$);
select cron.schedule('purge-data-exports', '49 */3 * * *', $$select public.call_edge_function('purge-data-exports')$$);
select cron.schedule('payments-daily', '23 6 * * *', $$select public.call_edge_function('payments-daily', '{"days":4}')$$);
select cron.schedule('teams-sync-morning', '35 5 * * *', $$select public.call_edge_function('teams-sync', '{"action":"sync"}', 300000)$$);
select cron.schedule('teams-sync-day', '35 12,16,19 * * 1-6', $$select public.call_edge_function('teams-sync', '{"action":"sync"}', 300000)$$);
-- weekly-digest sends only in the 15:00 UK hour (uk_hour), so both GMT and BST
-- times are listed; the later runs finish a batch that came back "partial".
select cron.schedule('weekly-digest', '5,25,45 14,15 * * 5', $$select public.call_edge_function('weekly-digest', '{"uk_hour":15}', 170000)$$);
