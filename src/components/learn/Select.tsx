"use client";

import type { ComponentProps } from "react";
import { Select as SiteSelect } from "@/components/ui/Dropdown";
import { ui } from "@/components/learn/ui";

/**
 * The portal's dropdown: the site's own <Select> (src/components/ui/Dropdown.tsx)
 * set up to behave exactly like the browser <select> it replaces, so pages keep
 * the same values, `name`, `required`, `disabled` and `onChange(e)`:
 *   - an "All ..." / "None" option with value "" can be picked again;
 *   - with no value or defaultValue the first option starts chosen;
 *   - the list floats over the page, so it isn't cut off inside tables and
 *     cards, and is kept on screen on a 360px phone;
 *   - lists of more than 12 options get a search box.
 *
 * Use it like a <select>: <Select value={v} onChange={(e) => set(e.target.value)} className={ui.select}>
 * <option value="">All</option>...</Select>. Never use a bare <select> in the
 * portal (a unit test checks).
 */

// Classes that place the field in its row (width, margins, flex/grid) belong
// on the outer wrapper; the rest (border, padding, text) style the button.
const LAYOUT = /^(?:[a-z0-9-]+:)*!?(?:-?m[trblxyse]?-|w-|min-w-|max-w-|flex-(?!row|col|wrap)|basis-|grow|shrink|self-|justify-self-|col-|row-|order-|block$|inline-block$|inline$|hidden$|contents$)/;

export function Select({ className, wrapperClassName, ...props }: ComponentProps<typeof SiteSelect>) {
  const all = (className ?? ui.select).split(/\s+/).filter(Boolean);
  const layout = all.filter((c) => LAYOUT.test(c));
  const look = all.filter((c) => !LAYOUT.test(c));
  return (
    <SiteSelect
      native
      floating
      {...props}
      className={look.join(" ")}
      wrapperClassName={[layout.join(" "), wrapperClassName ?? ""].join(" ").trim()}
    />
  );
}
