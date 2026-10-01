-- Headteacher/Admin can set, edit, delete and mark homework for ANY class
-- (the /admin/homework page). 0010 only let the class's own teacher manage
-- homework, and only manage_academic staff read it. Audit triggers from
-- 0010 (audit_row_change) already cover every table here, so every change
-- is logged with the acting user.

drop policy if exists "homework: head_teacher/admin read all" on public.homework;
create policy "homework: head_teacher/admin read all"
  on public.homework for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

-- New homework is attributed to the person setting it (teacher_id = them).
drop policy if exists "homework: head_teacher/admin insert any class" on public.homework;
create policy "homework: head_teacher/admin insert any class"
  on public.homework for insert
  to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin']) and teacher_id = auth.uid());

-- Editing keeps the original setter's teacher_id (no constraint on it).
drop policy if exists "homework: head_teacher/admin update any" on public.homework;
create policy "homework: head_teacher/admin update any"
  on public.homework for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "homework: head_teacher/admin delete any" on public.homework;
create policy "homework: head_teacher/admin delete any"
  on public.homework for delete
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "homework_submissions: head_teacher/admin read all" on public.homework_submissions;
create policy "homework_submissions: head_teacher/admin read all"
  on public.homework_submissions for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "homework_marks: head_teacher/admin manage all" on public.homework_marks;
create policy "homework_marks: head_teacher/admin manage all"
  on public.homework_marks for all
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

drop policy if exists "homework-submissions: head_teacher/admin read all" on storage.objects;
create policy "homework-submissions: head_teacher/admin read all"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'homework-submissions'
    and public.current_has_role(array['head_teacher', 'admin'])
  );
