"use client";

import { useId, useMemo } from "react";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { COUNTRY_ZONES } from "@/lib/countryZones.generated";
import { countryByCode, matchZone, placeTimeName, zonesFor } from "@/lib/place";
import { gmtOffsetLabel, UK_TIME_ZONE } from "@/lib/timezones";

/** Countries most of our families join from, listed first. */
const COMMON = ["GB", "IE", "AE", "SA", "QA", "KW", "BH", "OM", "EG", "TR", "PK", "IN", "BD", "MY", "NG", "GH", "KE", "SO", "ZA", "MA", "US", "CA", "AU"];

/**
 * "Where are you joining from?": country first, then (only for countries
 * with several time zones) which part of it. Every time on the page is then
 * shown in that place's time, with UK time alongside.
 */
export function PlacePicker({
  country,
  tz,
  fromDevice,
  onChange,
  title = "Where are you joining from?",
  compact = false,
}: {
  country: string | null;
  tz: string;
  /** True until the family has chosen; we say the place came from their device. */
  fromDevice: boolean;
  onChange: (country: string | null, tz: string) => void;
  title?: string;
  /** Smaller heading, for use inside a question that already has one. */
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const now = useMemo(() => new Date(), []);

  const countryOptions = useMemo<DropdownOption[]>(() => {
    const opt = (code: string, group: string): DropdownOption | null => {
      const c = countryByCode(code);
      if (!c) return null;
      const zones = zonesFor(c);
      if (zones.length === 0) return null;
      return {
        value: c.code,
        label: c.name,
        icon: c.flag || undefined,
        aside: zones.length === 1 ? gmtOffsetLabel(zones[0].tz, now) : `${zones.length} time zones`,
        keywords: c.keywords,
        group,
      };
    };
    const common = COMMON.map((c) => opt(c, "Where most families join from")).filter(Boolean) as DropdownOption[];
    const all = COUNTRY_ZONES.map((c) => opt(c.code, "All countries A to Z")).filter(Boolean) as DropdownOption[];
    return [...common, ...all];
  }, [now]);

  const entry = countryByCode(country);
  const zones = entry ? zonesFor(entry) : [];
  const zone = entry ? matchZone(entry, tz) : undefined;
  const multi = zones.length > 1;

  const zoneOptions: DropdownOption[] = zones.map((z) => ({ value: z.tz, label: z.label || entry!.name, aside: gmtOffsetLabel(z.tz, now) }));
  // A device zone we don't list (e.g. America/Detroit) still shows as itself until they choose.
  if (multi && !zone) zoneOptions.unshift({ value: tz, label: `Your device's time zone (${tz.split("/").pop()?.replace(/_/g, " ")})`, aside: gmtOffsetLabel(tz, now) });

  const chooseCountry = (code: string) => {
    const c = countryByCode(code);
    if (!c) return;
    const keep = matchZone(c, tz);
    onChange(code, keep?.tz ?? zonesFor(c)[0].tz);
  };

  const name = placeTimeName(tz, country);
  const offset = gmtOffsetLabel(tz, now);
  const triggerCls = "rounded-2xl border-[1.5px] border-gold-light/70 px-4 py-3 text-base";

  return (
    <div>
      <p id={`${uid}-title`} className={compact ? "text-sm font-semibold text-ink" : "font-serif text-lg font-semibold text-ink"}>
        {title}
      </p>
      <div className="mt-2 grid gap-2.5">
        <Dropdown
          id={`${uid}-country`}
          aria-labelledby={`${uid}-title`}
          value={entry?.code ?? ""}
          onChange={chooseCountry}
          options={countryOptions}
          placeholder="Choose your country"
          searchable
          searchPlaceholder="Search for your country or city"
          emptyText="No country matches that. Try its English name or your nearest city."
          className={triggerCls}
          hideAsideOnTrigger={multi}
        />
        {multi && (
          <div>
            <p className="mb-1 text-sm text-ink/70">Which part of {entry!.name}?</p>
            <Dropdown
              id={`${uid}-zone`}
              aria-label={`Which part of ${entry!.name}?`}
              value={zone?.tz ?? tz}
              onChange={(next) => onChange(entry!.code, next)}
              options={zoneOptions}
              searchable={false}
              className={triggerCls}
            />
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-ink/70" aria-live="polite">
        {tz === UK_TIME_ZONE ? (
          <>Times are shown in UK time.</>
        ) : (
          <>
            Times are shown in <span className="font-semibold text-ink">{name} time</span>
            {offset ? ` (${offset})` : ""}, with UK time alongside.
          </>
        )}
        {fromDevice && <> We have picked this from your device, so please check it.</>}
      </p>
    </div>
  );
}
