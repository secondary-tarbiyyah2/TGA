"use client";

import { LearnGate } from "@/components/learn/LearnGate";
import { useLearnSession, useLearnSignOut } from "@/lib/learn/session";

function StudentContent() {
  const { session } = useLearnSession();
  const signOut = useLearnSignOut();

  return (
    <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
      <h1 className="font-serif text-h2 font-semibold text-ink">Welcome.</h1>
      <p className="mt-1 text-sm text-ink/60">
        Signed in as {session && session !== "loading" ? session.user.email : ""}.
      </p>
      <p className="mt-4 text-sm text-ink/75">
        Your lessons, homework and progress will live here once the Learning Platform is built. For now this
        confirms your account is set up correctly.
      </p>
      <button type="button" onClick={signOut} className="mt-6 rounded-full border border-gold-500 px-4 py-2 text-sm text-gold-700 hover:bg-cream">
        Sign out
      </button>
    </div>
  );
}

export default function StudentDashboardPage() {
  return (
    <section className="section-pad">
      <LearnGate allowedRoles={["student"]}>
        <StudentContent />
      </LearnGate>
    </section>
  );
}
