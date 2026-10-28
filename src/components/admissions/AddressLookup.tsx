"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ListboxPopup, optionId, stepIndex } from "@/components/admissions/Combobox";
import {
  LOOKUP_PROVIDER,
  lookupAddresses,
  lookupAvailableFor,
  normalisePostcode,
  postcodeLooksComplete,
  type AddressFill,
  type AddressSuggestion,
} from "@/components/admissions/addressLookup";

type Status = "idle" | "incomplete" | "searching" | "results" | "invalid" | "none" | "error" | "resolving" | "picked" | "picked_street";

/**
 * The Postcode field, plus (when the lookup is on) an optional house number or
 * name, a Find address button and the list of matching addresses. Remount it
 * (key) when the country changes so old results are dropped.
 */
export function AddressLookup({
  country, postcode, onPostcodeChange, line1, onPick, manual, onManualChange, optional, hint, error, disabled, inputClassName, buttonClassName,
}: {
  country: string;
  postcode: string;
  onPostcodeChange: (value: string) => void;
  line1: string;
  onPick: (fill: AddressFill, kind: AddressSuggestion["kind"]) => void;
  manual: boolean;
  onManualChange: (manual: boolean) => void;
  /** No postcode system in this country: the lookup is not offered. */
  optional: boolean;
  hint: string;
  error?: string;
  disabled: boolean;
  inputClassName: string;
  buttonClassName: string;
}) {
  const available = lookupAvailableFor(country) && !optional;
  const lookupOn = available && !manual;
  const [house, setHouse] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [streetsOnly, setStreetsOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<AbortController | null>(null);
  const lastFill = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = "apply-address-results";

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      inFlight.current?.abort();
    },
    [],
  );

  const expanded = lookupOn && open && suggestions.length > 0 && !disabled;
  const hasFocus = () => !!wrapRef.current && wrapRef.current.contains(document.activeElement);

  function run(pc: string, hs: string) {
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setStatus("searching");
    lookupAddresses({ country, postcode: pc, house: hs, signal: ctrl.signal })
      .then((out) => {
        if (ctrl.signal.aborted) return;
        if (out.status === "ok") {
          setSuggestions(out.suggestions);
          setStreetsOnly(out.streetsOnly);
          setActive(-1);
          setStatus("results");
          setOpen(hasFocus());
          if (out.postcode && out.postcode !== pc.trim()) onPostcodeChange(out.postcode);
        } else {
          setSuggestions([]);
          setOpen(false);
          setStatus(out.status === "invalid_postcode" ? "invalid" : out.status);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setSuggestions([]);
          setStatus("error");
        }
      });
  }

  /** Debounced search as the family types; `now` for the Find address button. */
  function schedule(pc: string, hs: string, now = false) {
    clearTimeout(timer.current);
    inFlight.current?.abort();
    if (!lookupOn) return;
    // Don't pop a list over an address that is already filled in (browser
    // autofill, or typed by hand) unless the family asks, or the address came
    // from an earlier pick.
    const lineOk = line1.trim() === "" || line1 === lastFill.current;
    if (!now && !lineOk) return;
    if (!postcodeLooksComplete(pc, country)) {
      setSuggestions([]);
      setOpen(false);
      setStatus(now ? "incomplete" : "idle");
      return;
    }
    timer.current = setTimeout(() => run(pc, hs), now ? 0 : 450);
  }

  async function pick(index: number) {
    const s = suggestions[index];
    if (!s) return;
    setOpen(false);
    let fill = s.fill ?? null;
    if (!fill && s.resolve) {
      setStatus("resolving");
      fill = await s.resolve();
    }
    if (!fill) {
      setStatus("error");
      return;
    }
    lastFill.current = fill.line1;
    onPick(fill, s.kind);
    setStatus(s.kind === "street" ? "picked_street" : "picked");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!lookupOn) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      if (!expanded) {
        setOpen(true);
        setActive(e.key === "ArrowDown" ? 0 : suggestions.length - 1);
        return;
      }
      setActive((a) => stepIndex(a, e.key === "ArrowDown" ? 1 : -1, suggestions.length));
    } else if (e.key === "Enter") {
      // Enter never submits the form from here: it picks, or searches.
      e.preventDefault();
      if (expanded && active >= 0) void pick(active);
      else schedule(postcode, house, true);
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  const comboAria = lookupOn
    ? {
        role: "combobox" as const,
        "aria-expanded": expanded,
        "aria-controls": listId,
        "aria-autocomplete": "list" as const,
        "aria-activedescendant": expanded && active >= 0 ? optionId(listId, active) : undefined,
      }
    : {};
  function onFocus() {
    if (lookupOn && status === "results" && suggestions.length > 0) setOpen(true);
  }

  const count = suggestions.length;
  const message: Record<Status, string> = {
    idle: "",
    incomplete: "Please type the full postcode or ZIP code first.",
    searching: "Looking up addresses…",
    resolving: "Getting the full address…",
    results: streetsOnly
      ? `We found ${count === 1 ? "1 street" : `${count} streets`} near this postcode but not the individual houses. Choose your street, then add your house number.`
      : `${count === 1 ? "1 address" : `${count} addresses`} found. Choose yours from the list, or type it below if it is not there.`,
    invalid: "We could not find that postcode. Please check it, or type your address below.",
    none: "We could not find addresses for this postcode. Please type your address below.",
    error: "Address lookup is not available just now. Please type your address below.",
    picked: "Address filled in below. Please check it and change anything that is not quite right.",
    picked_street: "Street filled in below. Please add your house number or name to Address line 1.",
  };
  const note = lookupOn ? message[status] : "";
  const footer =
    LOOKUP_PROVIDER === "google" ? (
      <span>Not listed? Close this list and type your address below. Powered by Google.</span>
    ) : (
      <span>
        Not listed? Close this list and type your address below. Address data &copy;{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline" onMouseDown={(e) => e.preventDefault()}>
          OpenStreetMap contributors
        </a>
        .
      </span>
    );

  return (
    <div
      ref={wrapRef}
      className="sm:col-span-2"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {lookupOn && (
        <p className="mb-3 text-sm text-ink/75">
          Type your postcode and we will look up your address. Adding your house number or name narrows the list.
        </p>
      )}
      <div className="relative">
        <div className={`grid gap-4 ${lookupOn ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" : "sm:grid-cols-2"}`}>
          <div>
            <label htmlFor="f-addressPostcode" className="block text-sm font-medium text-ink">
              Postcode or ZIP code {optional && <span className="font-normal text-ink/70">(optional)</span>}
            </label>
            <p id="h-f-addressPostcode" className="text-xs text-ink/70">{hint}</p>
            <input
              id="f-addressPostcode"
              name="addressPostcode"
              type="text"
              autoComplete="postal-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              value={postcode}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "e-f-addressPostcode" : "h-f-addressPostcode"}
              onChange={(e) => {
                onPostcodeChange(e.target.value);
                schedule(e.target.value, house);
              }}
              onBlur={() => {
                const tidy = normalisePostcode(postcode, country);
                if (tidy !== postcode && tidy.toLowerCase() !== "none") onPostcodeChange(tidy);
              }}
              className={`mt-1 ${inputClassName}`}
              {...comboAria}
                onKeyDown={onKeyDown}
                onFocus={onFocus}
            />
          </div>
          {lookupOn && (
            <div>
              <label htmlFor="f-addressHouse" className="block text-sm font-medium text-ink">
                House number or name <span className="font-normal text-ink/70">(optional)</span>
              </label>
              <input
                id="f-addressHouse"
                type="text"
                autoComplete="off"
                maxLength={60}
                value={house}
                disabled={disabled}
                onChange={(e) => {
                  setHouse(e.target.value);
                  schedule(postcode, e.target.value);
                }}
                className={`mt-1 ${inputClassName}`}
                {...comboAria}
                onKeyDown={onKeyDown}
                onFocus={onFocus}
              />
            </div>
          )}
          {lookupOn && (
            <div>
              <button type="button" disabled={disabled || status === "searching"} onClick={() => schedule(postcode, house, true)} className={buttonClassName}>
                {status === "searching" ? "Searching…" : "Find address"}
              </button>
            </div>
          )}
        </div>
        {expanded && (
          <ListboxPopup
            id={listId}
            label="Matching addresses"
            options={suggestions.map((s) => ({ id: s.id, label: s.label, detail: s.detail }))}
            activeIndex={active}
            query={house}
            onPick={(i) => void pick(i)}
            onHover={setActive}
            footer={footer}
          />
        )}
        {lookupOn && !expanded && <ul id={listId} role="listbox" aria-label="Matching addresses" hidden />}
      </div>
      {error && <p id="e-f-addressPostcode" role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      <p role="status" className={`text-sm ${note ? "mt-2" : ""} ${status === "error" || status === "invalid" || status === "none" ? "text-ink/80" : "text-ink/70"}`}>
        {note}
        {lookupOn && status === "results" && !expanded && (
          <>
            {" "}
            <button type="button" className="font-semibold text-gold-700 underline" onClick={() => {
                setOpen(true);
                document.getElementById("f-addressPostcode")?.focus();
              }}
            >
              Show the list
            </button>
          </>
        )}
      </p>
      {available && (
        <p className="mt-2 text-sm">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const next = !manual;
              clearTimeout(timer.current);
              inFlight.current?.abort();
              setOpen(false);
              setStatus("idle");
              onManualChange(next);
              if (next) document.getElementById("f-addressLine1")?.focus();
            }}
            className="font-semibold text-gold-700 underline"
          >
            {manual ? "Look up my address from the postcode instead" : "Enter the address manually instead"}
          </button>
        </p>
      )}
    </div>
  );
}
