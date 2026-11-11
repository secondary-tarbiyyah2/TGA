"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { ApplicationsTab } from "@/components/learn/admissions/ApplicationsTab";
import { AdmissionsSettingsPanel } from "@/components/learn/admissions/AdmissionsSettingsPanel";
import { CallsAndBookings } from "@/components/learn/admissions/CallsAndBookings";
import { Tabs, tabPanelProps } from "@/components/learn/Tabs";
import { PageHeader } from "@/components/learn/PageHeader";

type Tab = "applications" | "calls" | "settings";

function AdmissionsContent() {
  const [tab, setTab] = useState<Tab>("applications");
  return (
    <div className="space-y-5">
      <PageHeader title="Admissions" subtitle="Online applications, plus admissions calls and bookings." />

      <Tabs
        items={[
          { key: "applications", label: "Applications" },
          { key: "calls", label: "Calls and bookings" },
          { key: "settings", label: "Email settings" },
        ]}
        value={tab}
        onChange={setTab}
        label="Admissions sections"
        guide="admissions-tabs"
        idBase="admissions"
      />

      <div {...tabPanelProps("admissions", tab)}>{tab === "applications" ? <ApplicationsTab /> : tab === "calls" ? <CallsAndBookings /> : <AdmissionsSettingsPanel />}</div>
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
