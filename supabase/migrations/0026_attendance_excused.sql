-- Attendance gains an "excused" status (authorised absence: illness with
-- a note, a school-approved absence), so teachers can record the four
-- register states schools actually use: present / late / absent / excused.
-- Absence alerts (scripts/lms-absence-alerts.mjs) only fire on 'absent',
-- so an excused child never triggers an unexplained-absence alert.
alter table public.attendance_records drop constraint if exists attendance_records_status_check;
alter table public.attendance_records
  add constraint attendance_records_status_check check (status in ('present', 'absent', 'late', 'excused'));
