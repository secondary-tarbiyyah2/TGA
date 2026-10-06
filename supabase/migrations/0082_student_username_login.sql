-- 0082: student sign-in with a USERNAME and password, no email needed.
--
-- How it works (full trade-offs in supabase/functions/_shared/studentAccount.ts):
--   * Supabase Auth needs an email, so a student's auth user is created with a
--     synthetic address, <username>@students.tarbiyyah.internal. That address
--     is never shown or emailed to; the sign-in page turns a typed username
--     into it. The domain cannot receive mail, so a student account cannot be
--     taken over by a password-reset email.
--   * public.student_logins records the username and whether the student must
--     choose their own password at first sign-in. It never holds a password.
--   * Rows are written ONLY by the student-account / admissions-create-accounts
--     Edge Functions (service role); there is no client insert/update policy.
--     The one thing a student may do is clear their own "must change" flag, via
--     student_login_password_changed() after changing their password.
-- Safe to re-run.

create table if not exists public.student_logins (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null unique references public.children(id) on delete cascade,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  username text not null unique
    check (char_length(username) between 3 and 40 and username ~ '^[a-z][a-z0-9.]*[a-z0-9]$'),
  must_change_password boolean not null default true,
  password_generated_at timestamptz not null default now(),
  reset_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.student_logins enable row level security;

drop policy if exists "student_logins: student reads own" on public.student_logins;
create policy "student_logins: student reads own"
  on public.student_logins for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists "student_logins: parent reads own child's" on public.student_logins;
create policy "student_logins: parent reads own child's"
  on public.student_logins for select
  to authenticated
  using (public.child_belongs_to_parent(student_logins.child_id));

drop policy if exists "student_logins: staff read" on public.student_logins;
create policy "student_logins: staff read"
  on public.student_logins for select
  to authenticated
  using (
    public.current_has_role(array['head_teacher', 'admin'])
    or public.current_has_permission('manage_people_accounts')
  );

-- No insert/update/delete policies on purpose: service role only.

drop trigger if exists audit_student_logins on public.student_logins;
create trigger audit_student_logins
  after insert or update or delete on public.student_logins
  for each row execute function public.audit_row_change();

-- A student clears their own "must change password" flag after changing it.
-- (Auth itself performs the change; this only records that it happened, so a
-- student who skips the page is simply asked again next time.)
create or replace function public.student_login_password_changed()
returns void
language sql
security definer
set search_path = public
as $$
  update public.student_logins
     set must_change_password = false
   where profile_id = auth.uid();
$$;

revoke all on function public.student_login_password_changed() from public, anon;
grant execute on function public.student_login_password_changed() to authenticated;
