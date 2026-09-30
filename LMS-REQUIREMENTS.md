# LMS Requirements — derived from the TGA 2026–27 policy set

**Source:** the 34 policies in Google Drive → `TGA / TGA Policies 2026-27`, plus the
`Launch policy checklist` register, read in full on 30 September 2026.
**Compared against:** this repo at `1f4dd95` (migrations `0001`–`0024`, the `/learn`
portal routes, and the Supabase Edge Functions).

This document is a requirements spec, not a plan of record. Where a policy states an
operational fact ("registers are taken in the first five minutes of every live lesson",
"a pupil who joins after ten minutes is marked late"), that fact is a requirement on the
LMS whether or not anyone has written a ticket for it. Where the policies and the code
currently disagree, that is called out rather than resolved unilaterally — several of
these are decisions for the Headteacher, not for an implementer.

Legend used throughout:

- **BUILT** — exists in the repo and appears to do the policy's job.
- **PARTIAL** — exists but does not yet meet what the policy states.
- **MISSING** — nothing in the repo does this.

---

## 0. Three decisions that gate everything else

These are not features. They are contradictions between the policy set and the codebase
that will produce either a non-compliant system or a rewrite if they are left open.

### 0.1 Microsoft Teams vs. the in-house classroom (BigBlueButton)

Every single policy that touches teaching names **Microsoft Teams for Education** as the
classroom, and names specific Teams features as the mechanism for a stated requirement:

| Policy | What it commits the Academy to |
| --- | --- |
| 02 Online Safety §4 | "Only staff can create live lessons. The lobby is enabled… Pupils cannot present, record, start meetings, create breakout rooms or remove others. Private pupil-to-pupil chat is disabled" |
| 03 Live Lesson Protocols §2 | "Platform: Microsoft Teams for Education, joined through the Student Portal or the Teams calendar" |
| 03 §4, §8 | "complete the lesson's Teams assignment"; homework "set on Teams Assignments before the end of the day" |
| 04 Recording §2 | "All live lessons… held on Microsoft Teams for Education"; "Lesson chat, which is retained by the platform" |
| 12 Curriculum §6 | "Work is set and returned through Teams Assignments and Class Notebooks" |
| 13 Assessment §3, §5 | Quizzes "set in Forms"; "Results are recorded in Teams Grades and the Academy tracking system" |
| 14 Marking §3 | Feedback "in Teams Assignments or Class Notebooks, using rubrics"; "Forms quizzes give instant results" |
| 28 Data Protection §6 | Lists "Microsoft 365 / Teams for Education" as the system of record for "Live lessons, recordings, assignments, class notebooks, email" |
| 01 Safeguarding §9 | "Microsoft Teams for Education is configured so that only staff can start meetings…" |

`DESIGN.md` in this repo agrees with the policies and is emphatic: *"**No Moodle.**
Microsoft Teams for Education (already licensed) is the classroom… Portals here are the
branded front door that link into each class's Team — never rebuild an LMS."*

**What the code actually does:** it *is* an LMS. `supabase/functions/_shared/bbb.ts`,
`lesson-join`, `recording-control`, `recording-access` and
`lesson_recordings.bbb_recording_id` mean live lessons run on **BigBlueButton**, hosted by
us. Homework (`0010_homework.sql`), assessment (`0011_assessment.sql`), quizzes
(`src/lib/quiz`, `admin/quiz`), reports, messaging and marking are all first-party tables
and screens. There is no `teams_class_url` anywhere in `src/` or `supabase/`.

This is not a small inconsistency. It changes:

- **what the policies say to families and to an inspector.** Policy 04 is the Academy's
  answer to "how is an online school safeguarded in place of CCTV" — it describes Teams
  recording. Policy 20 §3 tells families secure tests run in **Safe Exam Browser**.
  Policy 02 §4 tells them chat is retained by the platform. If the classroom is BBB, each
  of those sentences is now a statement about software we control and must therefore build,
  configure and evidence ourselves.
- **the compliance surface.** Teams-as-processor puts Microsoft's certifications,
  retention and lobby controls behind the safeguarding claims. Self-hosting moves all of
  that onto us: lobby/admit control, presenter-rights lockdown, chat retention, recording
  storage and deletion, audit logs, and the DPIA that policy 28 §6 says must be completed
  for the portals.
- **how much is left to build.** Roughly half of §2–§7 below is "Teams gives us this" under
  the policy set, and "we build this" under the code as it stands.

**Required action (decision, not code):** pick one, then make the other side match.
Either (a) the policies are re-issued naming the Academy's own platform, and the LMS takes
on the full list of platform-control requirements in §1.2 below; or (b) the classroom moves
to Teams and the in-house lesson/homework/assessment stack is repositioned as the portal
and record-keeping layer on top of Teams (via Microsoft Graph, which `DESIGN.md` already
anticipates). Nothing in §1–§7 can be signed off while this is open, because the
acceptance criteria differ in each case.

### 0.2 Two parallel pupil data models

`0001_init.sql` created `families` → `students` (`first_name`, `last_name`, `year_group`
as free text). `0008_timetabling.sql` created `children` (`parent_user_id`, `name`, `dob`,
`year_group_id` FK) and `student_accounts`, and everything since — enrolments, attendance,
homework, assessments, reports, Qur'an progress — hangs off `children`.

`students` is therefore an orphaned second spine for the same real-world entity. Before
the admission register in §1.1 is built on top of either one, they need to be reconciled
into a single pupil record. Doing this after fees, safeguarding and SEND records
reference a pupil is materially harder.

### 0.3 The pupil record is missing the fields the safeguarding policies depend on

`children` holds `name`, `dob`, `year_group_id` and nothing else. The policies require,
as a precondition for teaching a child at all:

- **Home address and country of residence** — policy 24 §11 (admission register), policy
  01 §10, and policy 09 §6 which states the teacher gives "the pupil's address from the
  admission record" to emergency services.
- **Time zone** — policies 08 §6, 21 §2, 29 §4 all trigger behaviour off it.
- **At least two emergency contacts, including a local adult where possible** — policies
  01 §10, 09 §3/§6, 24 §11/Appendix A.
- **Local emergency number for the pupil's country** — policy 01 §10 (Emergency Contact
  Register), 09 §6.
- **Medical information / IHP, SEND status, who holds parental responsibility, court
  orders, previous school** — policy 24 §11/§12, 09 §4, 16 §4.

Policy 09 §6 is explicit about the interface, not just the data: *"Every live teacher must
be able to see, through the staff view of the Student Portal, each pupil's home address,
local emergency number and parent contact numbers. This information is checked each term
and whenever a family moves."*

**Status: MISSING.** This is the highest-priority build item in this document. A teacher
cannot currently discharge policy 09 §6 from this system, and a medical emergency in a
live lesson is the scenario it exists for.

---

## 1. Safeguarding, online safety and platform control

### 1.1 Pupil record / admission register — PARTIAL → mostly MISSING

Policy 24 §11 specifies the register contents; policy 28 §12 sets retention at "3 years
from the date of the last entry".

Required fields beyond what `children` has: full legal name, address, country of
residence, time zone, parents/guardians with parental responsibility flags, court orders,
2+ emergency contacts (one local where possible), local emergency number, previous school,
date of admission, date and ground of removal from roll, medical info/IHP link, SEND
status/EHCP, and the documents in policy 24 Appendix A (birth certificate/passport, proof
of address, parent photo ID, school report, EHCP, medical info).

Also required: **termly re-verification** of address and emergency contacts (policy 09 §6)
— i.e. a "last confirmed" timestamp per family plus a prompt/report of overdue families,
not just an editable field.

### 1.2 Live-lesson platform controls — PARTIAL, and scope depends on §0.1

If the classroom stays in-house, the following are all policy commitments the LMS must
enforce and be able to evidence:

| Control | Policy | Status |
| --- | --- | --- |
| Only staff can create/start a lesson | 02 §4, 01 §9 | Assumed via `lesson-join`; needs explicit test |
| Lobby — only invited Academy accounts admitted; no anonymous/external joins | 02 §4, 01 §9 | Needs confirmation as an enforced BBB setting, not a default |
| Pupils cannot present, record, start meetings, create breakout rooms, or remove others | 02 §4 | Needs explicit role config + test |
| Private pupil-to-pupil chat disabled; all chat visible to staff **and retained** | 02 §4, 01 §8 | MISSING as a retained record — policy 04 §2 says chat is retained and policy 06 §6 relies on "platform chat logs" as bullying evidence |
| Teacher can remove a participant and **lock** the meeting mid-lesson | 01 Appendix A, 03 §7 | Needs a one-click control on the teacher lesson screen |
| Teacher ends the meeting **for everyone** (no pupil left unsupervised) | 03 §5, 30 §3 | Needs enforcement, not just a button |
| Recording starts as the first pupil is admitted; teacher can confirm it saved | 03 §3, §5 | `recording-control` exists; needs the "recording started/saved" assurance surfaced to the teacher |
| "This lesson is recorded" notice at the start of every lesson | 04 §4 | MISSING |
| Breakout rooms only where staff can visit every room; recording continues where the platform allows | 01 §8, 03 §4 | Breakout rooms exist (surfaced on the join screen per git log); the *staff-can-visit-every-room* guarantee and recording-through-breakouts need checking |
| Audit logs reviewable by the Digital Lead when a concern is raised | 02 §4 | `audit_log` exists; needs to cover lesson join/admit/remove/recording-access events and be queryable per pupil per lesson |
| Account suspension takes effect immediately (behaviour C5, fees suspension, leaver) | 01 §9, 07 §5, 25 §6 | MISSING as a single enforced action |

### 1.3 Lesson recordings — PARTIAL

**BUILT:** `lesson_recordings` with `retention_deletes_at`, `recording_consents`,
`recording-access` / `recording-control` functions, `retention_schedule` +
`retention_job_runs`.

**Gaps against policy 04:**

- **Access matrix (§5) is not modelled.** Policy 04 §5 grants distinct access to DSL and
  deputies (any recording), Headteacher/SLT (safeguarding, behaviour, complaints, QA), DPO
  (requests and retention), the teacher who led it (own lessons only), pupils (only where
  deliberately shared as a resource), parents (not routinely), external agencies (police,
  children's social care, LADO). Each of these is a different permission, and the "teacher
  → own lessons only" and "pupil → only deliberately shared" rules need to be RLS, not UI.
- **Every access logged (§5, last line):** *"Every access to a recording for safeguarding,
  behaviour or complaint purposes is logged."* Needs an access log with a reason code, not
  just a signed URL.
- **Three retention classes (§6), not one:** routine = 1 academic year from recording;
  shared-as-resource = end of the academic year in which shared; anything relevant to a
  safeguarding concern, allegation, complaint or legal claim = **held until the matter
  resolves**, then that record's period. The current single `retention_deletes_at` cannot
  express the legal-hold case, which is the one that matters most — an automated delete
  that runs during a live safeguarding investigation destroys evidence. **A legal-hold flag
  that blocks deletion is required before the retention job is allowed to run in
  production.**
- **Deletion confirmed by the Digital Lead to the DPO (§6):** needs a deletion record, not
  just a job run.
- **Redaction for SAR (§5, policy 28 §9):** parents may SAR recordings of their own child
  with other pupils' data redacted or withheld. At minimum the system needs a workflow and
  a record of the decision; true video redaction is a manual process and should be
  documented as such rather than implied.
- **One-to-one sessions are recorded by default, with a DSL-authorised, itself-recorded
  exception (04 §2, 03 §6, 30 §3).** MISSING — needs a "one-to-one session" type that
  cannot be created without a parent-informed flag, line-manager visibility, and either a
  recording or a logged DSL authorisation.

### 1.4 Safeguarding concern reporting — BUILT, with gaps

**BUILT:** `safeguarding_concerns`, `safeguarding_categories`, `safeguarding_chronology`,
`safeguarding_attachments`, `/learn/report-concern`, `safeguarding_keywords` +
`notify-flagged-messages`.

**Gaps:**

- **Same-day guarantee (01 §5).** Staff must report "on the same day". The DSL needs an
  overdue/unactioned queue with an escalation to the deputy DSL, and the concern needs an
  acknowledgement timestamp — policy 01 §13 sets DSL actions against clocks (referral
  within 24 hours; follow up if no response within three working days).
- **Records separate from the general pupil file (01 §14).** Needs verifying as an RLS
  guarantee: *"kept in the Academy's secure, access-restricted electronic safeguarding
  record system, separate from the pupil's general file."*
- **Fact vs. opinion, pupil's own words (01 §13/§14).** The concern form should structure
  this, not leave it to a free-text box.
- **Emergency Contact Register per country (01 §10).** MISSING. A per-country table of
  emergency number, child-protection/social-services contact, and British Embassy/High
  Commission consular line, maintained by the DSL and surfaced next to any pupil in that
  country.
- **Low-level concerns about staff (01 §16).** MISSING. A separate register, reviewed for
  patterns, with staff self-reporting — deliberately *not* the pupil concern form, and
  visible only to the Headteacher/Chair.
- **Allegations against staff (01 §16).** MISSING. LADO consultation within one working
  day, DBS/TRA referral consideration, and the retention rule from policy 28 §12 ("until
  normal retirement age or 10 years, whichever is longer").
- **Concern about the DSL's own handling (01 §5).** Because the Headteacher *is* the DSL,
  the system must offer a route to the deputy DSL or Chair of Trustees that the DSL cannot
  see. This is a real RLS requirement, not a policy nicety.
- **Child protection file transfer on leaving (01 §14):** securely to the new school within
  five school days, with confirmation of receipt recorded.
- **Prevent referrals (05 §7):** route to local authority Prevent team / Channel for
  England and Wales, or local authority + police for pupils abroad; DSL records the
  reasoning. Should be a concern category with its own referral fields.
- **Termly safeguarding report to trustees (01 §20):** number and nature of concerns,
  referrals, training, lessons learned. A report generator, so it is not rebuilt by hand
  each term.

### 1.5 Children missing from live education — PARTIAL

Policies 01 §15 and 08 §6 define a precise escalation ladder. The LMS needs to *drive* it,
not just store attendance:

1. Register in the first five minutes of every lesson (03 §2, 08 §4).
2. Unexplained absence → contact parents **by 10:00 UK time**, or within one hour of the
   first missed lesson for pupils on a different time-zone pattern (08 §6).
3. No contact → try emergency contacts.
4. Still no contact by end of day, or any welfare concern → DSL informed.
5. Two consecutive unexplained days → DSL considers a welfare video call.
6. Ten consecutive school days unexplained (pupil in England) → notify the local authority
   under Children Missing Education; for pupils abroad, DSL decides.
7. Never remove from roll until the Academy knows where education continues (01 §15, 07 §8,
   08 §10, 25 §6).

**Status:** attendance capture exists; the ladder, the clocks, the time-zone-relative
trigger, the LA notification record and the removal-from-roll block are all MISSING.
Point 7 should be a hard constraint in the data model, not a checklist item.

### 1.6 Online-safety incident handling — MISSING

Policy 02 §10 tabulates six incident types with distinct responses (inappropriate content;
cyberbullying; suspected grooming → CEOP/police, do not alert the adult; nudes/semi-nudes →
do not view or forward, UKCIS route; unauthorised person in a lesson → remove, lock,
review access logs; compromised account or breach → revoke, reset, DPO within 24 hours).
An incident log with type-specific required actions, linked to `incident_breach_log` where
it is also a data breach.

### 1.7 Staff vetting / Single Central Record — PARTIAL

**BUILT:** `staff_vetting_records` (DBS date + reference + renewal due, references,
right-to-work, qualification check).

**Gaps against policy 31 §4/§6:** barred-list check as a distinct item; **overseas
criminal record checks / certificates of good conduct for every country lived in for 12+
months in the last 10 years** (31 §4 box); prohibition-from-teaching (TRA) check; **Section
128** check for management posts and trustees; medical fitness; **online searches on
shortlisted candidates** (31 §3.5); identity verified by live video comparison (31 §4);
the **Headteacher's written risk assessment** required before any overseas-resident staff
member teaches (31 §4 box, §5); engagement route (direct PAYE / variable-hours / vetted
agency / Employer of Record) since the SCR entry is held by the Academy in every case
(31 §5); and **termly SCR review by the Headteacher and safeguarding trustee** (31 §6) as a
recorded sign-off with a completeness check, not an implicit one.

Also MISSING per policy 33: qualification standards per role (QTS or equivalent; ijazah or
recognised institution for Qur'an/Arabic/Islamic Studies; NPQ for SENCO; DSL training
renewed every two years), the annual **KCSIE Part One written confirmation** from every
staff member (01 §5, 01 §18), the annual **Staff Code of Conduct signature** (30 §11), and
the training matrix in policy 01 §18 with expiry tracking (all staff annual + termly
briefings; DSL every 2 years with annual refresh; trustees on appointment and every 2
years; recruitment panels every 3 years). `signable_documents` / `document_signatures`
already exist and are the right mechanism for the two annual signatures.

---

## 2. Attendance

### 2.1 Attendance codes — PARTIAL, and wrong at the schema level

`attendance_records.status` is constrained to `'present' | 'absent' | 'late'`. Policy 08
§4/§5 requires:

| Required code | Definition in policy |
| --- | --- |
| Present | Attended **and engaged** |
| Late | Joined after registration (within the first ten minutes) |
| Late + recorded as a concern | Joined after **ten** minutes |
| **Present but not engaged** | Logged in, but no camera and no response to direct questions after a reasonable check — **and the form tutor is informed** |
| Authorised absence | Illness, unavoidable medical appointment, religious observance (e.g. Eid), or exceptional circumstances approved by the Headteacher |
| Unauthorised absence | No reason, or a reason not accepted, **including term-time holidays** |
| **Technical absence** | Unable to connect despite reasonable efforts — **recorded separately and reviewed for patterns** |

The absent/authorised/unauthorised distinction is what the whole escalation ladder in §1.5
runs on, and "technical absence" is a separate analytic the policy explicitly asks to be
reviewed for patterns (and which feeds the device-support conversation in 08 §8). This is a
schema change plus a marking UI change.

### 2.2 Registration mechanics — PARTIAL

- Register taken in the **first five minutes** of every lesson (03 §2, 08 §4) — the
  register UI should be time-boxed and flag lessons with no register taken.
- Late is computed from join time against lesson start, with the 10-minute threshold —
  should be derived from BBB join events, not left to teacher judgement.
- **Camera on for registration** so the teacher can see the pupil is present and well
  (08 §3) — with agreed exceptions (medical, connection, SEND reasonable adjustment)
  recorded against the pupil so a teacher is not chasing an approved exemption.
- Registers retained **3 years** (08 §4, 28 §12).

### 2.3 Absence reporting — PARTIAL

**BUILT:** `absence_notices` (per lesson instance).

**Gaps:** parents report **before 09:00 UK** on the first day via the Parent Portal absence
form, stating reason **and expected return date** (08 §5); for absence over one day,
parents **update daily** (so a multi-day notice needs a daily re-confirm, not a date
range); the current model is per-lesson-instance, which does not naturally express "off
sick all week".

### 2.4 Attendance improvement ladder — MISSING

Policy 08 §7 sets four bands with owners and actions: below 96% → form tutor discussion;
below 92% → Attendance Lead meeting + support plan reviewed after four weeks; below 90%
(persistent absence) → formal meeting considering SEND/health/wellbeing/technical
barriers and a possible Flexible Learning review; continued concern → Headteacher review,
possible LA involvement, placement review.

Needs: a live attendance percentage per pupil, band thresholds as configuration, an action
queue per band with owner and due date, and support plans with review dates.

Also: **attendance awards designed so pupils with a long-term health condition are not
disadvantaged** — "recognition is given for improvement and effort as well as percentages"
(08 §9). If attendance awards are automated, this must be built in, not bolted on.

### 2.5 Reporting — MISSING

Weekly attendance report to senior leaders and **termly to trustees, including patterns by
year group, SEND and time zone** (08 §11). Time-zone breakdown is also equality objective
2 in policy 29 §4, so the same cut serves both.

---

## 3. Teaching and learning

### 3.1 Timetable — BUILT, with policy detail to verify

`0008_timetabling.sql` plus `timetable-*` functions are substantial. Check against policy:

- **Lesson lengths by phase** (03 §2): Reception 20–25 min; Y1–2 30 min; Y3–6 45 min;
  Y7–11 50 min.
- **Ten-minute movement break between consecutive lessons; 55-minute lunch/Dhuhr**
  (03 §2, 10 §5) — breaks are a hard constraint on generated timetables, not a gap left by
  chance.
- **Asr break extension:** November–February the break before the final lesson extends to
  15 minutes (03 §2). A date-range-dependent timetable rule.
- **Prayer:** pupils in other time zones may leave a lesson briefly to pray after telling
  the teacher in chat — so a short mid-lesson absence must not be mis-coded.
- **Live lessons per week per phase per subject** (12 §4 table) — the curriculum policy
  fixes these allocations; the generator should validate against them.
- **Class size maximum 15 pupils** (12 §6) — an enforced constraint.
- **Academy day 09:00–15:00 UK, Mon–Fri** (03 §2), with Flexible Learning as the exception.
- **Daily live time caps for primary** (03 §2, 10 §5): Reception ~1.5h, Y1–2 ~2h, Y3–6 ~3.5h.

`protected_times`, `cover_assignments` and `teacher_availability` already give the shape
for the staff-side rules; the pupil-side wellbeing caps above are the ones to check.

### 3.2 Homework — BUILT, with gaps

**BUILT:** `homework`, `homework_submissions`, `homework_marks`, `homework_status` view,
teacher/family/student homework screens (and the file-upload bug fixed at `800b025`).

**Gaps against policy 15:**

- **Published homework timetable per year group, per term, visible on the Student Portal**
  (15 §3) — explicitly so that "pupils do not receive several large tasks on the same
  evening". This implies a *load view* the teacher sees before setting work, not just a
  published PDF.
- **Expected time per weekday by year group** (15 §3: R–Y2 10–20 min; Y3–6 20–40; Y7–9
  45–75; Y10–11 1.5–2h) — should be visible when setting a task and checkable against
  what a pupil actually has due.
- **On-screen vs. off-screen balance** (15 §2, 10 §5) — homework should carry a type so the
  balance can be monitored.
- **Repeated non-completion escalates to behaviour C2–C3** (15 §5) — needs the behaviour
  system in §4.1.

### 3.3 Assessment — PARTIAL

**BUILT:** `assessment_types`, `mark_schemes`, `grade_boundaries`, `assessments`,
`assessments_for_family` view, `quran_progress`, an in-house quiz engine.

**Gaps against policies 13 and 20:**

- **Entry/baseline assessment on admission** (13 §3, 24 §5): age-appropriate baseline for
  primary; CAT4 or equivalent for secondary; **Qur'an and Arabic placement** (12 §5 sets
  Qur'an groups by ability rather than age). MISSING as a recorded, admissions-linked step.
- **Standardised tests** (13 §3): GL Assessment CAT4 and Progress Test Series, annually,
  shared with the Tarbiyyah family of schools. MISSING — needs a place to hold external
  standardised scores alongside internal marks.
- **Three security levels** (13 §4, 20 §3) — the single biggest assessment gap:
  - *Practice*: any browser, shuffled questions and answers, time limit, one attempt where
    appropriate.
  - *Secure*: **Safe Exam Browser**; test link released **only through the Student Portal
    to enrolled pupils during the test window**; one attempt; **live invigilation call with
    cameras on**, pupil may be asked to show desk and room.
  - *External*: in person at an approved centre under JCQ rules.
  Nothing in the repo implements Safe Exam Browser config, timed release windows, or
  invigilation. Policy 20 §4 also commits to a **device-check page** telling families
  whether their device is supported (SEB does not support Chromebooks or Android tablets),
  and to a **practice run before a pupil's first secure test**.
- **Access arrangements** (13 §8, 20 §8, 19 §6): extra time, rest breaks, reader, scribe,
  assistive technology, adapted formats — recorded per pupil, **applied automatically** to
  secure tests, and evidenced as "normal way of working" for the JCQ application the
  examination centre makes.
- **Moderation** (13 §7): subject teams moderate a sample each term; a recorded moderation
  round, not an informal one.
- **Progress against starting point and age-related expectations; termly SLT review with
  interventions agreed for pupils not on track** (13 §5). MISSING as a tracking view.
- **Invigilation call recording rule** (20 §4): invigilation calls are **not** recorded
  unless an incident needs documenting, in which case pupil and parent are informed. This
  is the one live session the recording default is inverted for — worth encoding rather
  than leaving to a teacher to remember.
- **Genuine technical failure is not misconduct; the test is rescheduled** (20 §4) — needs
  a reschedule path with a reason.

### 3.4 Marking and feedback — PARTIAL

**BUILT:** `homework_marks`, `comment_bank`, assessment marking screens.

**Gaps against policy 14:**

- **Ten-school-day return deadline** on key assessed pieces, with at least one clear next
  step (14 §4) — a tracked clock, visible to leaders.
- **Frequency floor:** individual written feedback on at least one key piece **every two
  weeks** in English, Maths and Science; **at least once every half term** in other
  subjects (14 §4). This is monitorable and should be a report, not a hope.
- **Whole-class feedback** as a first-class object (14 §3) — the policy makes it the
  workload-saving default that replaces much individual marking, so it needs to exist in
  the system or teachers will default to per-pupil comments.
- **Improvement time / pupil response** visible against the work (14 §4) — a response
  artefact, and a check that it happened.
- **Rubrics** (14 §3) — `mark_schemes` may cover this; worth confirming it supports
  criterion-level feedback.
- **Qur'an and Arabic feedback is mainly live and individual on recitation and
  pronunciation** (14 §4) — `quran_progress` exists; check it carries this.

### 3.5 Curriculum — MISSING as a system

Policy 12 commits to a curriculum that is "coherently planned and sequenced", monitored
through "lesson drop-ins, review of lesson recordings, work scrutiny on Teams, pupil voice
and outcomes data" (12 §11). There is no curriculum/scheme-of-learning model in the repo.

Minimum useful version: subject → year group → term → unit sequence, so that a lesson
instance can point at the unit it teaches, and so that assessment can point at what it
assesses. Without it, "progress against age-related expectations" (13 §5) has nothing to
measure against.

Note also the open item in policy 12 §7: **`[TO CONFIRM: phonics programme]`** — a
validated systematic synthetic phonics programme is required for Reception/KS1 and for
older pupils who need it, and is not yet chosen.

### 3.6 Quality assurance — MISSING

Policy 03 §9 and 04 §3: senior leaders drop in to live lessons regularly ("as they would
walk through a physical school"), and recordings may be reviewed for QA. Needs a drop-in
record (who, which lesson, focus, supportive feedback) distinct from appraisal, and a QA
reason code on recording access (see §1.3).

### 3.7 Flexible Learning — MISSING

Policy 21 defines five options: standard live timetable; **four-day live week** (Mon–Thu
live, Friday structured independent study, R–Y9 only, not Y10–11); **time-zone flexible**
(mix of live at feasible local times, recorded lessons with set tasks, live catch-up
clinics); **time-zone pods** (where 5+ pupils in a year group share a time zone, their
form time, Qur'an group and clinics run at a local-friendly time); **temporary adjusted
timetable** (medical/SEND/exceptional, agreed with SENCO or Pastoral Lead).

Each needs a written **Flexible Learning Plan** recording which lessons are live and which
recorded, expected weekly engagement, how work is submitted, live check-in times, and a
review date; reviewed **at least termly**; requested at admission or any time via the
Parent Portal; decided by the Deputy Head with the form tutor and, where relevant, the
SENCO.

Two hard requirements come with it:

- **Every pupil, on any option, has at least one live camera-on contact with a member of
  staff every school day** (21 §4). The system must be able to prove this daily, for every
  pupil — it is the safeguarding floor that makes flexible learning defensible.
- **Engagement with recorded lessons and set work is tracked, and non-engagement is
  followed up under the Attendance Policy in the same way as absence** (21 §4). So
  "watched the recording / did the task" must produce an attendance-equivalent signal, not
  a separate silo.

Also: recorded lessons for flexible learners are shared **to the pupil's class only**, and
pupils must not share them (21 §5) — a narrower access scope than the general recording
rules.

### 3.8 Careers — MISSING

Policy 18: personal guidance interview by video call with a **Level 6+ qualified adviser**
before the end of Year 11, for every pupil in Years 8–11; virtual employer encounters;
destination data collected and used to evaluate the programme (18 §7). Needs a per-pupil
careers record (interviews held, adviser, date) and a destinations field — the Gatsby
benchmarks and OEAS careers standard are both evidenced from it.

### 3.9 Examinations / private candidates — MISSING

Policy 19: TGA is **not an examination centre**; pupils sit exams as private candidates.
The LMS needs to support the Academy's side of that:

- Centre list shared with families; per-pupil record of **which centre** and **which
  entries** were made, with the family's confirmation (19 §2 puts registration and payment
  on parents, but the Academy "confirms candidate details to centres on request").
- **Predicted grades** and mock results (19 §2/§7) — mocks under secure conditions (SEB +
  live invigilation, or paper-based under timed camera-on conditions), feeding predictions.
- **Access arrangement evidence pack** the Academy supplies to the centre (19 §6) — needs
  to draw on the same per-pupil arrangements as §3.3.
- Timeline reminders keyed to the policy's dates (19 §4) — Y10 autumn subject/tier/centre
  info; Y11 autumn mocks and entry guidance; centre deadlines often autumn–January;
  Jan–Mar access arrangements; May–June exams; August results and post-16 support.
- Results and destinations captured in August.

### 3.10 Enrichment and clubs — MISSING

Policy 22: term club programme published on the Student Portal before term begins; pupils
sign up through the Student Portal; **parents can see their child's clubs on the Parent
Portal**; clubs run by staff or **approved, DBS-checked volunteers**, following Live Lesson
Protocols **including recording**; clubs timed to suit different time zones where possible;
**participation tracked to ensure every pupil has the opportunity to take part** (22 §6);
charges only by prior written agreement (22 §4). External providers and guest speakers go
through the Prevent risk assessment (§5.1 below). Houses and inter-House competitions also
live here (22 §2).

---

## 4. Pastoral: behaviour, bullying, character, SEND, medical

### 4.1 Merits and consequences — MISSING entirely

This is the largest single missing subsystem, and the most visible to families. Policy 07
§4–§6 specifies it precisely.

**Merits** — awarded through the Student Portal, visible to pupils **and parents** (07 §4):

| Level | Value | For |
| --- | --- | --- |
| M1 | 1 merit | Daily consistency — punctual, prepared, camera on, respectful chat, homework on time |
| M2 | 2 merits | Going further — outstanding work or contribution, helping peers, marked improvement |
| M3 | 3 merits | Exceptional ihsan — leadership, service or charity initiatives, exemplary integrity |

Cumulative awards: Bronze Badge 50 · Silver Certificate 100 · Gold Certificate 150 ·
Bookshop voucher 175 · Platinum Badge 200 · End-of-year virtual celebration 250.

Merits also contribute to **House points** (07 §4) and are linked to specific **RECIPE
values** (23 §4). So the merit record needs: level, value, awarding staff member, pupil,
lesson/context, RECIPE value, and House. Awards should fire automatically at thresholds.

**Consequences C1–C5** (07 §5), each with its own escalation rule:

| Level | What happens | Escalation trigger |
| --- | --- | --- |
| C1 | Private verbal or chat warning in the lesson | Repeat in the same lesson → C2 |
| C2 | Second warning; may be moved to a supervised breakout room for the activity | **Three C2s in a week** → pastoral conversation + C3 |
| C3 | Virtual reflection session with the Pastoral Lead outside lesson time (30 min for punctuality/homework/home-environment; 45 min for behaviour) | **Three C3s in a half term** → parent meeting + monitoring report |
| C4 | Removal from the live lesson; independent work + supervised catch-up session | **Three C4s in a half term** → review for suspension |
| C5 | Serious incident: immediate suspension of platform access pending Headteacher review + parent meeting | Repeated C5s → review for permanent exclusion |

Plus: a missed reflection session without good reason repeats the next day, and persistent
non-attendance at reflection escalates to C4 + parent call (07 §5); **the same concern
logged three times in a half term** triggers a parent video meeting with the Pastoral Lead
and a support plan (07 §5). The **matrix of 13 online expectations** (07 §6) maps each
expectation to its usual consequence range and should be the pick-list a teacher logs
against, so the data is analysable.

The counting windows ("in a week", "in a half term") mean this needs a real half-term
calendar, and the escalations should be generated by the system — a policy that depends on
a human noticing the third C2 of a week will not hold.

**Also required:** private correction first, never in front of peers (07 §3 "adab of
correction") — so the teacher's behaviour-logging UI should default to a private channel to
the pupil; and **half-termly analysis of merits and consequences by year group, SEND and
other characteristics to ensure fairness** (07 §11) — an equality-monitoring report, which
is also equality objective 3 in policy 29 §4.

### 4.2 Suspension, exclusion and probation — MISSING

- Only the Headteacher may suspend (temporarily remove platform access) or permanently
  exclude (07 §8) — a permission that cannot be delegated in the role model.
- Parents informed **the same day, by phone and in writing**, of reason, length and work
  arrangements; **reintegration meeting before return**; then a **two-week monitoring
  report** (07 §8).
- Permanent exclusion: parents may request review by a panel of **trustees not involved**,
  and must be told how in the decision letter (07 §8).
- **Probationary period: every new pupil, first half term** (07 §7, 24 §9) — monitored
  progress/conduct/engagement, regular feedback, formal review at the end, SENCO involved
  where the pupil has SEND, and the review must consider **whether agreed adjustments were
  in place**. If unsuccessful: video meeting + writing, remainder of term is notice.
  Policy 24 §9 adds: *"The probationary review is never a route around the duty to make
  reasonable adjustments."* The settling-in report at the end of the probationary half term
  is already a named report in policy 13 §6.
- **Never remove from roll until the Academy knows where education continues** (07 §8) —
  same hard constraint as §1.5.

### 4.3 Anti-bullying — MISSING as a workflow

Policy 06 §6 sets a seven-step response with clocks and a review schedule:
acknowledged **within one working day** and recorded on the pastoral system → separate
recorded video calls with the pupil harmed, those alleged, and witnesses → evidence
gathered **including platform chat logs and recordings** → parents of **all** pupils
involved informed → support plan for the pupil harmed → consequences plus behaviour support
for those responsible → **reviewed after two weeks and again after half a term**.

Recording requirements (06 §7): type of bullying, **any prejudice element**, action taken,
outcome; **half-termly pattern review** by the Pastoral Lead; annual report to Headteacher
and trustees. Bullying **outside** Academy platforms is still in scope where it affects
wellbeing or learning (06 §3, 07 §10).

Reporting routes that must exist (06 §5): pupils via **the Help page on the Student
Portal** as well as any teacher/form tutor/Pastoral Lead; parents via the Parent Portal or
email. The Help page also has to show the safeguarding contact clearly (01 §19).

### 4.4 SEND — MISSING

Policy 16: a **SEND register** maintained by the SENCO; **SEND Support Plans** with
outcomes, strategies and adjustments, agreed with parents and pupil, following
**assess–plan–do–review** and reviewed **at least termly**; EHCP records where held; the
four need areas (communication and interaction; cognition and learning; SEMH; sensory
and/or physical); adaptations per pupil surfaced **to every teacher who teaches them**
(16 §6 lists the adaptation types); recorded reasonable adjustments to the behaviour policy
(07 §9); termly progress data **by SEND status** (29 §4 objective 1); SENCO termly report
to Headteacher and annual report to trustees (16 §10).

The SENCO is named in policy 16 §4 as **Nadia Qureshi** — a role the permission model
needs.

### 4.5 Medical conditions / IHPs — MISSING

Policy 09: **Individual Healthcare Plans** for any pupil whose condition may affect
learning or require an emergency response, recording condition, triggers, signs and
symptoms, what staff do in lessons, adjustments, and emergency contacts **including an
adult near the pupil's home**; stored securely, shared only with staff who need them,
reviewed at least annually; **teachers know which pupils in their classes have IHPs and
what to do** (09 §3). Plus the incident record after any medical emergency in a lesson
(09 §6), and the address/emergency-number visibility requirement already covered in §0.3.

### 4.6 RECIPE character framework — MISSING

Policy 23: merits linked to values (see §4.1); a **half-termly "RECIPE Star" per class**
for the value of the half term; **termly reports include a short comment on character and
values** (so the report template needs that field); families invited to share examples from
home; merit data + pastoral records + surveys reviewed termly for impact (23 §5).

### 4.7 Wellbeing surveys — MISSING

Policy 06 §4: an **annual pupil wellbeing and safety survey**, with results acted on.
Policy 29 §4 measures "pupil survey on feeling safe and respected". Policy 27 §6: annual
parent survey, post-event feedback forms, termly Parent Forum, policy consultation
(including RSHE), and a published **"You said, we did"** summary. Policy 33 §7: annual
staff survey. A simple survey tool with anonymity where appropriate would serve all four.

---

## 5. Curriculum-adjacent compliance

### 5.1 Prevent — PARTIAL

Policy 05 §5 requires a **written risk assessment approved in advance by the Headteacher or
DSL for every virtual guest speaker, webinar or external resource**, considering
background, planned content and risk. Controls: a staff member hosts and can mute/remove/end
at any time; guests cannot screen-share unless approved; **pupils cannot message guests
privately**; slides or scripts provided in advance where possible; **every session
recorded**. MISSING as a workflow — this is the same approval gate clubs and enrichment
need (22 §3).

Also: the **Academy Prevent Risk Assessment** reviewed annually (05 §10), and Prevent
referral routing (already noted in §1.4). Policy 05 §10 carries an open item:
**`[TO CONFIRM: date the first Prevent risk assessment is completed]`**.

### 5.2 RSHE — MISSING

Policy 17: **resources shared with parents in advance on the Parent Portal** (17 §4);
**anonymous pupil question box** in the lesson platform that only the teacher sees (17 §4);
**parental withdrawal requests** from sex education only — not Relationships Education,
Health Education, or the biology of reproduction in Science — discussed with the
Headteacher and recorded per pupil (17 §5); the rule that **from three terms before their
16th birthday a pupil may choose to receive sex education** regardless (17 §5), which is a
date-driven flag; annual parent consultation (17 §6); some content taught in single-sex
groups (17 §4), which is a grouping requirement on the timetable.

The withdrawal register is the compliance artefact here: per pupil, which content, who
requested, when discussed, outcome, and the 16th-birthday override date.

### 5.3 Academic integrity — MISSING

Policy 20 §7: misconduct concern recorded with evidence → Head of Department/Deputy Head
informed → **pupil given the opportunity to explain in a recorded video meeting** →
parents informed → outcomes (redo under supervision, mark of zero, behaviour consequences,
suspension for serious or repeated misconduct in formal assessments) → support to
understand why integrity matters. **Termly review of misconduct incidents and the
effectiveness of security measures** (20 §9).

Also: **AI use must be declared** per task where permitted (02 §9, 20 §6), and *"no
decision is made on a detection tool alone"* (20 §6) — so if any AI-detection signal is
ever surfaced, it must be presented as one input requiring human follow-up, never a verdict.

### 5.4 SMSC and British Values — policy document missing

The register (`Launch policy checklist`, row 18) lists **SMSC and British Values Policy**,
owned by the Deputy Headteacher (Personal Development). It is referenced by policies 05,
12, 18, 22 and 23 as a "read alongside" document, but **there is no such file in the Drive
folder**. The folder holds 33 numbered policies; the register lists 34. Worth flagging to
the Headteacher — it is not an LMS gap, but it is a launch gap, and the register's
numbering is offset from the filenames from row 18 onward (the files number Careers as 18
where the register numbers it 19), so the two should be reconciled before publication.

---

## 6. Family-facing: communication, admissions, fees

### 6.1 Parent Portal content — PARTIAL

Policy 27 §2 defines what the Parent Portal is for: *"Your child's timetable, attendance,
merits, reports, documents, invoices, booking meetings, reporting absence, messages to
staff."* Of those, **merits** and **invoices** do not exist, and **booking meetings** exists
only for admissions calls.

Policy 27 §5 sets what parents are told and when: attendance alerts **same day** for any
unexplained absence; merits and behaviour notes **visible as they happen**; progress
reports each term; consultations at least twice a year; newsletter every half term with a
short weekly update email; termly parent information sessions.

### 6.2 Response-time SLAs — MISSING

Policy 27 §3 commits to: safeguarding — immediate; absence/urgent welfare — same school
day; general message to a teacher or form tutor — **two school days (48 hours)**; concern
needing investigation — acknowledged within two school days, resolved or updated within
five; formal complaint — per policy 26.

`message_threads` exists. The SLA clocks, the **school-day** calendar they run on (policy 26
§3: school days are Mon–Fri in term time, UK; holiday-received items count from the first
school day after), and an overdue queue do not. Also: *"We do not expect staff to reply in
the evenings, at weekends or in holidays, except for safeguarding"* (27 §3, 30 §9) — so
notifications should respect staff working hours, with safeguarding as the exception.

### 6.3 Parent–teacher consultations — MISSING

At least twice a year, **booked through the Parent Portal** (13 §6, 27 §2/§5). The booking
engine (`meeting_types`, `availability_rules`, `bookings`, `booking-join`) already exists
for admissions calls and should be reusable — the gap is consultation rounds, per-teacher
slots, and parent self-booking against their own children's teachers, across time zones.

### 6.4 Reports to parents — PARTIAL

**BUILT:** `term_reports`, `comment_bank`, `weekly_tarbiyah_notes`, family/student report
screens.

**Gaps:** the four named report types in policy 13 §6 — **settling-in report** after the
first half term (end of probation), **termly progress report**, **annual report** at year
end — as distinct templates; a **character and values comment** in every termly report
(23 §4); attainment shown **against starting point and age-related expectations** (13 §5);
and accessible formats on request (large print, accessible PDF, plain-English summary —
policy 29 §5 and the availability line in every policy header).

### 6.5 Complaints — MISSING

Policy 26 is a three-stage statutory-style procedure with clocks that must be evidenced:

- **Stage 1 (informal):** teacher → form tutor → Pastoral Lead/senior leader →
  Headteacher. Acknowledged **within two school days**, most resolved within five. If about
  the Headteacher, straight to the Chair of Trustees.
- **Stage 2 (formal, to the Headteacher):** in writing, normally within three months of the
  issue. Acknowledged **within five school days** with a video meeting offered;
  investigated (**including review of lesson recordings where appropriate** — ties to
  §1.3's access log and reason codes); written response with reasons **within ten school
  days** of acknowledgement, or a new date given with an explanation. Conducted by the
  Chair if it concerns the Headteacher.
- **Stage 3 (panel):** requested to the Chair within **ten school days** of the Stage 2
  response; acknowledged within five; panel of **at least three people not previously
  involved, at least one independent of the management and running of the Academy**;
  heard **within twenty school days**, with at least five school days' notice; parents may
  bring one companion and submit documents at least five school days before; written
  decision with reasons **within ten school days** of the hearing, to parents, Headteacher
  and (where relevant) the person complained about; findings and recommendations available
  for inspection and kept on file.

Plus: a written record of all complaints and outcomes; **the number of formal complaints
registered in the previous academic year made available to parents on request** (26 §2) —
a reportable count; the unreasonable-complaints provision (single channel, procedure
exhausted) (26 §8); and confidentiality with the exception for the Secretary of State or an
inspection/accreditation body (26 §7).

This is a well-defined state machine and should be built as one. The "at least one panel
member independent of the management and running of the Academy" is a composition
constraint worth enforcing, since it is the clause an inspection will look at.

### 6.6 Admissions — PARTIAL

**BUILT:** `bookings` + admissions call booking, `eligibility_responses`, quiz v2 +
`quiz_leads`, `year_group_capacity`, `bursary_seats`, `/learn/admin/admissions`, the PHP
`apply.php`/`register.php` endpoints.

**Gaps against policy 24 §5–§10:**

- The seven-step pipeline as tracked stages: enquiry → application + **£100 application
  fee** → documents (Appendix A) + **confidential report requested from the current
  school** → **online entry assessment under supervised, camera-on conditions** → family
  video call with a leadership team member → **decision normally within ten working days**
  → conditional offer with T&Cs and Fees Policy.
- **Document upload and verification** against the Appendix A list, including identity of
  each adult with parental responsibility and evidence of parental responsibility (court
  orders) — policy 24 §12 calls admissions "a safeguarding process".
- **Acceptance within five working days + registration fee**; **14-day distance-selling
  cancellation right** (24 §7, 25 §8) — a real clock with real refund consequences.
- **Oversubscription order** (24 §10): siblings first, then exceptional educational/welfare
  reasons with evidence, then date of completed application; **waiting list per year
  group**, with "a place on the waiting list is not an offer" surfaced to families.
- **Technical requirements check before starting** (24 §4): laptop/desktop (Windows or Mac)
  or iPad, webcam, microphone, headset, reliable broadband, quiet space, and **an
  SEB-supported device for secure tests** — the device-check page from policy 20 §4 is the
  same artefact.
- **Reasonable adjustments to the entry assessment** (24 §6), with a written reason if the
  Academy concludes it cannot meet a pupil's needs online, and the rule that **the cost of
  adjustments is never passed to families** (24 §6, 16 §7).
- **Induction** (24 §8): pupil induction covering the platform, Live Lesson Protocols,
  RECIPE values, merits and consequences, how to report a worry, and a **practice live
  lesson**; separate parent onboarding session. Trackable per family.
- **LA notification** of new admissions and removals at non-standard times for pupils in
  England (24 §11).
- **Retention:** unsuccessful applications kept 1 year then securely deleted (28 §12) — the
  current quiz/lead tables need this wired into `retention_schedule`.

### 6.7 Fees, invoicing and payments — largely MISSING

**BUILT:** fee display and estimation only — `FeeEstimator`, `FamilyFees`
(sibling discount computed from real `enrolments`), `admin/fees` with CSV export, fee bands
in Sanity. As the comment in `FamilyFees.tsx` honestly notes, eligibility-based discounts
are omitted rather than invented because no system records the admissions decision.

**What policy 25 requires that does not exist:**

- **Invoices on the Parent Portal** (25 §5, 27 §2) and **card payment through the Parent
  Portal** (25 §5).
- The fee schedule itself: 2026–27 is a **shortened January–July 2027 period**; four bands
  (R–Y2 £1,596 / Y3–6 £2,130 / Y7–9 £2,796 / Y10–11 £3,000); **termly** = 2 payments;
  **monthly** = 7 payments Dec 2026–Jun 2027; **2% discount** for annual paid in full by
  the due date. Note this contradicts the current README's admission that monthly/termly
  figures are an even split of an annual fee — policy 25 now gives the real figures, and the
  monthly amounts (e.g. £304.29, £399.43, £428.57) are not round.
- **Due dates** as scheduled events: registration fee by 19 Dec 2026; annual 19 Dec 2026;
  termly 19 Dec 2026 and 28 Mar 2027; monthly on the 28th from 28 Dec 2026 to 28 Jun 2027.
- **Arrears workflow** (25 §6): missed payment → **14 days' written notice** → access to
  lessons suspended, place held a **further 14 days** → place released to the waiting list.
  With the hard constraint that the Academy **will not remove a pupil from the admission
  register for unpaid fees** until that process completes and it knows where education will
  continue. The suspension is the same platform-access suspension as behaviour C5, so it
  should be one mechanism with a reason.
- **One-off charges** as billable items: application fee £100 (non-refundable);
  registration fee £550 (refundable only in the 14-day window); reinstatement admin £50;
  withdrawal-without-notice admin £210; late-start admin £180 (joining after the start of
  the second half term); plus "charged for the full half term in which they join".
- **Withdrawal:** one half term's written notice, fees payable through the notice period,
  via a **Withdrawal Form** stating where the pupil will continue their education (25 §7) —
  which is also how §1.5's removal-from-roll block gets its evidence.
- **Fee increase notice:** at least one full term's written notice, and families may
  withdraw **without penalty or notice within 21 days** of being told (25 §14).
- **References may be declined while an account is in arrears** (25 §11) — a flag, not a
  workflow.
- **Cancelled lessons:** reschedule, provide an equivalent recorded or supervised session,
  or credit proportionately (25 §13) — implies a lesson-cancellation record with a
  resolution.

Given VAT-inclusive fees, refunds and consumer cancellation rights, this subsystem should
be scoped with the Finance Manager before any of it is built, and it is the one area where
buying rather than building deserves a serious look.

---

## 7. Cross-cutting: data protection, accessibility, roles

### 7.1 Data protection — PARTIAL, strongest area of the existing build

**BUILT:** `data_rights_requests`, `retention_schedule` + `retention_job_runs`,
`consent_wordings` + `consent_register`, `incident_breach_log` +
`incident_checklist_items`, `audit_log`, RLS throughout, `recording_consents`, the
compliance admin screens.

**Gaps against policy 28:**

- **The retention schedule in §12 is specific and should be seeded as data**: routine lesson
  recordings 1 academic year; admission register 3 years from last entry; attendance
  registers 3 years; main pupil record and internal results **until the pupil's 25th
  birthday**; SEND/EHCP **until 31st birthday**; child protection files until 25 then
  review; allegations against staff until normal retirement age or 10 years, whichever is
  longer; staff personnel files 6 years after employment ends; unsuccessful job
  applications 6 months; financial records 6 years; unsuccessful admissions 1 year. Several
  of these are **age-relative**, which the current schema (a human-readable
  `retention_period` string) cannot compute — an age-relative expiry needs the pupil's DOB
  and a computed date.
- **Legal hold** must override every automated deletion (see §1.3). This is the single most
  important safety property of the retention job.
- **SAR clock:** one calendar month, extendable in limited circumstances; **pupils around
  12 and over can generally make their own requests** — an age-derived capability;
  third-party data redacted or withheld (28 §9).
- **Breach: DPO informed immediately, ICO within 72 hours where required**, affected
  individuals informed without undue delay, every breach recorded and reviewed (28 §10).
  `incident_breach_log` exists; the 72-hour clock and the ICO decision record should be
  explicit.
- **DPIA for the Parent and Student Portals before they go live** (28 §6) — a named,
  outstanding deliverable, not a feature.
- **Data processing agreements** for every processor, and **international transfer
  safeguards** (IDTA + transfer risk assessment) where data is accessed from a country
  without UK adequacy — relevant because staff may work abroad (28 §8, 31 §5).
- **Open item:** **`[TO CONFIRM: ICO registration number, or confirmation that the Trust's
  registration covers TGA]`** (28 §2).
- Note policy 28 §7 states staff accounts use **single sign-on and multi-factor
  authentication**, while migration `0021_remove_mfa.sql` removed MFA from this system.
  Either the policy sentence is about Microsoft 365 only (in which case it should say so),
  or the portal needs step-up authentication for staff. `trusted_devices` is not the same
  control the policy describes. Worth an explicit decision recorded somewhere.

### 7.2 Accessibility — PARTIAL

Policy 29 §4 makes it an equality objective — *"Ensure all Academy platforms meet WCAG 2.2
AA"* — measured by an **annual accessibility audit**. `DESIGN.md` already commits to WCAG
2.2 AA and the README notes the manual keyboard/screen-reader pass has not been done.

Policy 29 §5 adds portal-specific requirements: **captions and transcripts** in live
lessons; **Immersive Reader** or equivalent; adjustable text size and contrast; keyboard
alternatives; reduced motion; policies and letters in **large print, accessible PDF and
plain-English summaries**, with key information in other languages on request; access
arrangements configured in the assessment tools.

Captions and transcripts are a substantive platform requirement, not a CSS concern — and
another input to the §0.1 decision, since Teams provides them and BBB's support differs.

### 7.3 Roles and permissions — PARTIAL

`user_roles`, `role_permissions`, `user_permissions` exist. The policies name a wider set
of distinct roles than the portal currently models, several with exclusive powers:

Headteacher (**sole** authority to suspend or permanently exclude — 07 §3/§8) · DSL (also
the Headteacher) · **Deputy DSL** (Skander Ahmed, and the route for concerns about the
DSL's own handling — 01 §5) · Chair of Trustees (allegations about the Headteacher;
Stage 2 and 3 complaints about the Headteacher) · safeguarding lead trustee (termly SCR
review) · Deputy Head (Teaching and Learning) · Deputy Head (Curriculum) · Deputy Head
(Personal Development) · Attendance Lead · Pastoral and Behaviour Lead · SENCO (Nadia
Qureshi) · Digital Lead (platform settings, audit logs, deletion) · DPO (possibly external
— 28 §4) · Examinations Officer · Careers Lead · PSHE Lead · Finance Manager · subject
leads · form tutors · class/subject teachers · sessional teachers · DBS-checked volunteers ·
trustees (including the exclusion review panel and the complaints panel, which must exclude
anyone previously involved).

Two structural consequences: **the Headteacher/DSL conflation requires a blind route to
the deputy DSL and Chair**, and **complaints/exclusion panels require a "not previously
involved" constraint** the system can check.

---

## 8. Suggested priority order

Ordered by what makes the Academy safe and lawful first, then what families experience
daily, then the rest.

**P0 — resolve before further building**

1. §0.1 Teams vs. in-house classroom. Every estimate below depends on it.
2. §0.2 Reconcile `students` and `children` into one pupil record.
3. §0.3 Pupil record fields: address, country, time zone, emergency contacts, local
   emergency number, medical/IHP, SEND, parental responsibility — plus the teacher-facing
   emergency view from policy 09 §6 and termly re-verification.
4. §1.3 Legal hold on recordings, before any retention job runs in production.

**P1 — safeguarding and statutory duties**

5. Attendance codes (§2.1) and the children-missing-education ladder (§1.5), including the
   removal-from-roll block.
6. Safeguarding gaps (§1.4): same-day queue and clocks, Emergency Contact Register per
   country, low-level concerns register, allegations-against-staff process, the blind route
   past the DSL, Prevent referral fields, termly trustee report.
7. Recording access matrix, access logging with reason codes, and the three retention
   classes (§1.3).
8. One-to-one session controls (§1.3 last item).
9. SCR completion and the training/qualification matrix with expiries (§1.7), plus the two
   annual signatures via the existing e-signature tables.
10. Platform controls and their evidence (§1.2), scope per §0.1.

**P2 — the daily school**

11. Merits, Houses and C1–C5 with automatic escalation (§4.1) — the largest missing
    subsystem and the most visible to families.
12. SEND register and support plans (§4.4); IHPs (§4.5).
13. Suspension/exclusion/probation, including the settling-in report (§4.2).
14. Anti-bullying workflow (§4.3).
15. Attendance improvement ladder and reporting (§2.4, §2.5).
16. Parent SLAs and consultation booking (§6.2, §6.3); merits and invoices on the Parent
    Portal (§6.1).
17. Marking clocks and frequency reporting; whole-class feedback as an object (§3.4).

**P3 — assessment integrity and Key Stage 4**

18. Three-level assessment security: SEB, timed release windows, live invigilation, device
    check, practice run (§3.3).
19. Access arrangements applied automatically (§3.3).
20. Academic integrity workflow (§5.3).
21. Baselines, CAT4/GL standardised scores, moderation, progress tracking (§3.3).
22. Examinations and private candidates (§3.9).

**P4 — breadth**

23. Flexible Learning plans, including the daily live camera-on contact guarantee and
    engagement-as-attendance (§3.7).
24. Complaints state machine (§6.5).
25. Fees, invoicing, payments and arrears — scope with the Finance Manager first (§6.7).
26. Clubs and enrichment with participation tracking (§3.10); guest-speaker approval (§5.1).
27. RSHE parent resources, anonymous question box, withdrawal register (§5.2).
28. Curriculum/scheme-of-learning model (§3.5); QA drop-ins (§3.6); careers (§3.8).
29. Surveys and "You said, we did" (§4.7).
30. Accessibility audit, captions and transcripts, accessible formats (§7.2).
31. Role model expansion, panel-composition constraints (§7.3).

---

## 9. Open items to put back to the Headteacher

Not LMS gaps — decisions or documents the policies themselves leave open, each of which
affects what gets built.

1. **Teams or our own platform** (§0.1). Everything else waits on this.
2. **SMSC and British Values Policy** is in the register but not in the Drive folder, and
   the register's numbering is offset from the filenames from row 18 onward (§5.4).
3. **`[TO CONFIRM: phonics programme]`** — policy 12 §7.
4. **`[TO CONFIRM: ICO registration number, or confirmation that the Trust's registration
   covers TGA]`** — policy 28 §2.
5. **`[TO CONFIRM: date the first Prevent risk assessment is completed]`** — policy 05 §10.
6. **DPIA for the Parent and Student Portals**, required by policy 28 §6 *before they go
   live*.
7. **Staff MFA** — policy 28 §7 says staff accounts use SSO and MFA; migration `0021`
   removed MFA from this portal (§7.1).
8. **Fee figures** — policy 25's monthly/termly instalments supersede the even-split
   placeholder the README flags; the Sanity fee bands need updating to the real numbers.
9. **Who is DPO**, and whether it is an external service (policy 28 §4) — it is a named
   role in several workflows above.
10. **Attendance awards design**, so that pupils with long-term health conditions are not
    disadvantaged (policy 08 §9) — a policy intent that has to be designed in, not patched.
