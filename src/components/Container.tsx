export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[75rem] px-5 sm:px-8 lg:px-12 ${className}`}>{children}</div>;
}
