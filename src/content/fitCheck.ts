/**
 * Every word of the public "Is it right for us?" check (/eligibility) lives
 * here, so the copy can be changed without touching the component
 * (src/components/eligibility/FitCheck.tsx) or the verdict logic
 * (src/lib/fitCheck.ts).
 *
 * Ground rules for anything added here: only published facts (the school
 * day, the curriculum tables in src/content/curriculum.ts, the fee bands and
 * the admissions dates), no accreditation or ratings claims, UK English, no
 * em dashes, and the check must stay honest: it tells a family when the
 * Academy may not be the right fit yet.
 *
 * Option `value`s are read by the verdict logic, so change labels freely but
 * keep the values as they are.
 */

export type ChoiceOption = { value: string; label: string; detail?: string };

export const FIT_CHECK = {
  meta: {
    title: "Is it right for us?",
    description:
      "An honest two-minute check for families considering Tarbiyyah Global Academy: your child's live school day in your time zone, what you would need at home, what it costs and the real next steps.",
  },

  intro: {
    kicker: "Is it right for us?",
    title: "An honest answer on whether TGA would suit your family.",
    body: "Eight short questions, about two minutes. At the end you get a straight answer with the reasons, your child's school day in your own time zone, what you would need at home, what it would cost and the real next steps.",
    gets: [
      "A clear verdict, with reasons",
      "The live school day in your time",
      "Fees for your family",
      "Dates and next steps",
    ],
    privacy: "No account and no obligation. Your answers stay on this page unless you ask us to email the summary.",
    startLabel: "Check if it's right for us",
    minutes: "About 2 minutes",
  },

  nav: {
    back: "Back",
    continue: "Continue",
    seeResult: "See our answer",
    questionOf: (n: number, total: number) => `Question ${n} of ${total}`,
    keyboardHint: "Keyboard: press 1 to 9 to choose, Enter to continue.",
  },

  yearGroups: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11"],

  questions: {
    children: {
      title: "Which year group is your child in?",
      subtitle: "Choose the year group they will be in from January 2027. You can add brothers and sisters too.",
      addChild: "Add another child",
      removeChild: "Remove",
      maxChildren: 6,
      childLabel: (i: number) => (i === 0 ? "Your child" : i === 1 ? "Second child" : i === 2 ? "Third child" : `Child ${i + 1}`),
    },
    location: {
      title: "Where will you be learning from?",
      subtitle: "Live lessons run on UK time. Choose your country and we will show when the school day falls for you.",
      selectLabel: "Your country",
      previewTitle: "Your child's live school day would be",
      monThu: "Monday to Thursday",
      fri: "Friday",
      nextDay: "next day",
      prevDay: "previous day",
      ukLabel: (start: string, end: string) => `${start} to ${end} UK time`,
      tone: {
        good: "Within normal school hours where you are.",
        edge: "Workable, with an early start or a late finish.",
        late: "Outside the hours most children learn well. We would want to talk this through.",
      },
    },
    reason: {
      title: "Why are you considering an online school?",
      subtitle: "There is no wrong answer. It helps us point you to the right things.",
      options: [
        { value: "homeschooling", label: "We already home educate", detail: "Looking for live teaching and structure alongside what we do at home." },
        { value: "leaving", label: "We are leaving a school", detail: "The current school is not working for our child." },
        { value: "abroad", label: "We live abroad without a suitable school", detail: "We want a British curriculum with Islamic education wherever we are." },
        { value: "islamic", label: "We want Islamic and academic education together", detail: "Qur'an, Arabic and Islamic Studies on the same timetable as English and Maths." },
        { value: "other", label: "Something else", detail: "Health, travel, or another reason." },
      ] satisfies ChoiceOption[],
    },
    priorities: {
      title: "What matters most to you?",
      subtitle: "Pick up to three.",
      max: 3,
      chosen: (n: number, max: number) => `${n} of ${max} chosen`,
      options: [
        { value: "quran", label: "Qur'an and hifdh" },
        { value: "arabic", label: "Arabic" },
        { value: "academics", label: "Strong academics and GCSEs" },
        { value: "environment", label: "An Islamic environment" },
        { value: "small", label: "Small classes" },
        { value: "flexibility", label: "Flexibility" },
        { value: "send", label: "SEND support" },
      ] satisfies ChoiceOption[],
    },
    setup: {
      title: "Do you have a quiet space and a laptop or tablet with a camera?",
      subtitle: "Every live lesson needs a camera and microphone, and somewhere your child can concentrate.",
      options: [
        { value: "yes", label: "Yes, both are ready", detail: "A quiet spot and a device with a working camera and microphone." },
        { value: "arrange", label: "We can arrange it", detail: "Not set up yet, but we can have it ready by January." },
        { value: "no", label: "Not yet", detail: "We would need to sort this out first." },
      ] satisfies ChoiceOption[],
    },
    adult: {
      title: "Will an adult be nearby during lessons?",
      subtitle: "For children in Years 1 to 6. Younger children settle best in live lessons with someone close by, and in Years 1 and 2 much of the learning happens away from the screen with a parent.",
      options: [
        { value: "usually", label: "Usually", detail: "Someone is nearby for most lessons." },
        { value: "sometimes", label: "Sometimes", detail: "It depends on the day." },
        { value: "rarely", label: "Rarely", detail: "Our child would mostly be learning on their own." },
      ] satisfies ChoiceOption[],
    },
    needs: {
      title: "Does your child have any additional needs?",
      subtitle: "This is only so we can be honest with you about what we can offer.",
      options: [
        { value: "none", label: "None that we know of" },
        { value: "some", label: "Some support needed", detail: "For example dyslexia, attention difficulties, anxiety, or catching up in reading, maths or Qur'an." },
        { value: "significant", label: "Significant needs", detail: "An EHCP or equivalent, or a child who needs an adult with them to learn." },
      ] satisfies ChoiceOption[],
      noteLabel: "Anything you would like us to know (optional)",
      notePlaceholder: "A sentence or two is plenty. It is only sent to us if you email yourself the summary.",
    },
    start: {
      title: "When would you like to start?",
      options: [
        { value: "january", label: "January 2027, the founding cohort", detail: "Induction 4 to 8 January, first live lessons on Monday 11 January 2027." },
        { value: "later", label: "Later in 2027 or beyond", detail: "Interested, but not for January." },
        { value: "exploring", label: "We are just exploring", detail: "Finding out what an online school would be like." },
      ] satisfies ChoiceOption[],
    },
  },

  verdicts: {
    strong: {
      label: "A strong fit",
      heading: "From what you have told us, TGA looks like a strong fit.",
      body: "Nothing in your answers gives us a reason to hesitate. Below is what the school day, the cost and the next steps would look like for your family.",
    },
    sort: {
      label: "A good fit, with a few things to sort out",
      heading: "TGA looks like a good fit, with a few things to sort out first.",
      body: "Most of what you have told us fits well. There are one or two practical points we would want settled before your child starts. None of them rules the Academy out.",
    },
    talk: {
      label: "Let's talk first",
      heading: "We would like to talk with you before you apply.",
      body: "To be honest with you, one or more of your answers means TGA may not be the right fit yet, or would only work with a plan we agree together. A free call with admissions is the fair next step, and we will tell you plainly if we think another option would serve your child better.",
    },
  },

  /** Reasons shown under the verdict. Tones: good (a reason it fits), info (worth knowing), sort (verdict at most "a few things to sort out"), talk (verdict "Let's talk first"). */
  reasons: {
    reasonsTitle: "Why we say this",
    timezoneGood: (localStart: string, localEnd: string) =>
      `Live lessons would run from ${localStart} to ${localEnd} where you are, a normal school day.`,
    timezoneEdge: (localStart: string, localEnd: string) =>
      `Live lessons would run from ${localStart} to ${localEnd} where you are. That is workable, but early starts or late finishes can wear on a child over a term, so think about how it would feel every day.`,
    timezoneLate: (localStart: string, localEnd: string) =>
      `Live lessons would run from ${localStart} to ${localEnd} where you are. That is outside the hours most children learn well, and it is the first thing we would want to talk through. Families in other time zones can ask about the Academy's flexible learning options, but we cannot promise they will suit every year group.`,
    setupReady: "You already have the quiet space and the device with a camera that live lessons need.",
    arrangeDevice: "You will need the quiet space and the device with a camera ready for induction week, 4 to 8 January 2027.",
    noDevice:
      "Your child will need a laptop or tablet with a working camera and microphone, and a quiet place to learn. This is straightforward to put right, but it does need to be in place before induction week.",
    primaryAdult: "An adult is usually nearby, which is what children in Years 1 to 6 need to settle into live lessons.",
    primarySometimesAdult:
      "Children in Years 1 to 6 settle best with an adult nearby. If that is only sometimes possible, plan who will be around on the other days before January.",
    primaryNoAdult:
      "A child in Years 1 to 6 needs an adult nearby during live lessons, and in Years 1 and 2 much of the learning is done away from the screen with a parent. If that is rarely possible, we would want to understand your situation before offering a place.",
    someNeeds:
      "Tell us about the support your child needs when you apply. We draw up an individual support plan with you, reviewed regularly, and we will say clearly if there is something we cannot provide.",
    significantNeeds:
      "We provide individual support plans, adjustments in lessons and access arrangements in assessments, but we cannot offer in-person help such as an adult in the room. For a child with significant needs we want to be honest about whether a live online school can meet them, so a conversation first is the right step.",
    year11January:
      "Joining Year 11 in January 2027 means starting partway through the GCSE courses. We would want to look at what your child has already covered before advising you.",
    priorities: (labels: string) => `You told us what matters most: ${labels}. Below is honestly what we offer for each.`,
    laterStart:
      "You are not looking at January 2027, so there is no deadline pressure. Register your interest and we will let you know when places for a later start open.",
    exploring: "You are still exploring, which is exactly what the open evenings are for.",
  },

  sections: {
    day: {
      title: "Your child's day",
      lead: (zone: string) => `Live lessons in ${zone} time, with UK time alongside.`,
      yourTime: "Your time",
      ukTime: "UK time",
      monThu: "Monday to Thursday",
      fri: "Friday",
      stripLabel: "Your 24 hours",
      stripLive: "Live lessons",
      stripComfort: "Usual waking school hours (07:00 to 21:00)",
      summerChange: (start: string, end: string) => `When the clocks change in spring, this becomes ${start} to ${end} for you.`,
      fridayNote: "Friday afternoons are free for Jumu'ah.",
      classSize: "Classes have no more than 15 pupils.",
      ks1Note: "Years 1 and 2 have short daily live sessions, about 1.5 hours a day, with guided activities at home.",
      childLine: (year: string, stage: string) => `${year}, ${stage}`,
      curriculumLink: "See the curriculum",
      curriculumHref: "/curriculum",
    },
    need: {
      title: "What you would need",
      statusReady: "Ready",
      statusArrange: "To arrange",
      statusMissing: "Not yet",
      statusCheck: "To plan",
      items: {
        device: "A laptop or tablet with a camera and microphone, and a reliable internet connection",
        space: "A quiet place where your child can learn without interruption",
        writing:
          "A tablet with a stylus, so your child can write on worksheets and the lesson PDF each day (recommended: any tablet that takes a stylus, or a basic graphics tablet that plugs into the laptop). Without one, a printer at home is required",
        adult: "An adult nearby during live lessons (Years 1 to 6)",
        ks1Parent: "Time for a parent to guide the away-from-screen activities sent home each week (Years 1 and 2)",
        exams: "An exam centre for GCSE and International GCSE exams (Years 10 and 11): pupils in the UK sit them at Tarbiyyah Secondary School as their exam centre, and families outside the UK get help finding and registering with an approved centre nearby",
        support: "Details of any support your child already receives, so we can draw up a support plan together",
      },
    },
    cost: {
      title: "What it would cost",
      period: "January to July 2027",
      perChildTitle: "Tuition",
      siblingRow: "Sibling discount",
      plansTitle: "Ways to pay",
      annual: "In one payment",
      annualNote: (pct: number) => `Includes ${pct}% off for paying in full by 8 January 2027`,
      twoPayments: "In two payments",
      twoPaymentsNote: "8 January and 28 March 2027",
      monthly: "Monthly",
      monthlyNote: (n: number) => `${n} payments from 8 January 2027`,
      applicationFee: (fee: string, n: number) =>
        n > 1 ? `Application fee ${fee} per child, paid once you apply. There is no registration fee.` : `Application fee ${fee}, paid once you apply. There is no registration fee.`,
      siblingLine: (pct: number) => `The sibling discount (${pct}% off the second child) is included above.`,
      siblingFallback: "A sibling discount applies to younger brothers and sisters. The exact amount is on the Fees page.",
      examNote: "GCSE and International GCSE exam entry fees are not included in tuition.",
      link: "See all fees and payment dates",
      href: "/fees",
    },
    offer: {
      title: "What we offer for what matters to you",
      items: {
        quran: { label: "Qur'an and hifdh", body: "Qur'an and Tajweed are on the timetable every week in every year group, in groups set by ability. Hifdh is not compulsory: every pupil memorises at a pace agreed with you, and a full hifdh track is available if you want it to be central." },
        arabic: { label: "Arabic", body: "Arabic is taught as a language from Year 1: reading, writing, speaking and grammar. In Years 10 and 11 it is a GCSE option, taught from the same Pearson Edexcel course as Tarbiyyah Secondary School." },
        academics: { label: "Strong academics and GCSEs", body: "The full national curriculum taught live by qualified teachers, leading in Years 10 and 11 to the same GCSE and International GCSE courses as Tarbiyyah Secondary School, where UK pupils sit their exams." },
        environment: { label: "An Islamic environment", body: "Qur'an, Arabic and Islamic Studies are timetabled lessons at every key stage, with du'a and Islamic manners through the week. Friday afternoons are free for Jumu'ah, and from Year 7 puberty and its fiqh are taught to boys and girls separately." },
        small: { label: "Small classes", body: "No class has more than 15 pupils, so every child is seen and heard in every live lesson." },
        flexibility: { label: "Flexibility", body: "A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is available for Years 1 to 9. Years 10 and 11 follow the full live timetable, because GCSE courses need it." },
        send: { label: "SEND support", body: "An individual support plan reviewed regularly with you, adjustments in lessons, and extra time or a reader or scribe in assessments where your child needs them. We cannot provide in-person help such as an adult in the room." },
      },
      noneChosen: "You did not pick anything in particular, so here is what every family gets.",
      defaults: ["quran", "academics", "small"],
      honest: {
        title: "And, to be clear",
        items: [
          "PSHE is taught in every year group. There is no RSE.",
          "PE is not offered.",
          "History is not offered at GCSE.",
          "This is a live online school: your child learns from home, and you stay responsible for their day-to-day supervision and wellbeing.",
        ],
      },
    },
    next: {
      title: "Next steps",
      datesTitle: "Dates for the founding cohort",
      dates: [
        { label: "Open evening (online)", when: "Thursday 26 November 2026, 7:30pm UK", href: "/open-evening" },
        { label: "Open evening (online)", when: "Sunday 6 December 2026, 4pm UK", href: "/open-evening" },
        { label: "Taster morning (online)", when: "Saturday 12 December 2026", href: "/open-evening" },
        { label: "Applications close", when: "Friday 18 December 2026", href: "/admissions/apply" },
        { label: "Induction week", when: "4 to 8 January 2027", href: "/term-dates" },
        { label: "First live lessons", when: "Monday 11 January 2027", href: "/term-dates" },
      ],
      steps: {
        strongJanuary: "Come to an open evening if you can, then apply online by Friday 18 December 2026. The application takes about ten minutes.",
        sortJanuary: "Sort out the points above, come to an open evening, and apply by Friday 18 December 2026. If anything is uncertain, book a free call first.",
        talk: "Book a free 20-minute call with admissions. We will go through your answers with you and say honestly what we can and cannot offer your child.",
        later: "Register your interest so we can tell you when places for a later start open, and come to an open evening to see a live lesson in the meantime.",
        exploring: "An open evening is the easiest way to see a live lesson and the parent portal, with no commitment. You are welcome to book a call too.",
      },
      buttons: {
        call: "Book a free call",
        openEvening: "Come to an open evening",
        apply: "Apply online",
        register: "Register interest",
      },
      hrefs: {
        call: "/book-a-call",
        openEvening: "/open-evening",
        apply: "/admissions/apply",
        register: "/contact",
      },
      callNotes: (summary: string) => `From "Is it right for us?": ${summary}`,
    },
    email: {
      title: "Email me this summary",
      body: "Get the times, fees and dates in your inbox, so you have them to hand.",
      nameLabel: "Your name (optional)",
      emailLabel: "Email",
      consent: "Email me this summary and keep me updated about open evenings and admissions. I can unsubscribe at any time.",
      privacy: "We only use your email for this summary and admissions updates, and never share it. Read our",
      privacyLink: "privacy policy",
      privacyHref: "/legal/privacy",
      submit: "Send my summary",
      sending: "Sending",
      sent: (email: string) => `Sent. Check ${email} in a few minutes.`,
      error: "Something went wrong. Please try again, or book a call instead.",
      consentError: "Please tick the box so we can email your summary.",
      emailError: "Please enter a valid email address.",
    },
    startAgain: "Start again",
    changeAnswers: "Change my answers",
    disclaimer:
      "A summary based on your answers, not an offer of a place. Fees are the published founding-cohort fees for January to July 2027. Everything else is confirmed with you during admissions.",
  },
} as const;

export type FitCheckConfig = typeof FIT_CHECK;
