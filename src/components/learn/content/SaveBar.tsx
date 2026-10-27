"use client";

/**
 * Save button for the long website-content forms. It sticks to the bottom of
 * the screen while you scroll the form, so you never have to hunt for it, and
 * says whether there is anything unsaved.
 */
export function SaveBar({
  onSave,
  saving,
  dirty,
  message,
  error = false,
  disabled = false,
  label = "Save",
}: {
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  message?: string | null;
  error?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-gold-light bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <button type="button" onClick={onSave} disabled={saving || disabled} className="rounded-full bg-gold-700 px-5 py-2 text-sm font-semibold text-white hover:bg-gold-900 disabled:opacity-60">
        {saving ? "Saving…" : label}
      </button>
      <p role={error ? "alert" : "status"} className={`min-w-0 flex-1 text-sm ${error ? "text-red-700" : "text-ink/70"}`}>
        {message || (dirty ? "You have unsaved changes." : "No unsaved changes.")}
      </p>
    </div>
  );
}

/** Shown instead of a form when its row could not be loaded (rather than "Loading…" for ever). */
export function LoadProblem({ what }: { what: string }) {
  return <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Couldn&apos;t load the {what}. Check you are signed in as a Headteacher, Admin or Admissions, then reload the page.</p>;
}
