/** Short transparency note for the messages hubs. */
export function OversightNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-ink/65 ${className}`}>
      Messages may be reviewed by school leadership for safeguarding.
    </p>
  );
}
