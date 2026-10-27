export function formatGBP(amount: number): string {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A UK phone number as a dialable tel: href that works from abroad:
 * "020 3719 8697" -> "tel:+442037198697". Numbers already in +44 form are
 * left as they are.
 */
export function telHref(display: string): string {
  const digits = display.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.startsWith("0")) return `tel:+44${digits.slice(1)}`;
  return `tel:${digits}`;
}
