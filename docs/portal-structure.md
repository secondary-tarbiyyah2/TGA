# Portal structure (third pass, owner feedback 11 Nov 2026)

Owner, 11 Nov 2026: "I don't like the fact that options are on top and across (Curriculum etc). Also some buttons,
when I press, for example Set homework, take me to a separate page. I hate the pages themselves." Then (08:34): "the
functionality of the pages themselves isn't good, there is no structure, the UI is the problem; use Figma community
'education portal' designs for inspiration."

This file is the structural brief for the third pass. `DESIGN.md` ("Portal design system") still sets the look
(ivory canvas, stone sidebar, forest green for action and location, antique gold only as a marker, Inter, hairlines,
one status language). This file sets **how pages are put together**. `docs/portal-redesign.md` keeps the status log.

## What we looked at (11 Nov 2026)

Figma community pages cannot be fetched by a tool, and Dribbble shot pages came back empty, so these were read through
publicly viewable case studies and template pages, looking at the screenshots themselves:

- ClassSync school management dashboard (Contra): teacher dashboard, Create homework, Students record, Add student.
  https://contra.com/p/XMc23RUl-class-sync-school-management-dashboard-design-uiux
- School Management Platform UI/UX (Contra, "Vision & Community"): dashboard, Students, Classes, Settings.
  https://contra.com/p/LZYOW3Eo-school-management-platform-uiux-design
- Student Portal Dashboard, Secondary School (Behance case study, text only).
  https://www.behance.net/gallery/128456961/Student-Portal-Dashboard-Secondary-School
- Skuma school management dashboard (Medium; module list only, images not served).
  https://medium.com/@sahidaldis.design/skuma-school-management-dashboard-dd4c4a51f877
- Lollypop, "Figma education templates for app design" (structural advice for student and teacher dashboards).
  https://lollypop.design/blog/2025/july/figma-education-templates-for-app-design-workflows-ui-kits-pro-tips/
- SkillSphere LMS template (shadcn studio): course listing and detail structure.
  https://shadcnstudio.com/templates/skillsphere-lms-template
- Product patterns we already know well and borrow structure from: Linear (list with a detail pane, command bar,
  create in a dialog that never leaves the list), Attio and Notion (records open in a side peek; inline editing of a
  field), Google Classroom and Teams for Education (a class is one place with sections).

**What the good ones share, and what to avoid.**
- Good: one persistent left menu with nested items for a section's pages (ClassSync's "Records and Enrollment"
  opens to Student records, Teacher records, Class management); a page header that is just a title, one sentence and
  the page's one primary action on the right ("Add student", "Create class"); one filter bar above a list (status
  segments, search, Filter, primary action); tables with a row menu; a dashboard of a few purposeful modules (today's
  schedule, work to mark, messages) rather than a wall of cards.
- Avoid: ClassSync's "Create homework" and "Add student" are full pages with a back arrow, which is exactly what the
  owner dislikes; four identical stat tiles with "+3.2%" chips (decoration, not information); coloured icon tiles on
  every row; status pills in five colours.

## The patterns TGA adopts

### 1. One menu, nested; no strip of tabs across the top
The sidebar is the only navigation between sibling pages. A category opens to its pages; a page with its own steps
(Timetable, Academic setup) lists them one level further in while you are on it. Families and pupils: an entry with
several pages (Messages: Inbox, Announcements) shows them under it while you are in it. Phones: the same tree in the
drawer. The collapsed rail opens the menu at a category instead of guessing a page.
Applies to: every portal page (the old `HubTabs` and `SubPageNav` strips are gone).

```
+-----------------+-----------------------------------------------+
| Today           |  CURRICULUM                                   |
| Waiting for you |  Curriculum map                  [ Planner ]  |
| Messages        |  How each year builds across six half terms.  |
| CATEGORIES      |  --------------------------------------------- |
| v Curriculum    |  [Year 7 v] [English v]   One subject | Year   |
|   | Map  <      |                                               |
|   | Library     |   Aut1   Aut2   Spr1   Spr2   Sum1   Sum2      |
|   | Review      |   [..]   [..]   [..]   [..]   [..]   [..]      |
|   | Resources   |                                               |
|   | Planner     |                                               |
|   | Syllabus    |                                               |
| > My teaching   |                                               |
+-----------------+-----------------------------------------------+
```

### 2. A compact page header: where, what, one action
Eyebrow (the category, small capitals), the title, one sentence, the one primary action on the right and a "more"
menu for the rest. Deeper pages (a class, a pupil, a lesson) carry a breadcrumb; phones show one back link.
Applies to: every page (`PageHeader`, `WorkspaceHeader`).

### 3. Create and edit in a panel over the page, never a separate page
Every "Set homework", "Add pupil", "New message", "Log behaviour", "Record absence", "Assign cover", "Share to class"
opens a right-side panel (a bottom sheet on phones) or, for short confirmations, a dialog, over the page you are on.
It reuses the existing form, keeps its validation and permissions, and closing it puts you back exactly where you
were, with the list refreshed. An old address that used to open the form (for example `?tab=classwork` from "Set
work", or a pupil's `&edit=details`) opens the same panel over its parent page.
Applies to: class work, registers, pupils, messages, behaviour, absences and cover, curriculum sharing.

```
+-----------------+---------------------------------+--------------------+
| menu            |  7A English            [Set work]| New assignment   x |
|                 |  Overview Classwork Register ... | Title  [........] |
|                 |  -------------------------------| Due    [12 Nov  ] |
|                 |  Due this week                  | Topic  [Poetry v ]|
|                 |   Poetry essay      12 to mark  | For    (o) Class  |
|                 |   Vocab quiz        3 missing   | ...               |
|                 |                                 | [Cancel] [Set it] |
+-----------------+---------------------------------+--------------------+
```

### 4. List and detail: pick a row, its detail opens beside the list
Lists stay where they are; the record opens in a side panel (Attio, Linear). The panel has the record's key facts,
its next actions and a link to the full record only when there is a lot more to see. Arrow keys or Previous / Next in
the panel move through the list without closing it.
Applies to: Pupils (list + pupil profile panel), Lesson review queue, Waiting for you (each item's detail and its
action), Messages (thread list + conversation), Classwork to action, Applications.

```
+-----------------+--------------------------+-------------------------+
| menu            |  PUPILS                  | Aisha Khan        x     |
|                 |  All pupils   [Add pupil]| Year 7 . 7A, 7B         |
|                 |  [Search....] [Year v]   | Attendance 96%          |
|                 |  -------------------------| Support plan: yes       |
|                 |  > Aisha Khan   Y7  96%  | Contacts  ...           |
|                 |    Bilal Ahmed  Y8  91%  | [Message parent] [Edit] |
|                 |    Fatima Noor  Y7  99%  | Open full record ->     |
+-----------------+--------------------------+-------------------------+
```

### 5. A class is one workspace with sections, not a set of pages
A class page has one header (name, subject, year, Join on Teams, Set work, a menu) and its sections in a left-aligned
section list (Overview, Classwork, Lessons, Register, Pupils, Grades, Insights, Settings). Setting work, taking the
register and marking all happen inside it, in panels. Families and pupils see the same structure with fewer sections.
Applies to: `/teach/class`, `/admin/class`, `/family/class`, `/student/class`.

### 6. Dashboards built from a few purposeful modules
"Today" is a working page, not a showroom: your day (lessons with register status and Join), what is waiting for you
(to mark, registers not taken, messages), and a short list of what is coming up. No percentage chips, no tile of
counts that leads nowhere: a figure is shown only where it is a link to the list behind it.
Applies to: teacher Today, head teacher Today, family and pupil Today.

```
+-----------------+-------------------------------------------------+
| menu            |  Good morning, Yusuf                            |
|                 |  Your day                        Waiting for you |
|                 |  09:00 7A English  Register v    12 to mark   > |
|                 |  10:00 8B English  [Take]        2 registers  > |
|                 |  13:30 9C English  [Join]        3 messages   > |
|                 |  Coming up: Poetry essay due Thu (7A)            |
+-----------------+-------------------------------------------------+
```

### 7. One filter bar above every list
Left: the list's segments as a quiet switch (All, Approved, In review...), then search, then dropdown filters. Right:
the count and the list's one action. The same bar everywhere (Library, Review, Pupils, Classwork to action).

### 8. Command bar and pins for the rest
Anything not on screen is one Ctrl K away (pages, pupils, classes, lessons and jobs such as "take a register"), and
staff can pin any page to the top of the menu. This is how deep pages stay reachable without more menus.

### 9. Empty states that teach the next step
An empty list says what goes there and offers the one action that fills it ("No work set yet. Set work"), opening the
same panel as pattern 3.

## Order of work (third pass)
1. Navigation: no strips across the top; nested sidebar; compact header (pattern 1, 2).
2. Actions in place: the shared panel and every action converted (pattern 3, 9).
3. My teaching: teacher Today (6), class workspace (5), marking and registers in panels.
4. Curriculum: map, library, planner, review, resources and syllabus as one structure (1, 4, 7).
5. Pupils list and profile panel (4); head teacher Today (6); Messages and Waiting for you (4).
6. Parent and pupil home (6).
