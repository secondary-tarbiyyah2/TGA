# COMPLETE UI/UX REDESIGN — TARBIYYAH GLOBAL ACADEMY

I want you to undertake a substantial redesign of the Tarbiyyah Global Academy platform.

I have attached a screenshot of the current interface, specifically the Curriculum Map page. I am extremely dissatisfied with the current appearance. It looks generic, basic, unfinished and very much like a standard school administration dashboard.

I do NOT want superficial styling changes. I want you to rethink the visual design, layout, information hierarchy, navigation, component styling and overall user experience.

Your job is to make this platform feel like a professionally designed, premium educational technology product.

**Most importantly: inspect the existing codebase, understand how everything works, and then implement the redesign directly. Do not just give me recommendations, mockups or a list of proposed changes.**

---

# 1. THE DESIGN VISION

I want Tarbiyyah Global Academy to have a distinctive visual identity.

The platform should feel:

- Premium and sophisticated.
- Modern, clean and exceptionally well organised.
- Calm, welcoming and professional.
- Purpose-built for an educational institution rather than a generic corporate SaaS product.
- Thoughtful and consistent across every page.
- Visually interesting without becoming distracting.
- Efficient for teachers who use it regularly throughout the day.

Think of the quality of products such as Linear, Notion, Stripe, Attio and carefully designed modern education platforms.

I am not asking you to copy any of these products. I want you to take inspiration from their design maturity, attention to detail, spacing, typography, navigation and interaction patterns.

The interface must have its own identity.

**Avoid the typical AI-generated dashboard aesthetic.** I do not want endless rounded white cards, random coloured badges, excessive icons, gradient backgrounds, oversized headings or decorative elements that serve no purpose.

I want a restrained, sophisticated design system.

# 2. VISUAL IDENTITY AND DESIGN LANGUAGE

Use the existing Tarbiyyah Global Academy branding as the foundation.

### Colour palette

Develop a consistent palette built around:

- Deep forest green as the primary brand colour.
- Rich, muted green for secondary emphasis.
- Warm ivory / off-white for the overall application background.
- Soft stone and warm grey for secondary surfaces.
- Muted champagne / antique gold for subtle accents.
- Dark charcoal for primary text.
- Soft grey-green for secondary text and icons.

The current green-and-gold identity should be retained, but implemented with much greater sophistication.

Do not make the entire interface green. Use green strategically for important navigation states, primary actions, selected elements and meaningful indicators.

Gold should be an accent, not a dominant colour.

Avoid:
- Bright saturated greens.
- Excessive beige.
- Generic blue SaaS colour schemes.
- Unnecessary gradients.
- Heavy shadows.
- Excessive borders.
- Too many competing accent colours.

### Typography

Typography needs significant improvement.

Establish a deliberate hierarchy between:

- Page titles.
- Section headings.
- Card titles.
- Body text.
- Supporting descriptions.
- Metadata.
- Navigation labels.
- Small contextual information.

Use a modern, highly legible typeface. Consider Inter, Geist or a similarly refined sans-serif.

Avoid making everything the same size and weight.

Page headings should be confident but not enormous. Body text should be comfortable to read. Secondary information should remain legible rather than appearing washed out.

### Spacing

The current interface has a particularly poor use of space.

There are enormous areas of unnecessary whitespace, while other elements feel cramped.

Establish a consistent spacing system.

Every element should have a reason for its positioning. Improve alignment, grouping, density and proportions.

Do not simply increase padding everywhere. The objective is to make the interface feel balanced and intentional.

# 3. REDESIGN THE ENTIRE APPLICATION SHELL

The current sidebar and top navigation need a complete rethink.

## Left sidebar

The current sidebar looks outdated and consumes space without making navigation particularly intuitive.

Create a refined, collapsible sidebar.

Requirements:

- Properly structured navigation groups.
- Clear distinction between group headings and individual navigation items.
- Consistent icon sizing and alignment.
- A subtle but unmistakable active navigation state.
- Smooth and restrained hover interactions.
- Logical indentation for nested pages.
- Appropriate spacing between navigation groups.
- Unobtrusive notification indicators.
- A properly designed collapsed state with tooltips.
- Smooth expansion and collapse behaviour.

Review the existing navigation structure and preserve all existing destinations.

The navigation should be organised logically around the teacher's workflow.

For example, the existing sections include:

**Home**
- Today
- Waiting for you
- Messages
- Calendar

**My teaching**
- My classes
- Lessons and registers
- To mark
- Classwork to action

**Pupils**
- My pupils
- Qur'an and Qaidah

**Curriculum**
- Curriculum map
- Lesson library
- Lesson review
- Resources
- Planner
- Syllabus

These are examples based on the existing interface. Inspect the actual application and preserve its complete navigation structure.

Do not remove functionality simply to make the sidebar cleaner.

## Sidebar footer

The current profile section at the bottom feels very basic.

Redesign it to include:
- A refined profile/avatar treatment.
- Staff member's name.
- Role.
- An accessible account/settings menu.
- A clear logout action.

Keep it compact and properly aligned.

## Top navigation

Redesign the top bar.

The current search bar and collection of pill-shaped buttons feel generic.

Create a more cohesive top navigation containing:

- A prominent but proportionate global search.
- Keyboard shortcut indication.
- Relevant contextual actions.
- Clock-in functionality.
- Display/accessibility controls.
- Feedback.
- Safeguarding/report-a-concern functionality.

Important: safeguarding and reporting concerns must remain easily accessible and visually distinguishable. Do not bury them inside menus.

The top navigation should feel integrated with the rest of the interface rather than like a collection of unrelated buttons.

# 4. REDESIGN THE CURRICULUM SECTION

This is particularly important.

The attached screenshot shows the current Curriculum Map page.

I dislike almost everything about its presentation.

The page currently contains:
- A horizontal navigation bar.
- Breadcrumbs.
- An oversized page heading.
- A year-group dropdown.
- A One subject / Whole year toggle.
- A large content container with what appears to be loading placeholders.

The result is extremely basic and doesn't communicate the purpose of the feature particularly well.

I want this to become a genuinely excellent curriculum-planning interface.

## A. Curriculum navigation

The existing curriculum pages are:

- Curriculum map
- Lesson library
- Lesson review
- Resources
- Planner
- Syllabus

Instead of the current oversized pill-shaped segmented navigation, develop a more elegant secondary navigation system.

It should:
- Clearly communicate the relationship between curriculum tools.
- Have a refined active state.
- Use consistent icons.
- Avoid excessive background fills and rounded containers.
- Work responsively.
- Maintain clear visual hierarchy beneath the main application navigation.

## B. Curriculum Map page header

Redesign the header completely.

The page should have:

A clear title: Curriculum map.

A concise supporting description explaining what the page does.

A sensible year-group selector.

An intuitive way to switch between viewing one subject and the whole year.

The controls should feel like part of the interface rather than separate floating elements.

Avoid wasting a large amount of vertical space on the header.

## C. The actual curriculum map

This is the most important component.

I want the curriculum map to look like an actual curriculum map, not a generic list of rectangular loading placeholders.

The academic structure follows six half-terms.

The design should communicate how learning develops throughout the academic year.

Explore a sophisticated visual representation of the six half-terms:

- Autumn 1
- Autumn 2
- Spring 1
- Spring 2
- Summer 1
- Summer 2

Consider a horizontal timeline, structured curriculum grid, interconnected learning progression or another appropriate visual system.

The six half-terms should be immediately understandable.

When viewing an individual subject, make it easy to see:
- The unit or topic being taught.
- The half-term it belongs to.
- Key learning objectives.
- The progression of learning.
- Links to relevant lessons or resources, where supported by the existing data.

When viewing the whole year, the interface should communicate the relationship between subjects and their respective units across all six half-terms.

Do not overload the user with information.

Use progressive disclosure: show the important information first and allow teachers to explore more detail when needed.

### Important design consideration

Do not assume the curriculum data structure.

Inspect the existing data models, API responses, database schema and components before making changes.

Use the actual available curriculum information.

If certain information does not exist, do not fabricate it.

Design appropriate empty, loading and error states.

Loading placeholders should never look like the permanent page layout.

# 5. COMPONENT DESIGN SYSTEM

Do not independently style every page.

Develop a coherent design system that can be reused throughout the application.

Standardise the following:

### Buttons
- Primary buttons.
- Secondary buttons.
- Tertiary/ghost buttons.
- Destructive actions.
- Icon-only buttons.

### Inputs
- Search fields.
- Dropdowns.
- Selectors.
- Text fields.
- Date selectors.
- Filters.

### Navigation
- Primary sidebar.
- Nested navigation.
- Secondary tabs.
- Breadcrumbs.

### Content components
- Cards.
- Tables.
- Lists.
- Curriculum units.
- Empty states.
- Loading states.
- Notifications.
- Dialogs.
- Popovers.

### Status indicators
Use a restrained and consistent visual language for:
- Pending.
- Completed.
- In progress.
- Needs attention.
- Overdue.
- Approved.
- Unavailable.

Do not make every status a brightly coloured badge.

Use colour only where it communicates something meaningful.

# 6. INTERACTION AND MICRO-INTERACTIONS

The application should feel responsive and polished.

Introduce subtle interactions throughout:

- Smooth sidebar transitions.
- Refined hover states.
- Clear focus indicators.
- Subtle button feedback.
- Smooth tab transitions.
- Well-designed dropdown interactions.
- Appropriate loading feedback.
- Thoughtful empty states.
- Clear success and error feedback.

Animations should be restrained and purposeful.

Avoid excessive movement, bouncing, elaborate transitions or anything that makes the interface feel like a marketing website.

Accessibility matters.

Ensure keyboard navigation, visible focus states, readable contrast and appropriate accessible labels.

Respect reduced-motion preferences.

# 7. RESPONSIVENESS

The current interface appears designed primarily for desktop.

Make sure the redesigned system works properly across:

- Large desktop monitors.
- Standard laptop screens.
- Tablets.
- Mobile devices.

The sidebar should adapt appropriately.

The curriculum map should remain usable on smaller screens. Do not simply shrink a six-column curriculum grid until it becomes unreadable.

Consider horizontal scrolling, responsive stacking or an alternative mobile presentation where appropriate.

# 8. IMPORTANT: PRESERVE THE EXISTING APPLICATION

This is a redesign, not an opportunity to break the platform.

Before changing anything:

1. Inspect the complete project structure.
2. Identify the frontend framework and existing styling system.
3. Understand the routing and navigation.
4. Identify reusable components.
5. Inspect the current Curriculum Map implementation.
6. Understand how curriculum data is retrieved and displayed.
7. Identify existing interactions and functionality.

Then implement the redesign using the existing architecture wherever sensible.

**Preserve:**
- Existing functionality.
- Routes and navigation destinations.
- Database relationships.
- API integrations.
- Authentication.
- User permissions.
- Existing business logic.
- Existing data.
- Staff workflows.

Do not replace working functionality with decorative mockups.

Do not introduce unnecessary dependencies.

Do not create duplicate components when existing ones can be improved.

Do not hardcode information that should come from the database.

Do not remove features simply because they are difficult to accommodate visually.

# 9. QUALITY CONTROL

After implementing the redesign, inspect the actual rendered interface.

Do not assume that code which compiles automatically looks good.

Check:

- Alignment.
- Spacing.
- Typography.
- Component proportions.
- Visual hierarchy.
- Overflow.
- Responsive behaviour.
- Contrast.
- Loading states.
- Empty states.
- Hover states.
- Active states.
- Dropdown behaviour.
- Sidebar behaviour.

Look for anything that still feels generic, cramped, unfinished or visually inconsistent.

Make another refinement pass.

I want the finished product to look deliberately designed, not like a template assembled from default component-library elements.

# 10. HOW I WANT YOU TO APPROACH THIS

Work in the following order:

**Phase 1 — Audit**

Inspect the existing application and identify the main design problems and architectural constraints.

**Phase 2 — Design direction**

Establish the new visual language, typography, colour tokens, spacing system, component conventions and application layout.

**Phase 3 — Application shell**

Redesign the sidebar, top navigation, profile area and overall page layout.

**Phase 4 — Curriculum experience**

Completely redesign the curriculum navigation and Curriculum Map page, including the actual six-half-term visualisation.

**Phase 5 — Consistency**

Apply the new design language to existing shared components and relevant curriculum pages.

**Phase 6 — Testing and refinement**

Test the implementation and make the necessary visual and functional corrections.

Do not stop after Phase 1 and give me a report. Continue through implementation.

---

# FINAL DESIGN DIRECTION

I want something that feels like a premium, established educational platform.

Imagine opening the application and immediately feeling that every detail has been considered.

The interface should be:
- Elegant without being overly decorative.
- Information-rich without being cluttered.
- Minimal without feeling empty.
- Professional without feeling corporate.
- Distinctive without being unconventional.
- Consistent without becoming monotonous.

**My biggest criticism of the current design is that it looks like a basic admin template with a green colour scheme. I want you to get away from that entirely.**

Be ambitious with the redesign. Make meaningful layout and structural improvements rather than playing it safe with minor CSS adjustments.

Use your design judgement, inspect the actual application, and implement the best solution.

The final result should look and feel like a product that a professional product-design team has spent considerable time refining.
---

Owner addition (10 Nov 2026, 20:36): the Syllabus pages are annoying because they send you to different pages. Change it entirely: one page, everything reachable in place.

---

Owner feedback (11 Nov 2026, 08:28), screenshot docs/owner-briefs/2026-11-11-curriculum-map-feedback.png:
"I don't like the fact that options are on top and across (Curriculum etc). Also some buttons, when I press, for
example Set homework, take me to a separate page. I hate the pages themselves."
Meaning: (1) remove the horizontal secondary tab strips (Curriculum map / Lesson library / ... across the top; the
sidebar already lists these, so the strip duplicates it); (2) actions open in place (side panel / sheet / dialog) on
the page you are on, never a separate page; (3) rethink the pages so you rarely leave where you are.
