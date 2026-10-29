// The founding cohort's key dates, in one place so the homepage, the
// admissions page and the open-evening page always say the same thing.
// All times are UK time.
export type KeyDate = { label: string; when: string; detail?: string; href?: string };

export const KEY_DATES: KeyDate[] = [
  { label: "Online open evening", when: "Thu 26 November, 7:30pm", href: "/open-evening" },
  { label: "Online open evening", when: "Sun 6 December, 4pm", href: "/open-evening" },
  { label: "Taster morning", when: "Sat 12 December", detail: "Years 1 to 6 at 10:00, Years 7 to 11 at 11:15", href: "/open-evening" },
  { label: "Apply by", when: "Fri 18 December 2026", detail: "Later applications are considered while places remain", href: "/admissions" },
  { label: "Induction week", when: "Mon 4 January 2027", detail: "Accounts, devices and meeting teachers" },
  { label: "First live lessons", when: "Mon 11 January 2027" },
];
