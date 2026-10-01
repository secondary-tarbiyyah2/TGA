/** WhatsApp-style ticks for the sender's own messages: one tick = sent, two
 * teal ticks = read. Only shown when the caller has receipts on; read state
 * arrives from thread_receipts() already filtered by both parties' settings. */
export function ReadTicks({ readAt }: { readAt: string | null }) {
  const read = readAt !== null;
  const title = read ? `Read ${new Date(readAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Sent";
  return (
    <span title={title} aria-label={title} className={`ml-1 inline-block font-semibold tracking-[-0.2em] ${read ? "text-teal-200" : "text-white/70"}`}>
      {read ? "✓✓" : "✓"}
    </span>
  );
}
