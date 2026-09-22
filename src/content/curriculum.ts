export type KeyStage = {
  slug: string;
  range: string;
  title: string;
  subjects: string[];
  liveSplit: string;
  sampleWeek: { day: string; focus: string }[];
  gcseNote?: string;
};

export const keyStages: KeyStage[] = [
  {
    slug: "reception-year-2",
    range: "Reception – Year 2",
    title: "Early Years & Key Stage 1",
    subjects: ["English (phonics & reading)", "Mathematics", "Science", "Islamic Studies", "Qur'an & Hifz", "Arabic", "PSHE & Creative Time"],
    liveSplit: "Mostly live, short, teacher-led sessions with high interaction, balanced with guided independent activities and parent-supported play-based learning.",
    sampleWeek: [
      { day: "Monday", focus: "English + Qur'an" },
      { day: "Tuesday", focus: "Maths + Islamic Studies" },
      { day: "Wednesday", focus: "Science + Arabic" },
      { day: "Thursday", focus: "English + Creative Time" },
      { day: "Friday", focus: "Review + independent activities" },
    ],
  },
  {
    slug: "year-3-6",
    range: "Year 3 – Year 6",
    title: "Key Stage 2",
    subjects: ["English", "Mathematics", "Science", "Islamic Studies", "Qur'an & Hifz", "Arabic", "Humanities", "PE & Wellbeing"],
    liveSplit: "A majority live-lesson timetable with structured independent work set and marked between sessions.",
    sampleWeek: [
      { day: "Monday", focus: "English + Maths" },
      { day: "Tuesday", focus: "Science + Qur'an" },
      { day: "Wednesday", focus: "Humanities + Arabic" },
      { day: "Thursday", focus: "Islamic Studies + Maths" },
      { day: "Friday", focus: "PE/Wellbeing + independent work" },
    ],
  },
  {
    slug: "year-7-9",
    range: "Year 7 – Year 9",
    title: "Key Stage 3",
    subjects: ["English", "Mathematics", "Science", "Islamic Studies", "Qur'an & Hifz", "Arabic", "Humanities", "Computing", "PE & Wellbeing"],
    liveSplit: "Live subject lessons across the week with growing independent study skills built in ahead of GCSE.",
    sampleWeek: [
      { day: "Monday", focus: "English + Science" },
      { day: "Tuesday", focus: "Maths + Qur'an" },
      { day: "Wednesday", focus: "Humanities + Computing" },
      { day: "Thursday", focus: "Islamic Studies + Arabic" },
      { day: "Friday", focus: "Science + independent study" },
    ],
  },
  {
    slug: "year-10-11",
    range: "Year 10 – Year 11",
    title: "Key Stage 4 (GCSE)",
    subjects: ["English Language & Literature", "Mathematics", "Sciences", "Islamic Studies", "Qur'an & Hifz", "Options subjects", "Arabic"],
    liveSplit: "Live GCSE-specification lessons per subject, with independent revision time built into the timetable ahead of exams.",
    sampleWeek: [
      { day: "Monday", focus: "English + Maths" },
      { day: "Tuesday", focus: "Sciences + Qur'an" },
      { day: "Wednesday", focus: "Options subjects" },
      { day: "Thursday", focus: "Islamic Studies + Maths" },
      { day: "Friday", focus: "Sciences + independent revision" },
    ],
    gcseNote: "GCSE exam entry fees are billed separately by the exam centre and are not included in tuition fees.",
  },
];
