// The admin area's navigation now lives in the sidebar
// (src/components/learn/PortalSidebar.tsx, config in src/lib/learn/nav.ts),
// so every area gets the same sidebar. AdminShell stays as a
// thin wrapper so the admin pages that use it don't need changing.
export function AdminShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function PhasePlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h1 className="font-serif text-h2 font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink/65">
        This section is being built in a later phase. The page is real and access-controlled today — there&apos;s
        just nothing to manage here yet.
      </p>
    </div>
  );
}
