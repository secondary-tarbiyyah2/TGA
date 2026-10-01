"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  MAX_PHOTO_BYTES,
  STAFF_PHOTO_BUCKET,
  STAFF_PROFILE_COLUMNS,
  signedPhotoUrls,
  splitList,
  type StaffProfile,
} from "@/lib/learn/staffProfiles";
import { StaffAvatar } from "@/components/learn/staff/StaffAvatar";

const INPUT = "mt-1 w-full rounded-lg border border-gold-light/60 bg-white px-3 py-2 text-sm text-ink";
const LABEL = "block text-sm font-medium text-ink";

type FormState = {
  display_title: string;
  bio: string;
  qualifications: string;
  subjects: string;
  years: string;
  languages: string;
  contact_visible: boolean;
  photo_path: string | null;
};

const EMPTY: FormState = { display_title: "", bio: "", qualifications: "", subjects: "", years: "", languages: "", contact_visible: false, photo_path: null };

function toForm(p: StaffProfile | null): FormState {
  if (!p) return EMPTY;
  return {
    display_title: p.display_title || "",
    bio: p.bio || "",
    qualifications: p.qualifications || "",
    subjects: (p.subjects_taught || []).join(", "),
    years: p.years_experience == null ? "" : String(p.years_experience),
    languages: (p.languages || []).join(", "),
    contact_visible: p.contact_visible,
    photo_path: p.photo_path,
  };
}

/**
 * The teacher-facing profile editor, shared by "My profile" (a teacher edits
 * their own row) and the admin staff page (Headteacher/Admin edit any).
 * RLS decides who may save; nothing here is an access check.
 */
export function StaffProfileForm({ userId, fullName }: { userId: string; fullName: string }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("staff_profiles").select(STAFF_PROFILE_COLUMNS).eq("user_id", userId).maybeSingle();
      if (cancelled) return;
      const next = toForm((data as StaffProfile | null) ?? null);
      setForm(next);
      setLoaded(true);
      if (next.photo_path) {
        const urls = await signedPhotoUrls(supabase, [next.photo_path]);
        if (!cancelled) setPhotoUrl(urls[next.photo_path] || null);
      } else {
        setPhotoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onPhoto = async (file: File | undefined) => {
    const supabase = getSupabaseClient();
    if (!supabase || !file) return;
    setMsg(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setMsg({ kind: "err", text: "Please choose a JPEG, PNG or WebP image." });
    if (file.size > MAX_PHOTO_BYTES) return setMsg({ kind: "err", text: "That photo is over 2 MB. Please choose a smaller one." });
    setBusy(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(STAFF_PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) return setMsg({ kind: "err", text: "Couldn't upload the photo. Please try again." });
      const old = form.photo_path;
      set("photo_path", path);
      const urls = await signedPhotoUrls(supabase, [path]);
      setPhotoUrl(urls[path] || null);
      if (old) await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([old]);
      setMsg({ kind: "ok", text: "Photo added. Press Save profile to publish it." });
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = () => {
    set("photo_path", null);
    setPhotoUrl(null);
    setMsg({ kind: "ok", text: "Photo removed. Press Save profile to confirm." });
  };

  const save = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      const years = form.years.trim() === "" ? null : Number(form.years);
      if (years !== null && (!Number.isInteger(years) || years < 0 || years > 60)) return setMsg({ kind: "err", text: "Years of experience should be a whole number from 0 to 60." });
      const { error } = await supabase.from("staff_profiles").upsert(
        {
          user_id: userId,
          display_title: form.display_title.trim() || null,
          bio: form.bio.trim() || null,
          qualifications: form.qualifications.trim() || null,
          subjects_taught: splitList(form.subjects),
          years_experience: years,
          languages: splitList(form.languages),
          photo_path: form.photo_path,
          contact_visible: form.contact_visible,
        },
        { onConflict: "user_id" },
      );
      setMsg(error ? { kind: "err", text: "Couldn't save the profile. Check the lengths and try again." } : { kind: "ok", text: "Profile saved. Families of your classes can now see it." });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <StaffAvatar name={fullName} src={photoUrl} size={72} />
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/80 hover:bg-cream">
            {form.photo_path ? "Replace photo" : "Add a photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {form.photo_path && (
            <button type="button" onClick={removePhoto} className="rounded-lg border border-gold-light bg-white px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-cream">
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div>
          <label className={LABEL} htmlFor="sp-title">
            Title
          </label>
          <input id="sp-title" className={INPUT} value={form.display_title} maxLength={20} placeholder="Mr, Mrs, Ustadh…" onChange={(e) => set("display_title", e.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="sp-years">
            Years of teaching experience
          </label>
          <input id="sp-years" className={INPUT} inputMode="numeric" value={form.years} placeholder="e.g. 8" onChange={(e) => set("years", e.target.value.replace(/[^0-9]/g, ""))} />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="sp-bio">
          About me <span className="font-normal text-ink/50">(shown to families and students)</span>
        </label>
        <textarea id="sp-bio" className={INPUT} rows={4} maxLength={2000} value={form.bio} onChange={(e) => set("bio", e.target.value)} />
      </div>

      <div>
        <label className={LABEL} htmlFor="sp-qual">
          Qualifications
        </label>
        <textarea id="sp-qual" className={INPUT} rows={2} maxLength={1000} value={form.qualifications} onChange={(e) => set("qualifications", e.target.value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="sp-subjects">
            Subjects taught <span className="font-normal text-ink/50">(comma separated)</span>
          </label>
          <input id="sp-subjects" className={INPUT} value={form.subjects} placeholder="Qur'an, Arabic, Maths" onChange={(e) => set("subjects", e.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="sp-lang">
            Languages <span className="font-normal text-ink/50">(comma separated)</span>
          </label>
          <input id="sp-lang" className={INPUT} value={form.languages} placeholder="English, Arabic, Urdu" onChange={(e) => set("languages", e.target.value)} />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-1" checked={form.contact_visible} onChange={(e) => set("contact_visible", e.target.checked)} />
        <span>
          Show my school email to families of my classes
          <span className="block text-xs text-ink/55">Off by default. Families can always message you through the portal.</span>
        </span>
      </label>

      {msg && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-teal-100/60 text-ink" : "bg-amber-50 text-amber-900"}`}>
          {msg.text}
        </p>
      )}

      <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
        {busy ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}
