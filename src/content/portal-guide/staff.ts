// Guide entries for pages that teachers and the head teacher / admin both
// use. Each is built from the same component, so the steps are the same;
// only the address, the menu category and a few words differ.
import type { GuideEntry } from "./types";

type Area = "teach" | "admin";
const head = (a: Area) => a === "admin";

export const OVERSIGHT_NOTE = "For safeguarding, the head teacher can read staff and family conversations in Message oversight; opening one is recorded in the audit log.";

export function actionsEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/actions`,
    name: "Waiting for you",
    category: "Home",
    purpose: head(a) ? "Everything waiting for the office, most urgent first: applications, absences, approvals, alerts." : "Registers, marking, replies and pupil records waiting for you, most urgent first.",
    when: "First thing each day, and whenever its number in the menu goes up.",
    steps: [
      "Choose a group from the list of groups, each with its count, or leave it on Everything: each group is its own box showing its first four lines, and Show all opens the group.",
      "Work down Do now first, then This week, then Good to know.",
      "Each line has one button that does the job; work to mark is marked right there.",
      "Press the three dots on a line for its detail beside the list: every pupil named, Mark done and print.",
      "Come back: lines clear by themselves once the work is done.",
    ],
    tips: ["Save as PDF prints the list for a meeting.", "How missing homework is followed up explains who does what on each day after a due date."],
    privacy: "Your list is your own; it is built from what you are responsible for.",
    related: [`/${a}/dashboard`, `/${a}/messages`],
    showMe: [
      { target: "waiting-categories", label: "Groups", say: "Filter the list by type of job." },
      { target: "waiting-list", label: "The list", say: "Each line has its own button; the three dots show its detail." },
    ],
    tasks: ["see what needs me", "action centre"],
  };
}

export function messagesEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/messages`,
    name: "Messages",
    category: "Home",
    purpose: head(a) ? "Conversations and groups with families and staff across the school." : "Conversations and groups with the families of your classes and with colleagues.",
    when: "To reply to a parent, contact a colleague, message a whole class's families or start a conversation about a pupil.",
    steps: [
      "Press New message. Choose A person, or A group (a class's parents or pupils, a year group, a staff team, or people you pick).",
      "Write and send. Press the paper clip to attach documents or pictures (up to 10 MB each).",
      "Open a conversation on the left to read and reply; press Reply beside a message to quote it. Your own message can be edited or deleted for 15 minutes.",
      "Ticks show sent, delivered and read; in a group, Seen by shows who has read it.",
      "Search finds people, groups and words in messages. The menu at the top of a conversation mutes it or opens Group details (members, name, replies on or off).",
    ],
    tips: [
      "A safeguarding worry belongs in Report a concern, not in a message.",
      "In a group, families and pupils see only the staff's messages and their own, never each other's. Everyone chooses in Account how often they are emailed about new messages.",
      ...(head(a) ? ["The sort button can ask AI to sort the newest parent messages; you still read and reply yourself."] : []),
    ],
    privacy: `Only the people in a conversation see it, apart from safeguarding oversight. ${OVERSIGHT_NOTE}`,
    related: [`/${a}/announcements`, "/report-concern"],
    showMe: [
      { target: "messages-new", label: "New message", say: "Start a conversation here." },
      { target: "messages-search", label: "Search", say: "People, groups and words in messages." },
      { target: "messages-list", label: "Conversations", say: "Every conversation and group, with unread counts." },
    ],
    tasks: ["message a parent", "reply to a parent", "message a colleague", "message a class's parents", "make a group"],
  };
}

export function calendarEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/calendar`,
    name: "Calendar",
    category: "Home",
    purpose: "Term dates, half terms, closures, lessons, homework due dates and events in one calendar.",
    when: "When planning the week or checking a date.",
    steps: [
      "Choose Month, Week or Day agenda.",
      "Press a day to see what is on.",
      head(a) ? "Use the Terms and Dates and overrides sections to add term dates, half terms and closures." : "Press Add to my calendar to subscribe from Google, Outlook or Apple Calendar.",
    ],
    tips: ["Islamic dates are shown alongside each day."],
    privacy: head(a) ? "Term dates and closures you add are shown to everyone in the school." : "Your calendar link shows your own lessons; keep it private. Stop sharing turns it off.",
    related: [`/${a}/dashboard`, `/${a}/announcements`],
    showMe: [
      { target: "calendar-views", label: "Calendar view", say: "Month, week or day." },
      head(a)
        ? { target: "calendar-sections", label: "Calendar sections", say: "Calendar, Dates and overrides, and Terms." }
        : { target: "calendar-subscribe", label: "Add to my calendar", say: "Put the calendar on your phone or Outlook." },
    ],
    tasks: ["see term dates", ...(head(a) ? ["add term dates", "add a closure"] : [])],
  };
}

export function classesEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/classes`,
    name: head(a) ? "Classes" : "My classes",
    category: head(a) ? "Classes and timetable" : "My teaching",
    purpose: head(a) ? "Every class in the school. Open one for its stream, classwork, register and grades." : "Every class you teach or cover. Open one to set work, take the register and enter grades.",
    when: "Whenever you want to work with one class.",
    steps: [
      "Type in Search classes, or sort by class name, subject or year group.",
      "Press a class card to open the class.",
      ...(head(a) ? ["Use Add a class to create a new class (it opens Academic setup, Classes and teachers)."] : ["Use the menu beside the title for the Gradebook or Classwork to action."]),
    ],
    tips: ["Each card shows how much of the latest homework is handed in."],
    privacy: "Teachers see only their own classes; the head teacher and admin see every class.",
    related: [`/${a}/class`, `/${a}/homework`, ...(head(a) ? ["/admin/lessons"] : ["/teach/today"])],
    showMe: [
      { target: "class-search", label: "Search classes", say: "Find a class by name or subject." },
      { target: "class-cards", label: "Class cards", say: "Press a card to open the class." },
    ],
    tasks: ["open a class", ...(head(a) ? ["add a class"] : [])],
  };
}

export function classPageEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/class`,
    name: "A class",
    category: head(a) ? "Classes and timetable" : "My teaching",
    detail: true,
    purpose: "One class: Stream, Classwork, Lessons, People, Attendance, Grades, Insights and Settings.",
    when: "When you set work, take this class's register, look at grades or change the class's Teams link.",
    steps: [
      "Press Set work at the top of the class: the form opens in a panel over the section you are in.",
      "Fill in the title, instructions and due date, then press Assign (or Schedule for later); the panel closes and you are back where you were.",
      "Inside Classwork, Create shows the four kinds as cards: Assignment, Quiz assignment, Question and Material, each with its own form. The chips above the list show one kind at a time, grouped By kind or By topic.",
      "A quiz opens full screen: add questions one at a time from the question-type cards (multiple choice, multiple answer, true or false, short and long answer, matching, ordering, number, label a diagram), set marks, explanations, a time limit and attempts, or press Draft questions from a unit and check each one. Press Set quiz; open it again for Results and to mark long answers.",
      "Open Classwork, then To review, to mark what pupils handed in and press Return to pupil.",
      "The class's sections are listed down the left (on a phone, choose one from Section); open Attendance to take this class's register.",
      "Open Settings to paste the class's Teams meeting link once, then Save link.",
    ],
    tips: ["Work is only set inside a class, or from Set work on Today, where you choose the class.", "Insights shows the class's four figures and the pupils who may need a word: press a name for their record, or a figure for the page behind it."],
    privacy: "Pupils and their parents see the Stream, Classwork, Lessons and their own Grades. Attendance, Insights and Settings are staff only.",
    related: [`/${a}/classes`, `/${a}/homework`, `/${a}/lessons/view`],
    showMe: [
      { target: "class-tabs", label: "Class sections", say: "Stream, Classwork, Lessons, People, Attendance, Grades, Insights and Settings." },
      { target: "class-set-work", label: "Set work", say: "Start a new piece of classwork here: choose Assignment, Quiz assignment, Question or Material." },
      { target: "classwork-kinds", label: "Kinds of classwork", say: "In Classwork: show Assignments, Quizzes, Questions or Materials, grouped by kind or by topic." },
    ],
    tasks: ["set homework", "set classwork", "set a quiz", "build a quiz", "mark work", "add a Teams link"],
  };
}

export function lessonViewEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/lessons/view`,
    name: "A lesson",
    category: head(a) ? "Classes and timetable" : "My teaching",
    detail: true,
    purpose: "One dated lesson: objectives, resources, register and recording.",
    when: "When you open a lesson from a class, the timetable or Today.",
    steps: [
      "Write or check the Objectives (what this lesson will cover).",
      "Press + Add resource link for anything pupils need, then Save.",
      "Take the Register for this lesson.",
      "After the lesson, check the Recording and its consent.",
    ],
    tips: ["Recordings stream in the portal; exporting the raw file is limited to the Headteacher or Admin with Can export data, and is logged."],
    privacy: "Pupils and parents see the objectives, resources and recording. The register is staff only.",
    related: [`/${a}/class`, head(a) ? "/admin/lessons" : "/teach/today"],
    showMe: [
      { target: "lesson-objectives", label: "Objectives", say: "What the lesson covers." },
      { target: "lesson-resources", label: "Resources", say: "Links pupils open from the lesson." },
      { target: "lesson-register", label: "Register", say: "This lesson's register." },
    ],
    tasks: ["add a resource to a lesson"],
  };
}

export function classworkToActionEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/homework`,
    name: "Classwork to action",
    category: head(a) ? "Classes and timetable" : "My teaching",
    purpose: "Work across all classes that needs action: to mark, missing, handed in late and resubmissions.",
    when: "Once a day, to catch anything slipping.",
    steps: [
      "Choose what to show: To mark, Missing, Handed in late or Resubmission asked.",
      "Choose how far back: Last 30 days, Last 90 days or This year.",
      "Press Mark work: the work to mark opens in a panel over this list, and the list updates when you close it.",
      "Press Open classwork to go into that class.",
    ],
    tips: ["New work is set inside a class with Set work, not here."],
    privacy: head(a) ? "You see every class; teachers see only theirs." : "You see only your own classes.",
    related: [`/${a}/class`, ...(head(a) ? [] : ["/teach/review"])],
    showMe: [
      { target: "cta-filter", label: "Show", say: "Pick what needs action." },
      { target: "cta-list", label: "The list", say: "Mark each piece from here, or open the class's classwork." },
    ],
    tasks: ["chase missing homework", "late homework"],
  };
}

export function curriculumMapEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/curriculum/map`,
    name: "Curriculum map",
    category: "Curriculum",
    purpose: "How each year's learning builds across the six half terms, by subject, with how many lessons are approved.",
    when: "To see what is taught when, what a unit builds on and leads to, or to find a unit's lessons.",
    steps: ["Pick a year group.", "Choose One subject (a timeline of the year) or Whole year (every subject by half term).", "Select a unit to see what it covers, what it builds on and leads to.", "Press its lessons or Weekly plan: they open in a panel over the map, and each lesson opens its own page."],
    tips: ["Each unit shows how many of its lessons are approved; the bar fills as they are.", "Years 10 and 11 follow the exam board's three terms."],
    privacy: "Staff only.",
    related: [`/${a}/curriculum`, `/${a}/planner`, `/${a}/syllabus`],
    showMe: [
      { target: "map-view", label: "Show", say: "One subject or the whole year." },
      { target: "map-grid", label: "Units", say: "Each unit by half term; open one for its lessons." },
    ],
    tasks: ["see the scheme of work for a year"],
  };
}

export function libraryEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/curriculum`,
    name: "Browse",
    category: "Curriculum",
    purpose: "The whole curriculum as folders, like a drive: year, subject, unit, then its lessons, resources and weekly plan.",
    when: "To find, present or share a lesson or a resource.",
    steps: [
      "Open a year, then a subject, then a unit; the path at the top takes you back up.",
      "Search, or show Lessons or Resources only; in a unit, filter lessons by review status.",
      "Press anything once to see its details on the right; press Open (or double click) to open it.",
      "A lesson opens on its own page, with slides, plan, resources, sharing and review, and a way back.",
      "In a unit, Unit tools has its specification points, revision pack and pupil results.",
    ],
    tips: ["Switch between grid and list with the buttons on the right of the toolbar.", "Views and tools at the top opens the Curriculum map, Planner, Lesson review, Syllabus and the term resource lists."],
    privacy: "Staff only. Pupils only see what you share to a class and approved revision packs.",
    related: [`/${a}/curriculum/lesson`, `/${a}/curriculum/map`, `/${a}/curriculum/review`],
    showMe: [
      { target: "curriculum-browser", label: "Folders", say: "Years, subjects and units as folders; the path at the top goes back up." },
      { target: "curriculum-browser-filters", label: "Search and filters", say: "Search, lessons or resources only, review status, grid or list." },
      { target: "curriculum-browser-details", label: "Details", say: "What you selected, with its main action." },
    ],
    tasks: ["find a lesson", "make a revision pack"],
  };
}

export function lessonWorkspaceEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/curriculum/lesson`,
    name: "Lesson workspace",
    category: "Curriculum",
    detail: true,
    purpose: "One lesson in the library: slides, plan, pupil copy, objectives, connections, review and versions.",
    when: "To teach from, edit, share or approve one lesson.",
    steps: [
      "Press Present slides to teach from the slides.",
      "Press Edit lesson to change slides or plan in place, then Save.",
      "Use Share to a class (in the menu) to give it to pupils.",
      head(a) ? "In Review and approval, press Start review, then Approve or Request changes, and Publish to classes." : "In Review and approval, press Submit for review when it is ready.",
    ],
    tips: ["Editing an approved lesson sends it back for review automatically.", "Version history keeps every earlier version."],
    privacy: "Staff only, until shared to a class.",
    related: [`/${a}/curriculum`, `/${a}/curriculum/review`],
    showMe: [
      { target: "lesson-materials", label: "Lesson materials", say: "Slides, plan and pupil copy." },
      { target: "lesson-review", label: "Review and approval", say: "Submit, approve or request changes here." },
    ],
    tasks: ["edit a lesson", "plan a lesson", "present slides", ...(head(a) ? ["approve a lesson"] : ["submit a lesson for review"])],
  };
}

export function lessonReviewEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/curriculum/review`,
    name: "Lesson review",
    category: "Curriculum",
    purpose: "Lessons waiting for review, sent back with changes, or approved but not yet published.",
    when: head(a) ? "Weekly, to approve lessons teachers have submitted." : "To see which of your lessons were sent back or approved.",
    steps: [
      "Filter by subject if you need to.",
      "Look under Waiting for review, Changes requested and Approved, not yet published.",
      "Press a lesson: its objectives and review open beside the list, so you can approve, send back or publish without leaving it.",
      "Press Open the lesson in the panel for its slides, plan and versions.",
    ],
    tips: ["Changed after approval marks a lesson edited since it was approved."],
    privacy: "Staff only.",
    related: [`/${a}/curriculum/lesson`, `/${a}/curriculum`],
    showMe: [{ target: "review-queue", label: "Review queue", say: "Each lesson grouped by where it is in review." }],
    tasks: [head(a) ? "approve lessons" : "see lessons sent back"],
  };
}

export function resourcesEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/curriculum/resources`,
    name: "Resources",
    category: "Curriculum",
    purpose: "Each term's printables: worksheets, quizzes, tests, mark schemes and knowledge organisers, in each unit's folder.",
    when: "To download or share a resource for this term.",
    steps: [
      "Resources opens the Curriculum folders showing resources: open a year, subject and unit to see that unit's.",
      "For a whole term's list, use Views and tools, then Resources by term, and filter by Term, Subject, Year, Type or Status.",
      "Press Download pupil copy (PDF), or the Word copy to edit it.",
      "Use Share to a class to put it in a class's classwork.",
    ],
    tips: ["Mark schemes are staff only and never shared to pupils."],
    privacy: "Staff only, until shared to a class.",
    related: [`/${a}/curriculum`, `/${a}/class`],
    showMe: [
      { target: "curriculum-browser", label: "Folders", say: "Each unit's folder holds its resources." },
      { target: "curriculum-browser-details", label: "Details", say: "Preview, download or share the resource you selected." },
    ],
    tasks: ["download a worksheet", "print a quiz"],
  };
}

export function plannerEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/planner`,
    name: "Planner",
    category: "Curriculum",
    purpose: "The long-term and week-by-week plan, unit by unit, for every year and subject.",
    when: "When you change what a unit covers, or plan it week by week.",
    steps: [
      "Choose a year group.",
      "Open a unit to change its title, specification reference, skills and key terms.",
      "Under Week by week, use + Add a week and fill in lessons and vocabulary.",
      "Use + Add unit for a new unit; the arrows move a unit up or down.",
    ],
    tips: ["Changes save for everyone straight away.", "See earlier versions puts back an older copy."],
    privacy: "Staff only.",
    related: [`/${a}/curriculum/map`, `/${a}/syllabus`],
    showMe: [
      { target: "planner-years", label: "Year group", say: "Pick the year to plan." },
      { target: "planner-grid", label: "Units", say: "Open a unit to edit it." },
    ],
    tasks: ["plan a unit", "medium term plan"],
  };
}

export function syllabusEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/syllabus`,
    name: "Syllabus",
    category: "Curriculum",
    purpose: "Schemes of work and exam specifications, subject by subject, with whole-school documents.",
    when: "To check what the specification requires, or download the curriculum overview.",
    steps: ["Choose a subject from the list (a dropdown on phones).", "Switch between Long-term plan, Year by year, Progression and Exams.", "Select a unit: it opens beside the plan, without leaving the page.", "Download the subject or whole-school documents (PDF) if you need them."],
    tips: ["To change a unit, use Edit in the Curriculum planner."],
    privacy: "Staff only.",
    related: [`/${a}/planner`, `/${a}/curriculum`],
    showMe: [{ target: "syllabus-subject", label: "Subject", say: "Choose the subject to read." }],
    tasks: ["read the specification"],
  };
}

export function reportsEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/reports`,
    name: "Term reports",
    category: "Assessment and reports",
    purpose: head(a) ? "Write, approve and issue term reports to families." : "Write term reports for the pupils in your classes.",
    when: "At the end of each term.",
    steps: [
      "Choose the term.",
      "Open a class, then a pupil.",
      "Write your comment (search the comment bank, or Draft with AI and reword it), then Save draft.",
      head(a) ? "Open Approval queue, read each report and press Approve and issue." : "Press Submit for approval when it is ready.",
    ],
    tips: ["What the family will see shows the report exactly as it will be issued.", "A report sent back by the Headteacher shows the reason at the top."],
    privacy: "Families and pupils see a report only once it is issued.",
    related: [head(a) ? "/admin/summary" : "/teach/assessment", `/${a}/revision`],
    showMe: [{ target: "reports-sections", label: "Report sections", say: "Overview, classes and issued reports." }],
    tasks: ["write a report", ...(head(a) ? ["approve reports", "issue reports"] : [])],
  };
}

export function revisionResultsEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/revision`,
    name: "Revision results",
    category: "Assessment and reports",
    purpose: "How pupils did on each unit's revision quiz: average, pupils under 60% and the weakest topic.",
    when: "After a unit, to decide what to reteach.",
    steps: ["Find the unit.", "Read Pupils, Average, Under 60% and Weakest topic.", "Press See results for each pupil."],
    tips: ["Revision packs are built in a unit's Unit tools, under Curriculum, Browse."],
    privacy: "Staff, the pupil and their parents see a pupil's results.",
    related: [`/${a}/curriculum`],
    showMe: [{ target: "revision-overview", label: "Results by unit", say: "One row per unit." }],
    tasks: ["see quiz results"],
  };
}

export function sendEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/send`,
    name: head(a) ? "SEND register" : "Support plans",
    category: "Safeguarding and SEND",
    purpose: "Pupils with SEND: their support plans, adjustments, access arrangements and reviews.",
    when: "Before teaching a new class, before a test, or when a review is due.",
    steps: [
      "Search by name, or Show Current plans, Review due, Drafts or Needs mentioned, no plan.",
      "Open a pupil to read their plan: in lessons, in tests and targets.",
      "Use Pupil profile to see their full record.",
    ],
    tips: ["If you think a pupil needs a plan, talk to the SENCo."],
    privacy: "Staff only, plus the pupil's parents, who see the plan and can comment.",
    related: head(a) ? ["/admin/pupils"] : ["/teach/pupils"],
    showMe: [
      { target: "send-filter", label: "Show", say: "Current plans, reviews due and drafts." },
      { target: "send-list", label: "Register", say: "Open a pupil's plan." },
    ],
    tasks: ["read a support plan", "send register"],
  };
}

export function announcementsEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/announcements`,
    name: "Announcements",
    category: "Communication",
    purpose: head(a) ? "Post notices to the whole school or to one class." : "Read school notices and post notices to the families and pupils in your classes.",
    when: "To share news, dates or reminders.",
    steps: [
      "Press + Post notice.",
      "Write a Title and Message, and choose the Audience.",
      "Tick Pin to top for something important, and add an expiry date if it has one.",
      "Check the Preview and post.",
    ],
    tips: ["Edit or Delete a notice from its card.", ...(head(a) ? [] : ["Only the head teacher and admin can post to the whole school."])],
    privacy: "Everyone in the audience sees the notice.",
    related: [`/${a}/messages`, ...(head(a) ? ["/admin/digest"] : [])],
    showMe: [
      { target: "notices-post", label: "Post notice", say: "Write a new notice here." },
      { target: "notices-list", label: "Notices", say: "Pinned first, then newest." },
    ],
    tasks: ["post a notice", "announce something"],
  };
}

export function handbookEntry(a: Area): GuideEntry {
  return {
    href: `/${a}/handbook`,
    name: "Staff handbook",
    category: head(a) ? "Staff" : "My staff area",
    purpose: "The staff handbook PDF, all policies, and short how-tos for the portal.",
    when: "When you need a policy or forget how something works.",
    steps: ["Press Download PDF for the full handbook.", "Press All policies for the policy list.", "Read the how-tos below, such as clocking in and missing homework."],
    tips: ["The PDF is the full version and the policies are the authority."],
    privacy: "Staff only.",
    related: ["/report-concern"],
    showMe: [{ target: "handbook-pdf", label: "Download PDF", say: "The full handbook." }],
    tasks: ["read a policy", "staff handbook"],
  };
}
