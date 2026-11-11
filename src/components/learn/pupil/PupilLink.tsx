"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { portalAreaFor } from "@/lib/learn/nav";

/** Where a pupil's full record lives for staff in each area. Families and pupils have none. */
export function pupilRecordHref(area: string | null, id: string): string | null {
  if (area === "admin") return `/admin/pupils?id=${id}`;
  if (area === "teach") return `/teach/pupils?id=${id}`;
  return null;
}

/**
 * A pupil's name that opens their full record (owner, 11 Nov 2026: "shouldn't I be able to
 * press on the students' names and get their full info?"). Staff in the head's area go to the
 * pupil record, teachers to the teacher's pupil page; in the family and pupil areas the name
 * is plain text. Use this wherever a pupil's name is shown to staff.
 */
export function PupilLink({ id, name, className = "", children }: { id: string | null | undefined; name: string; className?: string; children?: ReactNode }) {
  const pathname = usePathname() || "";
  const href = id ? pupilRecordHref(portalAreaFor(pathname), id) : null;
  if (!href) return <span className={className}>{children ?? name}</span>;
  return (
    <Link href={href} className={`rounded-sm font-medium text-ink underline-offset-2 hover:text-forest-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${className}`} title={`Open ${name}'s record`}>
      {children ?? name}
    </Link>
  );
}
