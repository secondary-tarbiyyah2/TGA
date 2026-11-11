# Securing online assessments: options (Tafweed 3, T52)

**Owner's note (11 Nov 2026):** "Currently Safe Exam Browser is not in use, so remove
reference to it. As a side note, explore alternative methods to secure assessments and
methods of integration with our policy and system."

Safe Exam Browser has been taken out of every policy and the equipment FAQ. Secure tests
are now described as: released through the Student Portal only to the class, in a time
window, one attempt, marked on the server when set in the portal's quiz tool, with live
invigilation and cameras on (policies 13, 19, 20). This note lists what else could be done.
**Nothing here is built.** Each option says what it would change in the policy (mainly
policy 20, Academic Integrity and Secure Assessment) and in the system.

## What we already have

| Control | Where | Notes |
| --- | --- | --- |
| Questions and answers never sent to the pupil's browser before they hand in; marking on the server | Classwork quizzes (migration 0206), revision quizzes (0094), entry assessment | The strongest control we have: answers cannot be read from the page. |
| Time window, time limit, one attempt, shuffled questions | Classwork quizzes | Already in policy 20 ("Practice" and "Secure" rows). |
| "You left the assessment" cover, leave count, optional "end a part after N leaves" | Entry assessment only (`AssessmentSitting.tsx`, `_shared/assess/integrity.ts`, T4) | Shows staff how often a pupil left; a browser cannot stop it. |
| Live invigilation with cameras on | Teams call alongside the test | Staff time is the cost. |
| Follow-up conversation when a result looks out of line | Policy 20, section 5 | Cheap and effective. |

## Options

### 1. Bring the entry assessment's "fair sitting" to secure tests (recommended first)
- **What:** reuse the entry assessment's full-screen sitting, leave cover and leave count
  for classwork quizzes marked "Secure" (a per-quiz switch in the quiz builder); show
  "Left the test N times" on the teacher's results; optional "end after N leaves".
- **Policy:** add to policy 20's "Secure" row: "the portal records each time the pupil
  leaves the test screen, and the teacher sees the count".
- **System:** quiz settings column (`secure boolean`, `leave_limit int`), client events
  as in `entry-assessment`, results column; pgTAP for the new columns. Medium effort.
- **Cost / data:** none extra; data stays in Supabase (London). Update the privacy notice
  to say leave events are recorded.

### 2. Item banks and variants
- **What:** each secure test draws different questions of the same difficulty, or the same
  question with different numbers, so sharing answers helps less.
- **Policy:** already allowed by policy 20, section 5 ("question banks and multiple versions").
- **System:** quiz builder "pick N from this pool" and numeric variants. Medium effort.

### 3. Handwritten working, photographed and uploaded
- **What:** for maths and science papers, pupils work on paper (or a stylus tablet) and
  upload a photo or PDF of their working at the end; marks need the working.
- **Policy:** add to policy 20 section 4 ("you may be asked to upload your working within
  5 minutes of the end").
- **System:** classwork submissions already take files; add a short upload window after a
  quiz. Low effort.

### 4. Short viva after secure tests
- **What:** a 3 to 5 minute recorded conversation with a sample of pupils (and anyone with
  a surprising result) explaining two of their answers.
- **Policy:** already in policy 20 section 5 and section 7; make "a sample of pupils" explicit.
- **System:** none. Staff time.

### 5. Second camera for mock examinations
- **What:** for Year 10 and 11 mocks, pupils join the invigilation call a second time from
  a phone placed to the side, showing the desk and screen.
- **Policy:** policy 19 section 7 and policy 20 section 4; a phone used this way is an
  exception to "phone away", which must be written down; parental consent for under-13s.
- **System:** none (two Teams joins). Safeguarding: recording rules as policy 04; check it
  works for families with one device.

### 6. Device lock-down tools (if wanted again later)
- **What:** Safe Exam Browser (free, Windows, Mac, iPad; not Chromebook or Android), or the
  operating system's own assessment modes (Windows "Take a Test", iPad Automatic Assessment
  Configuration used by some exam apps).
- **Policy:** would need the old policy 20 wording back, a device requirement in policy 24,
  a practice run, and a privacy note.
- **System:** Safe Exam Browser config files per test; the portal would need to detect it
  (request header check). Families' devices limit it. Use only for mocks, if at all.

### 7. Remote proctoring services (not recommended)
- **What:** paid services that watch the webcam and screen and flag behaviour with AI.
- **Why not:** cost per pupil, children's biometric and video data sent to a third party
  (needs a DPIA and consent; ICO Children's Code), false flags, and DESIGN.md's "no AI
  with pupils". Live invigilation by our own staff does the same job more fairly.

### 8. Sit important papers in person
- **What:** UK pupils near the examination centre sit Year 11 mocks there; pupils abroad at
  their local centre where they sit their International GCSEs.
- **Policy:** policy 19 section 7 ("mocks may be held in person").
- **System:** none. Cost and travel for families; offer, don't require.

## Suggested order

1. Option 1 (fair sitting for secure quizzes) and option 3 (upload working): biggest gain
   for the least effort, and both fit the "portal is the school" decision.
2. Option 4 (viva sample) as routine practice, written into policy 20.
3. Options 2 and 5 for Years 10 and 11 mocks.
4. Leave 6 and 7 unless a later decision needs them.

## Who reviews the logs

The Digital Lead (policy 02, section 4) reviews the audit logs every month. Leave counts and
upload times from secure tests would sit in the teacher's results, not the audit log; the
Deputy Headteacher reviews misconduct each term under policy 20, section 9.
