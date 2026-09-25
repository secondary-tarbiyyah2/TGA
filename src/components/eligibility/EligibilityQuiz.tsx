"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

const YEAR_GROUPS = [
  "Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11",
];

function bandForYearGroup(year: string): "reception-y2" | "y3-6" | "y7-9" | "y10-11" {
  if (["Reception", "Year 1", "Year 2"].includes(year)) return "reception-y2";
  if (["Year 3", "Year 4", "Year 5", "Year 6"].includes(year)) return "y3-6";
  if (["Year 7", "Year 8", "Year 9"].includes(year)) return "y7-9";
  return "y10-11";
}

const REGIONS = [
  { value: "uk-europe-west-africa", icon: "🌍", label: "UK, Europe or West Africa", detail: "Live lessons land at a UK-friendly morning/afternoon time." },
  { value: "gulf-south-asia", icon: "🕌", label: "Gulf or South Asia", detail: "A second live-lesson band, timed for your evening/your region." },
  { value: "other", icon: "✈️", label: "Somewhere else", detail: "We'll talk through what's workable for your timezone." },
] as const;

const HIFZ_OPTIONS = [
  { value: "central", icon: "📖", label: "A central priority", detail: "Structured hifz progress, tracked like any other subject." },
  { value: "nice-to-have", icon: "🌙", label: "Important, not the main driver", detail: "Strong academics with meaningful Islamic Studies." },
  { value: "not-a-priority", icon: "🎓", label: "Not a priority right now", detail: "Mainly here for the British curriculum." },
] as const;

const READINESS_OPTIONS = [
  { value: "jan-2027", icon: "🚀", label: "Ready for January 2027", detail: "We're aiming to join at launch." },
  { value: "exploring-later", icon: "🗓️", label: "Exploring for a later start", detail: "Not this cohort, but keen to learn more." },
  { value: "not-sure", icon: "🤔", label: "Just exploring", detail: "Still deciding if this is the right fit." },
] as const;

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function EligibilityQuiz() {
  const [step, setStep] = useState<Step>(0);
  const [yearGroup, setYearGroup] = useState("");
  const [region, setRegion] = useState<(typeof REGIONS)[number]["value"] | "">("");
  const [hifzPriority, setHifzPriority] = useState<(typeof HIFZ_OPTIONS)[number]["value"] | "">("");
  const [sendNeeds, setSendNeeds] = useState<boolean | null>(null);
  const [sendDetails, setSendDetails] = useState("");
  const [readiness, setReadiness] = useState<(typeof READINESS_OPTIONS)[number]["value"] | "">("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — real users never see or fill this
  const [renderedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recommendedAction: "book_call" | "apply_now" = useMemo(() => {
    if (sendNeeds) return "book_call";
    if (readiness === "jan-2027") return "apply_now";
    return "book_call";
  }, [sendNeeds, readiness]);

  const totalSteps = 6;
  const progress = Math.round((Math.min(step, totalSteps) / totalSteps) * 100);

  async function submit() {
    setSubmitting(true);
    setError(null);

    // Honeypot + minimum-time-on-form spam guard, same idea as the booking form.
    if (website || Date.now() - renderedAt < 1500) {
      setStep(6);
      setSubmitting(false);
      return;
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error: insertError } = await supabase.from("eligibility_responses").insert({
        child_year_band: bandForYearGroup(yearGroup),
        region,
        hifz_priority: hifzPriority,
        send_needs: sendNeeds ?? false,
        send_details: sendNeeds ? sendDetails : null,
        start_readiness: readiness,
        recommended_action: recommendedAction,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone || null,
      });
      if (insertError) {
        setError("Something went wrong saving your answers — you can still continue below.");
      }
    }
    setSubmitting(false);
    setStep(6);
  }

  const bookCallHref = `/book-a-call?name=${encodeURIComponent(contactName)}&email=${encodeURIComponent(contactEmail)}&year=${encodeURIComponent(yearGroup)}&notes=${encodeURIComponent(
    `From the family-fit quiz — region: ${region}, hifz priority: ${hifzPriority}${sendNeeds ? `, SEND needs: ${sendDetails || "yes"}` : ""}`
  )}`;

  return (
    <div className="mx-auto max-w-xl">
      {step < 6 && (
        <div className="mb-8">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gold-100">
            <div className="h-full rounded-full bg-gold-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs font-medium text-ink/50">Step {step + 1} of {totalSteps}</p>
        </div>
      )}

      {step === 0 && (
        <QuizStep title="What year group is your child joining?" subtitle="This tells us the right curriculum stage and fee band.">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {YEAR_GROUPS.map((y) => (
              <OptionButton key={y} selected={yearGroup === y} onClick={() => { setYearGroup(y); setStep(1); }}>
                {y}
              </OptionButton>
            ))}
          </div>
        </QuizStep>
      )}

      {step === 1 && (
        <QuizStep title="Where will your child be learning from?" subtitle="We run two live-lesson time bands for a genuinely global intake." onBack={() => setStep(0)}>
          <div className="space-y-3">
            {REGIONS.map((r) => (
              <IconOptionCard key={r.value} icon={r.icon} label={r.label} detail={r.detail} selected={region === r.value} onClick={() => { setRegion(r.value); setStep(2); }} />
            ))}
          </div>
        </QuizStep>
      )}

      {step === 2 && (
        <QuizStep title="How central is Qur'an memorisation (hifz) to what you're looking for?" onBack={() => setStep(1)}>
          <div className="space-y-3">
            {HIFZ_OPTIONS.map((h) => (
              <IconOptionCard key={h.value} icon={h.icon} label={h.label} detail={h.detail} selected={hifzPriority === h.value} onClick={() => { setHifzPriority(h.value); setStep(3); }} />
            ))}
          </div>
        </QuizStep>
      )}

      {step === 3 && (
        <QuizStep title="Does your child have any additional learning needs we should know about?" onBack={() => setStep(2)}>
          <div className="grid grid-cols-2 gap-3">
            <OptionButton selected={sendNeeds === true} onClick={() => setSendNeeds(true)}>Yes</OptionButton>
            <OptionButton selected={sendNeeds === false} onClick={() => { setSendNeeds(false); setStep(4); }}>No</OptionButton>
          </div>
          {sendNeeds === true && (
            <div className="mt-4">
              <label className="text-sm font-medium text-ink" htmlFor="sendDetails">Tell us a little about their needs (optional)</label>
              <textarea
                id="sendDetails"
                value={sendDetails}
                onChange={(e) => setSendDetails(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2"
                placeholder="e.g. dyslexia support, autism-friendly pacing…"
              />
              <button type="button" onClick={() => setStep(4)} className="mt-3 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
                Continue
              </button>
            </div>
          )}
        </QuizStep>
      )}

      {step === 4 && (
        <QuizStep title="When are you hoping to start?" onBack={() => setStep(3)}>
          <div className="space-y-3">
            {READINESS_OPTIONS.map((r) => (
              <IconOptionCard key={r.value} icon={r.icon} label={r.label} detail={r.detail} selected={readiness === r.value} onClick={() => { setReadiness(r.value); setStep(5); }} />
            ))}
          </div>
        </QuizStep>
      )}

      {step === 5 && (
        <QuizStep title="Almost there — where should we send your result?" onBack={() => setStep(4)}>
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="space-y-4"
          >
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website">Leave this field empty</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div>
              <label htmlFor="contactName" className="text-sm font-medium text-ink">Your name</label>
              <input id="contactName" required value={contactName} onChange={(e) => setContactName(e.target.value)} type="text" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
            </div>
            <div>
              <label htmlFor="contactEmail" className="text-sm font-medium text-ink">Email</label>
              <input id="contactEmail" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
            </div>
            <div>
              <label htmlFor="contactPhone" className="text-sm font-medium text-ink">Phone (optional)</label>
              <input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} type="tel" className="mt-1 w-full rounded-lg border border-gold-light/60 px-3 py-2" />
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full rounded-full bg-gold-500 px-6 py-3 text-sm font-semibold text-ink-900 transition-all hover:brightness-95 disabled:opacity-60">
              {submitting ? "Saving…" : "See my result"}
            </button>
          </form>
        </QuizStep>
      )}

      {step === 6 && (
        <div className="rounded-2xl border border-gold-light/50 bg-white p-8 text-center shadow-warm">
          <p className="text-4xl">🎉</p>
          <h2 className="mt-3 font-serif text-2xl font-semibold text-ink">
            {contactName ? `${contactName.split(" ")[0]}, here's what we'd suggest.` : "Here's what we'd suggest."}
          </h2>
          <p className="mt-4 text-ink/75">
            For {yearGroup || "your child"} in the {REGIONS.find((r) => r.value === region)?.label.toLowerCase() || "your region"} time
            band, with hifz as {hifzPriority === "central" ? "a central priority" : hifzPriority === "nice-to-have" ? "an important part of the day" : "part of a broader curriculum"},
            {sendNeeds ? " and additional needs we&apos;ll make sure your teacher knows about," : ""} here&apos;s our recommendation:
          </p>

          {recommendedAction === "apply_now" ? (
            <div className="mt-6 rounded-2xl bg-gold-100 p-5">
              <p className="font-semibold text-ink">You&apos;re ready to apply.</p>
              <p className="mt-1 text-sm text-ink/75">Start your application now — we&apos;ll follow up with next steps for January 2027.</p>
              <Link href="/admissions" className="mt-4 inline-block rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
                Start your application
              </Link>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl bg-gold-100 p-5">
              <p className="font-semibold text-ink">A quick call is the best next step.</p>
              <p className="mt-1 text-sm text-ink/75">Our admissions team can talk through your child&apos;s needs and timing, no obligation.</p>
              <Link href={bookCallHref} className="mt-4 inline-block rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-900 transition-all hover:brightness-95">
                Book a free 20-minute call
              </Link>
            </div>
          )}
          <p className="mt-6 text-xs text-ink/50">
            Either way, you&apos;re welcome to{" "}
            <Link href="/admissions" className="underline">explore admissions</Link> or{" "}
            <Link href="/book-a-call" className="underline">book a call</Link> at any time.
          </p>
        </div>
      )}
    </div>
  );
}

function QuizStep({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div key={title} className="animate-[fadeIn_0.3s_ease-out]">
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 text-sm text-ink/50 hover:text-ink/80">
          ← Back
        </button>
      )}
      <h2 className="font-serif text-xl font-semibold text-ink sm:text-2xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function OptionButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-xl border px-3 py-3 text-sm font-medium transition-all ${
        selected ? "border-gold-500 bg-gold-100 text-ink" : "border-gold-light/50 bg-white text-ink/75 hover:border-gold-500/60"
      }`}
    >
      {children}
    </button>
  );
}

function IconOptionCard({ icon, label, detail, selected, onClick }: { icon: string; label: string; detail: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
        selected ? "border-gold-500 bg-gold-100" : "border-gold-light/50 bg-white hover:border-gold-500/60"
      }`}
    >
      <span aria-hidden="true" className="text-2xl">{icon}</span>
      <span>
        <span className="block font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink/60">{detail}</span>
      </span>
    </button>
  );
}
