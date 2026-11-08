"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * The site's own dropdown, used instead of the browser's <select> so every
 * list looks like the rest of the site on every device (the native popup
 * is drawn by the browser and can't be styled).
 *
 * Follows the WAI-ARIA "select-only combobox" pattern: the trigger is a
 * button with role="combobox"; the list is a role="listbox" popup; the
 * highlighted option is announced through aria-activedescendant. Arrow keys,
 * Home/End, Page Up/Down and typing the first letters move; Enter or Space
 * picks; Escape closes. Long lists get a search box at the top.
 *
 * For forms a hidden input carries `name`, so FormData and the browser's
 * "required" check keep working exactly as they did with <select>.
 */

export type DropdownOption = {
  value: string;
  label: string;
  /** Second line under the label, e.g. "Induction on Friday 1 January". */
  detail?: string;
  /** Text on the right, e.g. "GMT+4". */
  aside?: string;
  /** Shown before the label, e.g. a flag. */
  icon?: ReactNode;
  /** Options with the same group are listed under that heading. */
  group?: string;
  /** Extra words that search should match (not shown). */
  keywords?: string;
  disabled?: boolean;
};

const chevron = (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
    <path d="M5.3 7.3 10 12l4.7-4.7 1.4 1.4L10 14.8 3.9 8.7z" />
  </svg>
);

const tick = (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-gold-700">
    <path d="M7.7 14.3 3.4 10l1.4-1.4 2.9 2.9 7.5-7.5 1.4 1.4z" />
  </svg>
);

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Every typed word must appear somewhere; options whose label starts with the text come first. */
function filterOptions(options: DropdownOption[], query: string): DropdownOption[] {
  const q = norm(query.trim());
  if (!q) return options;
  const words = q.split(/\s+/);
  const scored: { o: DropdownOption; s: number }[] = [];
  for (const o of options) {
    const label = norm(o.label);
    const hay = `${label} ${norm(o.detail ?? "")} ${norm(o.keywords ?? "")} ${norm(o.aside ?? "")}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const s = label.startsWith(q) ? 0 : label.split(/[\s(,-]+/).some((w) => w.startsWith(words[0])) ? 1 : 2;
    scored.push({ o, s });
  }
  return scored.sort((a, b) => a.s - b.s).map((x) => x.o);
}

export type DropdownProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  /** Shown on the trigger while nothing is chosen. */
  placeholder?: string;
  /** true: always show a search box; "auto" (default): when there are more than 12 options. */
  searchable?: boolean | "auto";
  searchPlaceholder?: string;
  /** Shown in the list when a search matches nothing. */
  emptyText?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Classes for the trigger (border, padding, radius, text size). */
  className?: string;
  /** Classes for the outer wrapper. */
  wrapperClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** Called after the list closes, e.g. to run validation. */
  onBlur?: () => void;
  /** Keep the option's right-hand note in the list only. */
  hideAsideOnTrigger?: boolean;
};

export function Dropdown({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = "Choose",
  searchable = "auto",
  searchPlaceholder = "Type to search",
  emptyText = "Nothing matches that.",
  required,
  disabled,
  invalid,
  className = "",
  wrapperClassName = "",
  onBlur,
  hideAsideOnTrigger,
  ...aria
}: DropdownProps) {
  const autoId = useId().replace(/:/g, "");
  const triggerId = id ?? `dd-${autoId}`;
  const listId = `${triggerId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [above, setAbove] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const withSearch = searchable === true || (searchable === "auto" && options.length > 12);
  const shown = useMemo(() => {
    if (!withSearch || !query.trim()) return options;
    // While searching, an option listed under two headings (e.g. "common" and "A to Z") shows once.
    const seen = new Set<string>();
    return filterOptions(options, query).filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  }, [options, query, withSearch]);
  const selected = options.find((o) => o.value === value);
  const optId = (i: number) => `${listId}-o${i}`;

  const firstEnabled = useCallback((from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < shown.length; i += step) if (!shown[i].disabled) return i;
    return -1;
  }, [shown]);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    setOpen(true);
    const at = options.findIndex((o) => o.value === value);
    setActive(at >= 0 ? at : firstEnabled(0, 1));
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
    onBlur?.();
  };

  const pick = (i: number) => {
    const o = shown[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close(true);
  };

  // Open upwards when there isn't room below (e.g. a field near the bottom of a phone screen).
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setAbove(below < 300 && r.top > below);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // On a phone, don't throw up the keyboard until they tap the search box.
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    if (withSearch && !touch) searchRef.current?.focus();
    else listRef.current?.focus();
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optId(active))}`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  // Typing letters on the closed trigger or the open list jumps to the next match, like a native select.
  const jumpTo = (key: string, now: number) => {
    const t = typeahead.current;
    t.text = now - t.at > 700 ? key : t.text + key;
    t.at = now;
    const q = norm(t.text);
    const start = t.text.length === 1 ? active + 1 : Math.max(active, 0);
    const order = [...shown.slice(start), ...shown.slice(0, start)];
    const hit = order.find((o) => !o.disabled && norm(o.label).startsWith(q));
    return hit ? shown.indexOf(hit) : -1;
  };

  const move = (e: KeyboardEvent) => {
    const page = 8;
    let next = active;
    switch (e.key) {
      case "ArrowDown": next = active < 0 ? firstEnabled(0, 1) : firstEnabled(Math.min(active + 1, shown.length - 1), 1); if (next < 0) next = active; break;
      case "ArrowUp": next = active < 0 ? firstEnabled(shown.length - 1, -1) : firstEnabled(Math.max(active - 1, 0), -1); if (next < 0) next = active; break;
      case "Home": next = firstEnabled(0, 1); break;
      case "End": next = firstEnabled(shown.length - 1, -1); break;
      case "PageDown": next = firstEnabled(Math.min(active + page, shown.length - 1), -1); break;
      case "PageUp": next = firstEnabled(Math.max(active - page, 0), 1); break;
      default: return false;
    }
    e.preventDefault();
    setActive(next);
    return true;
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) || (e.altKey && e.key === "ArrowDown")) {
      e.preventDefault();
      openList();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Closed: a letter changes the choice straight away, as a native select does.
      const i = jumpTo(e.key, e.timeStamp);
      if (i >= 0 && shown[i].value !== value) onChange(shown[i].value);
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLElement>) => {
    if (move(e)) return;
    if (e.key === "Enter" || (e.key === " " && !withSearch)) {
      e.preventDefault();
      if (active >= 0) pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      if (active >= 0 && !withSearch) pick(active);
      close(false);
    } else if (!withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const i = jumpTo(e.key, e.timeStamp);
      if (i >= 0) setActive(i);
    }
  };

  // Headings between groups.
  const rows: ReactNode[] = [];
  let lastGroup: string | undefined;
  shown.forEach((o, i) => {
    if (o.group && o.group !== lastGroup && !query) {
      rows.push(
        <li key={`g-${o.group}-${i}`} role="presentation" className="px-3 pb-1 pt-3 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink/55 first:pt-1.5">
          {o.group}
        </li>,
      );
    }
    lastGroup = o.group;
    const isActive = i === active;
    const isSelected = o.value === value;
    rows.push(
      <li
        key={`${o.value}-${i}`}
        id={optId(i)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={o.disabled || undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(i)}
        onMouseMove={() => !isActive && !o.disabled && setActive(i)}
        className={`mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
          o.disabled ? "cursor-not-allowed text-ink/35" : isActive ? "bg-gold-100 text-ink" : "text-ink"
        } ${isSelected ? "font-semibold" : ""}`}
      >
        {o.icon && <span className="shrink-0 text-base leading-none" aria-hidden="true">{o.icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block break-words">{o.label}</span>
          {o.detail && <span className="mt-0.5 block text-xs font-normal text-ink/60">{o.detail}</span>}
        </span>
        {o.aside && <span className="shrink-0 text-xs font-normal text-ink/55">{o.aside}</span>}
        {isSelected ? tick : <span className="w-4 shrink-0" aria-hidden="true" />}
      </li>,
    );
  });

  return (
    <div ref={wrapRef} className={`relative ${wrapperClassName}`}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && !withSearch && active >= 0 ? optId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        aria-describedby={aria["aria-describedby"]}
        disabled={disabled}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={onTriggerKey}
        className={`flex w-full items-center gap-2 bg-white text-left transition-colors focus:outline-none focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-300 disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? "border-gold-500 ring-2 ring-gold-300" : ""
        } ${invalid ? "border-red-500" : ""} ${className}`}
      >
        {selected?.icon && <span className="shrink-0 text-base leading-none" aria-hidden="true">{selected.icon}</span>}
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-ink" : "text-ink/50"}`}>{selected ? selected.label : placeholder}</span>
        {selected?.aside && !hideAsideOnTrigger && <span className="hidden shrink-0 text-xs text-ink/55 sm:inline">{selected.aside}</span>}
        <span className={`shrink-0 text-gold-700 transition-transform ${open ? "rotate-180" : ""}`}>{chevron}</span>
      </button>

      {name !== undefined && (
        <input
          type="text"
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          onChange={() => {}}
          onFocus={() => triggerRef.current?.focus()}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      )}

      {open ? (
        <div
          className={`absolute left-0 right-0 z-40 overflow-hidden rounded-2xl border border-gold-light/70 bg-white shadow-xl shadow-ink/10 ${above ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
        >
          {withSearch && (
            <div className="border-b border-gold-light/50 p-2">
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? optId(active) : undefined}
                aria-label={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(e.target.value.trim() ? 0 : -1);
                }}
                onKeyDown={onListKey}
                placeholder={searchPlaceholder}
                autoComplete="off"
                className="w-full rounded-xl border border-gold-light/60 bg-cream px-3 py-2 text-base text-ink placeholder:text-ink/45 focus:border-gold-500 focus:outline-none sm:text-sm"
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={aria["aria-labelledby"]}
            aria-label={aria["aria-labelledby"] ? undefined : aria["aria-label"] ?? placeholder}
            aria-activedescendant={!withSearch && active >= 0 ? optId(active) : undefined}
            onKeyDown={onListKey}
            className="max-h-72 overflow-y-auto overscroll-contain py-1 focus:outline-none"
          >
            {rows}
            {shown.length === 0 && <li className="px-4 py-3 text-sm text-ink/60">{emptyText}</li>}
          </ul>
        </div>
      ) : (
        <ul id={listId} role="listbox" hidden aria-label={aria["aria-label"] ?? placeholder} />
      )}
    </div>
  );
}

// ── <select>-compatible wrapper ─────────────────────────────────────────

type OptionEl = ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>;

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** Reads <option>/<optgroup> children the way a <select> would. */
export function optionsFromChildren(children: ReactNode): { options: DropdownOption[]; placeholder?: string } {
  const options: DropdownOption[] = [];
  let placeholder: string | undefined;
  const visit = (nodes: ReactNode, group?: string) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const el = child as OptionEl;
      if (el.type === "optgroup") return visit(el.props.children, el.props.label);
      if (el.type === "option") {
        const label = textOf(el.props.children);
        const v = el.props.value ?? label;
        if (String(v) === "") {
          placeholder ??= label;
          return;
        }
        options.push({ value: String(v), label, group, disabled: el.props.disabled });
        return;
      }
      // A fragment or a component wrapping options.
      const inner = (el.props as { children?: ReactNode }).children;
      if (inner) visit(inner, group);
    });
  };
  visit(children);
  return { options, placeholder };
}

/** Stand-in for the event a <select> would pass: code reads e.target.value. */
export type SelectChange = { target: { value: string; name: string }; currentTarget: { value: string; name: string } };

/**
 * Drop-in replacement for <select>: same children (<option>, <optgroup>),
 * value or defaultValue, onChange(e) with e.target.value, name, required.
 * An <option value=""> becomes the placeholder.
 */
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  name,
  ...rest
}: Omit<DropdownProps, "value" | "onChange" | "options"> & {
  children: ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: SelectChange) => void;
  autoComplete?: string;
}) {
  const { options, placeholder } = useMemo(() => optionsFromChildren(children), [children]);
  const [inner, setInner] = useState(() => String(defaultValue ?? ""));
  const controlled = value !== undefined;
  const current = controlled ? String(value) : inner;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { autoComplete: _ac, ...dropdownProps } = rest as typeof rest & { autoComplete?: string };
  return (
    <Dropdown
      {...dropdownProps}
      name={name}
      placeholder={rest.placeholder ?? placeholder}
      options={options}
      value={current}
      onChange={(v) => {
        if (!controlled) setInner(v);
        const t = { value: v, name: name ?? "" };
        onChange?.({ target: t, currentTarget: t });
      }}
    />
  );
}
