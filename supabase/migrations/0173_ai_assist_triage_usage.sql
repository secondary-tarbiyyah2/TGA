-- AI helpers for staff (supabase/functions/ai-assist): drafts of report
-- comments, Weekly Tarbiyah Notes and replies to parent messages. Everything
-- the AI writes is a DRAFT that staff edit and send themselves; nothing here
-- sends anything to a family.
--
-- 1. ai_message_triage: the category / urgency / one-line summary the AI gave
--    an incoming parent message, so the inbox can show category chips and an
--    "Urgent" filter. Written only by the Edge Function (service role). Staff
--    read a row only when they can already read the thread under its own RLS.
--    Reply drafts are NOT stored.
-- 2. ai_usage: calls and tokens per UK day and task, for the owner. Read by
--    the Headteacher/Admin; written only through ai_usage_reserve() /
--    ai_usage_add_tokens(), which only the service role may execute. The
--    reserve function also enforces the daily cap (AI_DAILY_LIMIT).

-- ── ai_message_triage ───────────────────────────────────────────────────
create table if not exists public.ai_message_triage (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  message_id uuid not null unique references public.message_thread_messages(id) on delete cascade,
  category text not null check (category in (
    'absence', 'fees and payments', 'admissions', 'academic or homework', 'pastoral or wellbeing',
    'safeguarding concern', 'technical or portal', 'complaint', 'other'
  )),
  urgency text not null check (urgency in ('urgent', 'normal')),
  handler text check (char_length(handler) <= 120),
  summary text check (char_length(summary) <= 300),
  model text check (char_length(model) <= 80),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_message_triage_thread_idx on public.ai_message_triage (thread_id, created_at desc);

alter table public.ai_message_triage enable row level security;

drop policy if exists "ai_message_triage: staff who can see the thread read" on public.ai_message_triage;
create policy "ai_message_triage: staff who can see the thread read"
  on public.ai_message_triage for select
  to authenticated
  using (
    public.is_staff_member(auth.uid())
    and exists (select 1 from public.message_threads t where t.id = ai_message_triage.thread_id)
  );
-- No insert/update/delete policies: only the Edge Function writes.

-- ── ai_usage ────────────────────────────────────────────────────────────
create table if not exists public.ai_usage (
  day date not null,
  task text not null check (task in ('report_comment', 'tarbiyah_note', 'message_triage')),
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, task)
);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage: headteacher/admin read" on public.ai_usage;
create policy "ai_usage: headteacher/admin read"
  on public.ai_usage for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- Counts one call against today's (UK) cap. Returns false, and counts
-- nothing, when the cap is reached. Serialised with an advisory lock so two
-- simultaneous calls can't both squeeze past the limit.
create or replace function public.ai_usage_reserve(p_task text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Europe/London')::date;
  v_total integer;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage_reserve'));
  select coalesce(sum(calls), 0) into v_total from public.ai_usage where day = v_day;
  if v_total >= greatest(p_limit, 0) then
    return false;
  end if;
  insert into public.ai_usage (day, task, calls) values (v_day, p_task, 1)
  on conflict (day, task) do update set calls = public.ai_usage.calls + 1, updated_at = now();
  return true;
end;
$$;

-- Adds the tokens a finished call used to today's row for that task.
create or replace function public.ai_usage_add_tokens(p_task text, p_input integer, p_output integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (day, task, calls, input_tokens, output_tokens)
  values ((now() at time zone 'Europe/London')::date, p_task, 0, greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0))
  on conflict (day, task) do update
    set input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
        output_tokens = public.ai_usage.output_tokens + excluded.output_tokens,
        updated_at = now();
$$;

revoke all on function public.ai_usage_reserve(text, integer) from public, anon, authenticated;
revoke all on function public.ai_usage_add_tokens(text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_usage_reserve(text, integer) to service_role;
grant execute on function public.ai_usage_add_tokens(text, integer, integer) to service_role;
