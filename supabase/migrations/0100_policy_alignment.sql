-- Bring the website's stored content in line with the 2026–27 policies.
--
-- Fees Policy (25): registration fee £550; termly = 2 payments; monthly =
-- 7 payments (December 2026 to June 2027); the stored termly/monthly figures
-- per band were for 3 and 12 payments and are corrected. Contact phone from
-- every policy's letterhead.
-- FAQs: equipment (Admissions Policy 24, section 4), timetable options
-- (Flexible Learning Policy 21), class size (Curriculum Policy 12), Qur'an
-- (Curriculum Policy 12 section 5), payment methods (Fees Policy 25), and the
-- portals now being live.
-- Teachers (Supporting Pupils with Medical Conditions Policy 09): "Every live
-- teacher must be able to see ... each pupil's home address ... and parent
-- contact numbers", so a teacher can call emergency services to the right
-- address during a lesson. 0098 had removed these; they are restored here.
-- The rest of the family record (ethnicity, previous school, GP, siblings)
-- stays with the office.

update public.site_settings
set registration_fee = 550,
    fee_terms = 2,
    fee_instalments = 7,
    contact_phone = coalesce(nullif(contact_phone, ''), '020 3719 8697')
where id;

update public.fee_bands set termly_fee = 798.00,  monthly_fee = 228.00 where year_group_range = 'Reception – Year 2' and annual_fee = 1596;
update public.fee_bands set termly_fee = 1065.00, monthly_fee = 304.29 where year_group_range = 'Year 3 – Year 6' and annual_fee = 2130;
update public.fee_bands set termly_fee = 1398.00, monthly_fee = 399.43 where year_group_range = 'Year 7 – Year 9' and annual_fee = 2796;
update public.fee_bands set termly_fee = 1500.00, monthly_fee = 428.57, notes = 'Exam entry fees are not included: families pay the exam centre directly.' where year_group_range = 'Year 10 – Year 11' and annual_fee = 3000;

update public.faq_entries set answer =
  'Yes. It is taught live by qualified teachers in classes of no more than 15, alongside Qur''an, Arabic and Islamic Studies, through to GCSE and International GCSE in Years 10 and 11.'
where question = 'Is this the full British curriculum?';

update public.faq_entries set answer =
  'A laptop or desktop computer (Windows or Mac) or an iPad, with a working webcam, microphone and headset; a reliable broadband connection; and a quiet space to study. For secure tests the device must run Safe Exam Browser (Windows, Mac or iPad). We do a device check with you before your child starts.'
where question = 'What equipment does my child need?';

update public.faq_entries set answer =
  'Qur''an recitation, Tajweed and memorisation are taught live every week (two or three lessons, depending on the key stage), in groups set by ability after the entry assessment, with progress tracked alongside every other subject.'
where question = 'How is Qur''an memorisation (hifz) taught?';

update public.faq_entries set answer =
  'Fees can be paid by standing order (best for monthly plans), card, or bank transfer. Full payment details are in our Fees Policy and are sent with your offer.'
where question = 'How do I actually pay fees?';

update public.faq_entries set answer =
  'Most pupils follow the standard live timetable, 09:00–15:00 UK time, Monday to Friday. Reception to Year 9 can choose a four-day live week (Monday to Thursday, with Friday as a structured independent study day). For families in other time zones there are time-zone flexible options. Years 10 and 11 follow the full live timetable. See our Flexible Learning Policy.'
where question = 'Can we choose our timetable?';

update public.faq_entries set answer =
  'Yes. Every family has a Parent Portal and every pupil a Student Portal, where you will find live lessons, homework, attendance, messages to teachers, reports and forms to sign. Accounts are created when you accept a place.'
where question = 'Will there be a separate parent/student portal to log into?';

update public.faq_entries set answer =
  'The published fee covers tuition and core digital learning materials. Exam entry fees are not included: families register their child at an approved exam centre and pay the centre''s charges. Any physical textbook needed is listed at enrolment.'
where question = 'What does the published fee include, and what''s billed separately?';

update public.faq_entries set answer =
  'Yes. Years 10 and 11 follow live GCSE and International GCSE courses in core and option subjects. Exam entry fees are paid by families directly to the exam centre.'
where question = 'Do you teach GCSEs?';

-- ── Teachers: address and emergency contacts (Policy 09) ─────────────────
drop function if exists public.teacher_pupil_health();
create function public.teacher_pupil_health()
returns table (
  child_id uuid,
  address_line1 text,
  address_line2 text,
  town text,
  postcode text,
  medical_conditions text,
  allergies text,
  medication text,
  dietary_needs text,
  sen_notes text,
  health_confirmed boolean,
  photo_consent boolean,
  trip_consent boolean,
  completed_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select d.child_id, d.address_line1, d.address_line2, d.town, d.postcode,
         d.medical_conditions, d.allergies, d.medication, d.dietary_needs, d.sen_notes,
         d.health_confirmed, d.photo_consent, d.trip_consent, d.completed_at, d.updated_at
  from public.pupil_details d
  where public.child_enrolled_in_teachers_class(d.child_id);
$$;

revoke all on function public.teacher_pupil_health() from public, anon;
grant execute on function public.teacher_pupil_health() to authenticated;

drop policy if exists "pupil_emergency_contacts: teacher reads own class's children" on public.pupil_emergency_contacts;
create policy "pupil_emergency_contacts: teacher reads own class's children"
  on public.pupil_emergency_contacts for select
  to authenticated
  using (public.child_enrolled_in_teachers_class(pupil_emergency_contacts.child_id));

-- Safeguarding contacts and Headteacher, as named in the Child Protection and
-- Safeguarding Policy (01, section 2). Only filled where still empty.
update public.site_settings
set safeguarding_lead_name = coalesce(nullif(safeguarding_lead_name, ''), 'Ustadh Abu Zayn Haneef Sandhar, Headteacher'),
    safeguarding_lead_contact = coalesce(nullif(safeguarding_lead_contact, ''), 'globalacademy@tarbiyyah.co.uk · 020 3719 8697'),
    headteacher_name = coalesce(nullif(headteacher_name, ''), 'Ustadh Abu Zayn Haneef Sandhar')
where id;
