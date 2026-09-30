// Teach/family/student navigation now lives in the shared portal header
// (src/app/learn/layout.tsx + PortalNav, config in src/lib/learn/nav.ts).
// LearnShell stays as a thin wrapper so the pages that use it don't need
// changing.
type Role = "teach" | "family" | "student";

export function LearnShell({ children }: { role: Role; children: React.ReactNode }) {
  return <>{children}</>;
}
