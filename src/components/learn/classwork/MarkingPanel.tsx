"use client";

import { SidePanel } from "@/components/learn/kit";
import { ReviewQueue } from "@/components/learn/classwork/ReviewQueue";

/**
 * Work waiting to be marked, in a panel over the page you are on (Today, Classwork to action),
 * instead of a separate page (owner, 11 Nov 2026; docs/portal-structure.md, pattern 3). It is
 * the To review list itself (`ReviewQueue`), so marking, returning and grades work as before.
 * Pass a class, or one piece of work, to open straight on it.
 */
export function MarkingPanel({ classId, homeworkId, title = "Work to mark", eyebrow, onClose, onCount }: { classId?: string; homeworkId?: string; title?: string; eyebrow?: string; onClose: () => void; onCount?: (n: number) => void }) {
  return (
    <SidePanel title={title} eyebrow={eyebrow || "Marking"} onClose={onClose} size="lg">
      <div data-guide="marking-panel">
        <ReviewQueue classId={classId} homeworkId={homeworkId} embedded onCount={onCount} />
      </div>
    </SidePanel>
  );
}
