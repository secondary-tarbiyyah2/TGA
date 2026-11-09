-- Portal redesign (owner brief, Nov 2026: "allow teachers to bookmark units, pin
-- frequently used lessons and resume where they left off"). Each member of
-- staff pins lessons for themselves; nobody else sees another person's pins.

create table if not exists public.lesson_pins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lesson_pins enable row level security;

drop policy if exists "lesson_pins: own" on public.lesson_pins;
create policy "lesson_pins: own"
  on public.lesson_pins for all
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.current_has_role(array['head_teacher', 'admin', 'teacher', 'teaching_assistant_cover'])
  );
