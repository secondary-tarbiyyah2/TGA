// "A day in the life": guided journeys that walk across the real pages in
// order, pointing at the real buttons. Each step goes to `href` and
// spotlights `target` (a data-guide value). A step with `from` reaches a page
// that needs a record (one class, one lesson): the guide follows the first
// link inside that target on the step before, so it opens a real class.
import type { Journey, GuideRole } from "./types";

export const JOURNEYS: Record<GuideRole, Journey[]> = {
  teacher: [
    {
      id: "teacher-day",
      title: "A day of teaching",
      summary: "Plan a lesson, teach it live on Teams, take the register, set and mark work, log behaviour and write a report.",
      steps: [
        { href: "/teach/dashboard", target: "teach-your-day", title: "Start with Your day", body: "Today lists your lessons in order, each with Start on Teams and its register." },
        { href: "/teach/curriculum", target: "library-filters", title: "Plan: find the lesson", body: "In the Lesson library, choose the subject and year you are teaching." },
        { href: "/teach/curriculum", target: "library-units", title: "Open the lesson", body: "Pick the unit, then press Open lesson for its slides, plan and Present slides." },
        { href: "/teach/curriculum/review", target: "review-queue", title: "Edit, then send for review", body: "On a lesson's own page, Edit lesson changes the slides or plan and Submit for review sends it to the head teacher. This list shows where each lesson is." },
        { href: "/teach/today", target: "today-lessons", title: "Teach it live", body: "When the lesson is due, press Join to start it on Teams." },
        { href: "/teach/today", target: "register", title: "Take the register", body: "Tap Present, Late, Absent or Excused for each pupil; each mark saves straight away." },
        { href: "/teach/classes", target: "class-cards", title: "Open the class", body: "Classwork is set inside the class. Press a class card." },
        { href: "/teach/class", from: "class-cards", target: "class-set-work", title: "Set work", body: "Press Set work, choose the Assignment card, add the task and due date, then Assign." },
        { href: "/teach/review", target: "mark-queue", title: "Mark it", body: "Handed-in work waits here. Press Mark, give feedback and press Return to pupil." },
        { href: "/teach/behaviour", target: "behaviour-quick", title: "Log behaviour", body: "Press + Merit beside a pupil, or + Log merit or demerit for more detail." },
        { href: "/teach/reports", target: "reports-sections", title: "Write a report", body: "At the end of term, open a class and a pupil, write the comment and Submit for approval." },
      ],
    },
  ],
  head: [
    {
      id: "head-morning",
      title: "The morning check",
      summary: "Today and the Action centre, admissions, safeguarding, registers, staff cover and policies.",
      steps: [
        { href: "/admin/dashboard", target: "admin-stats", title: "Today's figures", body: "Lessons today, things needing attention, lessons to approve and curriculum progress." },
        { href: "/admin/dashboard", target: "admin-lessons-today", title: "Registers", body: "Any lesson showing Register missing needs chasing." },
        { href: "/admin/actions", target: "waiting-list", title: "Waiting for you", body: "The Action centre: work down Do now, then This week. Press a line to see it and act on it beside the list." },
        { href: "/admin/admissions", target: "admissions-list", title: "Admissions", body: "New applications arrive here. Move each one on with the arrows." },
        { href: "/admin/compliance", target: "safeguarding-summary", title: "Safeguarding", body: "Critical and high alerts first: acknowledge, act, then resolve with what was done." },
        { href: "/admin/message-oversight", target: "oversight-list", title: "Flagged messages", body: "Read any flagged conversation; opening one is recorded in the audit log." },
        { href: "/admin/attendance", target: "registers-day", title: "Missing registers", body: "Tick Only show registers still to take and take any that were missed." },
        { href: "/admin/absences", target: "absences-tabs", title: "Absences and cover", body: "Follow up unexplained absences, and under Staff cover record a staff absence and assign cover." },
        { href: "/admin/curriculum/review", target: "review-queue", title: "Lessons to approve", body: "Open each lesson waiting for review and Approve or Request changes." },
        { href: "/admin/documents", target: "documents-new", title: "Policies", body: "Check who still has to sign, or add a new document to sign." },
      ],
    },
  ],
  admissions: [
    {
      id: "admissions-day",
      title: "An admissions day",
      summary: "New applications, calls, entry assessments, open evenings and new family accounts.",
      steps: [
        { href: "/admin/dashboard", target: "admissions-shortcuts", title: "Your shortcuts", body: "Your four everyday pages are here." },
        { href: "/admin/admissions", target: "admissions-list", title: "New applications", body: "Search, then move each application on with the arrows." },
        { href: "/admin/admissions", target: "admissions-tabs", title: "Calls and bookings", body: "Set your weekly availability and Teams link so families can book a call." },
        { href: "/admin/assessments", target: "assessments-new", title: "Entry assessment", body: "Press New assessment, set any access arrangements and send the link." },
        { href: "/admin/open-evening", target: "open-evening-new", title: "Open evenings", body: "Add an evening and it appears on the website with its own booking form." },
        { href: "/admin/people", target: "people-add", title: "New family", body: "When a place is accepted, press Add person to give the family a sign-in." },
        { href: "/admin/compliance", target: "safeguarding-summary", title: "Alerts", body: "Check any alerts you can see before you finish." },
      ],
    },
  ],
  senco: [
    {
      id: "senco-day",
      title: "A SENCo's day",
      summary: "Reviews due, drafts, pupils with needs but no plan, concerns and the handbook.",
      steps: [
        { href: "/teach/send", target: "send-filter", title: "Reviews due", body: "Show Review due to see which plans need reviewing first." },
        { href: "/teach/send", target: "send-list", title: "Open a plan", body: "Open a pupil to read and update their plan." },
        { href: "/teach/send", target: "send-filter", title: "Needs, no plan", body: "Show Needs mentioned, no plan to find pupils who may need one." },
        { href: "/report-concern", target: "concern-form", title: "A worry", body: "Anything about a child's safety goes to the safeguarding team here." },
        { href: "/teach/handbook", target: "handbook-pdf", title: "Policies", body: "The full handbook and every policy are here." },
        { href: "/teach/send", target: "guide-button", title: "Help on any page", body: "Press Guide me (or the ? key) on any page for its own guide." },
      ],
    },
  ],
  parent: [
    {
      id: "parent-week",
      title: "A week as a parent",
      summary: "Check today, homework, messages, fees and report an absence.",
      steps: [
        { href: "/family/dashboard", target: "family-child-switch", title: "Whose day", body: "With more than one child, switch between them here." },
        { href: "/family/dashboard", target: "waiting-widget", title: "What needs you", body: "Forms to sign, payments and replies are listed here." },
        { href: "/family/todo", target: "homework-status", title: "Homework", body: "Check Assigned and Missing for each child." },
        { href: "/family/todo", target: "homework-list", title: "Open a piece", body: "Open a piece of homework to see the task, hand it in or read feedback." },
        { href: "/family/messages", target: "messages-new", title: "Message a teacher", body: "Press New message, choose the teacher and write." },
        { href: "/family/fees", target: "fees-figures", title: "Fees", body: "Charged, paid and what is due. Payments show once the office records them." },
        { href: "/family/absences", target: "absence-form", title: "Report an absence", body: "Who is away, when and why, then Send. It takes a minute." },
        { href: "/family/child-details", target: "child-details-sections", title: "Keep details up to date", body: "Home, health, emergency contacts and consents." },
        { href: "/family/calendar", target: "calendar-subscribe", title: "Dates on your phone", body: "Add to my calendar keeps term dates and lessons on your phone." },
      ],
    },
  ],
  pupil: [
    {
      id: "pupil-day",
      title: "My school day",
      summary: "Join a lesson, do your homework, revise and see your progress.",
      steps: [
        { href: "/student/dashboard", target: "join-lesson", title: "Join your lesson", body: "When a lesson is about to start, press Join lesson here." },
        { href: "/student/dashboard", target: "pupil-timetable", title: "Your week", body: "Your timetable shows every lesson this week." },
        { href: "/student/todo", target: "homework-status", title: "Your homework", body: "Assigned is what to do. Missing is late work." },
        { href: "/student/todo", target: "homework-list", title: "Hand it in", body: "Open a piece of homework, add your work and press Hand in." },
        { href: "/student/classes", target: "class-cards", title: "Your classes", body: "Press a class to open it." },
        { href: "/student/class", from: "class-cards", target: "class-tabs", title: "Inside a class", body: "Lessons, classwork and your grades for this class." },
        { href: "/student/revision", target: "revision-subjects", title: "Revise", body: "Pick a subject, then a unit." },
        { href: "/student/revision", target: "revision-steps", title: "Test yourself", body: "Read the summary, take the quiz, then practise what you found hard." },
        { href: "/student/behaviour", target: "merit-stats", title: "Your merits", body: "See the merits and badges you have earned." },
      ],
    },
  ],
};
