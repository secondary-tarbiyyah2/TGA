-- Star of the Week: a fuller weekly flow (October 2026).
--
--  * reasons: the reason chips the teacher picked (kept alongside the
--    free-text `reason` sentence, which stays the thing printed).
--  * message: an optional personal message from the teacher to the pupil,
--    printed on the certificate and shown to the family. Never part of the
--    public shout-out.
--  * decision_note: why a nomination was not chosen (staff only).
--  * announced_at: when the class shout-out announcement was posted.
--  * star_candidates(): this week's evidence for every pupil in a class
--    (merits, behaviour points, homework, Qur'an, attendance) plus how often
--    they have been star this term, so a teacher can choose fairly. Staff of
--    that class (or head/admin) only; demerits appear only as a net number.
--
-- The 0074 guard is replaced so teachers may also edit `reasons` and
-- `message` on a pending nomination, and so changing the message invalidates
-- a made certificate (it is printed on it).

alter table public.star_of_the_week
  add column if not exists reasons text[] not null default '{}',
  add column if not exists message text check (message is null or char_length(message) <= 400),
  add column if not exists decision_note text check (decision_note is null or char_length(decision_note) <= 400),
  add column if not exists announced_at timestamptz;

create or replace function public.star_of_the_week_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.status in ('approved', 'declined') and auth.uid() is not null then
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.current_has_role(array['head_teacher', 'admin']) then
    if new.class_id is distinct from old.class_id
       or new.week_start is distinct from old.week_start
       or new.nominated_by is distinct from old.nominated_by
       or new.status is distinct from old.status
       or new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at
       or new.decision_note is distinct from old.decision_note
       or new.announced_at is distinct from old.announced_at
       or new.certificate_path is distinct from old.certificate_path
       or new.certificate_at is distinct from old.certificate_at
       or new.certificate_emailed_at is distinct from old.certificate_emailed_at then
      raise exception 'Teachers can only change the pupil, reasons or message of a pending nomination';
    end if;
  end if;

  if new.child_id is distinct from old.child_id or new.reason is distinct from old.reason or new.message is distinct from old.message then
    new.certificate_path := null;
    new.certificate_at := null;
    new.certificate_emailed_at := null;
  end if;

  if new.status is distinct from old.status and new.status in ('approved', 'declined') and auth.uid() is not null then
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end;
$$;

-- ── star_candidates (staff only) ────────────────────────────────────────
-- One row per pupil enrolled in the class, with the week's evidence and the
-- pupil's Star of the Week history this term (the term containing
-- p_week_start, else the last 12 weeks when no term is set up).
create or replace function public.star_candidates(p_class_id uuid, p_week_start date)
returns table (
  child_id uuid,
  child_name text,
  hidden boolean,
  merits int,
  merit_points int,
  net_points int,
  homework_set int,
  homework_done int,
  quran_sessions int,
  quran_average numeric,
  lessons int,
  attended int,
  stars_this_term int,
  stars_all_time int,
  last_star_week date
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_end date;
  v_term_start date;
begin
  if auth.uid() is null then
    raise exception 'Sign in to see candidates' using errcode = '42501';
  end if;
  if not (public.current_has_role(array['head_teacher', 'admin']) or public.class_taught_by_current_user(p_class_id)) then
    raise exception 'Not allowed to see candidates for this class' using errcode = '42501';
  end if;
  if p_week_start is null then
    raise exception 'A week is required' using errcode = '22023';
  end if;
  v_end := p_week_start + 7;
  select t.starts_on into v_term_start from public.terms t where t.starts_on <= p_week_start and t.ends_on >= p_week_start order by t.starts_on desc limit 1;
  v_term_start := coalesce(v_term_start, p_week_start - 84);

  return query
  with kids as (
    select c.id, btrim(c.name) as name, c.hide_from_leaderboard
    from public.enrolments e
    join public.children c on c.id = e.child_id
    where e.class_id = p_class_id
  ),
  bh as (
    select b.child_id,
           count(*) filter (where b.kind = 'merit')::int as merits,
           coalesce(sum(b.points) filter (where b.kind = 'merit'), 0)::int as merit_points,
           coalesce(sum(b.points), 0)::int as net_points
    from public.behaviour_records b
    where b.child_id in (select id from kids)
      and b.kind in ('merit', 'demerit') and b.voided_at is null
      and b.occurred_on >= p_week_start and b.occurred_on < v_end
    group by b.child_id
  ),
  hw as (
    select h.id from public.homework h
    where h.class_id = p_class_id and h.due_at >= p_week_start and h.due_at < v_end
  ),
  hs as (
    select s.child_id, count(*) filter (where s.submitted_at is not null)::int as done
    from public.homework_submissions s
    where s.homework_id in (select id from hw) and s.child_id in (select id from kids)
    group by s.child_id
  ),
  qp as (
    select q.child_id, count(*)::int as sessions, round(avg(q.score)::numeric, 1) as avg_score
    from public.quran_progress q
    where q.child_id in (select id from kids)
      and q.session_date >= p_week_start and q.session_date < v_end
    group by q.child_id
  ),
  att as (
    select a.child_id,
           count(*)::int as lessons,
           count(*) filter (where a.status in ('present', 'late', 'not_engaged'))::int as attended
    from public.attendance_records a
    join public.lesson_instances li on li.id = a.lesson_instance_id
    join public.timetable_slots ts on ts.id = li.timetable_slot_id
    where ts.class_id = p_class_id and a.child_id in (select id from kids)
      and li.date >= p_week_start and li.date < v_end
    group by a.child_id
  ),
  st as (
    select s.child_id,
           count(*) filter (where s.week_start >= v_term_start)::int as this_term,
           count(*)::int as all_time,
           max(s.week_start) as last_week
    from public.star_of_the_week s
    where s.status = 'approved' and s.child_id in (select id from kids)
    group by s.child_id
  )
  select k.id, k.name, k.hide_from_leaderboard,
         coalesce(bh.merits, 0), coalesce(bh.merit_points, 0), coalesce(bh.net_points, 0),
         (select count(*)::int from hw), coalesce(hs.done, 0),
         coalesce(qp.sessions, 0), qp.avg_score,
         coalesce(att.lessons, 0), coalesce(att.attended, 0),
         coalesce(st.this_term, 0), coalesce(st.all_time, 0), st.last_week
  from kids k
  left join bh on bh.child_id = k.id
  left join hs on hs.child_id = k.id
  left join qp on qp.child_id = k.id
  left join att on att.child_id = k.id
  left join st on st.child_id = k.id
  order by k.name;
end;
$$;

revoke all on function public.star_candidates(uuid, date) from public, anon;
grant execute on function public.star_candidates(uuid, date) to authenticated;
