-- 0212: Tafweed 3 policy wording (owner, 11 November 2026). Brings the live policy
-- text held in policy_links (body_md, meta) into line with content/policies/*.md:
--   * no Safe Exam Browser (not in use); secure tests are invigilated live and released
--     only to the class through the Student Portal (01, 02, 13, 19, 20, 24, 28, 29);
--   * without a stylus tablet, a pupil needs access to printing (home, a library or
--     similar), not a home printer (02, 07, 24, 25);
--   * the Digital Lead reviews the audit logs monthly and on any concern (01, 02, 28),
--     and families are offered help with home filtering (02);
--   * the model day is an example and subject to change (03); guest speaker risk
--     assessment form and referrals for pupils in and outside the UK (01, 05, 11);
--     resilience led by Islamic Studies (05); the honorific written out in Arabic (06);
--     realistic adab of correction, rewards and consequences (07, 23); flexible
--     learning subject to availability (21); how to apply as on the website and the
--     documents list (24); the Complaint Form is now its own page (26);
--   * every date of issue reads "1 September 2026 (version n)", and no basis line
--     mentions Tarbiyyah Secondary (meta of every policy).
-- Policies whose wording changed get their whole text from the markdown (24 and 25 only
-- the changed sections, because fee wording there is maintained separately). The
-- body-changed trigger is off, so nobody is asked to re-sign for a wording change;
-- body_updated_at is set so the PDFs rebuild on the next deploy. Idempotent.
-- Also the FAQ copies held in faq_entries (src/content/seed.ts).

alter table public.policy_links disable trigger policy_links_body_changed;


-- 01-child-protection-and-safeguarding
update public.policy_links
set body_md = $b$## 1. Statement of Intent

Tarbiyyah Global Academy is committed to safeguarding and promoting the physical, mental and emotional welfare of every pupil. Our pupils learn from home, often in different countries and time zones, and we recognise that this changes *how* we keep them safe but never *whether* we do. Every member of staff sees pupils through a screen, and every member of staff has a responsibility to notice, to ask, and to act. We take a whole-Academy, preventative approach. The welfare of the child is paramount in every decision we make, and we will always act in the child's best interests, even where this is uncomfortable or inconvenient for adults. This policy sets out how we will:

- ensure trustees, the Headteacher and all staff understand their safeguarding responsibilities, are alert to the signs of abuse, neglect and exploitation (including online), and know to refer concerns to the DSL without delay;
- teach pupils how to keep themselves safe online and offline, and how to tell a trusted adult;
- identify and support any pupil who has been subject to, or is at risk of, abuse, neglect or exploitation;
- make safeguarding referrals to the correct agencies, whether a pupil lives in England, elsewhere in the UK, or abroad;
- maintain a culture of safer recruitment, so that only suitable adults teach or support our pupils.

> **Our safeguarding promise**
>
> If a member of staff is worried about a child, they do not wait for certainty. They tell the Designated Safeguarding Lead the same day. In an emergency, where a child is at immediate risk, they contact the emergency services in the child's country first and then the DSL.

## 2. Key Safeguarding Contacts

| Role | Name | How to contact |
| --- | --- | --- |
| Designated Safeguarding Lead (DSL) | Ustadh Abu Zayn Haneef Sandhar, Headteacher | globalacademy@tarbiyyah.co.uk · via the Academy office on 020 3719 8697 |
| Deputy Designated Safeguarding Lead | Skander Ahmed | skander@tarbiyyah.co.uk |
| Headteacher | Ustadh Abu Zayn Haneef Sandhar (also the DSL) | globalacademy@tarbiyyah.co.uk · via the Academy office on 020 3719 8697 |
| Chair of Trustees (safeguarding lead trustee) | Moiz Madrasawala | gbchair@tarbiyyah.co.uk |
| Local authority: allegations about staff — London Borough of Hounslow | Hounslow safeguarding team (allegations) | 020 8583 4933 · used for allegations against staff |
| Hounslow Children's Services (for pupils living in Hounslow, and for advice) | Multi-Agency Safeguarding Hub | 020 8583 6600 |
| NSPCC Helpline (UK, for adults worried about a child) | — | 0808 800 5000 · help@nspcc.org.uk |
| Childline (UK, for children) | — | 0800 1111 · childline.org.uk |
| Emergency services | — | UK 999 · pupil's own country: see the Emergency Contact Register |

Staff should never publish or share personal mobile numbers in this policy. Contact details are kept current in the Safeguarding Contacts Register held by the DSL and reviewed every term.

## 3. Legal Framework and Guidance

This policy has due regard to legislation and statutory guidance, including:

- Children Act 1989 and Children Act 2004
- Education Act 2002 (whose safeguarding principles the Academy follows as good practice)
- Keeping Children Safe in Education (KCSIE) — the edition currently in force
- Working Together to Safeguard Children 2023
- The Online Education Accreditation Scheme (OEAS) standards published by the Department for Education, used as a benchmark of good practice
- Counter-Terrorism and Security Act 2015 and its statutory guidance
- Sexual Offences Act 2003 (including the position of trust offence)
- Female Genital Mutilation Act 2003 (mandatory reporting duty)
- Safeguarding Vulnerable Groups Act 2006
- Equality Act 2010 and Human Rights Act 1998
- Data Protection Act 2018 and the UK GDPR
- Online Safety Act 2023
- DfE guidance: Teaching Online Safety in Schools; Sharing nudes and semi-nudes (UKCIS); Filtering and Monitoring Standards; Mental Health and Behaviour in Schools. Where a pupil lives outside England, the Academy also takes account of the child protection arrangements of the pupil's country of residence (see section 10).

## 4. Definitions

**Safeguarding and promoting the welfare of children** means: providing help and support to meet children's needs as soon as problems emerge; protecting children from maltreatment, whether inside or outside the home, including online; preventing impairment of children's mental and physical health or development; ensuring children grow up in circumstances consistent with safe and effective care; and taking action to enable all children to have the best outcomes. **Child protection** is the part of safeguarding that focuses on children who are suffering, or are likely to suffer, significant harm. **Child** means anyone under the age of 18. **Parent** means any person with parental responsibility or day-to-day care of the child. **Online platforms** means any system the Academy uses to teach or communicate with pupils, including the Academy's live-lesson platform (currently Microsoft Teams), joined from the Student Portal, the Academy Parent and Student Portals, Academy email and approved learning subscriptions.

## 5. Roles and Responsibilities

### All staff

All staff, including part-time and sessional teachers, volunteers and contractors, will:

- read at least Part One (and Annex B where relevant) of KCSIE and this policy, and confirm this in writing each year;
- be alert to signs of abuse, neglect and exploitation that may be visible on screen, heard in the background, disclosed in chat or written work, or noticed through a change in engagement, appearance or attendance;
- report every concern to the DSL on the same day using the Academy's secure online concern form, and never investigate themselves;
- follow the Live Lesson Protocols at all times;
- never promise a child confidentiality;
- understand the Academy's procedures for children who go missing from live education (see section 15).

### The Designated Safeguarding Lead (DSL)

The DSL is a member of the senior leadership team with lead responsibility for safeguarding and child protection, including online safety and filtering and monitoring. The DSL will:

- be available, by phone or video call, throughout the Academy day (09:00–15:00 UK time) and have a deputy available when absent;
- receive, record and act on all concerns, deciding on the right course of action;
- make referrals to children's social care, the police or the relevant authority in the pupil's country of residence;
- keep secure, accurate, chronological child protection records;
- liaise with the Headteacher about any police investigation or Section 47 enquiry;
- ensure all staff receive induction and annual safeguarding training, with regular updates throughout the year;
- oversee the Academy's approach to online safety, platform settings, recording and monitoring;
- undertake DSL training every two years and refresh knowledge at least annually.

### The Headteacher

The Headteacher will ensure this policy is implemented, that the DSL has the time, funding, training and resources to fulfil the role, and that allegations against staff are managed in line with section 16.

### The Board of Trustees

Trustees have strategic responsibility for safeguarding. They will appoint a lead trustee for safeguarding, ensure the Academy follows KCSIE and the OEAS standards as good practice, receive an annual safeguarding report, and ensure that staff and trustees receive appropriate training. The Chair of Trustees deals with any allegation against the Headteacher. Because the Headteacher is also the DSL, any concern about the DSL's handling of a case may be raised directly with the deputy DSL or the Chair of Trustees.

## 6. Safeguarding in an Online School

Being online does not reduce risk; it changes where risk appears. Staff will be particularly alert to the following.

| What staff may see or hear | What it might indicate |
| --- | --- |
| Injuries, repeated tiredness, hunger or poor hygiene visible on camera | Physical abuse or neglect |
| Shouting, threats or distress in the background; a pupil who looks frightened or glances off-screen before answering | Domestic abuse or an unsafe home environment |
| An unknown adult present during lessons, or a pupil who is never alone | Controlling behaviour, exploitation, or a pupil being coached |
| Camera refused repeatedly, or long unexplained absences | Concealment of injury, neglect, or a child missing education |
| Sudden changes in mood, withdrawal or references to self-harm in chat or work | Mental health concerns or abuse |
| Contact from strangers, gifts, new devices or secret online friends | Grooming or exploitation |
| Extreme views, conspiracy content or hostile language about groups | Radicalisation (see the Safeguarding: Extremism and Radicalisation Policy) |

Staff will never assume that what they see on a screen is the whole picture. Where a pupil's camera is off, staff should still consider whether they have seen or heard enough of the child to be confident they are safe.

## 7. Abuse, Neglect and Exploitation

All staff will be familiar with the four categories of abuse — **physical abuse, emotional abuse, sexual abuse and neglect** — and with specific safeguarding issues described in KCSIE Annex B, including:

- child sexual exploitation (CSE) and child criminal exploitation (CCE), including county lines;
- online abuse, grooming, sextortion and financially motivated sexual extortion;
- domestic abuse, including children witnessing it;
- honour-based abuse, forced marriage and female genital mutilation (FGM);
- radicalisation and extremism;
- mental health concerns, self-harm and suicidal ideation;
- child-on-child abuse, including cyberbullying and the sharing of nudes and semi-nudes;
- children missing education, private fostering and children with family members in prison. **FGM mandatory reporting:** where a teacher discovers that FGM appears to have been carried out on a girl under 18 in England or Wales, the Academy will report this to the police, in addition to informing the DSL.

## 8. Child-on-Child Abuse Online

Pupils do not share a building, but they share lessons, breakout rooms and group chats. The Academy has zero tolerance for child-on-child abuse and will never dismiss it as "banter" or "part of growing up". To reduce risk:

- private pupil-to-pupil chat is disabled on Academy platforms; all chat is visible to staff;
- breakout rooms are only used with a member of staff able to drop in, and lesson recordings continue during breakout activities where the platform allows;
- pupils are taught what healthy relationships look like online, and how to report concerns. All reports will be taken seriously, recorded and passed to the DSL. The DSL will consider the needs of the victim and of the alleged perpetrator, and will follow KCSIE Part Five and the Anti-Bullying and Cyberbullying Policy.

### Sharing nudes and semi-nudes

Staff who become aware of an incident must not view, copy, print, forward or delete the image, and must not ask a pupil to share it. They will secure any device only if it is safe to do so and refer to the DSL immediately. The DSL will follow the UKCIS guidance, involve parents unless this would put the child at risk, and support pupils to use Report Remove (Childline/IWF) to have images taken down.

## 9. Online Safety, Filtering and Monitoring

Because the Academy does not provide the internet connection in a pupil's home, our approach combines platform controls, supervision and education:

- pupils use Academy-issued accounts only; access is controlled centrally and can be suspended immediately;
- the live-lesson platform is configured so that only staff can start meetings, admit participants, share screens by default, record, or create breakout rooms;
- lobby (waiting room) settings are used so that only invited Academy accounts can join live lessons;
- live lessons are recorded for safeguarding purposes in line with the Recording of Live Lessons and Use of Images Policy;
- secure assessments are released only to the pupil's class during the test window and are invigilated live, with cameras on;
- the Digital Lead reviews the audit logs of Academy platforms every month and whenever a concern is raised, and passes any safeguarding concern to the DSL the same day;
- parents are offered guidance and help to set up router-level filtering, device parental controls and safe search at home, and to supervise younger children online;
- the DSL reviews filtering and monitoring arrangements at least annually against the DfE Filtering and Monitoring Standards, adapted for online provision. Full detail is set out in the Online Safety and Acceptable Use Policy.

## 10. Pupils Living Outside England

Many of our pupils live in other countries. The Academy's duty of care does not stop at the border.

- At admission, the Academy records the pupil's country and address of residence, time zone, parents' contact details, and at least two emergency contacts, including one local adult where possible.
- For each country where pupils live, the DSL maintains an Emergency Contact Register listing the emergency number and the most appropriate child protection or social services contact, and the relevant British Embassy or High Commission consular line.
- Where a pupil living abroad is at immediate risk, staff will contact the local emergency services first, then the DSL.
- For non-emergency concerns about a pupil abroad, the DSL will seek advice from the local child protection authority, the NSPCC and, where appropriate, the Foreign, Commonwealth and Development Office, and will record the reasoning for every decision.
- Where a pupil is a British national abroad and the concern is serious, the DSL may also contact the local authority where the family was last resident in the UK.
- Where it is unclear which local service to contact, the DSL seeks advice from Hounslow Children's Services (see section 2) while making sure the pupil is safe in the meantime.

> **Time zones**
>
> Safeguarding concerns are never left until "the UK morning". The DSL or a deputy provides out-of-hours cover for urgent concerns during term time, and staff are given the out-of-hours escalation number at induction. Outside the Academy day, the DSL and deputy DSL share an on-call rota during term time.

## 11. Pupils Potentially at Greater Risk of Harm

Staff will be especially vigilant for pupils who: have a social worker or are looked-after; have special educational needs or disabilities (whose signs of abuse may be mistaken for their condition); are young carers; are isolated at home without regular contact with other trusted adults; have had previous child protection involvement; or are persistently absent from live lessons. The DSL will ensure these pupils are known to relevant staff and, where appropriate, receive regular welfare check-ins by video call.

## 12. Early Help

Early help means providing support as soon as a problem emerges. The DSL will consider early help for any pupil showing signs of needing additional support, working with the family and, for pupils in England, the local early help service. For pupils abroad, the Academy will signpost families to appropriate local support and may offer additional pastoral sessions.

## 13. Responding to Concerns and Disclosures

### If a pupil tells you something

- Stay calm, listen, and let the pupil speak freely. Do not ask leading questions.
- If the disclosure happens in a live lesson, move the pupil — with their consent and never alone with unrecorded audio — into a private recorded space, or pause the class and arrange an immediate call with the DSL present.
- Reassure the pupil they have done the right thing, and explain that you must share what they have told you with the people who can help.
- Never promise confidentiality.
- Write a factual record as soon as possible, using the pupil's own words, and submit it to the DSL the same day.

### If you are worried but there is no disclosure

Record what you saw or heard, the date, time and lesson, and refer it to the DSL. Small concerns matter: the DSL may be holding other pieces of the picture.

### What the DSL will do

| Situation | Action |
| --- | --- |
| Immediate risk of harm | Contact emergency services in the child's location, then children's social care or the equivalent authority. Inform the Headteacher. |
| Significant harm suspected | Refer to children's social care (or the local equivalent) within 24 hours. Record the referral and follow up if no response within three working days. |
| Additional needs, not significant harm | Consider early help, pastoral support and a plan with the family. |
| No further action | Record the reasoning, continue to monitor, and inform the member of staff who raised the concern. |

If the member of staff disagrees with the DSL's decision, they may escalate the concern directly to children's social care; any member of staff can make a referral.

## 14. Recording and Information Sharing

All safeguarding records are kept in the Academy's secure, access-restricted electronic safeguarding record system, separate from the pupil's general file. Records are factual, dated and signed, and distinguish fact from opinion. Information is shared with other professionals where this is necessary to keep a child safe; the Data Protection Act 2018 does not prevent this. When a pupil leaves, the child protection file is transferred securely to the new school within five school days, and confirmation of receipt is obtained.

## 15. Children Missing from Live Education

A pupil who does not appear in live lessons may be at risk. The Academy will:

- take a register at the start of every live lesson;
- contact parents on the first day of any unexplained absence, by the end of the morning session;
- escalate to the DSL where a pupil is absent without explanation for two consecutive days, or where there is a pattern of absence or camera refusal that raises concern;
- attempt a welfare video call where contact with the parent cannot be made;
- where a pupil leaves and the Academy does not know where their education will continue, the Academy may share its concern with the relevant local authority as good practice;
- never withdraw a pupil until the Academy knows where the child is continuing their education.

## 16. Safeguarding Concerns and Allegations about Staff

### Allegations that may meet the harm threshold

Any concern that a member of staff, supply teacher, volunteer or contractor may have harmed a child, committed a criminal offence against a child, behaved in a way that indicates they may pose a risk of harm, or behaved in a way that indicates they may not be suitable to work with children, must be reported to the Headteacher immediately (or to the Chair of Trustees if the concern relates to the Headteacher). The Headteacher will consult the local authority's allegations officer within one working day and follow KCSIE Part Four. Where a person is removed from regulated activity because of harm to a child, the Academy will make a referral to the Disclosure and Barring Service and, for teachers, consider a referral to the Teaching Regulation Agency.

### Low-level concerns

A low-level concern is any concern — no matter how small — that an adult may have acted in a way inconsistent with the Live Lesson Protocols, but that does not meet the harm threshold. Examples online include: contacting a pupil outside Academy platforms; one-to-one video calls without recording or authorisation; overly familiar language in chat; or sharing personal social media. Low-level concerns are reported to the Headteacher, recorded, and reviewed for patterns. Staff are encouraged to self-report.

## 17. Safer Recruitment and the Single Central Record

The Academy follows the safer recruitment section of the Child Protection and Safeguarding Policy. All staff who teach pupils live are subject to an enhanced DBS check with barred list check, identity and right-to-work checks, two references, verification of qualifications, and prohibition-from-teaching checks. Staff who have lived or worked overseas are subject to overseas checks. Staff who work remotely from outside the UK are subject to equivalent checks and must still meet every UK safeguarding requirement. A Single Central Record is maintained and reviewed termly by the Headteacher and the safeguarding trustee.

## 18. Training

| Who | What | How often |
| --- | --- | --- |
| All staff and volunteers | Safeguarding and child protection induction, including online safety, remote-teaching risks and this policy | On appointment, before teaching |
| All staff | Safeguarding update, KCSIE changes, and extremism and radicalisation awareness | At least annually, with termly briefings |
| DSL and deputies | Designated safeguarding lead training, including filtering and monitoring | Every two years, with annual refresh |
| Trustees | Safeguarding governance training | On appointment and at least every two years |
| Recruitment panels | Safer recruitment training | Every three years |

## 19. Pupils and Parents

Pupils are taught, in age-appropriate ways, about keeping safe, healthy relationships, boundaries, modesty and protection from exploitation, online safety and how to report concerns, through PSHE, Islamic Studies, form time and assemblies. Every pupil knows how to contact a trusted adult at the Academy, including through the Help page of the Student Portal, which shows the safeguarding contact clearly. Parents are informed of this policy at admission and are expected to support safe learning at home, including supervising younger children's device use.

## 20. Monitoring and Review

This policy is reviewed at least annually by the DSL and Headteacher and approved by the Headteacher and agreed with the Chair of Trustees, and sooner if legislation or guidance changes, or following a serious incident. The DSL provides a termly safeguarding report to trustees covering the number and nature of concerns, referrals, training and any lessons learned.

## Appendix A — Online Safeguarding Quick Guide for Staff

| If this happens in a live lesson | Do this |
| --- | --- |
| A pupil discloses abuse in chat or aloud | Acknowledge calmly, do not question further in front of the class, arrange immediate private recorded follow-up, tell the DSL straight away |
| You see an injury or something worrying in the background | Note time and detail, do not comment in front of peers, report to the DSL the same day |
| An unknown adult or older child joins the lesson | Remove them from the meeting, lock the lesson, report to the DSL |
| Inappropriate or explicit content is shared | End the screen share, remove the participant, do not save or forward the content, report to the DSL immediately |
| A pupil appears to be in immediate danger | Contact emergency services in the pupil's location, then the DSL |
| A pupil misses lessons and cannot be reached | Follow section 15 and escalate to the DSL |$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)"}$m$::jsonb,
    body_updated_at = now()
where slug = '01-child-protection-and-safeguarding';

-- 02-online-safety-and-acceptable-use
update public.policy_links
set body_md = $b$## 1. Purpose

Tarbiyyah Global Academy exists online. Our classrooms, corridors and noticeboards are digital, so online safety is not a topic taught once a year; it is the environment in which every lesson happens. This policy explains how the Academy keeps its platforms safe, what we expect of pupils, parents and staff, and what happens when things go wrong.

## 2. Scope

This policy applies to every person who uses Academy systems, and to every Academy system, including:

- the Academy's live-lesson platform (currently Microsoft Teams), joined from the Student Portal (live lessons; assignments and quizzes are in the Student Portal);
- the Academy Parent Portal, Student Portal and staff area;
- Academy email accounts and calendars;
- approved learning subscriptions issued by the Academy. It also applies to conduct outside Academy systems where that conduct affects the safety or wellbeing of a member of the Academy community.

## 3. Our Approach: the Four Cs

Following KCSIE, we plan online safety around four areas of risk:

| Area | Examples |
| --- | --- |
| Content | Exposure to illegal, harmful or inappropriate material, misinformation, extremist content, pornography, self-harm content |
| Contact | Harmful interaction with other users, including grooming, sextortion, and adults posing as children |
| Conduct | A pupil's own behaviour that increases risk or causes harm, such as sharing images, cyberbullying or oversharing personal information |
| Commerce | Online gambling, scams, phishing, inappropriate advertising and financial exploitation |

## 4. How the Academy Secures its Platforms

- **Academy accounts only.** Pupils and staff use Academy-issued accounts. Personal accounts are never used for teaching or contact with pupils.
- **Controlled meetings.** Only staff can create live lessons. The lobby is enabled so that only Academy accounts are admitted; anonymous or external participants cannot join.
- **Restricted pupil permissions.** Pupils cannot present, record, start meetings, create breakout rooms or remove others. Private pupil-to-pupil chat is disabled; lesson chat is visible to staff and retained.
- **Recording.** Live lessons are recorded for safeguarding and quality assurance in line with the Recording of Live Lessons and Use of Images Policy.
- **Single sign-on and multi-factor authentication** for staff accounts; access is revoked immediately when a device is lost or a staff member leaves.
- **Secure assessments** are released through the Student Portal only to the pupil's class during the test window, and are sat under live invigilation with cameras on, as set out in the Academic Integrity and Secure Assessment Policy.
- **Audit logs.** The Digital Lead reviews the portal audit log and the platforms' sign-in and activity logs every month, and straight away when a concern is raised (see below).

### The Digital Lead

The Digital Lead is the member of staff the Headteacher names to look after the security of Academy systems (currently: [name to be confirmed]). The Digital Lead:

- reviews the audit logs every month, looking at a sample of activity and at anything unusual, such as sign-ins from unexpected places, changes to accounts or permissions, records opened in bulk, and safeguarding or message records opened;
- passes anything that suggests a safeguarding risk to the DSL, and anything that suggests a data breach to the Data Protection Officer, on the same day;
- manages accounts and access: new starters, leavers, lost devices and password resets;
- checks platform settings each term (lobby, pupil permissions, chat and recording);
- keeps a short record of each review and what was done, and reports to the DSL each term and to trustees each year.

The Digital Lead looks at pupils' messages or records only as part of a review agreed with the DSL, and their own access is recorded in the audit log like everyone else's.

> **Filtering at home**
>
> The Academy does not control the internet connection in a pupil's home, so we offer every family help to set up:
>
> - **router-level filtering:** most broadband providers offer a free family filter that blocks harmful and adult sites on every device in the home. It is switched on in the provider's account or app, or in the router's settings;
> - **device parental controls:** for example Microsoft Family Safety on Windows, Screen Time on iPad and Mac, and Google Family Link on Android and Chromebook, to filter websites, limit apps and set screen-time limits;
> - **safe search and restricted modes** in search engines and video sites;
> - **devices in shared family spaces** for younger pupils, and phones and tablets charged outside bedrooms overnight.
>
> The guidance is on the Safeguarding page of the Academy website and is covered in the parents' induction session, and any family can ask the Digital Lead for help to set it up.

## 5. Acceptable Use — Pupils

Every pupil (with a parent for pupils in Years 1 to 6) agrees to the Pupil Acceptable Use Agreement at enrolment. In summary, pupils will:

- use only their own Academy account and keep their password private;
- join lessons from a quiet, appropriate space, with their camera on unless the teacher agrees otherwise;
- be kind and respectful in chat, voice and work, and never share hurtful, rude or unsafe content;
- never record, photograph or screenshot a lesson, a teacher or another pupil;
- never share lesson links, codes or Academy materials with anyone outside the Academy;
- never share personal information such as addresses, phone numbers or social media accounts with other pupils in lessons;
- keep mobile phones and other devices away during lessons unless the teacher asks for them;
- tell a teacher, their form tutor or the DSL straight away if they see or receive something that worries them. Breaches are managed under the Behaviour and Online Conduct Policy. Anything that suggests a pupil is at risk is managed under the Child Protection and Safeguarding Policy.

## 6. Acceptable Use — Parents

Parents support safe learning at home by:

- providing a suitable device, a reliable connection and a quiet, appropriate study space, with a tablet with a stylus (recommended) or, without one, access to printing (at home, at a local library or similar) for worksheets and the lesson PDF;
- supervising younger children's device use and applying parental controls;
- never recording, sharing or posting lessons or images of staff or other pupils;
- keeping out of camera view and not intervening during live lessons, except to support their own child or in an emergency;
- raising concerns through the proper channels set out in the Parent Communication Charter, rather than through public posts or group chats.

## 7. Acceptable Use — Staff

Staff will:

- use Academy accounts and approved platforms only, and never contact pupils through personal phones, personal email or social media;
- never hold unrecorded one-to-one video calls with a pupil. Where one-to-one support is needed, the call is scheduled through Academy systems, recorded, and the parent is informed;
- teach from a neutral, professional background with no personal information visible, dressed appropriately;
- lock or end meetings correctly so that pupils cannot remain in an unsupervised meeting;
- protect personal data, lock devices when unattended, and report lost devices or suspected breaches immediately;
- report any online safety concern to the DSL on the same day. Full expectations are set out in the Live Lesson Protocols.

## 8. Teaching Online Safety

Online safety is taught through PSHE, Computing and Islamic Studies, and reinforced in assemblies and form time. The curriculum is age-appropriate and includes: recognising reliable information and misinformation; privacy and digital footprints; healthy online relationships and boundaries, modesty and protection from exploitation; recognising grooming and manipulation; managing screen time; artificial intelligence and deepfakes; and how to report. Islamic Studies connects online conduct with adab, guarding the tongue, and the amanah of what we see and share.

## 9. Artificial Intelligence

Pupils may use AI tools only where a teacher has permitted it for a specific task, and must declare how they used it. Using AI to complete assessed work without permission is academic misconduct under the Academic Integrity and Secure Assessment Policy. Staff will not enter pupils' personal data into AI tools that are not approved by the Academy, and will be alert to AI-generated images being used to bully or exploit.

## 10. Responding to Incidents

| Incident | Response |
| --- | --- |
| Upsetting or inappropriate content seen by a pupil | Reassure, record, inform the DSL, contact parents, review platform settings |
| Cyberbullying between pupils | Anti-Bullying and Cyberbullying Policy; preserve evidence; support both pupils |
| Suspected grooming or contact from an unknown adult | Do not alert the adult; secure evidence; DSL refers to police/CEOP and children's social care |
| Nudes or semi-nudes shared | Do not view or forward; DSL follows UKCIS guidance |
| Unauthorised person joins a lesson | Remove, lock the meeting, report to the DSL and Digital Lead, review access logs |
| Compromised account or data breach | Revoke access, reset credentials, inform the Data Protection Officer within 24 hours |

## 11. Monitoring and Review

The DSL and Digital Lead review this policy annually, together with platform settings and incident logs, and report to trustees. The policy is also reviewed after any significant online safety incident or change of platform.

## Appendix A — Pupil Acceptable Use Agreement (summary for signature)

| I will… | I will not… |
| --- | --- |
| Use only my own Academy account | Share my password or lesson links |
| Keep my camera on and be ready to learn | Record, screenshot or photograph lessons |
| Be kind in chat and in my words | Post anything hurtful, rude or unsafe |
| Tell a trusted adult if something worries me | Give personal details to people online |
| Keep my phone away during lessons | Open other apps or websites during lessons |

Pupil name: ______________________ Signature: ______________ Date: __________ Parent name: ______________________ Signature: ______________ Date: __________$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.3)", "basis": "New policy for online provision"}$m$::jsonb,
    body_updated_at = now()
where slug = '02-online-safety-and-acceptable-use';

-- 03-live-lesson-protocols
update public.policy_links
set body_md = $b$## 1. Purpose

Live lessons are the heart of Tarbiyyah Global Academy. These protocols set out the shared routines that make every virtual classroom feel like a well-ordered school: pupils know what is expected, teachers teach consistently, and everyone is safe. They apply to every live lesson, assembly, form time, intervention group, club and parents' meeting held on Academy platforms.

## 2. The Academy Day

| Item | Standard |
| --- | --- |
| Live teaching hours | 09:00–15:00 UK time, Monday to Thursday, and 09:00–12:00 on Fridays (the afternoon is free for Jumu'ah), unless a family has an agreed Flexible Learning arrangement. Times are UK time; from 28 March 2027 UK time moves one hour forward |
| Registration | Taken in the first five minutes of every lesson |
| Lesson length | Years 1–2: 30 minutes · Years 3–6: 45 minutes · Years 7–11: 50 minutes |
| Screen breaks | A ten-minute movement break between consecutive live lessons, and a one-hour lunch and Dhuhr break |
| Prayer | The lunch break is placed around Dhuhr. From November to February, when Asr falls within the UK school day, the break before the final lesson is extended to 15 minutes so pupils can pray Asr. Pupils in other time zones may leave a lesson briefly to pray on time, after letting the teacher know in the chat |
| Platform | The Academy's live-lesson platform (currently Microsoft Teams), joined from the Student Portal |

### Model day (Years 7–11, UK time)

The model day below is an example only and is subject to change. Each pupil's own timetable, published in the Student Portal, is the one to follow.

| Time | Session |
| --- | --- |
| 09:00–09:10 | Form time: tutor check-in and wellbeing (the lesson register is taken in each lesson) |
| 09:10–10:00 | Lesson 1 |
| 10:00–10:10 | Movement break |
| 10:10–11:00 | Lesson 2 |
| 11:00–11:10 | Movement break |
| 11:10–12:00 | Lesson 3 (on Fridays the live day ends here) |
| 12:00–13:00 | Lunch and Dhuhr |
| 13:00–13:50 | Lesson 4 |
| 13:50–14:00 | Movement break (extended for Asr, November–February) |
| 14:00–14:50 | Lesson 5 |
| 14:50–15:00 | End of day, independent work set |

Primary pupils follow a shorter live timetable with more offline activity: Years 1–2 about 1.5 hours of live sessions a day, and Years 3–6 about 3 hours, with learning at home between sessions.

## 3. Before the Lesson

### Teachers

- Open the meeting at least five minutes early; check that the lobby is enabled and that pupil presenter rights are off.
- Start the recording as soon as the first pupil is admitted.
- Have the lesson resources, Student Portal pages and any assignment ready to share.
- Teach from a quiet, professional setting with a plain or blurred background.

### Pupils

- Join from a desk or table in a quiet, well-lit space — never from a bed or a room shared with adults who are not supporting them.
- Be dressed in the Academy's modest dress standard: clean, tidy clothing appropriate for a school day.
- Have books, stationery, headphones and a charged device ready, with the day's worksheets and lesson PDF open on a tablet with a stylus or printed out.
- Log in two minutes before the start time.

## 4. During the Lesson

| Routine | Expectation |
| --- | --- |
| Camera | On for the whole lesson unless the teacher agrees otherwise, for example for a medical reason, a connection problem, or where agreed as a reasonable adjustment |
| Microphone | Muted unless invited to speak; unmute when called upon |
| Contributions | Use "raise hand" or the lesson chat; chat is for learning only |
| Breakout rooms | Only used where the teacher can visit every room; pupils follow the same standards as the main lesson |
| Other apps and tabs | Closed, unless the teacher has directed their use |
| Phones | Out of reach and silent, unless required for the task |
| Leaving the lesson | Only with permission, for example for the toilet or prayer, using the chat to let the teacher know |
| Technical problems | Try rejoining once; if unsuccessful, message the form tutor through the Student Portal and complete the lesson's assignment in the Student Portal |

Teachers use calm, private correction first, following the Behaviour and Online Conduct Policy. Pupils are never shamed in front of peers.

## 5. Ending the Lesson

- The teacher ends the meeting for everyone, so that no pupil remains in an unsupervised meeting.
- The recording stops automatically when the meeting ends; the teacher checks it has saved.
- Homework or follow-up tasks are set on the Student Portal before the end of the day.

## 6. One-to-One and Small-Group Sessions

One-to-one sessions (for example tutoring, SEND support, mentoring or pastoral check-ins) are only held:

- when scheduled through the Academy calendar and visible to the relevant line manager;
- with the parent informed in advance;
- with the session recorded, unless the DSL has authorised otherwise for a specific safeguarding reason, which is itself recorded;
- using Academy accounts and platforms only. Staff never meet pupils one-to-one on personal accounts, by phone, or on any unrecorded platform.

## 7. Safeguarding in Live Lessons

If a teacher sees or hears anything that raises a concern, they follow the Online Safeguarding Quick Guide in the Child Protection and Safeguarding Policy. If an unknown person joins, the teacher removes them, locks the meeting and reports it to the DSL and Digital Lead. If inappropriate content is shared, the teacher stops the share, removes the participant and reports immediately.

## 8. Parents and Live Lessons

Parents are welcome to support younger children with setting up, but are asked not to appear on camera, speak in lessons or message teachers during the lesson. Concerns are raised afterwards through the channels in the Parent Communication Charter. Parents must not record lessons.

## 9. Quality Assurance

Senior leaders drop in to live lessons regularly, as they would walk through a physical school. Drop-ins are supportive and focus on the quality of teaching, engagement and safety. Recordings may be reviewed for quality assurance as set out in the Recording of Live Lessons and Use of Images Policy.

## 10. Monitoring and Review

These protocols are reviewed annually by the Deputy Headteacher with pupil, parent and staff feedback, and approved by the Headteacher.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.3)", "basis": "New policy for online provision"}$m$::jsonb,
    body_updated_at = now()
where slug = '03-live-lesson-protocols';

-- 04-recording-of-live-lessons-and-use-of-images
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)", "basis": "New policy for online provision"}$m$::jsonb,
    body_updated_at = now()
where slug = '04-recording-of-live-lessons-and-use-of-images';

-- 05-safeguarding-extremism-and-radicalisation
update public.policy_links
set body_md = $b$## 1. Policy Statement

Tarbiyyah Global Academy is committed to providing a safe online environment in which pupils learn free from exposure to extremist views or ideologies, and in which they develop the knowledge and confidence to challenge them. Our Islamic ethos teaches justice, mercy, the sanctity of life and respect for others; these values are the strongest foundation for resisting those who would misuse faith, or any ideology, to justify hatred or violence. This policy is part of our safeguarding arrangements. It explains how the Academy meets its duty to protect pupils from being drawn into extremism in an online setting, how we keep our platforms free from extremist content, and how concerns are referred.

## 2. Legal Framework

- Counter-Terrorism and Security Act 2015, section 26, and its statutory guidance for England and Wales (2023), as good practice
- Terrorism Act 2000 and Terrorism Act 2006
- Keeping Children Safe in Education (current edition)
- Online Education Accreditation Scheme (OEAS) standards, used as a benchmark of good practice
- Equality Act 2010

## 3. Definitions

| Term | Meaning |
| --- | --- |
| Extremism | The Academy has regard to the government's 2024 definition: the promotion or advancement of an ideology based on violence, hatred or intolerance that aims to negate or destroy the fundamental rights and freedoms of others, or to undermine, overturn or replace the UK's system of liberal parliamentary democracy and democratic rights, or to intentionally create a permissive environment for others to achieve those results. For safeguarding purposes, staff also recognise vocal or active opposition to the fundamental British values of democracy, the rule of law, individual liberty and mutual respect and tolerance of different faiths and beliefs. |
| Radicalisation | The process by which a person comes to support terrorism and extremist ideologies associated with terrorist groups. Online radicalisation can happen through social media algorithms, gaming platforms, video sites and private messaging. |
| Terrorism | An action that endangers or causes serious violence, damage or disruption and is intended to influence the government or intimidate the public, for the purpose of advancing a political, religious or ideological cause. |
| Proscribed organisation | An organisation banned under the Terrorism Act 2000. No proscribed organisation or its representatives will be given access to Academy platforms, events or resources. |

Extremism can come from any ideology, including Islamist, extreme right-wing, extreme left-wing, single-issue, incel and mixed or unclear ideologies. Staff will not make assumptions about any group.

## 4. The No Platform Clause

Academy platforms — live lessons, portal channels, assignments, the Parent and Student Portals, email and virtual events — will not be used to promote, express or share extremist views. This includes:

- promoting any ideology that falls within the definitions above;
- advocating or inciting terrorism, violence or hatred;
- encouraging discrimination, harassment or victimisation of any person or group, including on the basis of a protected characteristic;
- posting, linking to or sharing extremist material, including via screen share, chat or uploaded files.

## 5. Virtual Guest Speakers and External Content

### Risk assessment

Every virtual guest speaker, webinar or external resource is approved in advance through a written risk assessment, completed by the member of staff organising it on the Academy's Virtual Guest Speaker and External Content Risk Assessment form and signed off by the DSL (or the Headteacher). The form covers:

- the speaker's or provider's background and any public statements, checked online before the invitation;
- the planned content, seen in advance (slides, script, video or resource);
- the pupils taking part, their ages and any pupils who may be particularly affected;
- the risk of extremist views, misinformation, inappropriate content or reputational harm, rated on the Academy's 1 to 5 scale for likelihood and impact (see the Risk Assessment Policy);
- the controls below, and who is responsible for each;
- the decision (approved, approved with conditions, or declined) and the date.

Completed forms are kept by the DSL in line with the Data Protection Policy. Speakers who return are reassessed each academic year, or sooner if anything changes.

### Controls

- A member of staff hosts every session and can mute, remove or end it at any time.
- Guest speakers cannot share their screen unless approved, and pupils cannot message guests privately.
- Slides or scripts are provided in advance where possible, and every session is recorded.
- Where a contested topic is discussed, balanced views are presented.

The Academy may decline or cancel any speaker or resource where the risk assessment raises concern.

## 6. Recognising Vulnerability Online

Staff are alert to changes that may be visible through online learning, including:

- expressing extreme or intolerant views in chat, discussion or written work;
- using language, symbols or references associated with extremist groups;
- sudden changes in behaviour, friendships, appearance or engagement;
- secretive use of devices or references to new online "mentors";
- justifying violence or expressing a sense of grievance that is being exploited.

None of these alone proves radicalisation; each is a reason to talk to the DSL.

## 7. Reporting and Referral

All staff report any concern to the DSL on the same day, using the online concern form. The DSL will consider the concern alongside other information, speak to the family where appropriate, and decide whether to refer:

- **for pupils living in the UK:** to children's services at the local authority where the pupil lives (in Scotland, the council's social work service; in Northern Ireland, the Health and Social Care Trust), which can arrange specialist support where appropriate, and to the police where there is a risk of harm;
- **for pupils living outside the UK:** to the child protection or social services in the country where the pupil lives, and to the police there where there is a risk of harm, using the contacts in the Emergency Contact Register kept by the DSL (see the Child Protection and Safeguarding Policy). Where the right local service is unclear, the DSL seeks advice from the London Borough of Hounslow's children's services; for British nationals, the DSL may also contact the Foreign, Commonwealth and Development Office and the local authority where the family last lived in the UK.

The DSL records the reasons for every decision, including a decision not to refer, and tells the family unless doing so would put the pupil or anyone else at risk.

In an emergency, staff call the police (999 in the UK) or the local emergency number. The DfE counter-extremism helpline (020 7340 7264, counter.extremism@education.gov.uk) is available for non-emergency advice.

## 8. Staff Training

All staff complete training on extremism and radicalisation as part of safeguarding training at induction, refreshed annually. The DSL completes enhanced training. Training covers online radicalisation, recognising indicators in live lessons and written work, and making referrals.

## 9. Teaching Pupils to be Resilient

**Islamic Studies comes first.** Pupils learn the Prophetic example of mercy, justice and mutual respect; the sanctity of life; how scholars disagree with good manners; who has the authority to give religious rulings; and why extremist groups misrepresent Islam and its texts. Pupils who know their faith well, from trusted teachers, are far harder to mislead.

Other subjects build on this:

- **PSHE and Citizenship:** challenging stereotypes, debating safely, and recognising manipulation and propaganda.
- **History and English:** propaganda, human rights and the dangers of authoritarianism.
- **Online safety:** checking sources, recognising misinformation and algorithmic "rabbit holes", and knowing how to report.

Lessons provide a safe space, chaired by a teacher, to discuss difficult questions so that pupils do not seek answers from unsafe sources.

## 10. Extremism Risk Assessment

As part of the safeguarding risk assessment, the DSL maintains an extremism risk assessment, reviewed annually, covering online platforms, guest speakers, the curriculum, staff training and the Academy's international pupil population. The first is completed before live lessons begin on 11 January 2027 and is reviewed annually.

## 11. Monitoring and Review

This policy is reviewed annually by the DSL and Headteacher and approved by the Headteacher and agreed with the Chair of Trustees, or sooner if legislation, guidance or OEAS requirements change.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.3)", "basis": "Updated from the Tarbiyyah Global Academy draft (September 2026)"}$m$::jsonb,
    body_updated_at = now()
where slug = '05-safeguarding-extremism-and-radicalisation';

-- 06-anti-bullying-and-cyberbullying
update public.policy_links
set body_md = $b$## 1. Our Commitment

Every pupil at Tarbiyyah Global Academy has the right to learn without fear. Bullying goes against everything our faith teaches about brotherhood, sisterhood, mercy and guarding the tongue. The Prophet Muhammad صلى الله عليه وسلم (peace and blessings be upon him) said: "The Muslim is the one from whose tongue and hand the people are safe." We expect every member of our community to live by this, on screen and off.

Bullying in an online school rarely looks like a push in a corridor. It is more likely to be a comment in chat, exclusion from a breakout group, a mocking message on a private app, or an image shared without permission. This policy is written for that reality.

## 2. What is Bullying?

Bullying is behaviour by an individual or group, usually repeated over time, that intentionally hurts another individual or group either physically or emotionally, and where there is an imbalance of power. It includes:

| Type | Examples online |
| --- | --- |
| Verbal and written | Name-calling, insults, threats or mockery in chat, voice or comments |
| Social and relational | Deliberately excluding someone from group work or class discussion, spreading rumours, encouraging others to ignore someone |
| Cyberbullying | Messages, posts, images or videos on any app or platform intended to hurt, humiliate or threaten; impersonation; hacking accounts; sharing screenshots |
| Prejudice-based | Bullying related to race, religion, sect, nationality, sex, disability, SEN, appearance, family circumstances or any protected characteristic |
| Sexual | Sexual comments, jokes, requests for images, or sharing of nudes or semi-nudes (also a safeguarding matter) |

A single serious incident can also be treated as bullying where there is clear intent to cause distress, and serious incidents are always treated seriously whether or not they meet this definition.

## 3. Bullying Outside Academy Platforms

Much cyberbullying happens on apps the Academy does not control. Where bullying between Academy pupils happens outside Academy platforms, or outside Academy hours, the Academy will still act where it affects a pupil's wellbeing or learning, in line with the Behaviour and Online Conduct Policy.

## 4. Prevention

- Private pupil-to-pupil chat is disabled on Academy platforms, and lesson chat is visible to staff.
- Teachers visit every breakout room and set clear expectations for group work.
- Pupils learn about kindness, online behaviour, bystander responsibility and reporting through PSHE, Islamic Studies and assemblies.
- Anti-Bullying Week and regular form-time discussions keep the subject visible.
- Pupils complete an annual wellbeing and safety survey, and results are acted on.
- Staff are trained to recognise signs of bullying through a screen, such as withdrawal, reluctance to join lessons, camera refusal or changes in work.

## 5. How to Report

| Who | How |
| --- | --- |
| Pupils | Tell any teacher, your form tutor or the Pastoral Lead; use the Help page on the Student Portal; or ask a parent to contact the Academy |
| Parents | Contact the form tutor or the Pastoral Lead through the Parent Portal or by email |
| Staff | Record the incident and inform the form tutor and Pastoral Lead the same day; inform the DSL if there is any safeguarding element |

Pupils are encouraged to keep evidence (screenshots of messages sent to them, not of lessons) and not to reply to or forward hurtful messages.

## 6. How the Academy Responds

1. The concern is acknowledged within one working day and recorded on the pastoral system.
2. The Pastoral Lead or form tutor speaks separately, by recorded video call, to the pupil who has been hurt, the pupil(s) alleged to be involved, and any witnesses.
3. Evidence is gathered, including platform chat logs and recordings where relevant.
4. Parents of all pupils involved are informed.
5. A plan is agreed to support the pupil who was bullied, which may include check-ins, seating or group changes and a trusted adult to report to.
6. Consequences are applied to the pupil(s) responsible under the Behaviour and Online Conduct Policy, together with support to change their behaviour, which may include restorative conversations where the pupil who was hurt agrees.
7. The situation is reviewed after two weeks and again after half a term to ensure the bullying has stopped.

Where bullying involves a risk of significant harm, a criminal offence, sexual content or prejudice, it is referred to the DSL and managed under the Child Protection and Safeguarding Policy. Some online behaviour, such as threats or sharing intimate images, may be reported to the police.

## 7. Recording and Monitoring

All incidents are recorded, including type, any prejudice element, action taken and outcome. The Pastoral Lead reviews patterns each half term and reports to the Headteacher and trustees annually.

## 8. Monitoring and Review

This policy is reviewed annually by the Pastoral Lead, taking account of pupil and parent feedback.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)"}$m$::jsonb,
    body_updated_at = now()
where slug = '06-anti-bullying-and-cyberbullying';

-- 07-behaviour-and-online-conduct
update public.policy_links
set body_md = $b$## 1. Purpose

Tarbiyyah Global Academy aims to be a calm, well-ordered and supportive online school in which every pupil can learn and every teacher can teach. Our standards of conduct are rooted in adab and akhlaq and in our Tarbiyyah Compass values, which spell IHSAN (Ilm, Honesty, Sabr and shukr, Adab, Niyyah), and are applied consistently in every live lesson, assembly, club and Academy platform.

We recognise that behaviour and engagement online are closely linked to a pupil's circumstances: an unsuitable home study space, technical difficulties, unmet special educational needs, social, emotional or mental health needs, or upheaval at home. Our first response to poor behaviour is therefore to understand it; our second is to address it firmly and fairly.

## 2. Scope

This policy applies to all pupils during live lessons, assemblies, form times, clubs, assessments and events, and to all use of Academy platforms (the Academy's live-lesson platform (currently Microsoft Teams), joined from the Student Portal, the Student Portal and Academy email). It also applies to conduct outside Academy platforms where that conduct affects another member of the Academy community, poses a safeguarding risk, or seriously damages the Academy's reputation.

## 3. Roles and Responsibilities

| Role | Responsibilities |
| --- | --- |
| All staff | Model adab; resolve low-level disruption at source using private correction and platform tools; apply rewards and consequences consistently; record significant incidents the same day |
| Subject teachers | First point of contact for conduct and engagement in their lessons; contact parents early about emerging concerns |
| Form tutors | Monitor attendance, punctuality, camera use, conduct and wellbeing daily; coordinate support |
| Pastoral and Behaviour Lead | Support staff, conduct lesson drop-ins, lead reflection sessions and pastoral plans, analyse patterns |
| Headteacher | Ensures consistency and the Islamic ethos; holds sole authority to suspend or permanently exclude |
| Trustees | Ensure the policy is lawful and fair; form the independent panel for exclusion reviews |
| Parents | Provide a suitable study space and device, and a tablet with a stylus (recommended) or, without one, access to printing (at home, at a local library or similar) for worksheets and the lesson PDF; ensure punctual attendance with camera working; support the Academy's standards at home |
| Pupils | Follow the Live Lesson Protocols and this policy; treat everyone with respect; act with integrity |

### Adab of correction

Correction online has to be quick, calm and private, without a corridor or a quiet word at the door. Staff use these steps in order and move on only if the behaviour carries on:

1. **A reminder to the whole class.** Restate the expectation for everyone ("cameras on and eyes on the board, please") without naming anyone.
2. **A private prompt.** A short private message to the pupil in the lesson chat (staff to pupil only; it is kept by the Academy like all lesson chat), or a calm word using the pupil's name, said as an instruction rather than a telling-off: "Yusuf, microphone off please, thank you."
3. **A clear warning (C1).** Tell the pupil privately what will happen if it continues.
4. **The platform tools, used calmly.** Mute the pupil's microphone, turn off their chat, or move them to the lobby for a few minutes to settle, then let them back in. Say privately why.
5. **A short word at the end of the lesson.** Two to five minutes with the pupil before the meeting is closed, while it is still recorded, never in an unrecorded one-to-one call.
6. **Log it the same day** in the portal's behaviour log, so the form tutor and parents see a pattern early rather than a surprise later.

Staff never raise their voice, use sarcasm or humiliation, or discuss a pupil's behaviour with other pupils. They give a pupil a moment to regulate before talking about what happened. Every lesson starts fresh: once a consequence is done, it is not held against the pupil.

## 4. Rewards: Merits, Stars and Houses

Good conduct, effort and character are noticed often, and rewards are things pupils actually want. Merits are given in the Student Portal and are seen by pupils and parents straight away.

| Merit | Worth | For example |
| --- | --- | --- |
| M1 | 1 merit | Punctual and ready, camera on, good manners, helpfulness, homework on time |
| M2 | 2 merits | Excellent work, real improvement, leadership, a beautiful recitation, an act of real kindness or integrity |

Teachers aim to give merits in most lessons, so a pupil who works hard should earn several a week. Merits add to the pupil's House total, and the House with the most points wins the House Cup each term.

### Every week

- **Star of the Week** in each class, chosen by the teacher for the value of the half term: a certificate in the portal and a mention in the weekly email to families.
- **A privilege of the pupil's choice** for each Star of the Week, from: choosing the topic of the class's end-of-week quiz; leading the opening du'a or recitation in form time; being the lesson helper (timer, reading instructions, sharing the board); or a **homework pass** (one homework handed in two days late without penalty; never for assessed work).

### Milestones

| Award | Merits | What the pupil gets |
| --- | --- | --- |
| Bronze | 30 | Certificate, and a message home from the form tutor |
| Silver | 75 | Certificate, and a message home from the Headteacher |
| Gold | 150 | Certificate, named in assembly, and a privilege of their choice (as above) |
| Platinum | 250 | Certificate and a book voucher, presented by the Headteacher in assembly |

Pupils who reach Gold by the end of the year, with no C4 or C5 in the final half term, are invited to the end-of-year celebration. The milestones are checked against real merit totals after the first half term and adjusted if they prove too easy or too hard.

## 5. Consequences (C1 to C5)

Consequences are proportionate, consistent and always explained to the pupil privately. Online, the consequences that matter most to pupils are their own time, their privileges, their House and their parents knowing, so those are the ones used.

| Level | What happens | What it costs the pupil |
| --- | --- | --- |
| C1 | A private warning in the lesson | Nothing yet: a chance to put it right |
| C2 | A second warning and a demerit in the portal; chat or microphone turned off for the rest of the lesson where that helps | The demerit comes off the pupil's House total and parents see it in the portal |
| C3 | A reflection session in the pupil's own time: 30 minutes online with a member of staff after the live day, camera on, to put the work right or reflect on what happened. Three C2s in a week also lead to a C3 | Their own time; parents are told the same day |
| C4 | Removal from the live lesson (to the lobby, with work set), a phone call to parents, and two weeks "on report": a daily check-in with the form tutor against agreed targets | Not eligible for Star of the Week, privileges or clubs while on report |
| C5 | A serious incident: platform access suspended pending the Headteacher's review, and a parent meeting | Suspension; repeated C5s lead to a review for permanent exclusion |

A pupil who misses a reflection session without good reason does it the next day as a 60-minute session; missing that as well moves to C4. Three C3s in a half term lead to a parent meeting and a C4. Three C4s in a half term lead to a review for suspension.

### Repeated concerns

Where the same concern is logged three times in a half term, parents are invited to a video meeting with the Pastoral Lead before the pupil continues with a support plan. The Academy may ask a parent to sit silently alongside their child in lessons for an agreed period.

## 6. Matrix of Online Expectations

| Ref | Expectation | Usual consequence |
| --- | --- | --- |
| 1 | Join every live lesson on time, camera on, from a quiet and suitable space | C1–C2 |
| 2 | Be prepared with books, equipment and the right files open in the Student Portal | C2 |
| 3 | Follow the modest dress standard for camera-on lessons | C2 |
| 4 | Keep phones away during lessons | C2–C3 |
| 5 | Stay muted unless invited; use raise hand or chat to contribute | C1–C2 |
| 6 | Follow instructions the first time | C1–C4 |
| 7 | Do not disrupt learning (spamming chat, unmuting noise, misusing reactions or whiteboards) | C1–C4 |
| 8 | Keep other apps, games and tabs closed | C1–C2 |
| 9 | Submit set work on the Student Portal by the deadline | C2–C3 |
| 10 | Use respectful language at all times | C1–C5 |
| 11 | Never record, screenshot or share lessons or images of others | C3–C5 |
| 12 | Never misuse shared resources, other people's accounts or Academy systems | C3–C5 |
| 13 | Act honestly in all assessments | See the Academic Integrity and Secure Assessment Policy |

## 7. Probationary Period for New Pupils

All new pupils join on a probationary basis for their first half term. Progress, conduct and engagement are monitored closely, with regular feedback to pupils and parents and a formal review at the end of the half term. Where a pupil has SEND, the SENCO takes part in the review, which considers whether agreed adjustments were in place. If the probationary period is not successful, parents are told at a video meeting and in writing; the remainder of the term is a notice period and enrolment ends at the end of that term. Parents may make representations under the Concerns and Complaints Policy.

## 8. Suspension and Permanent Exclusion

Only the Headteacher may suspend (temporarily remove platform access) or permanently exclude a pupil. Decisions are lawful, reasonable, fair and proportionate, and take account of any SEND, disability or safeguarding needs.

### Examples that may lead to suspension

- Persistent refusal to follow Academy rules
- Swearing or abusive language in lessons or chat
- Serious disruption of others' learning
- Bullying, including cyberbullying, or harassment related to race, religion, sex or any protected characteristic
- Unauthorised recording, screenshotting or sharing of lessons, staff or pupils
- Serious academic dishonesty in a formal assessment
- Deliberate mockery or belittling of staff

### Examples that may lead to permanent exclusion

- Persistent behaviour of the type above, where support has not succeeded
- Threats of violence toward a pupil or member of staff
- Serious or malicious cyberbullying causing significant harm
- Hacking, sabotage or serious misuse of Academy systems or other users' accounts
- Sharing extremist, sexual or otherwise harmful material on Academy platforms
- Any matter requiring police involvement

### Procedure

Parents are informed the same day, by phone and in writing, of the reason, length and arrangements for work during a suspension. A reintegration meeting is held before the pupil returns, followed by a two-week monitoring report. For a permanent exclusion, parents may ask for the decision to be reviewed by a panel of trustees who were not involved; they are told how to do so in the decision letter. The Academy will not withdraw a pupil until it knows where the child's education will continue.

## 9. Pupils with SEND

The Academy makes reasonable adjustments to this policy for pupils with SEND or a disability, for example agreed camera arrangements, movement breaks or adapted reflection sessions. Adjustments are recorded in the pupil's support plan and shared with teachers.

## 10. Off-Platform Conduct

Where a pupil's conduct outside Academy platforms — for example on personal social media or messaging apps — seriously affects another member of the Academy community, poses a safeguarding risk, or brings the Academy into serious disrepute, the Headteacher may apply this policy.

## 11. Monitoring and Review

The Pastoral and Behaviour Lead analyses merits, consequences and patterns each half term, including by year group, SEND and other characteristics, to ensure fairness. The policy is reviewed annually.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.3)", "basis": "Tidied and updated from the Tarbiyyah Global Academy Behaviour and Online Conduct Policy draft (September 2026)"}$m$::jsonb,
    body_updated_at = now()
where slug = '07-behaviour-and-online-conduct';

-- 08-attendance-punctuality-and-children-missing-education
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '08-attendance-punctuality-and-children-missing-education';

-- 09-supporting-pupils-with-medical-conditions
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '09-supporting-pupils-with-medical-conditions';

-- 10-health-safety-and-wellbeing
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '10-health-safety-and-wellbeing';

-- 11-risk-assessment
update public.policy_links
set body_md = $b$## 1. Purpose

Risk assessment is how the Academy thinks ahead. This policy sets out how risks to pupils, staff, data and the continuity of education are identified, assessed, reduced and reviewed.

## 2. Our Approach

Every risk assessment follows five steps:

1. Identify the hazard or risk.
2. Decide who might be harmed and how.
3. Evaluate the risk (likelihood × impact) and decide on controls.
4. Record findings, owners and deadlines.
5. Review regularly and after any incident or change.

Risks are rated on a simple 1–5 scale for likelihood and impact, giving a score from 1 to 25.

| Score | Response |
| --- | --- |
| 1–6 (low) | Manage through normal routines |
| 8–12 (medium) | Specific controls required; review termly |
| 15–25 (high) | Immediate action; reported to the Headteacher and trustees |

## 3. The Academy Risk Register

The Headteacher maintains an Academy Risk Register, reviewed each term by senior leaders and annually by trustees. It includes, as a minimum:

| Area | Examples of risks considered |
| --- | --- |
| Safeguarding | Unknown persons joining lessons; unrecorded one-to-one contact; pupils abroad at risk; children missing education |
| Online platforms | Platform outage; account compromise; misconfigured meeting settings |
| Data protection | Data breach; loss of staff devices; international data transfers |
| Safeguarding: extremism | Online radicalisation; guest speakers; external content |
| Teaching continuity | Staff absence; time zone clashes; failure of internet or power for staff |
| Pupil wellbeing | Excessive screen time; isolation; mental health |
| Assessment integrity | Cheating in online tests; AI misuse |
| Recruitment | Staff recruited from outside the UK where checks differ (see the Safer Recruitment Policy) |
| Finance and reputation | Fee income; complaints; social media |
| In-person events | Venue safety; travel; supervision |

## 4. Specific Risk Assessments

Specific written risk assessments are completed for:

- every virtual guest speaker, external provider or external resource, on the Virtual Guest Speaker and External Content Risk Assessment form (see the Safeguarding: Extremism and Radicalisation Policy);
- any in-person event, trip or examination sitting;
- any new platform or major change to platform settings (combined with a data protection impact assessment);
- individual pupils where needed, for example a pupil with a medical condition, significant SEND or a safeguarding plan;
- staff with specific needs, including pregnancy or disability;
- any member of staff for whom the usual criminal record checks cannot be obtained in full (see the Safer Recruitment Policy).

## 5. Business Continuity

The Academy maintains a continuity plan so that education continues if a platform fails or key staff are unavailable. It includes: alternative meeting links; offline work set in the Student Portal; a cover rota; out-of-hours contact routes; and backup of key records. The plan is tested before launch and reviewed annually.

## 6. Monitoring and Review

This policy and the Risk Register are reviewed annually by the Headteacher and trustees.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)"}$m$::jsonb,
    body_updated_at = now()
where slug = '11-risk-assessment';

-- 12-curriculum
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '12-curriculum';

-- 13-assessment
update public.policy_links
set body_md = $b$## 1. Purpose

Assessment helps teachers understand what pupils know and can do, plan the next steps, and report accurately to parents. Assessment in an online school must also be secure and fair. This policy sets out the types of assessment we use, how results are recorded and reported, and how we protect the integrity of assessment.

## 2. Principles

- Assessment serves learning: most assessment is formative and happens in every lesson.
- Assessment is purposeful and proportionate: we do not assess for its own sake or overload teachers or pupils.
- Assessment is fair: access arrangements are made for pupils with SEND.
- Assessment is secure: the right controls are used for the stakes involved.

## 3. Types of Assessment

| Type | What it looks like online | When |
| --- | --- | --- |
| Entry (baseline) | Age-appropriate baseline check for primary pupils; a baseline assessment in English, Mathematics and Qur'an; Qur'an and Arabic placement | On admission |
| Formative | Questioning, polls, mini-whiteboards, quizzes in the Student Portal, cold-calling, exit tickets, live feedback | Every lesson |
| Summative (in-school) | End-of-unit tests and termly assessments, set in the Student Portal | End of units and each term |
| Standardised | Standardised tests in English and Mathematics, shared with the Tarbiyyah family of schools | Annually |
| External | International GCSE examinations sat at an approved centre | End of Key Stage 4 |

## 4. Security of Assessments

The level of security is matched to how much the assessment matters, as set out in the Academic Integrity and Secure Assessment Policy:

| Level | Controls |
| --- | --- |
| Practice | Any browser; shuffled questions; time limit |
| Secure | Released only to the pupil's class during the time window, one attempt, live invigilation with cameras on |
| External | Sat in person at an approved examination centre |

## 5. Recording and Tracking

Results are recorded in the Student Portal and the Academy tracking system. Each pupil's attainment is compared with their starting point and age-related expectations. Senior leaders review progress each term and agree interventions for pupils who are not on track.

## 6. Reporting to Parents

| Report | Timing |
| --- | --- |
| Settling-in report | After the first half term (end of the probationary period) |
| Termly progress report | Each term, uploaded to the Parent Portal |
| Parent–teacher consultations | At least twice a year, booked through the Parent Portal |
| Annual report | End of the academic year |

## 7. Moderation

Subject teams moderate a sample of marked assessments each term to ensure consistent standards. Where possible, the Academy moderates with colleagues in the Tarbiyyah family of schools.

## 8. Access Arrangements

Pupils with SEND, medical conditions or English as an additional language may receive access arrangements such as extra time, rest breaks, a reader, or adapted formats, based on evidence and their normal way of working. Arrangements are recorded and used consistently.

## 9. Monitoring and Review

This policy is reviewed annually by the Deputy Headteacher.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)"}$m$::jsonb,
    body_updated_at = now()
where slug = '13-assessment';

-- 14-marking-and-feedback
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '14-marking-and-feedback';

-- 15-homework-and-independent-study
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '15-homework-and-independent-study';

-- 16-send-and-inclusion
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '16-send-and-inclusion';

-- 17-pshe
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)", "basis": "Written as a PSHE policy, with no RSE or sex education"}$m$::jsonb,
    body_updated_at = now()
where slug = '17-pshe';

-- 18-careers-education-and-guidance
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '18-careers-education-and-guidance';

-- 19-examinations-and-private-candidates
update public.policy_links
set body_md = $b$## 1. Purpose

Pupils are entered for their examinations through Tarbiyyah Secondary School, which acts as the examination centre; for pupils outside the United Kingdom the Academy helps the family arrange entry at a suitable approved centre near them. This policy explains how the Academy prepares pupils, supports families to secure entries, and manages access arrangements.

## 2. Responsibilities

| Who | Responsibilities |
| --- | --- |
| Academy | Teaches the specification; advises on subject and tier choices; provides predicted grades and mock examinations; gives parents a list of suitable centres; supports applications for access arrangements; confirms candidate details to centres on request |
| Parents | Register and pay the examination centre by its deadlines; ensure the pupil attends with identification; keep the Academy informed of entries and timetables |
| Examination centre | Accepts the entry, conducts the examination under JCQ regulations, and issues results and certificates |
| Pupils | Prepare fully, follow the centre's rules, and act with integrity |

## 3. Choosing Qualifications

Pupils are entered for International GCSE examinations, which are assessed by examination and widely available to private candidates in the UK and abroad. Where a course is taught to a GCSE specification, pupils sit the matching International GCSE. If a subject has any non-examined assessment, the Academy will confirm in advance how it can be completed and authenticated.

## 4. Timeline (typical)

| When | What happens |
| --- | --- |
| Autumn of Year 10 | Academy shares subject, tier and board information and a list of centres |
| Autumn of Year 11 | Mock examinations; Academy issues guidance on entries and tiers |
| By the centre's deadline (often autumn–January) | Parents secure entries for the summer series |
| January–March | Access arrangement applications completed with the centre |
| May–June | Examinations sat at the centre |
| August | Results issued by the centre; Academy supports post-16 next steps |

Late-entry fees charged by awarding bodies or centres are the responsibility of the family.

Founding cohort: pupils who join Year 11 in January 2027 follow a compressed version of this timeline, agreed with each family at admission.

## 5. Costs

Examination and centre fees are not included in Academy tuition fees and are paid by families directly to the centre, as set out in the Fees Policy. Centre charges vary and are set by the centre.

## 6. Access Arrangements

Pupils with SEND, medical conditions or temporary injuries may be eligible for access arrangements (for example extra time, a reader or a scribe). The Academy provides evidence of normal way of working and professional reports to support the centre's application under JCQ rules. Families should raise needs as early as possible, ideally by the start of Year 11.

## 7. Mock Examinations

Mock examinations are held in Year 11 (and at the end of Year 10) under secure conditions, with live invigilation and cameras on, or with paper-based submission under timed, camera-on conditions. Results inform predicted grades and entry decisions.

## 8. Examinations in Other Countries

Families living outside the UK can usually sit International GCSEs at British Council or other approved international centres, which is one reason the Academy enters pupils for International GCSEs. The Academy will advise on centres when subjects are chosen.

## 9. Subjects and Entry

In Years 10 and 11 pupils follow International GCSE courses in English Language, English Literature, Mathematics, Science (Double Award, or separate Biology, Chemistry and Physics) and Islamic Studies, with options from Arabic, Business, Computer Science and Geography. English Language, Mathematics, Computer Science, Geography and Arabic are taught from the UK GCSE specifications, and teachers add the content and exam practice each International GCSE requires. History is taught from Year 1 to Year 9 and is not offered at Key Stage 4.

International GCSEs are not regulated by Ofqual; the awarding body describes them as generally equivalent to GCSEs, and sixth forms and universities set their own entry requirements. Computer Science includes a 3-hour practical examination on a computer, held in June, so families must choose a centre that can run it. English Language and Arabic have no compulsory speaking test. Geography fieldwork is examined in the written papers, and pupils complete one physical and one human fieldwork enquiry during the course. Entry for Arabic is confirmed for each pupil by the end of Year 10.

## 10. Monitoring and Review

This policy is reviewed annually by the Examinations Officer and Headteacher.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)", "basis": "New policy for online provision"}$m$::jsonb,
    body_updated_at = now()
where slug = '19-examinations-and-private-candidates';

-- 20-academic-integrity-and-secure-assessment
update public.policy_links
set body_md = $b$## 1. Purpose

Honesty (sidq and amanah) is one of our Tarbiyyah Compass values. Honest work is an act of worship and a matter of trust between pupil, teacher and family. This policy sets out what academic integrity means at Tarbiyyah Global Academy, how online assessments are secured, and what happens if a pupil is dishonest.

## 2. What Counts as Academic Misconduct

- Copying from another person or source and presenting it as one's own work (plagiarism).
- Using artificial intelligence tools to produce work without the teacher's permission or without declaring it.
- Receiving help from a parent, sibling, tutor or anyone else during a test or on work that must be independent.
- Using notes, other websites, apps, phones or devices during a closed-book test.
- Sharing questions or answers with other pupils.
- Impersonation — anyone other than the pupil completing work or a test.
- Attempting to bypass or disable assessment security tools.

## 3. Three Levels of Assessment Security

| Level | Used for | Controls |
| --- | --- | --- |
| Practice | Homework, quick quizzes, retrieval practice | Any browser; shuffled questions and answers; time limit; one attempt where appropriate. Some risk is accepted because the purpose is learning. |
| Secure | End-of-unit tests, termly tests, mock examinations | The test is only released through the Student Portal to enrolled pupils during the test window, with a time limit and one attempt. Tests set in the portal's own quiz tool are marked on the Academy's server, so the answers never reach the pupil's device. Pupils join a live invigilation call with cameras on and may be asked to show their desk and room. |
| External | International GCSE examinations | Sat in person at an approved examination centre under JCQ regulations |

## 4. Secure Tests: What Families Need to Know

- Secure tests are sat on the pupil's usual device (a Windows or Mac computer, or an iPad), with the camera on for the invigilation call.
- Before a pupil's first secure test, they complete a practice run so they know how the test works in the Student Portal.
- During the test, the pupil should be alone in a quiet room, with their phone away and out of reach.
- Invigilation calls are not recorded by the Academy unless an incident needs to be documented, in which case the pupil and parent are informed.
- If a technical problem occurs, the pupil messages the invigilator immediately through the invigilation call. Genuine technical failures are not treated as misconduct; the test is rescheduled.

## 5. Designing Assessments that Resist Cheating

Teachers use question banks and multiple versions, "show your working" and explanation questions, and application questions that cannot simply be looked up. Where a result is inconsistent with a pupil's normal performance, a short follow-up conversation with the teacher may be held to discuss the answers.

## 6. Artificial Intelligence

AI tools may only be used where a teacher explicitly permits it for a particular task, and pupils must state how they used them. Staff may use AI detection or follow-up questioning to check authenticity, but no decision is made on a detection tool alone.

## 7. Responding to Suspected Misconduct

1. The teacher records the concern and any evidence, and informs the Head of Department or Deputy Headteacher.
2. The pupil is given the opportunity to explain, in a recorded video meeting.
3. Parents are informed.
4. If misconduct is confirmed, outcomes may include: redoing the work under supervision; a mark of zero for the assessment; consequences under the Behaviour and Online Conduct Policy; and, for serious or repeated misconduct in formal assessments, suspension.
5. The pupil receives support to understand why integrity matters and how to avoid a repeat.

Suspected malpractice in external examinations is handled by the examination centre and awarding body under JCQ rules.

## 8. Reasonable Adjustments

Pupils with SEND or medical needs receive their agreed access arrangements in secure tests, such as extra time, rest breaks or assistive technology, configured in advance.

## 9. Monitoring and Review

The Deputy Headteacher reviews incidents of misconduct and the effectiveness of security measures each term. This policy is reviewed annually.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)", "basis": "New policy for online provision"}$m$::jsonb,
    body_updated_at = now()
where slug = '20-academic-integrity-and-secure-assessment';

-- 21-flexible-learning
update public.policy_links
set body_md = $b$## 1. Purpose

Our pupils live in many countries. For some families, the standard UK timetable fits well; for others, the time difference or family circumstances make it difficult. This policy explains the learning options the Academy may be able to offer, who is eligible, and how quality and safeguarding are maintained.

## 2. Learning Options

| Option | What it involves | Who it is for |
| --- | --- | --- |
| Standard live timetable | All lessons live, 09:00–15:00 UK time Monday to Thursday and 09:00–12:00 on Fridays (the afternoon is free for Jumu'ah) | Most pupils in the UK and nearby time zones |
| Four-day live week | Live lessons Monday to Thursday; Friday is a structured independent study day with set work, submitted through the Student Portal | Year 1 to Year 9. Not offered in Years 10–11, where International GCSE courses need the full live timetable |
| Time-zone flexible | A mix of live lessons at feasible local times and recorded lessons with set tasks and live catch-up clinics | Pupils whose local time makes the full live timetable unreasonable |
| Time-zone pods | Where five or more pupils in the same phase live in a similar time zone (for example the Gulf or South-East Asia), the Academy may run their form time, Qur'an group and catch-up clinics at a time that suits them, so they build friendships with pupils who share their day | Clusters of families abroad |
| Temporary adjusted timetable | A reduced or adapted timetable for a limited period | Pupils with medical needs, SEND or exceptional circumstances, agreed with the SENCO or Pastoral Lead |

The standard live timetable remains our expectation wherever it is reasonable, because live teaching gives the strongest learning and the best safeguarding oversight.

**Subject to availability.** Apart from the standard live timetable, every option above is offered subject to availability: it depends on staffing, the number of pupils in the class and time zone, and whether the option will give the pupil a good education. The Academy cannot promise that a particular option will be available for every year group or every term, and will tell families honestly, before they accept a place, what can be offered. A temporary adjusted timetable for a pupil with medical needs, SEND or a disability is different: it is considered as a reasonable adjustment, not as a matter of availability.

## 3. How to Apply

Families ask about a Flexible Learning option at admission, or at any time by contacting the Academy office or through Messages in the Parent Portal. The Deputy Headteacher considers the request with the form tutor and, where relevant, the SENCO. A written Flexible Learning Plan sets out: which lessons are live and which are recorded; expected weekly engagement; how work is submitted; live check-in times; and the review date.

## 4. Safeguarding and Attendance

Every pupil, whatever their option, has live, camera-on contact with a member of staff every school day, normally form time, a live lesson or a tutor check-in. Where the Academy cannot staff this at a reasonable time for the pupil's time zone, the option is not offered. Engagement with recorded lessons and set work is tracked, and non-engagement is followed up under the Attendance, Punctuality and Children Missing Education Policy in the same way as absence.

## 5. Recorded Lessons

Recorded lessons used for flexible learners are shared through the Student Portal for the pupil's class only and are subject to the Recording of Live Lessons and Use of Images Policy. Pupils must not share recordings.

## 6. Fees

Flexible Learning options are provided within the standard fee unless the Fees Policy states otherwise.

## 7. Review

Each Flexible Learning Plan is reviewed at least termly. The Academy may end a plan if engagement or progress is insufficient, after discussion with parents. This policy is reviewed annually.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)", "basis": "New policy for online provision (planned as \"Flexible Timetable Options\" during the TGA launch planning)"}$m$::jsonb,
    body_updated_at = now()
where slug = '21-flexible-learning';

-- 22-enrichment-and-clubs
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)", "basis": "New policy for online provision"}$m$::jsonb,
    body_updated_at = now()
where slug = '22-enrichment-and-clubs';

-- 23-tarbiyyah-compass-character-framework
update public.policy_links
set body_md = $b$## 1. Purpose

Tarbiyyah means nurturing of the heart, the mind and the character. The Tarbiyyah Compass is the Academy's own set of values that guide that nurturing. Like a compass, they help a pupil find the right way wherever they are in the world. The five values spell **IHSAN**: worshipping Allah as though you see Him. Each value is the focus of one half term, and the year ends with Ihsan itself, all five together. This framework sets out what each value means, what it looks like online, and how staff teach, model and recognise it.

## 2. The IHSAN Values

| Letter | Value | Meaning | What it looks like at TGA | Focus |
| --- | --- | --- | --- | --- |
| I | Ilm | Love of learning: curiosity, good questions and the effort to really understand | Asks questions; reads beyond the lesson; acts on feedback | Autumn 2 |
| H | Honesty | Sidq and amanah: telling the truth, doing your own work and keeping the trust others place in you | Does their own work; tells the truth; keeps passwords and devices safe; keeps promises | Summer 1 |
| S | Sabr and shukr | Patience and gratitude: keeping going when things are hard, and thanking Allah and others when they are easy | Perseveres with hard work; manages technical problems calmly; thanks teachers and family; uses screen time wisely | Spring 2 |
| A | Adab | Good manners: respect and kindness in how we speak, listen and behave, online and at home | Greets with salam; follows microphone and chat etiquette; speaks kindly to teachers and classmates | Autumn 1 |
| N | Niyyah | Sincere intention: doing what is right for the sake of Allah, whether or not anyone is watching | Brings a good intention to learning; behaves the same with camera on or off; prays on time | Spring 1 |

**Summer 2: Ihsan.** The final half term brings the five together: doing everything as well as we can, because Allah sees us.

> **Why "online" matters**
>
> In an online school, much of a pupil's conduct happens without an adult in the room. Niyyah and honesty, doing right because Allah sees us and keeping the trust others place in us, are therefore not abstract ideas but the daily foundation of how our pupils learn, and the road to ihsan.

## 3. How the Values are Taught

- **Assemblies:** each half term focuses on one Tarbiyyah Compass value, with Qur'anic verses, hadith and stories from the seerah and from inspiring Muslims past and present.
- **Form time:** short discussions and reflection prompts linked to the value of the half term.
- **Curriculum:** subject leads identify where their subject develops each value, for example sabr in problem-solving in Mathematics and honesty in scientific method.
- **Staff modelling:** every member of staff models the values in their conduct and communication.

## 4. How the Values are Recognised

- Merits (M1 and M2) are linked to specific values, as set out in the Behaviour and Online Conduct Policy.
- Each half term, a "Compass Star" is recognised in each class for the value of the half term.
- Termly reports include a short comment on character and values.
- Families are invited to share examples of their child living the values at home.

## 5. Measuring Impact

Pupil and parent surveys, merit data and pastoral records are reviewed each term to see how well the values are being lived and where more support is needed.

## 6. Review

This framework is reviewed annually by the Headteacher with staff, pupils and parents.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 2.2)", "basis": "Written for Tarbiyyah Global Academy; its values are the Academy's own"}$m$::jsonb,
    body_updated_at = now()
where slug = '23-tarbiyyah-compass-character-framework';

-- 24-admissions
update public.policy_links
set body_md = regexp_replace(regexp_replace(body_md, '## 4\. Technical Requirements.*?(?=## 6\. Reasonable Adjustments)', $b$## 4. Technical Requirements

Because all learning is online, a place is conditional on the family providing:

- a laptop or desktop computer (Windows or Mac) or an iPad, with a working webcam, microphone and headset;
- a reliable broadband connection;
- a quiet, suitable space for study;
- a way for the pupil to write on worksheets and the lesson PDF each day: a tablet with a stylus is recommended for every pupil (any tablet that takes a stylus, or a basic graphics tablet that plugs into the laptop), and where the pupil does not have one, access to printing is required (at home, at a local library or similar).

The minimum specification is published on the website, and a device check is completed during induction week, before the pupil starts.

## 5. How to Apply

Before applying, families are welcome to book an admissions call, join an online open evening or the taster morning, and use "Is it right for us?" on the Academy website to see the likely year group, the live day in their time zone, what they need at home and the fees. The application itself follows the same six steps as the "How to apply" page of the website:

| Step | What happens |
| --- | --- |
| 1. Apply | Complete the online application form (one form for all the children in a family), including each child's home address, and upload the documents listed in Appendix A. Pay the application fee of £150 per child, which is non-refundable (see the Fees Policy) |
| 2. We review the application | The admissions team checks the application and documents, asks the child's current school for a confidential report, and tells the family if anything else is needed |
| 3. Remote assessment | The pupil sits an age-appropriate online entry assessment, supervised with the camera on. The Academy emails the date, time and what to prepare |
| 4. Family video call | A video call with the Headteacher or a member of the leadership team, the parent or guardian and the pupil, about learning goals, values and any support needs |
| 5. Offer and securing the place | The decision is sent in writing, normally within three working days of the family video call (and within ten working days of a complete application). A successful applicant receives a conditional offer with the terms and conditions and the Fees Policy, and the family secures the place as set out in section 7 |
| 6. Welcome | The Academy creates the parent and pupil accounts, emails the sign-in details, and welcomes the pupil to induction week before the first live lessons |

$b$), '## Appendix A.*$', $b$## Appendix A — Documents Required with an Application

| Document | Purpose | When |
| --- | --- | --- |
| The child's passport or birth certificate | Identity and date of birth | Uploaded with the application |
| Photo ID for a parent or guardian | Identity of adults with parental responsibility | Uploaded with the application |
| Proof of the child's home address and country of residence | For the admissions record and safeguarding | Uploaded with the application, or asked for during the review |
| Most recent school report, or a homeschool progress record | Attainment, progress and attendance | Uploaded with the application if the family has one; the Academy also asks the current school for a confidential report |
| Evidence of parental responsibility, where relevant | For example a court order | During the review |
| EHCP, SEN support plan or professional reports | To plan support and adjustments | During the review, or with the application |
| Medical information and any Individual Healthcare Plan | To keep the pupil safe from day one | Before the pupil starts |
| Emergency contact details, including a local adult | For safeguarding and medical emergencies | Before the pupil starts |$b$),
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.3)"}$m$::jsonb,
    body_updated_at = now()
where slug = '24-admissions';

-- 25-fees
update public.policy_links
set body_md = replace(body_md, 'without one, a printer at home is required)', 'without one, access to printing is required, at home, at a local library or similar)'),
    meta = coalesce(meta, '{}'::jsonb) || $m${"dateOfIssue": "1 September 2026 (version 1.4)"}$m$::jsonb,
    body_updated_at = now()
where slug = '25-fees';

-- 26-concerns-and-complaints
update public.policy_links
set body_md = $b$## 1. Purpose

Tarbiyyah Global Academy aims to provide an excellent education and service. When things go wrong, we want to know, so that we can put them right and learn from them. This policy explains how to raise a concern and, if needed, make a formal complaint. We handle every concern fairly, openly and promptly, and in keeping with the Islamic principles of justice, good opinion of others (husn al-dhann) and reconciliation.

## 2. Concerns and Complaints

- A concern is a worry or doubt about something the Academy has or has not done. Most concerns are resolved quickly and informally.
- A complaint is a clear statement of dissatisfaction that requires a formal response.

The Academy records complaints and their outcomes. The number of formal complaints registered in the previous academic year is made available to parents on request. As a new Academy, there were no formal complaints before launch.

Concerns about the safety of a child are not handled under this policy; they are referred immediately to the DSL under the Child Protection and Safeguarding Policy. Concerns about staff conduct that may affect children are handled under the allegations procedure.

## 3. Timescales

All timescales are in school days (Monday to Friday during term time, UK). Complaints received in school holidays are treated as received on the first school day afterwards. Because families live in different time zones, meetings are offered by video call at mutually convenient times.

## 4. Stage 1 — Raising a Concern (Informal)

| Step | Who to contact |
| --- | --- |
| 1 | The class or subject teacher, through the Parent Portal |
| 2 | The form tutor, if unresolved or if the concern is broader |
| 3 | The Pastoral Lead or relevant senior leader |
| 4 | The Headteacher |

We aim to acknowledge every concern within two school days (48 hours) and to resolve most within five school days. If the concern is about the Headteacher, contact the Chair of Trustees directly.

## 5. Stage 2 — Formal Complaint to the Headteacher

If a concern is not resolved, parents may make a formal complaint in writing to globalacademy@tarbiyyah.co.uk, marked "For the attention of the Headteacher", using the [Complaint Form](https://globalacademy.tarbiyyah.co.uk/policies/complaint-form/) (also available from the Academy office) or an email that gives the same information. Complaints should be made within three months of the issue arising.

- The Headteacher (or a senior leader not involved) acknowledges the complaint within five school days and offers a video meeting.
- The complaint is investigated, including review of relevant records such as lesson recordings where appropriate.
- A written response with reasons and any action is sent within ten school days of acknowledgement. If more time is needed, parents are told why and given a new date.

If the complaint is about the Headteacher, Stage 2 is conducted by the Chair of Trustees.

## 6. Stage 3 — Complaints Panel Hearing

If parents remain dissatisfied, they may ask for their complaint to be heard by a Complaints Panel by writing to the Chair of Trustees within ten school days of the Stage 2 response.

- The request is acknowledged within five school days.
- The Panel comprises at least three people who have not been involved in the matters complained about, at least one of whom is independent of the management and running of the Academy.
- The hearing takes place by video call (or in person if requested and practicable) within twenty school days of the request, with at least five school days' notice.
- Parents may attend and be accompanied by one person, and may submit further documents at least five school days before the hearing.
- The Panel may make findings and recommendations. The decision, with reasons, is sent in writing to the parents, the Headteacher and, where relevant, the person complained about, within ten school days of the hearing.
- The Panel's findings and recommendations are available for inspection by the Headteacher and trustees, and a copy is kept on file.

## 7. Records and Confidentiality

A written record is kept of all complaints, whether resolved at Stage 2 or Stage 3, the action taken, and the outcome. Correspondence, statements and records are confidential, except where access is required by law or requested by an accreditation body. Records are kept in line with the Data Protection Policy.

## 8. Unreasonable or Repeated Complaints

The Academy is committed to dealing with all complaints fairly. Where a complainant behaves unreasonably (for example abusive communication or repeatedly reopening a matter that has completed the procedure), the Headteacher or Chair may limit contact to a single channel, and may inform the complainant in writing that the procedure has been exhausted and the matter is closed. Complaints should not be made on social media or in public group chats.

## 9. External Routes

The decision of the Complaints Panel is the final stage of the Academy's procedure. This does not affect families' statutory rights, including their rights as consumers under the Consumer Rights Act 2015, and families may seek independent advice at any stage. Safeguarding concerns can always be raised directly with the local authority.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)"}$m$::jsonb,
    body_updated_at = now()
where slug = '26-concerns-and-complaints';

-- 27-parent-communication-charter
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)", "basis": "New policy for online provision (combines the planned Parent Communication Charter and Feedback Mechanisms)"}$m$::jsonb,
    body_updated_at = now()
where slug = '27-parent-communication-charter';

-- 28-data-protection
update public.policy_links
set body_md = $b$## 1. Vision and Ethos

The personal data of our pupils, families and staff is an amanah — a trust. In a fully online school, lessons, communication, pupil work and records all pass through digital systems, so protecting data is both a legal duty and a daily responsibility for everyone.

## 2. Legal Framework

This policy complies with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018 and the Privacy and Electronic Communications Regulations. The Academy's processing of personal data is carried out under the Tarbiyyah Education Trust's arrangements with the Information Commissioner's Office (ICO); confirmation of the registration is available from the Headteacher on request. Where pupils live in other countries, the Academy also has regard to relevant local data protection laws.

## 3. The Data Protection Principles

Personal data is:

1. processed lawfully, fairly and transparently;
2. collected for specified, explicit and legitimate purposes;
3. adequate, relevant and limited to what is necessary;
4. accurate and kept up to date;
5. kept no longer than necessary;
6. processed securely.

The Academy is responsible for, and able to demonstrate, compliance with these principles (accountability).

## 4. Roles and Responsibilities

| Role | Responsibility |
| --- | --- |
| Trustees | Overall accountability for compliance |
| Data Protection Officer (DPO) | Advises on and monitors compliance, handles requests and breaches, liaises with the ICO. The DPO role is held by a suitably trained person with direct access to the trustees; the Trust may appoint an external DPO service |
| Digital Lead | Security of Academy systems, account management, access control and secure deletion; reviews the audit logs of Academy systems every month and whenever a concern is raised, and reports any suspected breach to the DPO the same day |
| All staff | Handle data in line with this policy and complete the Academy's data protection training, with its short quiz, at induction and every year |

## 5. What Data We Hold and Why

The Academy holds personal data about pupils (for example name, date of birth, address, country of residence, attendance, assessment, SEND and medical information, safeguarding records, lesson recordings), parents (contact details, fee and payment records), staff and applicants. The purposes and lawful bases are set out in the privacy notice on the Academy website. Special category data (such as health, religion or SEND information) is processed only where an Article 9 condition applies, such as substantial public interest for safeguarding.

## 6. Academy Systems

| System | Use |
| --- | --- |
| Microsoft 365 / the Academy's live-lesson platform (currently Microsoft Teams), joined from the Student Portal | Live lessons, recordings, email |
| Academy Parent and Student Portals (hosted on Supabase, London region) | Admissions calls, parent and student accounts, bookings, merits, announcements, documents, assignments, class notebooks |
| Transactional email service (Resend) | Booking confirmations, reminders and portal sign-in codes |
| Approved learning subscriptions | Only where a data processing agreement is in place |

Each processor is covered by a written data processing agreement, and a data protection impact assessment (DPIA) is completed before any new system that processes pupils' data is introduced. A DPIA is completed for the Parent and Student Portals before they go live.

## 7. Security and Access

- Access to data is limited by role. Safeguarding and SEND records are accessible only to authorised staff.
- Staff accounts use single sign-on and multi-factor authentication. Access can be revoked immediately if a device is lost, a staff member leaves, or an account is compromised.
- Staff may use personal devices only through Academy accounts, never downloading pupil data to personal storage.
- Paper documents received are scanned into Academy systems and securely shredded.

## 8. International Transfers

Many families live outside the UK, and some staff may work from abroad. Personal data is stored in UK or EU data centres where possible. Where data is transferred to or accessed from a country without UK adequacy regulations, the Academy uses appropriate safeguards (such as the International Data Transfer Agreement) and a transfer risk assessment.

## 9. Individuals' Rights

Individuals have the right to be informed, to access their data, to rectification, to erasure (in some circumstances), to restrict or object to processing, and to data portability. Requests, including subject access requests, are sent to the DPO and answered within one calendar month (extendable in limited circumstances). Pupils aged around 12 and over are generally considered able to make their own requests. Information about other people, including other pupils in lesson recordings, is redacted or withheld as the law requires.

## 10. Data Breaches

Any suspected breach — for example a lost device, an email sent to the wrong person, or an unauthorised person in a lesson — must be reported to the DPO immediately. The DPO assesses the risk and, where required, reports to the ICO within 72 hours and informs affected individuals without undue delay. Every breach is recorded and reviewed.

## 11. Photographs, Video and Recordings

Lesson recordings are governed by the Recording of Live Lessons and Use of Images Policy. Photographs and video for publicity require specific, written consent, which can be withdrawn at any time.

## 12. Retention Schedule

| Record | Retention | Action |
| --- | --- | --- |
| Routine live lesson recordings | 1 academic year, unless needed for an open matter | Secure deletion |
| Admissions record | 3 years from the date of the last entry | Secure deletion |
| Attendance registers | 3 years from the date of entry | Secure deletion |
| Main pupil record and internal results | Until the pupil's 25th birthday | Secure deletion |
| SEND files and EHCP records | Until the pupil's 31st birthday | Secure deletion |
| Child protection files | Until the pupil's 25th birthday, then review; longer if litigation or an inquiry requires | Review, then secure deletion |
| Allegations against staff (substantiated or not false/malicious) | Until normal retirement age or 10 years, whichever is longer | Secure deletion |
| Staff personnel files | 6 years after employment ends | Secure deletion |
| Unsuccessful job applications | 6 months after the decision | Secure deletion |
| Financial records, invoices and payroll | 6 years from the end of the financial year | Secure deletion |
| Unsuccessful admissions applications | 1 year after the decision | Secure deletion |

## 13. Training and Review

All staff receive data protection training at induction and annually. This policy is reviewed annually by the DPO and approved by the Headteacher and agreed with the Chair of Trustees.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)", "basis": "Updated from the Tarbiyyah Global Academy Data Protection Policy draft (September 2026); platform references updated to the Academy's current systems"}$m$::jsonb,
    body_updated_at = now()
where slug = '28-data-protection';

-- 29-equality-diversity-and-accessibility
update public.policy_links
set body_md = $b$## 1. Our Commitment

Allah says: "O mankind, We have created you from male and female and made you peoples and tribes that you may know one another. Indeed, the most noble of you in the sight of Allah is the most righteous of you." (Al-Hujurat 49:13). Our pupils come from many countries, cultures and backgrounds. Tarbiyyah Global Academy is committed to treating every pupil, parent and member of staff fairly, with dignity and respect, and to removing barriers so that everyone can take full part in Academy life.

## 2. Legal Framework

The Academy complies with the Equality Act 2010, which protects people from discrimination, harassment and victimisation because of the protected characteristics: age, disability, gender reassignment, marriage and civil partnership, pregnancy and maternity, race, religion or belief, sex, and sexual orientation. The Act includes specific exceptions for schools with a religious character, including in relation to religious worship and admissions, which the Academy applies lawfully. The Academy also has regard to the OEAS standards and the Public Sector Equality Duty principles as good practice.

## 3. What We Will Do

- Ensure admissions, assessment, behaviour and exclusion decisions are fair and free from discrimination.
- Make reasonable adjustments for disabled pupils, parents and staff, including auxiliary aids and services.
- Challenge and record prejudice-related incidents and bullying.
- Ensure the curriculum reflects the diversity of our community and teaches respect for all people, in line with our Islamic values.
- Recruit, train and promote staff fairly.
- Ensure communications and platforms are accessible.

## 4. Equality Objectives

| Objective | Measure |
| --- | --- |
| Ensure pupils with SEND make progress in line with their peers | Termly progress data by SEND status |
| Ensure pupils in all time zones have equitable access to live teaching and support | Attendance and engagement by time zone; Flexible Learning take-up |
| Reduce prejudice-related incidents and ensure all are resolved | Incident log; pupil survey on feeling safe and respected |
| Ensure all Academy platforms meet WCAG 2.2 AA accessibility | Annual accessibility audit |

These objectives are reviewed by trustees each year.

## 5. Digital Accessibility Plan

In a physical school, an accessibility plan focuses on ramps, lifts and classrooms. For TGA, it focuses on access to the curriculum, to information, and to our digital platforms.

| Area | Actions | Timescale |
| --- | --- | --- |
| Access to the curriculum | Captions and transcripts in live lessons; Immersive Reader; recorded explanations; adapted resources; assistive technology; flexible camera arrangements | From launch; reviewed termly |
| Access to information | Policies and letters available in large print, accessible PDFs and plain-English summaries; key information available in other languages on request. The website's Policies page lets families search the policies, jump to a group, and request any policy in another format | From launch |
| Digital platforms | Website and portals built to WCAG 2.2 AA (keyboard access, colour contrast, screen reader support, reduced motion); annual accessibility audit | Launch and annually |
| Assessments | Access arrangements (such as extra time and rest breaks) set up in the Student Portal and Forms; alternative formats where needed | Ongoing |
| Staff | Training on accessible teaching and inclusive online practice | Annually |

This plan runs from January 2027 to January 2030 and is reviewed annually.

## 6. Reporting and Responding

Discrimination, harassment or prejudice-related bullying can be reported to any member of staff and is investigated and recorded. Pupils' concerns are handled under the Anti-Bullying and Cyberbullying Policy and the Behaviour and Online Conduct Policy; parents' and staff concerns under the Concerns and Complaints Policy or staff grievance procedure.

## 7. Monitoring and Review

The Headteacher reports annually to trustees on equality objectives, the accessibility plan and incidents. This policy is reviewed annually.$b$,
    meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.2)"}$m$::jsonb,
    body_updated_at = now()
where slug = '29-equality-diversity-and-accessibility';

-- 30-safer-recruitment
update public.policy_links
set meta = (coalesce(meta, '{}'::jsonb) - 'basis') || $m${"dateOfIssue": "1 September 2026 (version 1.1)"}$m$::jsonb,
    body_updated_at = now()
where slug = '30-safer-recruitment';

alter table public.policy_links enable trigger policy_links_body_changed;

-- FAQs (src/content/seed.ts f31 and f19, and an older equipment answer).
update public.faq_entries
set answer = replace(replace(replace(replace(answer,
      E'\n- Microsoft Teams (free), and Safe Exam Browser for secure assessments\n', E'\n- Microsoft Teams (free)\n'),
      ' For secure tests the device must run Safe Exam Browser (Windows, Mac or iPad).', ''),
      '- **Required if there is no tablet with a stylus:** a printer at home, to print the worksheets and the lesson PDF.',
      '- **Required if there is no tablet with a stylus:** access to printing, to print the worksheets and the lesson PDF. A printer at home is not needed: a local library or similar is fine.'),
      '**Required if there is no tablet with a stylus:** a printer at home.',
      '**Required if there is no tablet with a stylus:** access to printing (at home, at a local library or similar).')
where answer like '%Safe Exam Browser%' or answer like '%a printer at home%';

update public.faq_entries
set answer = replace(answer, 'a tablet with a stylus or a printer', 'a tablet with a stylus or access to printing')
where answer like '%a tablet with a stylus or a printer%';
