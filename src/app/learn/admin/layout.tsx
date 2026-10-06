// The sidebar is the portal's only navigation (see src/lib/learn/nav.ts);
// there is no second tab strip inside the page.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
