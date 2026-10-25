# Connecting the portal to Microsoft 365 (email, Teams meetings, Teams attendance)

This guide is for the school's Microsoft 365 administrator. You don't need to be a developer. It takes about 30 minutes, plus up to two hours for Microsoft to apply some of the changes.

When you've finished, the portal will:

1. **Send email** from the school's Outlook mailbox. This already works if email is set up.
2. **Create a Teams meeting for every lesson** that doesn't already have a class Teams link. Moving a lesson moves its meeting. Cancelling a lesson, or publishing a new timetable, cancels its meeting. Pupils still press **Join now** in the portal as usual.
3. **Show Teams attendance on registers** (optional). After a lesson, the teacher's register shows a hint such as *"Teams says joined 09:02, 47 min"* next to each pupil Teams could identify. It is only a suggestion. Nothing is marked automatically.

Each feature stays switched off until its step below is done, so nothing breaks while you work through the guide.

---

## What you need first

- A **Global Administrator** (or Application Administrator + Teams Administrator + Exchange Administrator) account for the school's Microsoft 365 tenant.
- A **lesson organiser account**, for example `lessons@tarbiyyah.co.uk`. This must be a normal user account with a licence, not a shared mailbox. It owns the meeting for any lesson whose teacher doesn't have a school Microsoft 365 account.
- **Licences.** Every account that organises meetings (the lesson organiser account, and any teacher who will organise their own lessons) needs a licence that includes **Exchange Online and Microsoft Teams**. **Office 365 A1 for Education is free for schools** and is enough. Pupils and parents don't need a licence to join.

---

## Step 1: Open the app registration

1. Go to **https://entra.microsoft.com** and sign in as an administrator.
2. Open **Identity → Applications → App registrations → All applications**.
3. Open the app the portal already uses for email. Its **Application (client) ID** is the value saved as `MS_CLIENT_ID`. If there isn't one yet, choose **New registration**, name it *Tarbiyyah Global Academy portal*, choose *Accounts in this organisational directory only*, and select **Register**.
4. On the **Overview** page, note down:
   - **Application (client) ID** → this becomes `MS_CLIENT_ID`
   - **Directory (tenant) ID** → this becomes `MS_TENANT_ID`

## Step 2: Add the API permissions

1. In the app, open **API permissions → Add a permission → Microsoft Graph → Application permissions**. Choose *Application*, not *Delegated*.
2. Tick these permissions, then select **Add permissions**:

| Permission | Needed for | Required? |
|---|---|---|
| `Mail.Send` | Sending school email from Outlook | Yes (if email goes through Microsoft 365) |
| `Calendars.ReadWrite` | Creating, moving and cancelling lesson meetings | Yes, for Teams meetings |
| `User.Read.All` | Checking whether a teacher has a school Microsoft 365 account, so they organise their own lessons | Recommended |
| `OnlineMeetings.Read.All` | Finding a lesson's meeting so its attendance can be read | Only for attendance |
| `OnlineMeetingArtifact.Read.All` | Reading Teams attendance reports | Only for attendance |

3. Select **Grant admin consent for <your school>** and confirm. Every row should now show a green tick under *Status*.

> **Why application permissions?** The portal works in the background (for example, at 5am it creates the next fortnight's meetings), so no one is signed in. Application permissions are what allow this. Step 4 limits which mailboxes they can reach.

## Step 3: Create a client secret

1. In the app, open **Certificates & secrets → Client secrets → New client secret**.
2. Description: *Portal (created <today's date>)*. Expiry: **24 months** (the maximum).
3. Select **Add**, then **copy the Value straight away**. It is only shown once. Copy the *Value*, not the *Secret ID*. This becomes `MS_CLIENT_SECRET`.
4. **Put a reminder in your calendar two weeks before the expiry date.** When a secret expires, email and Teams meetings stop working. The *Microsoft 365 connection* card will then say *"The client secret has EXPIRED"*. To renew, repeat this step, update `MS_CLIENT_SECRET` (Step 6), then delete the old secret.

## Step 4: Limit mailbox access (recommended)

Without this step, `Mail.Send` and `Calendars.ReadWrite` let the app send as and edit the calendar of **any** mailbox in the tenant. Exchange **RBAC for Applications** limits the app to a group of mailboxes that you choose.

1. In the **Exchange admin centre** (https://admin.exchange.microsoft.com), create a **mail-enabled security group**, for example *TGA portal mailboxes*. Add as direct members:
   - the sending mailbox (`MS_SENDER_EMAIL`, for example `globalacademy@tarbiyyah.co.uk`),
   - the lesson organiser account (`MS_MEETING_ORGANISER`),
   - every teacher who should organise their own lessons.

   Nested groups don't count, so add people directly.

2. In **Entra admin centre → Identity → Applications → Enterprise applications**, open the same app. Note its **Object ID**. This is the *Enterprise application* object ID, which is different from the one on the App registrations page.

3. Open **PowerShell** on a Windows PC and run the following. Replace the parts in `<angle brackets>`.

```powershell
Install-Module ExchangeOnlineManagement -Scope CurrentUser   # first time only
Connect-ExchangeOnline -UserPrincipalName <your-admin@tarbiyyah.co.uk>

# Tell Exchange about the app (AppId = Application (client) ID; ObjectId = Enterprise application Object ID)
New-ServicePrincipal -AppId <APPLICATION-CLIENT-ID> -ObjectId <ENTERPRISE-APP-OBJECT-ID> -DisplayName "TGA portal"

# A scope containing only the members of your group
$dn = (Get-Group "TGA portal mailboxes").DistinguishedName
New-ManagementScope -Name "TGA portal mailboxes" -RecipientRestrictionFilter "MemberOfGroup -eq '$dn'"

# Give the app Mail.Send and Calendars.ReadWrite on those mailboxes only
New-ManagementRoleAssignment -App <ENTERPRISE-APP-OBJECT-ID> -Role "Application Mail.Send" -CustomResourceScope "TGA portal mailboxes"
New-ManagementRoleAssignment -App <ENTERPRISE-APP-OBJECT-ID> -Role "Application Calendars.ReadWrite" -CustomResourceScope "TGA portal mailboxes"

# Check: should say InScope True for a member and False for anyone else
Test-ServicePrincipalAuthorization -Identity <ENTERPRISE-APP-OBJECT-ID> -Resource <lessons@tarbiyyah.co.uk>
Test-ServicePrincipalAuthorization -Identity <ENTERPRISE-APP-OBJECT-ID> -Resource <someone-not-in-the-group@tarbiyyah.co.uk>
```

4. **Then remove `Mail.Send` and `Calendars.ReadWrite` from the app's API permissions in Entra** (App registrations → the app → API permissions → **⋯ → Remove permission**). Exchange combines the two grants, so if the tenant-wide Entra permission stays, the scope makes no difference.

5. Allow **30 minutes to 2 hours** for Exchange to apply the change.

After this, the connection card may show *Send email: Missing permission* with a note about Exchange RBAC. That's expected, because the permission no longer appears in Entra. If school emails still arrive, everything is working.

If a teacher who isn't in the group teaches a lesson, the portal puts that lesson's meeting in the lesson organiser's calendar and invites the teacher. Nothing fails.

## Step 5: Allow the app to read meeting attendance (Teams application access policy)

Only do this step if you want the attendance hints. Teams needs a separate policy before an app can read meeting details and attendance reports for a given organiser.

1. Find the **Object ID** of each organiser: in Entra admin centre, go to **Identity → Users → All users**, open the person, and copy their **Object ID**. Do this for the lesson organiser account and for each teacher who organises their own lessons.
2. In PowerShell:

```powershell
Install-Module MicrosoftTeams -Scope CurrentUser   # first time only
Connect-MicrosoftTeams

# Create the policy for this app (use the Application (client) ID)
New-CsApplicationAccessPolicy -Identity "TGA-Lesson-Attendance" -AppIds "<APPLICATION-CLIENT-ID>" -Description "Tarbiyyah Global Academy portal: read lesson meeting attendance"

# Grant it to each organiser (repeat for every teacher who organises their own lessons)
Grant-CsApplicationAccessPolicy -PolicyName "TGA-Lesson-Attendance" -Identity "<LESSON-ORGANISER-OBJECT-ID>"
Grant-CsApplicationAccessPolicy -PolicyName "TGA-Lesson-Attendance" -Identity "<TEACHER-OBJECT-ID>"

# OR, instead of granting it person by person, grant it to everyone in the tenant:
# Grant-CsApplicationAccessPolicy -PolicyName "TGA-Lesson-Attendance" -Global
```

3. Allow **up to 30 minutes** for the policy to apply.

## Step 6: Save the settings in Supabase

1. Go to **https://supabase.com/dashboard**, open the school's project, then **Edge Functions → Secrets** (in some versions: *Project Settings → Edge Functions*).
2. Add or update each secret below, then save.

| Secret | Value | Notes |
|---|---|---|
| `MS_TENANT_ID` | Directory (tenant) ID from Step 1 | |
| `MS_CLIENT_ID` | Application (client) ID from Step 1 | |
| `MS_CLIENT_SECRET` | The secret **Value** from Step 3 | |
| `MS_SENDER_EMAIL` | The mailbox school email is sent from, for example `globalacademy@tarbiyyah.co.uk` | |
| `MS_MEETING_ORGANISER` | The lesson organiser account, for example `lessons@tarbiyyah.co.uk` | **Setting this switches lesson Teams meetings on** |
| `MS_TEAMS_ATTENDANCE` | `1` | **Switches attendance hints on.** Leave it unset until Step 5 is finished |

Optional extras (most schools won't need them):

| Secret | What it does |
|---|---|
| `MS_TEAMS_MEETINGS` = `0` | Temporarily switches lesson meetings off without removing the organiser. |
| `MS_TENANT_DOMAINS` | Comma-separated school email domains, for example `tarbiyyah.co.uk`. Only used if you didn't grant `User.Read.All`: teachers whose portal email is on these domains are tried as organisers first. |
| `MS_TEAMS_INVITE_FAMILIES` = `1` | Also sends each lesson's calendar invitation to the parents of pupils in the class. **Off by default for safeguarding.** Pupils join from the portal, and invitations would put parents' email addresses on every attendee list. |
| `MS_TEAMS_INVITE_TEACHER` = `0` | Stops the teacher being invited when the meeting lives in the lesson organiser's calendar. |
| `MS_TEAMS_SYNC_DAYS` | How many days ahead meetings are created (default 14, maximum 60). |

> **If the same `MS_…` secrets are also saved in GitHub** (repository Settings → Secrets and variables → Actions), every backend deploy copies the GitHub values into Supabase. Update them in GitHub too, or delete them there, otherwise an old client secret will come back after the next deploy.

## Step 7: Check everything works

1. Sign in to the portal as the Headteacher or an Admin and open **Admin → Settings**.
2. Find the **Microsoft 365 connection** card. Each line shows one of:
   - **OK**: working.
   - **Missing permission**: the line says which permission (Step 2) or policy (Steps 4–5) is missing.
   - **Not configured**: a secret from Step 6 is missing.
   - **Ready, switched off**: the permission works, but the feature's switch (`MS_MEETING_ORGANISER` or `MS_TEAMS_ATTENDANCE`) isn't set yet.
   - **Problem**: anything else, explained on the line (for example, *the account has no Teams licence*).
3. Select **Sync Teams meetings now**. The card reports how many meetings were created. Open the lesson organiser's (or a teacher's) Outlook calendar: the coming lessons appear as Teams meetings named like *"Maths — Year 7A"*.
4. After the first meeting exists, select **Test connection** again. This lets the card check the attendance access policy against a real meeting.
5. After a real lesson has finished (allow about an hour for Teams to produce the report), open that lesson's register. Pupils Teams could identify have a purple **"Teams says joined…"** tag.

From then on, everything runs automatically. Meetings are created when a timetable is published or lessons are generated, and again every morning. Attendance is collected a few times each afternoon and evening.

---

## How it behaves, and safeguarding notes

- **What Microsoft is told.** Each meeting is titled with the subject and class only (for example *"Maths — Year 7A"*), with the lesson time and a link to the portal. Pupils' names are never sent to Microsoft. Pupils and parents aren't invited unless you set `MS_TEAMS_INVITE_FAMILIES=1`.
- **Classes that already have a Teams link** (set on the class in Academic setup, or on the virtual session) keep using it. Per-lesson meetings are only created for lessons without a link. If a link is later added to a class, its upcoming per-lesson meetings are cancelled.
- **The lobby** follows the school's Teams meeting policy. The usual default is that people in the school's organisation join directly and everyone else waits in the lobby for the teacher to admit them. This portal doesn't change that.
- **Who organises.** The teacher organises the meeting if they have a school Microsoft 365 account with a Teams licence (and, after Step 4, are in the mailbox group). Otherwise the lesson organiser account does, and the teacher is invited. When cover is arranged, the meeting moves to the covering teacher, which gives it a new join link. The portal always gives pupils the current link.
- **Attendance matching.** A Teams attendee is matched to a pupil by email address: the pupil's Microsoft 365 address (`children.microsoft_email`, if the school gives pupils accounts), the pupil's portal sign-in, or a parent's portal email (for a parent who joined for their child). People who join without signing in can't be matched. They're counted, not named, and those pupils simply show no tag. The teacher always makes the mark.
- **Nothing is deleted from the past.** Meetings for lessons that have already started are never moved or cancelled.

## Troubleshooting

| The card says… | Do this |
|---|---|
| *Could not sign in … client secret has EXPIRED* | Step 3, then update `MS_CLIENT_SECRET` (Step 6). |
| *Could not sign in … client secret is wrong* | You copied the Secret ID. Copy the secret **Value** instead. |
| *Create Teams meetings: Missing permission* | Add `Calendars.ReadWrite` and grant admin consent (Step 2). If you used Step 4, make sure the organiser account is a direct member of the group, and wait up to 2 hours. |
| *calendar does not allow Teams meetings* | Give that account a licence that includes Teams (Office 365 A1 for Education is free). |
| *Teams application access policy isn't granted* | Step 5 for that organiser; wait 30 minutes. |
| Some lessons say *couldn't be created* | The card shows the latest reason. Fix it, then select **Sync Teams meetings now**. Failed lessons are retried on every sync. |

Microsoft documentation, for reference:
- Create events with Teams meetings: https://learn.microsoft.com/graph/outlook-calendar-online-meetings
- RBAC for Applications in Exchange Online: https://learn.microsoft.com/exchange/permissions-exo/application-rbac
- Teams application access policy: https://learn.microsoft.com/graph/cloud-communication-online-meeting-application-access-policy
- Attendance reports: https://learn.microsoft.com/graph/api/meetingattendancereport-list
