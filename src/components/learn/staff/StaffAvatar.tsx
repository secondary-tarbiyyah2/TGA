import { initialsOf } from "@/lib/learn/staffProfiles";

/** Round photo, or initials when there is no photo. Decorative: the name is always printed beside it. */
export function StaffAvatar({ name, src, size = 56 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL on a static export; next/image is unoptimised here
    return <img src={src} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span aria-hidden="true" style={style} className="flex shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-semibold text-gold-900">
      {initialsOf(name)}
    </span>
  );
}
