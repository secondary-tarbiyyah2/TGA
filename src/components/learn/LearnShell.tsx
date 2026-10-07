// Teach/family/student navigation now lives in the sidebar
// (src/components/learn/PortalSidebar.tsx, config in src/lib/learn/nav.ts).
// LearnShell stays as a thin wrapper so the pages that use it don't need
// changing.
type Role = "teach" | "family" | "student";

export function LearnShell({ children }: { role: Role; children: React.ReactNode }) {
  return <>{children}</>;
}
