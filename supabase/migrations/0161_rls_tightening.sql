-- ── Three gaps from the October 2026 RLS review ──────────────────────────

-- 1. quiz_sessions: "anyone can update by token" never checked the token, so
--    any visitor could rewrite every session row (answers, completed_at,
--    config version). The client already carries the session_token (set on
--    insert from localStorage, src/lib/quiz/session.ts), so it now sends it
--    as a request header and the policy requires it to match the row.
--    Nothing is readable back by anon either way (no SELECT policy).
create or replace function public.quiz_session_token_matches(p_token text)
returns boolean
language sql
stable
as $$
  select p_token is not null
     and p_token = coalesce(current_setting('request.headers', true)::jsonb ->> 'x-quiz-session', '');
$$;

drop policy if exists "quiz_sessions: anyone can update by token (no PII, write-only from the client)" on public.quiz_sessions;
create policy "quiz_sessions: update own session by token"
  on public.quiz_sessions for update
  to anon, authenticated
  using (public.quiz_session_token_matches(session_token))
  with check (public.quiz_session_token_matches(session_token));

-- 2. resync_lesson_teachers() is SECURITY DEFINER with no permission check
--    and was executable by anon. It only recomputes teacher_user_id from the
--    mapping, but it is still an unauthenticated write; it is trigger-driven
--    and admin tooling can call it through a role-checked RPC if ever needed.
revoke all on function public.resync_lesson_teachers(uuid, uuid) from public, anon, authenticated;

-- 3. policy_links_auto_sign() was revoked from public and authenticated but
--    not from anon.
revoke all on function public.policy_links_auto_sign(uuid) from anon;
