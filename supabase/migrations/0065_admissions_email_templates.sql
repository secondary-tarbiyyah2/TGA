-- 0065: editable admissions email templates + per-template automatic sending.
--
-- One row per email the admissions team sends. subject/body use {{tokens}}
-- (documented in the portal: Admissions > Email settings), filled from the
-- application, site settings and stage details by the shared templating code
-- (supabase/functions/admissions-correspond/templating.ts, used by both the
-- portal composer and the Edge Function). auto_send switches on automatic
-- sending at the matching stage change; 'decline' is never sent automatically
-- (the Edge Function enforces that regardless of this column).
--
-- Rows are seeded with the defaults below. Safe to re-run: existing rows (and
-- any edits staff have made) are never overwritten.

create table if not exists public.admissions_email_templates (
  key text primary key check (char_length(key) <= 40),
  subject text not null check (char_length(subject) between 1 and 300),
  body text not null check (char_length(body) between 1 and 20000),
  auto_send boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.admissions_email_templates enable row level security;

drop policy if exists "admissions_email_templates: staff read" on public.admissions_email_templates;
create policy "admissions_email_templates: staff read"
  on public.admissions_email_templates for select
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

drop policy if exists "admissions_email_templates: staff insert" on public.admissions_email_templates;
create policy "admissions_email_templates: staff insert"
  on public.admissions_email_templates for insert
  to authenticated
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

drop policy if exists "admissions_email_templates: staff update" on public.admissions_email_templates;
create policy "admissions_email_templates: staff update"
  on public.admissions_email_templates for update
  to authenticated
  using (public.current_has_role(array['head_teacher', 'admin', 'admissions']))
  with check (public.current_has_role(array['head_teacher', 'admin', 'admissions']));

-- No delete policy: templates are edited, never removed ("reset to default" is an update).

-- (Not wired to audit_row_change(): that function reads NEW.id and this table is keyed by key;
-- updated_at / updated_by record the last editor.)

insert into public.admissions_email_templates (key, subject, body, auto_send) values
('received', $tpl$We have received {{child_first_name}}'s application - Tarbiyyah Global Academy$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

Thank you for applying to Tarbiyyah Global Academy for {{child_first_name}} ({{year_group}}).
{{#reference}}
Your application reference is {{reference}}. Please quote it if you contact us.
{{/reference}}

Our admissions team will review the application and contact you about the next steps, which usually begin with a short remote assessment. If you have any questions in the meantime, just reply to this email.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, true),
('assessment_invite', $tpl${{child_first_name}}'s remote assessment at Tarbiyyah Global Academy{{#assessment_short}} - {{assessment_short}}{{/assessment_short}}$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

Thank you for applying to Tarbiyyah Global Academy for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}}. This email has everything you need for {{child_first_name}}'s entry assessment.

DATE AND TIME
{{assessment_datetime}}
Please join 10 minutes early. The time above is UK time.

WHAT THE ASSESSMENT IS
A remote, supervised, standardised online assessment of {{child_first_name}}'s current attainment. It helps us place your child well and plan the right support.{{#assessment_platform}} The test is delivered through {{assessment_platform}}.{{/assessment_platform}} Your application fee covers the baseline assessment and the administration review. {{child_first_name}} does not need to prepare in advance.

HOW LONG
{{assessment_duration}}, including the ID check at the start.

JOIN LINK
{{assessment_link}}

WHAT YOU NEED
- A laptop, desktop or tablet (not a phone) with a working camera and microphone, fully charged or plugged in.
- A stable internet connection. Please close other programs and apps before we start.
- A quiet, well-lit room where {{child_first_name}} will not be disturbed, with the door closed. Another adult should be nearby but must not help.
- Pencil and blank paper if needed. We will tell you if anything else is allowed.

CAMERA AND SCREEN
- {{child_first_name}}'s camera must stay on for the whole assessment, positioned so we can see {{child_first_name}}'s face, hands and the desk or workspace.
- We will ask you to share {{child_first_name}}'s screen so the invigilator can see the test.
- At the start the invigilator will ask you to slowly turn the camera around the room so we can check the space.

ID CHECK AT THE START
A parent or guardian should be present for the first few minutes. Please have photo ID for yourself and ID for {{child_first_name}} (for example a passport or birth certificate) ready to show to the camera.

RULES
- No help of any kind from anyone in the room, and no talking about the questions.
- No other devices (phones, tablets, smart watches), books, notes, calculators or websites unless we say so.
- The camera must show {{child_first_name}} and the screen/room throughout. If the connection drops, rejoin straight away using the same link.
- The invigilator may pause or stop the assessment if the rules are not followed.

WHAT HAPPENS AFTER
We mark the assessment and review it with your application. We will then contact you to arrange a short conversation with you and {{child_first_name}}, and let you know the outcome of your application.

Please reply to confirm that this time works, or to ask for another slot.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, true),
('interview_invite', $tpl$Conversation with {{child_first_name}} and your family - Tarbiyyah Global Academy$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

Thank you for {{child_first_name}}'s assessment{{#reference}} ({{reference}}){{/reference}}. We would now like to invite you and {{child_first_name}} to a short conversation with us so we can get to know your family and answer your questions.

Date and time: {{interview_datetime}}
With: {{interviewer}}
Length: {{interview_duration}}
Join link: {{interview_link}}

Please both attend, in a quiet place with a working camera and microphone. There is nothing to prepare. We would like to hear about {{child_first_name}}'s interests and strengths, what you are looking for in a school, and anything you would like us to know. You are very welcome to bring your own questions.

Please reply to confirm that this time works.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, true),
('offer', $tpl$Offer of a place for {{child_first_name}} at Tarbiyyah Global Academy$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

We are delighted to offer {{child_name}} a place in {{year_group}} at Tarbiyyah Global Academy, starting {{start_date}}{{#reference}} ({{reference}}){{/reference}}. Masha'Allah, we enjoyed getting to know {{child_first_name}} and your family.

TO ACCEPT THE PLACE, PLEASE PAY BY {{deadline}}
- Application / assessment fee: {{application_fee_status}}
- Registration fee: {{registration_fee}}
{{#fee_plans}}
- First payment, depending on the plan you choose:
{{fee_plans}}
{{/fee_plans}}

{{#amounts_due}}
AMOUNT DUE NOW (application fee if not yet received + registration fee + first payment), by plan:
{{amounts_due}}
Please choose ONE plan. The remaining instalments follow the Fees Policy payment schedule.
{{/amounts_due}}

HOW TO PAY
{{bank_details}}
Please use {{child_name}} (the child's full name) as the payment reference.

{{#payment_link}}
UPLOAD YOUR PROOF OF PAYMENT
After paying, please upload a screenshot or receipt (JPG, PNG or PDF, up to 10 MB each) using your personal secure link, and tell us which plan you chose:
{{payment_link}}
Please do not share this link. Your place is confirmed once our team has checked the payment, and we will email you when it is.
{{/payment_link}}

Your child's place is held only once the payments above have been received and verified. If we have not heard from you by the deadline, we may offer the place to another family. Please also send us ID documents for {{child_first_name}} and a parent or guardian (for example a passport or birth certificate) if you have not already.

If you have any questions, just reply to this email.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, true),
('payment_received', $tpl$Payment received for {{child_first_name}} - Tarbiyyah Global Academy$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

Thank you. We have checked your proof of payment for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}} and it covers: {{payment_covers}}{{#payment_amount}} ({{payment_amount}}){{/payment_amount}}.

We will be in touch about the next steps. If you have any questions, just reply to this email.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, true),
('payment_rejected', $tpl$Proof of payment for {{child_first_name}} - action needed$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

Thank you for uploading proof of payment for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}}. Unfortunately we could not accept {{reject_item}} for the following reason:

{{reject_reason}}

{{#payment_link}}
Please upload a new screenshot or receipt using your personal secure link:
{{payment_link}}
{{/payment_link}}

If you think this is a mistake, or you would like to talk it through, just reply to this email.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, true),
('waitlist', $tpl$Your application for {{child_first_name}} at Tarbiyyah Global Academy$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

Thank you for applying to Tarbiyyah Global Academy for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}}, and for the time you and {{child_first_name}} gave us.

We do not have a place available in {{year_group}} at the moment, but we would like to keep {{child_first_name}} on our waiting list. We will contact you as soon as a place opens. Please let us know if you no longer wish to be on the list.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, false),
('decline', $tpl$Your application for {{child_first_name}} at Tarbiyyah Global Academy$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

Thank you for applying to Tarbiyyah Global Academy for {{child_first_name}}{{#reference}} ({{reference}}){{/reference}}, and for the time you and {{child_first_name}} gave us.

After careful consideration we are unable to offer {{child_first_name}} a place at this time. This is not a reflection of {{child_first_name}}'s ability or character, and we wish your family every success.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, false),
('request_documents', $tpl$Documents needed for {{child_first_name}}'s application$tpl$, $tpl$Assalamu alaikum {{parent_first_name}},

To continue with {{child_first_name}}'s application{{#reference}} ({{reference}}){{/reference}}, please send us the following by {{deadline}}:
{{missing_documents}}

You can reply to this email with the documents attached.

Jazakum Allahu khairan,
Admissions Team
Tarbiyyah Global Academy
{{school_email}}
{{school_phone}}$tpl$, false)
on conflict (key) do nothing;
