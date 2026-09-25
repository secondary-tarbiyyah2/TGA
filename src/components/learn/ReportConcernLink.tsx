import Link from "next/link";

/**
 * A small, always-visible link to /learn/report-concern — dropped next to
 * "Sign out" on every dashboard (admin, teach, family, student) so the
 * concern-reporting entry point required by the compliance brief is
 * reachable by every role, not buried in an admin-only page.
 */
export function ReportConcernLink() {
  return (
    <Link href="/learn/report-concern" className="print:hidden rounded-full border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50">
      Report a concern
    </Link>
  );
}
