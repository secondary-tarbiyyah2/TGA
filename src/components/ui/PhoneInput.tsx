"use client";

import { useState } from "react";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { DIAL_CODES, DIAL_COUNTRIES, joinPhone, splitPhone } from "@/lib/dialCodes";

/** A small flag image (public/images/flags), decorative: the country name is always beside it. */
export function Flag({ code, className = "" }: { code: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export, tiny local SVG
    <img
      src={`/images/flags/${code.toLowerCase()}.svg`}
      alt=""
      width={20}
      height={14}
      loading="lazy"
      decoding="async"
      className={`inline-block h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-ink/10 ${className}`}
    />
  );
}

const OPTIONS: DropdownOption[] = DIAL_COUNTRIES.map((c) => ({
  value: c.code,
  label: c.name,
  aside: `+${c.dial}`,
  icon: <Flag code={c.code} />,
  keywords: `+${c.dial} ${c.dial} ${c.code}`,
}));

/**
 * A phone number field with a country code picker (flag and dialling code)
 * in front of it. The value is one international string, e.g.
 * "+44 7700 900123", so forms and the database keep a single phone column.
 * A leading 0 on the local number is dropped when joined.
 */
export function PhoneInput({
  id,
  name,
  value,
  onChange,
  defaultCountry = "GB",
  invalid,
  disabled,
  describedBy,
  autoComplete = "tel-national",
  required,
  inputClassName = "",
  className = "",
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  /** ISO code used until the family picks one (and for numbers typed without a +). */
  defaultCountry?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
  autoComplete?: string;
  required?: boolean;
  /** Border, padding and radius classes shared with the form's other inputs. */
  inputClassName?: string;
  className?: string;
}) {
  // The local part is kept as typed (spaces, a leading 0); the joined value goes to the form.
  const [initial] = useState(() => (value.trim() ? splitPhone(value, defaultCountry) : null));
  const [localText, setLocalText] = useState(initial?.local ?? "");
  // A country the family picked (or that came with the stored number); otherwise follow defaultCountry.
  const [picked, setPicked] = useState<string | null>(initial?.code ?? null);
  const code = picked ?? defaultCountry;
  const country = DIAL_COUNTRIES.find((c) => c.code === code);
  // The parent cleared the field (e.g. a reset): clear the box too.
  const local = value.trim() ? localText : "";

  return (
    <div className={`mt-1 flex items-stretch gap-2 ${className}`}>
      <Dropdown
        id={`${id}-country`}
        value={code}
        onChange={(c) => {
          setPicked(c);
          onChange(local.trim() ? joinPhone(c, local) : "");
        }}
        options={OPTIONS}
        searchable
        searchPlaceholder="Country or code, e.g. Pakistan or 92"
        triggerText={`+${DIAL_CODES[code] ?? ""}`}
        hideAsideOnTrigger
        floating
        disabled={disabled}
        aria-label={`Country code: ${country ? `${country.name} +${country.dial}` : "choose"}`}
        wrapperClassName="w-[6.75rem] shrink-0"
        className={`h-full rounded-lg border border-gold-light/60 px-2.5 py-2 text-sm ${invalid ? "border-red-600" : ""}`}
      />
      {/* The whole international number is what a form submits under `name`. */}
      {name !== undefined && <input type="hidden" name={name} value={value} />}
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        maxLength={30}
        required={required}
        disabled={disabled}
        value={local}
        placeholder={code === "GB" ? "7700 900123" : "Phone number"}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const typed = e.target.value;
          // A pasted international number picks its own country.
          if (typed.trim().startsWith("+")) {
            const p = splitPhone(typed, code);
            if (p.local !== typed.trim()) {
              setPicked(p.code);
              setLocalText(p.local);
              onChange(joinPhone(p.code, p.local));
              return;
            }
          }
          setLocalText(typed);
          onChange(typed.trim() ? joinPhone(code, typed) : "");
        }}
        className={`min-w-0 flex-1 ${inputClassName}`}
      />
    </div>
  );
}

/**
 * PhoneInput for forms read with FormData (no React state of their own): keeps
 * the value itself and submits the whole international number as `name`.
 */
export function PhoneField({
  defaultValue = "",
  ...rest
}: Omit<Parameters<typeof PhoneInput>[0], "value" | "onChange"> & { name: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return <PhoneInput {...rest} value={value} onChange={setValue} />;
}
