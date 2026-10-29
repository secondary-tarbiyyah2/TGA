// Key stage pages. Subjects and exam boards follow the portal (the lesson
// library in content/lessons and the specifications in content/syllabus/ks4,
// which the school treats as the source of truth for what is taught). Live
// lessons per week and lesson length are taken from the Curriculum Policy
// (policy 12, 2026–27, section 4); the four-day week and hours from the
// Flexible Learning Policy (21). If either changes, change this file (and the
// key_stage_pages rows, editable at /learn/admin/content) to match.
// PSHE: every year group has PSHE only, with no RSE (owner decision, 26 Oct
// 2026; migration 0153 updates the DB copies). Puberty and its fiqh (bulugh)
// are taught from Year 7, to boys and girls separately.
// Lessons a week must fit the school day: lessons 1-3 run Monday to Friday
// and lessons 4-5 Monday to Thursday, so a full live week has 23 slots
// (migration 0150). PE is not offered (owner decision, 26 October 2026).

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
  "Live teaching runs 09:00–15:00 UK time Monday to Thursday and 09:00–12:00 on Fridays (the afternoon is free for Jumu'ah). Form time, assemblies and clubs are in addition to these lessons. Classes have no more than 15 pupils. Families in other time zones can ask about the Academy's flexible learning options.";

export const keyStages: KeyStage[] = [
  {
    slug: "year-1-2",
    range: "Year 1 – Year 2",
    title: "Key Stage 1",
    subjects: [
      "English, with systematic synthetic phonics and early reading",
      "Mathematics",
      "Science",
      "History",
      "Geography",
      "Computing",
      "Art and design",
      "PSHE",
      "Qur'an and Tajweed",
      "Arabic",
      "Islamic Studies, including du'a and Islamic manners",
    ],
    liveSplit:
      "Short, engaging 30-minute live lessons across the full curriculum, with a strong focus on phonics, early reading and number, alongside Qur'an, du'a and Islamic manners. Much of the learning is practical and done away from the screen with a parent, following guidance sent home each week, including art.",
    weekly: [
      { subject: "English and phonics", lessons: 5 },
      { subject: "Mathematics", lessons: 4 },
      { subject: "Science, history, geography, computing, art and design", lessons: 1 },
      { subject: "Qur'an and Tajweed", lessons: 3 },
      { subject: "Arabic and Islamic Studies", lessons: 1 },
      { subject: "PSHE", lessons: 1 },
    ],
    lessonLength: "30 minutes",
    totalLessons: "15 live lessons a week (Years 1–2)",
    note: "Years 1–2 have short daily live sessions (about 1.5 hours a day) with guided activities at home. A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is also available for Year 1 to Year 9.",
  },
  {
    slug: "year-3-6",
    range: "Year 3 – Year 6",
    title: "Key Stage 2",
    subjects: ["English", "Mathematics", "Science", "History", "Geography", "Computing", "Art and design", "PSHE", "Qur'an and Tajweed", "Arabic", "Islamic Studies"],
    liveSplit: "A full live timetable taught by qualified teachers, with homework and independent tasks set and marked between lessons.",
    weekly: [
      { subject: "English", lessons: 5 },
      { subject: "Mathematics", lessons: 5 },
      { subject: "Science", lessons: 2 },
      { subject: "History, geography and computing", lessons: 2 },
      { subject: "Qur'an and Tajweed", lessons: 2 },
      { subject: "Arabic and Islamic Studies", lessons: 2 },
      { subject: "PSHE", lessons: 1 },
      { subject: "Art and design", lessons: 1 },
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
      "PSHE",
      "Qur'an and Tajweed",
      "Islamic Studies",
    ],
    liveSplit: "Live subject lessons across the week, building the independent study habits pupils need ahead of GCSE.",
    weekly: [
      { subject: "English", lessons: 4 },
      { subject: "Mathematics", lessons: 4 },
      { subject: "Science", lessons: 3 },
      { subject: "History, geography and computing", lessons: 3 },
      { subject: "Qur'an and Tajweed", lessons: 3 },
      { subject: "Arabic and Islamic Studies", lessons: 4 },
      { subject: "PSHE", lessons: 1 },
      { subject: "Art and design", lessons: 1 },
    ],
    lessonLength: "50 minutes",
    totalLessons: "23 live lessons a week",
    note: "A four-day live week (Monday to Thursday, with Friday as a structured independent study day) is available for Year 1 to Year 9.",
  },
  {
    slug: "year-10-11",
    range: "Year 10 – Year 11",
    title: "Key Stage 4 (International GCSE)",
    subjects: [
      "English Language (International GCSE 4EB1, taught from the AQA GCSE course)",
      "English Literature (International GCSE 4ET1)",
      "Mathematics (International GCSE 4MA1, taught from the Pearson Edexcel GCSE course)",
      "Combined (Double Award 4SD0) or separate sciences: Biology 4BI1, Chemistry 4CH1 and Physics 4PH1 (International GCSE)",
      "Islamic Studies (International GCSE 4IS1)",
      "Two options from Geography (International GCSE 4GE1, taught from the AQA GCSE course), Computer Science (International GCSE 4CP0, taught from the Pearson Edexcel GCSE course), Business (International GCSE 4BS1) and Arabic (International GCSE Arabic as a first language 4AA1, taught from the Pearson Edexcel GCSE course)",
      "Qur'an and Tajweed",
      "PSHE",
    ],
    liveSplit:
      "Live lessons in every subject, leading to Pearson Edexcel International GCSEs. Subjects are chosen so they suit online learners sitting exams as private candidates, for example without coursework that a centre must supervise.",
    weekly: [
      { subject: "English Language and Literature", lessons: 5 },
      { subject: "Mathematics", lessons: 4 },
      { subject: "Sciences", lessons: 5 },
      { subject: "Two International GCSE options", lessons: 4 },
      { subject: "Islamic Studies (International GCSE)", lessons: 2 },
      { subject: "Qur'an and Tajweed", lessons: 2 },
      { subject: "PSHE", lessons: 1 },
    ],
    lessonLength: "50 minutes",
    totalLessons: "23 live lessons a week",
    note: "Years 10 and 11 follow the full live timetable, because International GCSE courses need it. Every pupil sits Pearson Edexcel International GCSEs. History is not offered at GCSE.",
    gcseNote: "Exam entry fees are not included in tuition: families register their child at an approved exam centre and pay the centre's charges.",
  },
];

/** A subject as parents see it on the public site: the name only, without
 * exam board or specification codes (those change with entries and live in
 * the portal and the Examinations and Private Candidates Policy). Returns
 * null for anything not offered (PE). Used by /curriculum/[stage] and the
 * holding site's Subjects page. */
const SUBJECT_DETAIL = /\s*\((?:[^()]*(?:GCSE|taught from|Double Award|Edexcel|AQA|Pearson)[^()]*)\)/g;
export function publicSubject(s: string): string | null {
  if (/^PE\b/i.test(s)) return null;
  if (/^Combined\b.*separate sciences/i.test(s)) return "Science: combined (Double Award), or separate biology, chemistry and physics";
  return s.replace(SUBJECT_DETAIL, "").replace(/\s+/g, " ").trim();
}

/** The shape of every live lesson, shown on /learning and /sample-lesson.
 * Timings are for a 50-minute lesson (Years 7 to 11). */
export const LESSON_SHAPE: { step: string; what: string; mins: string }[] = [
  { step: "Register and retrieval", what: "Camera on, quick register, then three or four questions on last lesson's learning in the chat or on mini-whiteboards.", mins: "0–7 min" },
  { step: "Short explanation", what: "The teacher teaches one idea clearly, with worked examples on the shared screen.", mins: "7–17 min" },
  { step: "Guided practice", what: "Pupils try it together: cold-calling, polls and hands up, with the teacher correcting misunderstandings straight away.", mins: "17–32 min" },
  { step: "Independent practice", what: "Pupils work on their own in the Class Notebook while the teacher drops in to check progress.", mins: "32–45 min" },
  { step: "Closing check and homework", what: "An exit question to show what has been learned, and the homework set in Teams Assignments.", mins: "45–50 min" },
];

/** "20 live lessons a week, 45 minutes each": the one wording used wherever a
 * key stage's week is summarised (homepage, curriculum index). Falls back to
 * this file's figures if a database row leaves either field empty. */
export function lessonsAWeek(ks: Pick<KeyStage, "slug" | "totalLessons" | "lessonLength">): string {
  const builtIn = keyStages.find((k) => k.slug === ks.slug);
  const total = (ks.totalLessons || builtIn?.totalLessons || "").replace(/ a week.*$/, "");
  const length = ks.lessonLength || builtIn?.lessonLength;
  return length ? `${total} a week, ${length} each` : `${total} a week`;
}
