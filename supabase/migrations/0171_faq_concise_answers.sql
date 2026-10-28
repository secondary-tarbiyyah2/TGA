-- FAQ rewrite (October 2026): every answer made short and direct, with
-- structure the site now renders (blank line = new paragraph, lines starting
-- "1." or "- " = lists, **bold**, [label](/path) links; see src/lib/faq.ts).
-- Facts checked against the owner's current list: no registration fee, the
-- {{applicationFee}} application fee (substituted from site_settings),
-- deadline Fri 18 Dec 2026, school opens Mon 4 Jan 2027, first live lessons
-- Mon 11 Jan 2027, lessons per week by key stage, PSHE only, no PE.
-- order_index is now one sequence across the whole list (category blocks in
-- page order, most asked first), so the homepage preview shows the top four.
-- Matches src/content/seed.ts.
--
-- Idempotent: rows are matched by question (or the previous wording of a
-- renamed question) and overwritten; missing rows are inserted; the
-- duplicate "Is there a parent login?" (now part of "How will I know how my
-- child is doing?") is removed. Running it again changes nothing.

drop table if exists pg_temp._faq_0171;
create temp table _faq_0171 (question text not null, old_questions text[] not null, category text not null, order_index int not null, answer text not null);

insert into _faq_0171 (question, old_questions, category, order_index, answer) values
  ('When do live lessons start, and what is the deadline to apply?', array[]::text[], 'Admissions', 1,
   E'Live lessons start on **Monday 11 January 2027**, and the deadline to apply is **Friday 18 December 2026**.\n\nThe school opens a week earlier with induction week (4 to 8 January), so your child meets their teachers and learns the portal first. Later applications are considered while places remain. See [Term dates](/term-dates).'),
  ('How do I apply, step by step?', array[]::text[], 'Admissions', 2,
   E'Apply online, then a short assessment and an offer.\n\n1. Come to an open evening or [book a call](/book-a-call) if you would like to talk first.\n2. [Apply online](/admissions) by **Friday 18 December 2026**. It takes about ten minutes.\n3. We email you payment details for the {{applicationFee}} application fee, which is paid before a place is confirmed.\n4. Your child sits a short online entry assessment, and we talk with you.\n5. We offer a place in writing.\n6. Accept within five working days, pay your first fee payment by **Friday 8 January 2027** and sign the parent agreement on the portal.\n7. Induction week runs 4 to 8 January, and live lessons start on Monday 11 January 2027.'),
  ('Can we see the school before we commit?', array[]::text[], 'Admissions', 3,
   E'Yes, at an online open evening or the taster morning.\n\n- Open evenings: **Thursday 26 November, 7:30pm** and **Sunday 6 December, 4:00pm** (UK time)\n- Taster morning: **Saturday 12 December**, when your child joins a real live lesson (Years 1 to 6 at 10:00, Years 7 to 11 at 11:15)\n\n[Register on the Open evenings page](/open-evening) and we email you the joining link.'),
  ('Which year groups can apply?', array[]::text[], 'Admissions', 4,
   'Year 1 to Year 11 (children aged 5 to 15 on 31 August 2026). We do not offer Reception. The application works out your child''s year group from their date of birth.'),
  ('What is the entry assessment like?', array[]::text[], 'Admissions', 5,
   E'A short, friendly online check, not a test to pass.\n\n- Reading and maths at your child''s level\n- A few minutes of Qur''an reading or recitation, at whatever level they are\n- A conversation with you and your child\n\nIt places your child in the right Qur''an and Arabic group and helps us plan support. There is nothing to revise.'),
  ('Is there a probationary period?', array[]::text[], 'Admissions', 6,
   'Yes, for the first half term. It gives you and the school time to check that online learning at TGA suits your child, with regular feedback throughout.'),
  ('Can we apply from outside the UK?', array[]::text[], 'Admissions', 7,
   'Yes. Lessons run on UK time (09:00 to 15:00), which suits families in the UK, Europe, North and West Africa, Turkey and the Middle East. Check the times where you live with [Is TGA right for us?](/eligibility)'),
  ('Can my child join part-way through the year?', array[]::text[], 'Admissions', 8,
   'Yes, if there is a place in their year group. The usual application, assessment and induction apply, and fees are adjusted for the part of the year your child attends.'),
  ('What is the difference between registering interest and applying?', array[]::text[], 'Admissions', 9,
   'Registering interest is a short form that keeps you updated and commits you to nothing. Applying is the full application, followed by the {{applicationFee}} application fee, and starts the admissions process.'),
  ('How much are the fees?', array[]::text[], 'Fees', 10,
   E'For January to July 2027, including VAT:\n\n- Years 1 to 2: £1,596\n- Years 3 to 6: £2,130\n- Years 7 to 9: £2,796\n- Years 10 to 11: £3,000\n\nFees cover all tuition and digital learning materials. See [Fees](/fees) for payment plans and a family estimate.'),
  ('What is the application fee, and is there a registration fee?', array['What are the application and registration fees, and why?']::text[], 'Fees', 11,
   E'The application fee is **{{applicationFee}} per child** and is non-refundable. There is **no registration fee**.\n\nWe email payment details after you apply, and the fee is paid before a place is confirmed. To accept a place, reply within five working days and pay your first fee payment by Friday 8 January 2027.'),
  ('How can we pay?', array[]::text[], 'Fees', 12,
   E'Choose one of three plans when you accept a place:\n\n- In full by 8 January 2027, with a {{annualDiscount}} discount\n- Two payments: 8 January and 28 March 2027\n- Seven monthly payments: 8 January, then the 28th of each month from January to June\n\nPay by bank transfer, standing order or card. See [Fees](/fees).'),
  ('Is there a sibling discount?', array[]::text[], 'Fees', 13,
   'Yes: 5% off tuition for a second child and 10% off for a third or further child. It applies to the younger sibling''s tuition and can be combined with the pay-in-full discount.'),
  ('What is not included in the fees?', array[]::text[], 'Fees', 14,
   E'Three things:\n\n- International GCSE exam entry fees, paid directly to the exam centre\n- Printed books or stationery you choose to buy\n- Your own device and internet connection'),
  ('What happens if we withdraw or miss a payment?', array[]::text[], 'Fees', 15,
   E'To withdraw, give one half term''s written notice using the Withdrawal Form; fees are payable for the notice period. If a payment is missed, we give you 14 days'' written notice before taking further steps.\n\nThe Fees Policy on the [Policies](/policies) page has the full detail, including refunds and your 14-day cancellation right.'),
  ('What are the school hours?', array[]::text[], 'School day', 16,
   'Monday to Thursday **09:00 to 15:00**, and Friday **09:00 to 12:00** (UK time) so families can prepare for Jumu''ah. Form time starts at 09:00, lessons at 09:10, and Dhuhr is built into the timetable.'),
  ('How long are lessons, and how big are the classes?', array[]::text[], 'School day', 17,
   E'Classes have **no more than 15 pupils**, taught live by a qualified teacher. Each week:\n\n- Years 1 to 2: 15 live lessons of 30 minutes\n- Years 3 to 6: 20 live lessons of 45 minutes\n- Years 7 to 11: 23 live lessons of 50 minutes\n\nThere is a ten-minute movement break between lessons. Each [key stage page](/curriculum) shows a sample week.'),
  ('Is my child on a screen all day?', array[]::text[], 'School day', 18,
   'No. Live lessons are broken up with independent tasks, reading, handwriting, prayer and movement breaks, and there are no lessons on Friday afternoons. Homework is kept manageable and tracked on the portal.'),
  ('Does a parent need to be at home during lessons?', array[]::text[], 'School day', 19,
   'For Years 1 to 3, yes: an adult should be nearby to help with logging in and staying on task. Most pupils manage on their own from Year 4 once settled, and we expect it from Year 7. The register shows you every lesson your child attended.'),
  ('What does my child do if they are unwell or miss a lesson?', array[]::text[], 'School day', 20,
   'Report the absence through the Parent Portal or by emailing the school, before 09:00 if you can. Lesson resources and homework stay on the portal, and the teacher helps your child catch up.'),
  ('Are there term dates and holidays?', array[]::text[], 'School day', 21,
   E'Yes. The year runs from January to July, with a Ramadan and Eid break, a spring half term and an Eid al-Adha half term.\n\n- School opens: Monday 4 January 2027 (induction week)\n- First live lessons: Monday 11 January 2027\n- Last day: Friday 9 July 2027\n\nSee [Term dates](/term-dates) for every date.'),
  ('What does my child study?', array[]::text[], 'Curriculum', 22,
   E'Three strands every week:\n\n- Qur''an, Arabic and Islamic Studies\n- The national curriculum: English, Mathematics, Science, humanities, computing, art and PSHE\n- Tarbiyyah (character), built around our RECIPE values\n\nPE is not on the timetable. See [Curriculum](/curriculum) for each key stage.'),
  ('Are the teachers qualified?', array[]::text[], 'Curriculum', 23,
   'Yes. Every subject is taught by a qualified teacher with an enhanced DBS check (or the overseas equivalent) and safeguarding training, and Qur''an is taught by experienced Qur''an teachers. See [Meet the team](/team).'),
  ('How will I know how my child is doing?', array[]::text[], 'Curriculum', 24,
   E'Through the Parent Portal, your own login, set up when you accept a place. It shows attendance, homework, Qur''an progress, merits, reports and messages from teachers.\n\n- A written report each term\n- Two parents'' evenings a year\n- A weekly Tarbiyah Note from the form tutor'),
  ('Which GCSEs do you offer, and with which exam boards?', array[]::text[], 'Curriculum', 25,
   E'Pearson Edexcel International GCSEs, sat as a private candidate at an approved exam centre near you. We help you register.\n\n- **Core:** English Language, English Literature, Mathematics, Science (Double Award or separate sciences) and Islamic Studies\n- **Two options from:** Arabic (first language), Business, Computer Science and Geography\n\nHistory is not offered at GCSE. See [Years 10 to 11](/curriculum/year-10-11) for subject details.'),
  ('Will my child be able to move back to a mainstream school?', array[]::text[], 'Curriculum', 26,
   'Yes. We follow the national curriculum year by year and keep full records, so your child can join any UK school in the matching year group. We provide a transfer report.'),
  ('How is Qur''an taught, and is hifdh compulsory?', array[]::text[], 'Islamic Studies', 27,
   E'Hifdh is not compulsory: every pupil memorises at a pace agreed with you, and a full hifdh track is available if you want it to be central.\n\nQur''an is taught every week in small groups set by level, not age, from Qa''idah and early reading to fluent reading with tajweed.'),
  ('Will my child learn Arabic properly?', array[]::text[], 'Islamic Studies', 28,
   'Yes. Arabic is taught as a language from Year 1: reading, writing, speaking and grammar. In Years 10 and 11 it is an International GCSE option (Arabic as a first language).'),
  ('What is taught in Islamic Studies, and from which perspective?', array[]::text[], 'Islamic Studies', 29,
   'Aqeedah, fiqh, seerah, hadith and akhlaq, taught from the Qur''an and Sunnah following the understanding of the early generations. It leads to the International GCSE in Islamic Studies, and we are happy to talk you through the syllabus.'),
  ('Do you teach relationships and sex education (RSE)?', array[]::text[], 'Islamic Studies', 30,
   E'No. Every year group has PSHE only, with no sex education.\n\n- PSHE covers manners, friendships and family, health and hygiene, and staying safe online and offline, including age-appropriate body safety\n- From Year 7, puberty and its fiqh (bulugh) are taught to boys and girls separately\n\nAll PSHE materials are on the Parent Portal.'),
  ('How do you keep lessons appropriate for an Islamic setting?', array[]::text[], 'Islamic Studies', 31,
   'Teachers set the tone, and camera use and conduct follow our Online Conduct and RECIPE expectations. The teacher controls the chat. Ask us at an open evening about class arrangements for your child''s year group.'),
  ('What equipment do we need?', array[]::text[], 'Technology', 32,
   E'A computer or iPad with a webcam and headset, reliable internet and a quiet place to work.\n\n- A Windows or Mac laptop or desktop, or an iPad\n- Webcam, microphone and headset\n- A wired connection or good Wi-Fi\n- Microsoft Teams (free), and Safe Exam Browser for secure assessments\n\nWe check your setup with you during induction week.'),
  ('Where do lessons happen, and how does my child join?', array[]::text[], 'Technology', 33,
   'On Microsoft Teams, through the Student Portal. Your child opens today''s timetable and presses Join to go straight into the right lesson. Homework, resources and recordings are in the same place.'),
  ('How is my family''s data protected?', array[]::text[], 'Technology', 34,
   E'Under UK GDPR: it is used only for your child''s education and running the school, and never sold. Lesson recordings are kept for safeguarding and catch-up and are not shared outside the school.\n\nSee the Data Protection and Recording of Live Lessons policies on the [Policies](/policies) page.'),
  ('Can you support my child''s special educational needs?', array['Do you support children with special educational needs?']::text[], 'SEND', 35,
   E'Often, yes, within what a live online school can provide. Tell us about your child''s needs when you apply, and we will say honestly what we can offer before you commit.\n\n- An individual support plan, reviewed regularly with you\n- Adjustments in lessons, in classes of up to 15\n- Extra time, a reader or a scribe in assessments\n- Lesson resources and homework kept on the portal to revisit\n\nWe cannot offer in-person help such as an adult in the room, so younger children or those with higher needs may need a parent or carer nearby. See [Pastoral care and SEND](/pastoral-care).'),
  ('Can you support a child who is behind in reading, maths or Qur''an?', array[]::text[], 'SEND', 36,
   'Yes. The entry assessment shows where your child is, Qur''an and Arabic groups are set by level rather than age, and small classes make catch-up practical. You can follow progress week by week on the portal.'),
  ('Is the website and portal accessible?', array[]::text[], 'SEND', 37,
   'Yes. Use **Display** (the Aa button in the menu or the footer) for larger text, easy reading, higher contrast and less motion; the portal has the same options. Policies are available in accessible formats on request. See [Accessibility](/accessibility).'),
  ('How do you keep children safe online?', array[]::text[], 'Safeguarding', 38,
   E'Every member of staff is DBS-checked and safeguarding-trained, and a Designated Safeguarding Lead oversees it all.\n\n- Live lessons are recorded and run on school accounts only\n- One-to-one sessions are booked through the school calendar, with parents told in advance and the session recorded\n\nSee [Safeguarding](/safeguarding).'),
  ('Who do I contact if I am worried about something?', array[]::text[], 'Safeguarding', 39,
   'Your child''s form tutor for everyday matters. For any worry about a child''s safety, contact the Designated Safeguarding Lead, whose details are on the [Safeguarding](/safeguarding) page and in the portal. Complaints follow the Concerns and Complaints Policy.')
;

-- Collapse any rows that share a question, keeping one.
delete from public.faq_entries a
using public.faq_entries b
where a.question = b.question and a.id > b.id;

-- A renamed question: drop the old-wording row if the new wording already exists.
delete from public.faq_entries f
using _faq_0171 n
where f.question = any (n.old_questions)
  and exists (select 1 from public.faq_entries x where x.question = n.question);

update public.faq_entries f
set question = n.question,
    category = n.category,
    order_index = n.order_index,
    answer = n.answer
from _faq_0171 n
where f.question = n.question or f.question = any (n.old_questions);

insert into public.faq_entries (question, category, order_index, answer)
select n.question, n.category, n.order_index, n.answer
from _faq_0171 n
where not exists (select 1 from public.faq_entries f where f.question = n.question);

delete from public.faq_entries where question in ('Is there a parent login?');

drop table if exists pg_temp._faq_0171;
