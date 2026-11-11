"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { displayName, signedPhotoUrls, type TeacherCardData } from "@/lib/learn/staffProfiles";
import { StaffAvatar } from "@/components/learn/staff/StaffAvatar";
import Link from "next/link";

function useTeachers(classId?: string) {
  const [teachers, setTeachers] = useState<TeacherCardData[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.rpc("meet_my_teachers", { p_class_id: classId ?? null });
      if (cancelled) return;
      if (err) {
        setError(true);
        return setTeachers([]);
      }
      const rows = (data as TeacherCardData[] | null) || [];
      setTeachers(rows);
      const urls = await signedPhotoUrls(
        supabase,
        rows.map((r) => r.photo_path).filter((p): p is string => !!p),
      );
      if (!cancelled) setPhotos(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  return { teachers, photos, error };
}

function TeacherCard({ t, photo, showClasses, messageHref }: { t: TeacherCardData; photo?: string; showClasses: boolean; messageHref?: string }) {
  const name = displayName(t.full_name, t.display_title);
  const subjects = t.subjects_taught || [];
  const languages = t.languages || [];
  const hasProfile = !!(t.bio || t.qualifications || subjects.length || t.years_experience != null || languages.length);
  return (
    <li className="rounded-xl border border-gold-light/70 bg-white p-4">
      <div className="flex items-start gap-3">
        <StaffAvatar name={t.full_name} src={photo} size={56} />
        <div className="min-w-0">
          <h3 className="font-semibold text-ink [overflow-wrap:anywhere]">{name}</h3>
          {showClasses && t.class_names && t.class_names.length > 0 && <p className="text-xs text-ink/65">{t.class_names.join(", ")}</p>}
          {subjects.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Subjects taught">
              {subjects.map((s) => (
                <li key={s} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-900">
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {hasProfile ? (
        <div className="mt-3 space-y-2 text-sm text-ink/80">
          {t.bio && <p className="whitespace-pre-line">{t.bio}</p>}
          {t.qualifications && (
            <p>
              <span className="font-medium text-ink">Qualifications: </span>
              {t.qualifications}
            </p>
          )}
          {(t.years_experience != null || languages.length > 0) && (
            <p className="text-xs text-ink/65">{[t.years_experience != null ? `${t.years_experience} years teaching` : "", languages.length ? `Speaks ${languages.join(", ")}` : ""].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink/65">{name} hasn&apos;t added a profile yet.</p>
      )}
      {(t.contact_email || messageHref) && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {messageHref && (
            <Link href={messageHref} className="font-medium text-teal-700 hover:underline">
              Send a message
            </Link>
          )}
          {t.contact_email && (
            <a href={`mailto:${t.contact_email}`} className="font-medium text-teal-700 [overflow-wrap:anywhere] hover:underline">
              {t.contact_email}
            </a>
          )}
        </p>
      )}
    </li>
  );
}

/**
 * "Meet your teachers": the safe subset of each teacher's profile (name,
 * title, bio, qualifications, subjects, photo) for the classes the signed-in
 * family/student is in. Data comes only from meet_my_teachers() (0067).
 * Pass classId to narrow to one class.
 */
export function MeetYourTeachers({ classId, bare = false, messageHref }: { classId?: string; bare?: boolean; /** Parents: where "Send a message" goes (the Messages inbox). */ messageHref?: string }) {
  const { teachers, photos, error } = useTeachers(classId);

  const body =
    teachers === null ? (
      <div className="h-24 motion-safe:animate-pulse rounded-xl bg-cream" />
    ) : error ? (
      <p className="text-sm text-amber-900">Couldn&apos;t load your teachers just now.</p>
    ) : teachers.length === 0 ? (
      <p className="text-sm text-ink/65">Your teachers will appear here once classes have been assigned.</p>
    ) : (
      <ul data-guide="teacher-cards" className="grid gap-3 sm:grid-cols-2">
        {teachers.map((t) => (
          <TeacherCard key={t.teacher_id} t={t} photo={t.photo_path ? photos[t.photo_path] : undefined} showClasses={!classId} messageHref={messageHref} />
        ))}
      </ul>
    );

  if (bare) return body;
  return (
    <section aria-labelledby="meet-teachers-heading" className="rounded-2xl border border-gold-light bg-white p-5">
      <h2 id="meet-teachers-heading" className="text-sm font-semibold text-ink">
        Meet your teachers
      </h2>
      <div className="mt-3">{body}</div>
    </section>
  );
}
