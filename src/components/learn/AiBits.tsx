import { AI_DISCLAIMER } from "@/lib/learn/aiAssist";

/** The small sparkle used on every AI button, so staff can tell AI actions apart at a glance. */
export function AiSpark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

/** "Drafted by AI from your notes. Check before sending." Shown wherever an AI draft appears. */
export function AiDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs text-ink/65 ${className}`}>
      <AiSpark className="h-3.5 w-3.5 shrink-0 text-teal-700" />
      {AI_DISCLAIMER}
    </p>
  );
}
