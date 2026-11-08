"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { Select } from "@/components/ui/Dropdown";

// Accessible dropdown pieces for the application form, following the WAI-ARIA
// combobox pattern: focus stays in the text box, the list is a role="listbox"
// popup directly under the field (full width of it), and the highlighted
// option is announced through aria-activedescendant. Arrow keys move, Enter
// picks, Escape closes; the mouse works too (mousedown is cancelled so the
// text box keeps focus while an option is clicked).

export type ListOption = {
  id: string;
  label: string;
  /** Smaller second line or trailing note, e.g. the town or "Also: UK". */
  detail?: string;
};

/** The label with the typed text picked out (case-insensitive, first match only). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-gold-100 font-semibold text-ink">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

export const optionId = (listId: string, i: number) => `${listId}-opt-${i}`;

/** The popup list. Render it inside a `relative` wrapper that also holds the text box. */
export function ListboxPopup({
  id, label, options, activeIndex, query, selectedLabel, onPick, onHover, footer,
}: {
  id: string;
  label: string;
  options: ListOption[];
  activeIndex: number;
  query: string;
  selectedLabel?: string;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
  footer?: ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(id, activeIndex))}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, id]);
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-gold-light/70 bg-white shadow-lg shadow-ink/10">
      <ul ref={listRef} id={id} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto overscroll-contain py-1">
        {options.map((o, i) => {
          const active = i === activeIndex;
          const selected = selectedLabel !== undefined && o.label.toLowerCase() === selectedLabel.trim().toLowerCase();
          return (
            <li
              key={o.id}
              id={optionId(id, i)}
              role="option"
              aria-selected={active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(i)}
              onMouseMove={() => {
                if (!active) onHover(i);
              }}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm text-ink ${active ? "bg-gold-100" : ""}`}
            >
              <span className="min-w-0">
                <span className="block break-words">
                  <Highlight text={o.label} query={query} />
                </span>
                {o.detail && <span className="block text-xs text-ink/65">{o.detail}</span>}
              </span>
              {selected && (
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-gold-700">
                  <path d="M7.7 14.3 3.4 10l1.4-1.4 2.9 2.9 7.5-7.5 1.4 1.4z" />
                </svg>
              )}
            </li>
          );
        })}
      </ul>
      {footer && <div className="border-t border-gold-light/50 bg-cream px-3 py-2 text-xs text-ink/70">{footer}</div>}
    </div>
  );
}

/** Next highlighted index for an arrow key, wrapping at either end. */
export function stepIndex(current: number, delta: 1 | -1, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}

function rank(option: string, aliases: string[], q: string): { score: number; via?: string } | null {
  const o = option.toLowerCase();
  if (o.startsWith(q)) return { score: 0 };
  if (o.split(/[\s-]+/).some((w) => w.startsWith(q))) return { score: 1 };
  const alias = aliases.find((a) => a.toLowerCase().startsWith(q));
  if (alias) return { score: 2, via: alias };
  if (o.includes(q)) return { score: 3 };
  return null;
}

/**
 * A text box with a filtered suggestion list (used for Country). Free text is
 * still allowed, so a country missing from the list can be typed in full.
 */
export function Combobox({
  id, name, value, onChange, options, aliases = {}, listLabel, disabled, invalid, describedBy, autoComplete, maxLength, inputClassName, placeholder,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  aliases?: Record<string, string[]>;
  listLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoComplete?: string;
  maxLength?: number;
  inputClassName: string;
  placeholder?: string;
}) {
  const listId = `${useId().replace(/:/g, "")}-list`;
  const [open, setOpen] = useState(false);
  // True while the family is typing (filter the list); false when the list was
  // opened from the button or arrow keys (show everything, current value marked).
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = value.trim().toLowerCase();
  const shown: ListOption[] =
    filtering && q
      ? options
          .map((o) => ({ o, r: rank(o, aliases[o] ?? [], q) }))
          .filter((x): x is { o: string; r: { score: number; via?: string } } => x.r !== null)
          .sort((a, b) => a.r.score - b.r.score)
          .map(({ o, r }) => ({ id: o, label: o, detail: r.via ? `Also known as ${r.via}` : undefined }))
      : options.map((o) => ({ id: o, label: o }));
  const expanded = open && shown.length > 0 && !disabled;

  function openList(showAll: boolean) {
    setFiltering(!showAll);
    setOpen(true);
    const list = showAll ? options : shown.map((s) => s.label);
    const current = list.findIndex((o) => o.toLowerCase() === q);
    setActive(current);
  }

  function pick(index: number) {
    const o = shown[index];
    if (!o) return;
    onChange(o.label);
    setOpen(false);
    setFiltering(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!expanded) {
        openList(!filtering || !q);
        return;
      }
      setActive((a) => stepIndex(a, e.key === "ArrowDown" ? 1 : -1, shown.length));
    } else if (e.key === "Enter") {
      if (expanded && active >= 0) {
        e.preventDefault();
        pick(active);
      }
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  /** On leaving the field, "uk" or "united kingdom" becomes the list's own spelling. */
  function onBlur() {
    setOpen(false);
    setFiltering(false);
    const exact = options.find((o) => o.toLowerCase() === q) ?? options.find((o) => (aliases[o] ?? []).some((a) => a.toLowerCase() === q));
    if (exact && exact !== value) onChange(exact);
  }

  return (
    <div className="relative mt-1">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? optionId(listId, active) : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setFiltering(true);
          setOpen(true);
          setActive(e.target.value.trim() ? 0 : -1);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onClick={() => {
          if (!open) openList(true);
        }}
        className={`${inputClassName} pr-10`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (expanded) setOpen(false);
          else openList(true);
          inputRef.current?.focus();
        }}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink/60 hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className={`h-4 w-4 fill-current transition-transform ${expanded ? "rotate-180" : ""}`}>
          <path d="M5.3 7.3 10 12l4.7-4.7 1.4 1.4L10 14.8 3.9 8.7z" />
        </svg>
      </button>
      {expanded && (
        <ListboxPopup
          id={listId}
          label={listLabel}
          options={shown}
          activeIndex={active}
          query={filtering ? value : ""}
          selectedLabel={value}
          onPick={pick}
          onHover={setActive}
        />
      )}
      {/* The list element must exist for aria-controls even while closed. */}
      {!expanded && <ul id={listId} role="listbox" aria-label={listLabel} hidden />}
    </div>
  );
}

/** The site's own dropdown (src/components/ui/Dropdown.tsx) with the form's styling, used like a <select>. */
export function SelectBox({
  className,
  children,
  value,
  onChange,
  id,
  name,
  disabled,
  required,
  "aria-invalid": ariaInvalid,
  "aria-describedby": describedBy,
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & { className: string; onChange?: (e: ChangeEvent<HTMLSelectElement>) => void }) {
  return (
    <Select
      id={id}
      name={name}
      value={value === undefined ? undefined : String(value)}
      disabled={disabled}
      required={required}
      invalid={ariaInvalid === true || ariaInvalid === "true"}
      aria-describedby={describedBy}
      onChange={(e) => onChange?.(e as unknown as ChangeEvent<HTMLSelectElement>)}
      wrapperClassName="mt-1"
      className={className}
    >
      {children}
    </Select>
  );
}
