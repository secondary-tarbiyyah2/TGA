-- The school's attendance codes (owner, 11 Nov 2026, "Tafweed 3", T43): Present, Late, Authorised
-- absence, Unauthorised absence and Technical absence. The register values already exist
-- (attendance_records.status: present, late, excused = authorised, absent = unauthorised, technical;
-- 0101), so no mark changes. The older 'not_engaged' mark stays valid so nothing saved is lost; the
-- portal no longer offers it and counts it as present.
--
-- Authorised absences include "exceptional circumstances approved by the Headteacher", which had no
-- reason code of its own: add 'exceptional' to absence_reasons. Only the Headteacher and admin record
-- reasons (0098), so the approval stays with the office. Existing codes are all kept.

alter table public.absence_reasons drop constraint if exists absence_reasons_reason_code_check;
alter table public.absence_reasons add constraint absence_reasons_reason_code_check
  check (reason_code in ('illness', 'medical_appointment', 'family_emergency', 'religious_observance', 'exceptional', 'holiday', 'unknown', 'other'));

comment on column public.attendance_records.status is
  'Register code: present (attended and engaged), late (joined after registration), excused (authorised absence), absent (unauthorised absence), technical (technical absence, unable to connect; counted separately). not_engaged is an older mark, counted as present and no longer offered.';
