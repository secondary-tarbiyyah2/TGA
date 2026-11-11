"use client";

import Link from "next/link";
import { SidePanel } from "@/components/learn/kit";
import { ui } from "@/components/learn/ui";
import { Register } from "@/components/learn/attendance/Register";

/**
 * A lesson's register in a panel over the page you are on (Today, the head's Today, a class),
 * instead of sending you to the registers page (owner, 11 Nov 2026; docs/portal-structure.md,
 * pattern 3). It is the same `Register` (it saves each mark as you go), so nothing about who
 * can mark or what is stored changes.
 */
export function RegisterPanel({
  lessonId,
  classId,
  className,
  when,
  lessonHref,
  onClose,
  onProgress,
}: {
  lessonId: string;
  classId: string;
  className: string;
  /** "09:00 to 10:00", shown above the title. */
  when?: string;
  /** The lesson's own page, linked at the foot for anything more. */
  lessonHref?: string;
  onClose: () => void;
  onProgress?: (taken: number, total: number) => void;
}) {
  return (
    <SidePanel
      title={`Register: ${className}`}
      eyebrow={when ? `Today, ${when}` : "Register"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ui.btnPrimary}>
            Done
          </button>
          {lessonHref && (
            <Link href={lessonHref} className="ml-auto text-sm font-medium text-forest-700 hover:underline">
              Open the lesson page
            </Link>
          )}
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-500">Each mark is saved as you choose it.</p>
      <div data-guide="register-panel" className="-mx-5">
        <Register lessonId={lessonId} classId={classId} onProgress={onProgress} />
      </div>
    </SidePanel>
  );
}
