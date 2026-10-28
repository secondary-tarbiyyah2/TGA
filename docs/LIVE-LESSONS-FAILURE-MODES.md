# Live lessons: how the chain works and where it breaks

The chain, on a normal Tuesday morning:

1. **Dated lessons exist** for today (`lesson_instances`, created by Timetable → Dated lessons → *Create dated lessons*, up to 120 days ahead).
2. **Join button** appears on the family/pupil/teacher dashboards 10 minutes before the UK start time (`JoinLessonCard`), and stays until the lesson ends.
3. Pressing it **opens the meeting**: a per-lesson Teams meeting if `teams-sync` made one, else the class's recurring Teams link, else a BigBlueButton room; and **logs a `lesson_joins` row** in the background.
4. **The teacher's register** pre-fills "present" from `lesson_joins`, and shows Teams join/leave times as a hint when attendance sync is on. The register is the record of truth; nothing is marked automatically.
5. **No-show check** (`noshow-alerts`, every 30 minutes on weekdays): 10 minutes after a lesson starts, any enrolled child with no join, no register mark and no absence reason gets a parent email; 3 in 14 days opens a safeguarding concern.
6. **Teams attendance sync** (`teams-sync`, four times a day) pulls each meeting's attendance report and matches attendees to children by email.

## Fixed on `audit/oct-2026`

| Was | Now |
|---|---|
| The Join button and the teacher's Today/Now views used the **browser's clock** against UK lesson times. A family in Cairo saw the button two hours early and lost it before the lesson started; a family east of UTC+9 was looking at the wrong day. | All of them use the UK clock (`ukToday`, `ukNowHm`). The join card also shows "11:00 your time" for families abroad. |
| No-show check only alerted while the lesson was **still running**. With runs at :10 and :40 and GitHub cron routinely 5–15 minutes late, a 30-minute lesson could fall between two runs and never be checked. | Checks up to 30 minutes after the lesson ends; the email drops "you can still join" once it is over. |
| A lesson where **nobody joined at all** (teacher's internet down, lesson cancelled, dead link) emailed every family that their child was absent. | Recorded once per lesson, no parent emails; the Headteacher gets one email listing such lessons. |
| Alerts fired on **closure days** (INSET, holidays) if dated lessons existed. | Skipped when `school_closures` covers today. |
| A parent with **no email on file** was silently not alerted. | Listed in the office email. |
| If **no dated lessons** existed on a school day, nothing anywhere noticed. | Office email at 08:xx on a weekday with a published timetable and no instances. |
| No-show email read as an accusation. | Says "we have no record of X joining" and that the register is what counts if they joined from the Teams app. |

## Still fails, and what to do about it

| Scenario | What happens | Mitigation |
|---|---|---|
| **Pupil opens Teams from the Teams app or calendar, not from the dashboard** | No `lesson_joins` row, so the no-show email goes out even though the child is in the lesson. | Tell families clearly: *always join from the dashboard*. The register pre-fill will miss them too, so teachers must mark the register. Attendance sync (below) would reconcile it, hours later. |
| **Teacher and pupils all join Teams directly** | Looks like "nobody joined": office gets an email, parents do not. | Same instruction to staff. Harmless but noisy. |
| **Attendance sync is off or cannot match anyone** | `MS_TEAMS_ATTENDANCE` is unset by default; it needs an Azure app registration, `OnlineMeetingArtifact.Read.All`, and a Teams application access policy on the organiser. Matching is by **email**: pupils' portal accounts use `@students.tarbiyyah.internal`, which is not a Microsoft identity, so unless each child has `microsoft_email` set (an M365 account) or joins from the parent's M365 account, every attendee is "unmatched". Guests/anonymous joiners have no email at all. | Decide before January: give pupils M365 accounts (and fill `microsoft_email`), or treat Teams attendance as unavailable and rely on the dashboard join + register. Do not describe attendance as automatic until this is tested with real accounts. |
| **GitHub Actions schedules stop** | GitHub disables scheduled workflows in a repository with no commits for 60 days, and skips runs under load. Every alert and retention job is on GitHub cron. | Move the time-sensitive jobs to pg_cron (`invoke_edge_function()` exists for this, see LAUNCH-READINESS B2) and restore the 5-minute no-show cadence there. |
| **Class has no meeting link and no Teams meeting was created** | Join returns "This class has no meeting link yet"; the pupil sees an error. | Check Academic setup → Meeting links before term; the "nobody joined" email catches it after the fact. |
| **Teacher's recurring Teams meeting expires or is recreated** | Join "works" but opens a dead meeting. Nobody joins → office email after the lesson. | Prefer per-lesson meetings made by `teams-sync` (needs the Graph setup) or a dated check of each class link before term. |
| **Pupil clicks Join and Teams fails to open** (blocked popup, no Teams installed, bad network) | Join is already logged, so the child counts as present to the pre-fill and the no-show check. | Register remains the truth; teachers should correct it. |
| **Email provider down or unverified sending domain** | Parent and office emails fail; the alert row records `detail`. Nothing retries. | `alert-on-failure.yml` only fires if the *function* fails; a provider rejection does not. Watch `noshow_alerts.parent_emailed` on a dashboard, or add a retry queue. |
| **Supabase project paused** (free tier pauses after 7 days idle) | Everything stops: login, joins, alerts. | Confirm the project is on a paid plan before January. |
| **Daylight saving** | Lesson times are UK wall-clock; a family in a country without DST sees lessons move an hour twice a year. | The join card now shows the local time; say this in the parent handbook. |
| **Child in two classes with overlapping lessons** (timetable clash slipped through: `timetable-move` checks are bypassed by the editor) | Two join buttons; the no-show check alerts for whichever lesson they did not join. | Fix the editor to call `timetable-move` (LAUNCH-READINESS P8). |
| **Parent of several children** presses Join for the wrong child | `lesson_joins` logged against the wrong child; the sibling is alerted as a no-show. | The card names each child on its own button; the register corrects it. |
| **Lesson instances regenerated after a timetable change** | Old instances for the same date can remain alongside new ones, producing duplicate join buttons and duplicate alerts. | `lesson-instances-generate` should supersede, not add; verify before publishing a changed timetable mid-term. |

## What "monitoring" actually means here

The system records *who pressed Join, when*, the *teacher's register*, and (if configured) *Teams join/leave times and minutes present*. It does not see screens, other apps, cameras or activity inside the lesson. Say "we track attendance and punctuality for every lesson and alert you the same morning", not "we monitor devices".
