import { PROCESS_OWNER_LABELS, type ProcessStep } from "@/components/admissions/applicationShared";

const OWNER_CHIP: Record<ProcessStep["owner"], string> = {
  you: "bg-gold-100 text-gold-900",
  us: "bg-teal-100 text-teal-900",
  together: "bg-cream text-ink/80 ring-1 ring-gold-light/60",
};

function OwnerChip({ owner }: { owner: ProcessStep["owner"] }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${OWNER_CHIP[owner]}`}>{PROCESS_OWNER_LABELS[owner]}</span>;
}

/**
 * "How admissions works": six numbered cards. Each says whose part it is
 * (yours, ours or together) so a family can see at a glance what they have to do.
 */
export function AdmissionsStepsGrid({ steps }: { steps: ProcessStep[] }) {
  return (
    <ol className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex h-full min-w-0 flex-col rounded-2xl border border-gold-light/50 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500 font-serif text-lg font-bold text-ink-900">
              {i + 1}
            </span>
            <OwnerChip owner={s.owner} />
          </div>
          <h3 className="mt-3 break-words font-serif text-lg font-semibold text-ink">
            <span className="sr-only">Step {i + 1}: </span>
            {s.title}
          </h3>
          <p className="mt-1 break-words text-sm text-ink/70">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

type StepState = "done" | "current" | "later";

const STATE_LABEL: Record<StepState, string> = { done: "Done", current: "In progress", later: "Coming up" };
const STATE_CHIP: Record<StepState, string> = {
  done: "bg-teal-100 text-teal-900",
  current: "bg-gold-500 text-ink-900",
  later: "bg-cream text-ink/65 ring-1 ring-gold-light/60",
};

/**
 * A vertical timeline for the "what happens next" panel after applying. Steps
 * before `currentIndex` are Done, that step is In progress (highlighted) and
 * the rest are Coming up. `notes` replaces a step's body (e.g. the upload
 * outcome on step 1). Long words wrap instead of running off the edge.
 */
export function AdmissionsTimeline({ steps, currentIndex, notes }: { steps: ProcessStep[]; currentIndex: number; notes?: Record<number, string> }) {
  return (
    <ol className="mt-6">
      {steps.map((s, i) => {
        const state: StepState = i < currentIndex ? "done" : i === currentIndex ? "current" : "later";
        const last = i === steps.length - 1;
        return (
          <li key={s.title} aria-current={state === "current" ? "step" : undefined} className="relative flex gap-3 sm:gap-4">
            <div className="flex w-9 shrink-0 flex-col items-center">
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  state === "done" ? "bg-teal-700 text-white" : state === "current" ? "bg-gold-500 text-ink-900 ring-4 ring-gold-100" : "bg-white text-ink/65 ring-1 ring-gold-light"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              {!last && <span aria-hidden="true" className={`mt-1 w-0.5 flex-1 ${state === "done" ? "bg-teal-500/60" : "bg-gold-light/70"}`} />}
            </div>
            <div className={`min-w-0 flex-1 pb-6 ${last ? "pb-0" : ""}`}>
              <div className={`rounded-xl px-3 py-2 sm:px-4 ${state === "current" ? "bg-cream ring-1 ring-gold-500/60" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className={`break-words text-sm font-semibold ${state === "later" ? "text-ink/70" : "text-ink"}`}>
                    {s.title}
                    <span className="sr-only">: {STATE_LABEL[state]}</span>
                  </p>
                  <span aria-hidden="true" className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_CHIP[state]}`}>
                    {STATE_LABEL[state]}
                  </span>
                  <OwnerChip owner={s.owner} />
                </div>
                <p className={`mt-1 break-words text-sm ${state === "later" ? "text-ink/65" : "text-ink/75"}`}>{notes?.[i] ?? s.body}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The admissions journey as a process graphic: numbered stages joined by a
 * line, left to right on large screens and top to bottom on phones, so the
 * order is unmistakable. Used on the homepage.
 */
export function AdmissionsProcessFlow({ steps }: { steps: ProcessStep[] }) {
  return (
    <ol className="relative mt-10 grid gap-0 lg:grid-cols-6 lg:gap-4">
      {/* Desktop connector running through the centre of the number badges. */}
      <span aria-hidden="true" className="absolute left-[8.33%] right-[8.33%] top-6 hidden h-0.5 bg-gold-300 lg:block" />
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.title} className="relative flex gap-4 lg:flex-col lg:items-center lg:gap-0 lg:text-center">
            <div className="flex w-12 shrink-0 flex-col items-center lg:w-auto">
              <span
                aria-hidden="true"
                className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500 font-serif text-xl font-bold text-ink-900 ring-4 ring-cream"
              >
                {i + 1}
              </span>
              {!last && <span aria-hidden="true" className="w-0.5 flex-1 bg-gold-300 lg:hidden" />}
            </div>
            <div className={`min-w-0 flex-1 lg:mt-4 ${last ? "" : "pb-8 lg:pb-0"}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-700">Step {i + 1}</p>
              <h3 className="mt-1 break-words font-serif text-lg font-semibold leading-snug text-ink">{s.title}</h3>
              <p className="mt-1.5 break-words text-sm text-ink/70">{s.short}</p>
              <span className="mt-3 inline-block">
                <OwnerChip owner={s.owner} />
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
