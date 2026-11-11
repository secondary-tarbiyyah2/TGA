import { firstName, longDay } from "./starData";

/**
 * An on-screen likeness of the PDF certificate (star-certificate Edge
 * Function), so the teacher sees what the family will get before submitting.
 * The real PDF is made once the Headteacher approves.
 */
export function StarCertificatePreview({ name, reason, message, className, weekStart }: { name: string; reason: string; message?: string | null; className: string; weekStart: string }) {
  const fn = firstName(name || "");
  return (
    <figure aria-label="Certificate preview" className="rounded-xl bg-cream p-2 shadow-sm">
      {/* Matches the PDF (supabase/functions/_shared/starCertificate.ts): ink frame, gold hairline, gold logo, Space Grotesk. */}
      <div className="rounded-sm border-[3px] border-ink-900 p-1">
        <div className="flex aspect-[1.414] flex-col items-center justify-center border border-gold-500 px-4 py-3 text-center sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset in a scaled preview */}
          <img src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" className="h-auto w-24 sm:w-28" />
          <p className="mt-1.5 text-[8px] font-medium uppercase tracking-[0.3em] text-gold-700">Certificate of achievement</p>
          <p className="font-serif text-xl font-bold text-ink sm:text-2xl">Star of the Week</p>
          <p className="text-[10px] text-ink/60">This certificate is proudly presented to</p>
          <p className="mt-1 font-serif text-lg font-bold text-gold-700 sm:text-xl">{name || "Choose a pupil"}</p>
          <span aria-hidden="true" className="mt-0.5 h-0.5 w-8 bg-gold-500" />
          <p className="mt-1.5 line-clamp-3 max-w-md font-serif text-xs font-medium text-ink sm:text-sm">
            {name ? `Well done, ${fn}! ` : ""}
            {reason || "Your reasons appear here."}
          </p>
          {message && <p className="mt-1 line-clamp-2 max-w-md bg-gold-100 px-2 py-0.5 font-serif text-[11px] text-gold-700">&ldquo;{message}&rdquo;</p>}
          <p className="mt-2 text-[10px] text-ink/60">{[className, `Week beginning ${longDay(weekStart)}`].filter(Boolean).join("  ·  ")}</p>
        </div>
      </div>
      <figcaption className="mt-1.5 text-center text-[11px] text-ink/60">Preview. The PDF is made once the Headteacher approves.</figcaption>
    </figure>
  );
}
