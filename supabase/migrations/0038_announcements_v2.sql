-- Announcements v2: edit, recall (soft hide), pin and expiry.
--
--   * edited_at   - stamped by the client on every edit.
--   * recalled_at - soft hide. A recalled notice is invisible to readers; its
--                   author and head_teacher/admin still see it (and can
--                   restore it by clearing recalled_at). Enforced in RLS below,
--                   not just in the client.
--   * pinned      - pinned notices sort first.
--   * expires_at  - clients stop showing a notice after this moment (staff
--                   still see it, marked Expired). Not an RLS rule on purpose:
--                   expiry is a display concern, recall is the access one.

alter table public.announcements
  add column edited_at timestamptz,
  add column recalled_at timestamptz,
  add column pinned boolean not null default false,
  add column expires_at timestamptz;

create index announcements_pinned_idx on public.announcements (pinned desc, created_at desc);

-- The author may edit / recall / restore their own notice. It must stay their
-- own, and (for non-head authors) a notice in a class they still teach, so this
-- can't be used to promote a class notice to school-wide. head_teacher/admin
-- keep "manage all"; the 0013 teacher policy is unchanged.
create policy "announcements: author edits own notice"
  on public.announcements for update
  to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and scope = 'class'
    and public.class_taught_by_current_user(announcements.class_id)
  );

-- Readers must not see recalled notices: recreate both select policies.
drop policy "announcements: school-wide readable by all learn users" on public.announcements;
drop policy "announcements: class-wide readable by class members" on public.announcements;

create policy "announcements: school-wide readable by all learn users"
  on public.announcements for select
  to authenticated
  using (
    scope = 'school'
    and (
      recalled_at is null
      or author_id = auth.uid()
      or public.current_has_role(array['head_teacher', 'admin'])
    )
  );

create policy "announcements: class-wide readable by class members"
  on public.announcements for select
  to authenticated
  using (
    scope = 'class'
    and (
      recalled_at is null
      or author_id = auth.uid()
      or public.current_has_role(array['head_teacher', 'admin'])
    )
    and (
      public.class_taught_by_current_user(announcements.class_id)
      or public.class_has_parents_child(announcements.class_id)
      or public.class_has_students_own_enrolment(announcements.class_id)
      or public.current_has_permission('manage_academic')
    )
  );
