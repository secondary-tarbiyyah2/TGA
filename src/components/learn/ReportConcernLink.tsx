import Link from "next/link";

/**
 * A small, always-visible link to /learn/report-concern — dropped next to
 * "Sign out" on every dashboard (admin, teach, family, student) so the
 * concern-reporting entry point required by the compliance brief is
 * reachable by every role, not buried in an admin-only page.
 */
export function ReportConcernLink() {
  return (
    <Link href="/report-concern" className="print:hidden rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 font-medium transition-colors">
      Report a concern
    </Link>
  );
}
