// Key stage pages. Subjects, live lessons per week and lesson length are
// taken from the Curriculum Policy (policy 12, 2026–27, section 4); the
// four-day week and hours from the Flexible Learning Policy (21). If the
// policy changes, change this file to match.

export type KeyStage = {
  slug: string;
  range: string;
  title: string;
  subjects: string[];
  liveSplit: string;
  /** Live lessons a week by subject (Curriculum Policy table). */
  weekly: { subject: string; lessons: number | string }[];
  lessonLength: string;
  totalLessons: string;
  note?: string;
  gcseNote?: string;
};

export const SCHOOL_WEEK_NOTE =
  "Live teaching runs 09:00–15:00 UK time, Monday to Friday. Form time, assemblies and clubs are in addition to these lessons. Classes have no more than 15 pupils. Families in other time zones can ask about the Academy's flexible learning options.";

export const keyStages: KeyStage[] = [
  {
    slug: "reception-year-2",
    range: "Year 1 – Year 2",
    title: "Key Stage 1",
    subjects: [
      "Phonics and early reading (a systematic synthetic phonics programme)",
      "English",
      "Mathematics and number",
      "Understanding the world and science",
      "Qur'an, du'a and Islamic manners",
      "Arabic and Islamic Studies",
      "PSHE, PE, art and wellbeing",
    ],
    liveSplit:
      "Short, engaging live sessions focused on phonics, early reading and number, with Qur'an, du'a and Islamic manners. Much of the learning is practical and done away from the screen with a parent, following guidance sent home each week.",
    weekly: [
      { subject: "English and phonics", lessons: 5 },
      { subject: "Mathematics", lessons: 4 },
      { subject: "Understanding the world", lessons: 1 },
      { subject: "Qur'an and Tajweed", lessons: 3 },
      { subject: "Arabic and Islamic Studies", lessons: 1 },
      { subject: "PSHE, RSE, PE, art and wellbeing", lessons: 1 },
    ],
    lessonLength: "30 minutes",
    totalLessons: "15 live lessons a week (Years 1–2)",
    note: "Years 1–2 have short daily live sessions (about 2 hours a day) with guided activities at home. A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is also available for Year 1 to Year 9.",
  },
  {
    slug: "year-3-6",
    range: "Year 3 – Year 6",
    title: "Key Stage 2",
    subjects: ["English", "Mathematics", "Science", "History", "Geography", "Computing", "Art and design", "PE (at home)", "PSHE and RSE", "Qur'an and Tajweed", "Arabic", "Islamic Studies"],
    liveSplit: "A full live timetable taught by qualified teachers, with homework and independent tasks set and marked between lessons.",
    weekly: [
      { subject: "English", lessons: 5 },
      { subject: "Mathematics", lessons: 5 },
      { subject: "Science", lessons: 2 },
      { subject: "History, geography and computing", lessons: 2 },
      { subject: "Qur'an and Tajweed", lessons: 2 },
      { subject: "Arabic and Islamic Studies", lessons: 2 },
      { subject: "PSHE, RSE, PE, art and wellbeing", lessons: 2 },
    ],
    lessonLength: "45 minutes",
    totalLessons: "20 live lessons a week",
    note: "A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is available for Year 1 to Year 9.",
  },
  {
    slug: "year-7-9",
    range: "Year 7 – Year 9",
    title: "Key Stage 3",
    subjects: [
      "English",
      "Mathematics",
      "Science (biology, chemistry and physics)",
      "History",
      "Geography",
      "Computing",
      "Arabic",
      "Art and design",
      "PE and wellbeing",
      "PSHE and RSE",
      "Qur'an",
      "Islamic Studies",
    ],
    liveSplit: "Live subject lessons across the week, building the independent study habits pupils need ahead of GCSE.",
    weekly: [
      { subject: "English", lessons: 4 },
      { subject: "Mathematics", lessons: 4 },
      { subject: "Science", lessons: 4 },
      { subject: "History, geography and computing", lessons: 3 },
      { subject: "Qur'an and Tajweed", lessons: 3 },
      { subject: "Arabic and Islamic Studies", lessons: 4 },
      { subject: "PSHE, RSE, PE, art and wellbeing", lessons: 3 },
    ],
    lessonLength: "50 minutes",
    totalLessons: "25 live lessons a week",
    note: "A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is available for Year 1 to Year 9.",
  },
  {
    slug: "year-10-11",
    range: "Year 10 – Year 11",
    title: "Key Stage 4 (GCSE)",
    subjects: [
      "GCSE or International GCSE English Language",
      "English Literature",
      "Mathematics",
      "Combined or separate sciences",
      "Islamic Studies",
      "Two options, for example history, geography, computer science, business or Arabic",
      "Qur'an and Tajweed",
    ],
    liveSplit:
      "Live GCSE and International GCSE lessons in every subject. Subjects are chosen so they suit online learners sitting exams as private candidates, for example without practical components that need a centre.",
    weekly: [
      { subject: "English", lessons: 5 },
      { subject: "Mathematics", lessons: 5 },
      { subject: "Sciences", lessons: 5 },
      { subject: "Two GCSE options", lessons: 4 },
      { subject: "Qur'an and Tajweed", lessons: 2 },
      { subject: "Arabic and Islamic Studies", lessons: 2 },
      { subject: "PSHE, RSE, PE and wellbeing", lessons: 2 },
    ],
    lessonLength: "50 minutes",
    totalLessons: "25 live lessons a week",
    note: "Years 10 and 11 follow the full live timetable, because GCSE courses need it.",
    gcseNote: "Exam entry fees are not included in tuition: families register their child at an approved exam centre and pay the centre's charges.",
  },
];
