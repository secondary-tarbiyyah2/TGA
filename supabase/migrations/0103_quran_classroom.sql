-- Qur'an classroom: Qaidah and Qur'an levels (tajweed is part of Qur'an), level-group homework,
-- one-to-one recitation sessions that teachers schedule, and richer marks on quran_progress.
-- Marks stay a whole number 0-10 (0072). Surahs covered, averages and revision are computed in the app
-- from the marks, never stored, so they can't drift from the data.

create table if not exists public.quran_levels (
  id text primary key,
  track text not null check (track in ('qaidah', 'quran')),
  name text not null,
  sort smallint not null default 0,
  meets text,
  unique (id, track)
);
alter table public.quran_levels enable row level security;
create policy "quran_levels: signed-in read" on public.quran_levels for select to authenticated using (true);
create policy "quran_levels: head manages" on public.quran_levels for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin']))
  with check (public.current_has_role(array['head_teacher', 'admin']));

insert into public.quran_levels (id, track, name, sort) values
  ('q1', 'qaidah', 'Qaidah 1: letters and sounds', 1),
  ('q2', 'qaidah', 'Qaidah 2: joining, harakat and tanween', 2),
  ('l1', 'quran', 'Quran 1: short surahs and basic tajweed', 1),
  ('l2', 'quran', 'Quran 2: makharij and sifat', 2),
  ('l3', 'quran', 'Quran 3: noon, meem and madd', 3),
  ('l4', 'quran', 'Quran 4: waqf and fluency', 4),
  ('l5', 'quran', 'Quran 5: hifz and revision', 5)
on conflict (id) do nothing;

-- A pupil does Qaidah, Qur'an or both: one level per track.
create table if not exists public.quran_child_levels (
  child_id uuid not null references public.children(id) on delete cascade,
  track text not null check (track in ('qaidah', 'quran')),
  level_id text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (child_id, track),
  foreign key (level_id, track) references public.quran_levels (id, track)
);
alter table public.quran_child_levels enable row level security;
create policy "quran_child_levels: staff manage" on public.quran_child_levels for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']));
create policy "quran_child_levels: family reads" on public.quran_child_levels for select to authenticated
  using (public.child_belongs_to_parent(child_id) or public.child_belongs_to_student(child_id));

create table if not exists public.quran_homework (
  id uuid primary key default gen_random_uuid(),
  level_id text not null references public.quran_levels(id),
  kind text not null check (kind in ('recitation', 'memorisation', 'revision', 'tajweed')),
  surah smallint check (surah between 1 and 114),
  ayah_from smallint check (ayah_from >= 1),
  ayah_to smallint check (ayah_to >= 1),
  note text,
  due_date date not null,
  set_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint quran_homework_range check (ayah_to is null or ayah_from is null or ayah_to >= ayah_from)
);
alter table public.quran_homework enable row level security;
create index if not exists quran_homework_level_idx on public.quran_homework (level_id, due_date desc);
create policy "quran_homework: staff manage" on public.quran_homework for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']));
create policy "quran_homework: family reads own level" on public.quran_homework for select to authenticated
  using (exists (
    select 1 from public.quran_child_levels cl
    where cl.level_id = quran_homework.level_id
      and (public.child_belongs_to_parent(cl.child_id) or public.child_belongs_to_student(cl.child_id))
  ));

-- One-to-one recitation: scheduled by a teacher like any lesson.
create table if not exists public.quran_sessions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  teacher_id uuid references public.profiles(id),
  teacher_name text,
  session_date date not null,
  session_time time not null,
  done boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.quran_sessions enable row level security;
create index if not exists quran_sessions_child_idx on public.quran_sessions (child_id, session_date);
create policy "quran_sessions: staff manage" on public.quran_sessions for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']));
create policy "quran_sessions: family reads own" on public.quran_sessions for select to authenticated
  using (public.child_belongs_to_parent(child_id) or public.child_belongs_to_student(child_id));

-- Marks: where it was heard, the ayat, what to work on (stored as keys, shown in Arabic and English).
alter table public.quran_progress
  add column if not exists setting text not null default 'class' check (setting in ('homework', 'one_to_one', 'class', 'revision')),
  add column if not exists ayah_from smallint check (ayah_from >= 1),
  add column if not exists ayah_to smallint check (ayah_to >= 1),
  add column if not exists focus text[] not null default '{}',
  add column if not exists homework_id uuid references public.quran_homework(id) on delete set null,
  add column if not exists session_id uuid references public.quran_sessions(id) on delete set null;
alter table public.quran_progress drop constraint if exists quran_progress_focus_known;
alter table public.quran_progress add constraint quran_progress_focus_known
  check (focus <@ array['makharij', 'madd', 'ghunnah', 'qalqalah', 'idgham_ikhfa', 'waqf', 'fluency', 'memory']::text[]);
create index if not exists quran_progress_homework_idx on public.quran_progress (homework_id);

-- Teachers can mark any Qur'an group, not only assessment leads.
drop policy if exists "quran_progress: teachers mark qur'an" on public.quran_progress;
create policy "quran_progress: teachers mark qur'an" on public.quran_progress for all to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'teacher']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'teacher']));

create trigger audit_quran_homework after insert or update or delete on public.quran_homework
  for each row execute function public.audit_row_change();
create trigger audit_quran_sessions after insert or update or delete on public.quran_sessions
  for each row execute function public.audit_row_change();
