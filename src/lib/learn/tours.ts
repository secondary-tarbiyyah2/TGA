// The guided tours (T38, owner: "add a really good tour ... very concise and
// useful"). One short tour per role, shown once on first sign-in and
// relaunchable from the menu ("Take the tour") or search; plus two or three
// tips on the few pages that are genuinely complex. Each step is one sentence
// and points at the real thing on screen. Pure data, so nav.test.ts style
// checks can run on it (tours.test.ts).

/** Same as PortalArea in nav.ts (kept here so this file has no imports and runs in node tests). */
type PortalArea = "admin" | "teach" | "family" | "student";
// A type only (erased when run), so the file still needs nothing at run time.
import type { FeatureKey } from "./features";

export type TourStep = {
  /** CSS selectors for what to highlight; the first one visible on screen wins.
   * None visible (or none given): the step shows in the middle of the screen. */
  target?: string[];
  title: string;
  body: string;
  /** Text for phones and small tablets, where the menu sits behind "Menu". */
  phoneBody?: string;
  /** Leave the step out on phones (it points at something only the desktop menu has). */
  desktopOnly?: boolean;
  /** Left out while the Headteacher has this School feature switched off. */
  feature?: FeatureKey;
};

export type Tour = { key: string; steps: TourStep[] };

/** Bump when a tour changes enough that everyone should see it again. */
const VERSION = "v1";

const menuLink = (href: string) => `[data-tour=menu] a[href*="${href}"]`;
const tabLink = (href: string) => `[data-tour=tabbar] a[href*="${href}"]`;

const CATEGORIES: TourStep = {
  target: ["[data-tour=categories]", "[data-tour=menu-button]"],
  title: "Everything grouped by job",
  body: "Pages are grouped by job, such as Attendance and behaviour: open a category to see its pages.",
  phoneBody: "Press Menu to see every page, grouped by job.",
};
const PINNED: TourStep = {
  target: ["[data-tour=pinned]"],
  title: "Pin your shortcuts",
  body: "Point at any page in the menu and press the pin to keep it here, on every device.",
  desktopOnly: true,
};
const SEARCH: TourStep = {
  target: ["[data-tour=search]"],
  title: "Search for anything",
  body: "Type a page, a name or a job, such as “take a register”, and press Enter (Ctrl K opens it from anywhere).",
  phoneBody: "Type a page, a name or a job, such as “take a register”, to go straight there.",
};
const CONCERN: TourStep = {
  target: ["[data-tour=concern]"],
  title: "Report a concern",
  body: "Worried about a child’s safety or wellbeing? This button is on every page and goes straight to the safeguarding team.",
};
const HELP: TourStep = {
  target: ["[data-tour=help]", "[data-tour=menu-button]"],
  title: "Your Portal guide",
  body: "Open the Portal guide at the foot of the menu to take this tour again, follow a day in the life or read any page.",
  phoneBody: "Open the Portal guide from Menu to take this tour again, follow a day in the life or read any page.",
};

function isHead(roles: string[]) {
  return roles.some((r) => r === "head_teacher" || r === "admin");
}
function isSencoOnly(roles: string[]) {
  return roles.includes("senco") && !roles.some((r) => ["head_teacher", "admin", "admissions", "teacher", "teaching_assistant_cover"].includes(r));
}

function isDigitalLeadOnly(roles: string[]) {
  return roles.includes("digital_lead") && !roles.some((r) => ["head_teacher", "admin", "admissions"].includes(r));
}

/** The tour for this person in this area. */
export function tourFor(area: PortalArea, roles: string[]): Tour {
  const key = `${area}:${VERSION}`;
  if (area === "admin") {
    // A Digital Lead on their own has one page here, the Audit log.
    if (isDigitalLeadOnly(roles)) return { key, steps: [CATEGORIES, PINNED, SEARCH, CONCERN, HELP] };
    const head = isHead(roles);
    return {
      key,
      steps: [
        CATEGORIES,
        PINNED,
        SEARCH,
        ...(head
          ? [
              {
                target: [menuLink("/admin/actions"), tabLink("/admin/dashboard")],
                title: "Waiting for you",
                body: "Everything that needs a decision is listed here, most urgent first.",
                phoneBody: "Today shows what needs you; the full list is in Menu, under Waiting for you.",
              },
            ]
          : []),
        {
          target: ["[data-tour=notifications]"],
          title: "Notifications",
          body: "The bell tells you about new applications, payments and alerts as they arrive.",
        },
        {
          target: ['[data-tour-cat="Pupils and admissions"]', tabLink("/admin/pupils")],
          title: "Pupil records",
          body: "All pupils, under Pupils and admissions, opens each pupil’s full record.",
          phoneBody: "Pupils opens each pupil’s full record.",
        },
        CONCERN,
        HELP,
      ],
    };
  }
  if (area === "teach") {
    if (isSencoOnly(roles)) return { key, steps: [CATEGORIES, PINNED, SEARCH, CONCERN, HELP] };
    return {
      key,
      steps: [
        CATEGORIES,
        {
          target: ['[data-tour-cat="My teaching"]', tabLink("/teach/classes")],
          title: "Your teaching",
          body: "My teaching holds your classes, today’s registers and the work waiting to be marked.",
          phoneBody: "Classes opens each class: its register, classwork, grades and pupils.",
        },
        {
          target: [menuLink("/teach/actions"), tabLink("/teach/review")],
          title: "Waiting for you",
          body: "Registers, marking and replies that need you are listed here, most urgent first.",
          phoneBody: "To mark lists the work handed in and waiting for you.",
        },
        PINNED,
        SEARCH,
        CONCERN,
        HELP,
      ],
    };
  }
  if (area === "family") {
    return {
      key,
      steps: [
        {
          target: [menuLink("/family/dashboard"), tabLink("/family/dashboard")],
          title: "Today",
          body: "Today shows your children’s lessons, homework and anything waiting for you.",
        },
        {
          target: [menuLink("/family/todo"), tabLink("/family/todo")],
          title: "Homework",
          body: "Homework shows what is due, missing and handed in for each child.",
        },
        {
          target: [menuLink("/family/messages"), tabLink("/family/messages")],
          title: "Messages",
          body: "Message your children’s teachers or the school office here.",
        },
        {
          target: [menuLink("/family/classes"), tabLink("/family/classes")],
          title: "My children",
          body: "Report an absence, see timetables and update medical or contact details under My children.",
        },
        SEARCH,
        CONCERN,
        HELP,
      ],
    };
  }
  return {
    key,
    steps: [
      {
        target: [menuLink("/student/dashboard"), tabLink("/student/dashboard")],
        title: "Today",
        body: "Today shows your lessons and what is due.",
      },
      {
        target: [menuLink("/student/todo"), tabLink("/student/todo")],
        title: "Homework",
        body: "Homework lists what to hand in and when it is due.",
      },
      {
        target: [menuLink("/student/classes"), tabLink("/student/classes")],
        title: "My classes",
        body: "Each class has its lessons, classwork and the Join button for live lessons.",
      },
      {
        target: [menuLink("/student/revision"), tabLink("/student/revision")],
        feature: "revision_packs",
        title: "Revise",
        body: "Revise has a quiz for every unit you have studied, so you can test yourself.",
      },
      SEARCH,
      HELP,
    ],
  };
}

/** Two or three tips on the pages that are genuinely complex. */
export const PAGE_TIPS: Record<"lesson-editor" | "planner", Tour> = {
  "lesson-editor": {
    key: `tip:lesson-editor:${VERSION}`,
    steps: [
      { target: ["[data-tour=studio-views]"], title: "Slides or plan", body: "Switch between the slides and the lesson plan here." },
      { target: ["[data-tour=studio-preview]"], title: "Edit in place", body: "Click any text on a slide to change it; Enter adds a bullet point." },
      { target: ["[data-tour=studio-save]", "[data-tour=studio-pdf]"], title: "Save", body: "Save, and the slides, lesson plan and PDF are rebuilt for download in about two minutes." },
    ],
  },
  planner: {
    key: `tip:planner:${VERSION}`,
    steps: [
      { target: ["[data-tour=planner-years]"], title: "Pick a year", body: "Choose a year group: each row is a subject and each column a half term.", phoneBody: "Choose a year group to see each subject\u2019s units, half term by half term." },
      { target: ["[data-tour=planner-grid] > ul > li", "[data-tour=planner-grid]"], title: "Open a unit", body: "Open a unit to change what it covers or plan it week by week; the arrows move it up or down." },
      { target: ["[data-tour=planner-status]"], title: "Saved for everyone", body: "Changes save for everyone straight away and are copied to the syllabus pack and slides." },
    ],
  },
};

/** Ask the shell to run a tour now (the "Take the tour" button, search, page tips). */
export const START_TOUR_EVENT = "tga:start-tour";
export function startTour(tour?: Tour) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(START_TOUR_EVENT, { detail: tour || null }));
}
