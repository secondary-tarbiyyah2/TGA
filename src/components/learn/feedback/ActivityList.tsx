import type { ActivityEvent } from "@/lib/learn/activityLog";
import { Icon, type IconName } from "@/components/learn/Icon";

const TYPE: Record<ActivityEvent["type"], { icon: IconName; tone: string; label: string }> = {
  page: { icon: "file", tone: "text-ink/65", label: "Page" },
  click: { icon: "circleCheck", tone: "text-ink/65", label: "Action" },
  error: { icon: "bug", tone: "text-red-700", label: "Error" },
  request: { icon: "shieldAlert", tone: "text-red-700", label: "Failed request" },
};

/** The recent-activity timeline attached to a feedback ticket, oldest first. */
export function ActivityList({ events, empty = "Nothing recorded yet in this browser tab." }: { events: ActivityEvent[]; empty?: string }) {
  if (!events || events.length === 0) return <p className="text-xs text-ink/65">{empty}</p>;
  const problems = events.filter((e) => e.type === "error" || e.type === "request").length;
  return (
    <div>
      {problems > 0 && (
        <p className="mb-2 text-xs font-medium text-red-700">
          {problems} error{problems === 1 ? "" : "s"} recorded
        </p>
      )}
      <ol className="max-h-56 space-y-1 overflow-y-auto pr-1 text-xs">
        {events.map((e, i) => {
          const t = TYPE[e.type] || TYPE.page;
          return (
            <li key={`${e.t}-${i}`} className="flex gap-2">
              <time dateTime={e.t} className="w-12 shrink-0 tabular-nums text-ink/65">
                {new Date(e.t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </time>
              <Icon name={t.icon} className={`mt-px h-3.5 w-3.5 shrink-0 ${t.tone}`} />
              <span className="sr-only">{t.label}:</span>
              <span className={`min-w-0 break-words ${e.type === "error" || e.type === "request" ? "text-red-800" : "text-ink"}`}>{e.detail}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
