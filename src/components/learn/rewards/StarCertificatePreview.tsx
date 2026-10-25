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
      <div className="rounded-lg border-[3px] border-gold-500 p-1">
        <div className="flex aspect-[1.414] flex-col items-center justify-center rounded border border-gold-500/70 px-4 py-3 text-center sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-700">Tarbiyyah Global Academy</p>
          <span aria-hidden="true" className="mt-1 text-lg leading-none text-gold-500">
            ★
          </span>
          <p className="mt-1 font-serif text-xl font-semibold text-ink sm:text-2xl">Star of the Week</p>
          <p className="mt-1 font-serif text-xs italic text-ink/60">This certificate is proudly presented to</p>
          <p className="mt-1 border-b border-gold-500 px-4 font-serif text-lg font-semibold text-gold-900 sm:text-xl">{name || "Choose a pupil"}</p>
          {name && <p className="mt-1.5 font-serif text-sm italic text-ink">Well done, {fn}!</p>}
          <p className="mt-1 line-clamp-3 max-w-md font-serif text-xs text-ink sm:text-sm">{reason || "Your reasons appear here."}</p>
          {message && <p className="mt-1 line-clamp-2 max-w-md font-serif text-[11px] italic text-ink/60">&ldquo;{message}&rdquo;</p>}
          <p className="mt-2 text-[10px] text-ink/60">{[className, `Week beginning ${longDay(weekStart)}`].filter(Boolean).join("  ·  ")}</p>
        </div>
      </div>
      <figcaption className="mt-1.5 text-center text-[11px] text-ink/60">Preview. The PDF is made once the Headteacher approves.</figcaption>
    </figure>
  );
}
