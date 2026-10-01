"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { ApplicationsTab } from "@/components/learn/admissions/ApplicationsTab";
import { AdmissionsSettingsPanel } from "@/components/learn/admissions/AdmissionsSettingsPanel";
import { CallsAndBookings } from "@/components/learn/admissions/CallsAndBookings";

type Tab = "applications" | "calls" | "settings";

function AdmissionsContent() {
  const [tab, setTab] = useState<Tab>("applications");
  const tabCls = (t: Tab) =>
    `rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-gold-500 text-ink-900" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Admissions</h1>
        <p className="mt-1 text-sm text-ink/60">Online applications, plus admissions calls and bookings.</p>
      </div>

      <div role="tablist" aria-label="Admissions sections" className="flex gap-2">
        <button type="button" role="tab" aria-selected={tab === "applications"} onClick={() => setTab("applications")} className={tabCls("applications")}>
          Applications
        </button>
        <button type="button" role="tab" aria-selected={tab === "calls"} onClick={() => setTab("calls")} className={tabCls("calls")}>
          Calls &amp; bookings
        </button>
        <button type="button" role="tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")} className={tabCls("settings")}>
          Email settings
        </button>
      </div>

      {tab === "applications" ? <ApplicationsTab /> : tab === "calls" ? <CallsAndBookings /> : <AdmissionsSettingsPanel />}
    </div>
  );
}

export default function AdminAdmissionsPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <AdmissionsContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
