"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { SiteSettingsEditor } from "@/components/learn/content/SiteSettingsEditor";
import { HomepageContentEditor } from "@/components/learn/content/HomepageContentEditor";
import { AboutContentEditor } from "@/components/learn/content/AboutContentEditor";
import { CurriculumContentEditor } from "@/components/learn/content/CurriculumContentEditor";
import { KeyStagePagesEditor } from "@/components/learn/content/KeyStagePagesEditor";
import { PolicyEditor } from "@/components/learn/documents/PolicyEditor";
import { FeesEditor } from "@/components/learn/content/FeesEditor";
import { SimpleListEditor } from "@/components/learn/content/SimpleListEditor";
import { PageHeader } from "@/components/learn/PageHeader";
import { Tabs } from "@/components/learn/Tabs";
import { formatDateKey } from "@/lib/learn/ukTime";

// Real editor, replacing the old "link out to Sanity Studio" stub now
// that website content lives in this database (0025_website_content.sql)
// instead of a separate CMS, see content.ts for the read side. Twelve
// editors grouped into four sections (pages, fees, policies, lists) with
// a small switch inside each, instead of a wall of twelve buttons.
const TABS = [
  "Site settings", "Homepage", "About page", "Curriculum page",
  "Fees", "FAQs", "Policies", "Term dates", "Testimonials", "Team", "Differentiators", "Curriculum documents",
] as const;
type Tab = (typeof TABS)[number];

type Group = "pages" | "fees" | "policies" | "lists";
const GROUPS: { key: Group; label: string; tabs: Tab[] }[] = [
  { key: "pages", label: "Pages and settings", tabs: ["Site settings", "Homepage", "About page", "Curriculum page"] },
  { key: "fees", label: "Fees", tabs: ["Fees"] },
  { key: "policies", label: "Policies", tabs: ["Policies"] },
  { key: "lists", label: "Lists", tabs: ["FAQs", "Term dates", "Testimonials", "Team", "Differentiators", "Curriculum documents"] },
];
const groupOf = (t: Tab): Group => GROUPS.find((g) => g.tabs.includes(t))?.key || "pages";
const slug = (t: Tab) => t.toLowerCase().replace(/\s+/g, "-");
const fromSlug = (h: string): Tab | undefined => TABS.find((t) => slug(t) === h);

function TabContent({ tab }: { tab: Tab }) {
  switch (tab) {
    case "Site settings":
      return <SiteSettingsEditor />;
    case "Homepage":
      return <HomepageContentEditor />;
    case "About page":
      return <AboutContentEditor />;
    case "Curriculum page":
      return (
        <div className="space-y-6">
          <CurriculumContentEditor />
          <KeyStagePagesEditor />
        </div>
      );
    case "Fees":
      return <FeesEditor />;
    case "FAQs":
      return (
        <SimpleListEditor
          table="faq_entries"
          title="FAQs"
          description="Grouped by parent question on the public FAQs page. In answers, use {{applicationFee}}, {{terms}}, {{instalments}} and {{annualDiscount}} so figures follow your Fees settings automatically."
          orderKey="order_index"
          searchable
          rowLabel={(r) => `${r.category ? `${r.category}: ` : ""}${r.question}`}
          fields={[
            { key: "category", label: "Category", type: "select", options: ["Admissions", "School day", "Fees", "Curriculum", "Islamic Studies", "Technology", "SEND", "Safeguarding"], required: true },
            { key: "order_index", label: "Display order", type: "number" },
            { key: "question", label: "Question", required: true },
            { key: "answer", label: "Answer", type: "textarea", required: true },
          ]}
        />
      );
    case "Policies":
      return <PolicyEditor />;
    case "Term dates":
      return (
        <SimpleListEditor
          table="site_term_dates"
          title="Term dates & admissions calendar"
          description="The public Term Dates page and its .ics download. Only entries with Confirmed ticked are shown. The portal calendar's own terms and closures are set separately under Calendar, Terms."
          orderKey="date"
          searchable
          rowLabel={(r) => `${r.label} · ${formatDateKey(String(r.date))}${r.end_date ? ` to ${formatDateKey(String(r.end_date))}` : ""}${r.confirmed ? "" : " (not confirmed, hidden publicly)"}`}
          fields={[
            { key: "label", label: "Label", required: true },
            { key: "kind", label: "Kind", type: "select", options: ["Term date", "Holiday", "Admissions deadline", "Event"], required: true },
            { key: "date", label: "Date", type: "date", required: true },
            { key: "end_date", label: "End date (optional, for a range)", type: "date" },
            { key: "notes", label: "Notes" },
            { key: "confirmed", label: "Confirmed (show publicly)", type: "boolean" },
          ]}
        />
      );
    case "Testimonials":
      return (
        <SimpleListEditor
          table="testimonials"
          title="Testimonials"
          description="Placeholder testimonials never show publicly, only untick Placeholder once it's a real quote."
          orderKey="order_index"
          rowLabel={(r) => `${r.attribution}${r.is_placeholder ? " (placeholder)" : ""}`}
          fields={[
            { key: "quote", label: "Quote", type: "textarea", required: true },
            { key: "attribution", label: "Attribution", required: true },
            { key: "role", label: "Role", type: "select", options: ["Parent", "Student"], required: true },
            { key: "is_placeholder", label: "Placeholder (hidden publicly)", type: "boolean" },
            { key: "order_index", label: "Display order", type: "number" },
          ]}
        />
      );
    case "Team":
      return (
        <SimpleListEditor
          table="team_profiles"
          title="Team profiles"
          description="Placeholder profiles never show publicly, only untick Placeholder once it's a real, confirmed bio."
          orderKey="order_index"
          rowLabel={(r) => `${r.name} · ${r.role_title}${r.is_placeholder ? " (placeholder)" : ""}`}
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "role_title", label: "Role title", required: true },
            { key: "qualifications", label: "Qualifications", type: "textarea" },
            { key: "intro_video_url", label: "Intro video URL" },
            { key: "is_placeholder", label: "Placeholder (hidden publicly)", type: "boolean" },
            { key: "order_index", label: "Display order", type: "number" },
          ]}
        />
      );
    case "Differentiators":
      return (
        <SimpleListEditor
          table="differentiators"
          title="Differentiators ('What makes us different')"
          description="Only 'Confirmed commitment' + Visible entries show on the homepage."
          orderKey="order_index"
          rowLabel={(r) => `${r.title} · ${r.status === "Confirmed commitment" ? "Confirmed" : "Draft"}${r.visible ? "" : " (hidden)"}`}
          fields={[
            { key: "title", label: "Title", required: true },
            { key: "summary", label: "Summary", type: "textarea", required: true },
            { key: "detail", label: "Detail (optional, longer)", type: "textarea" },
            { key: "icon", label: "Icon key" },
            {
              key: "status",
              label: "Status",
              type: "select",
              // The second value is fixed by a database check, so only its label is reworded.
              options: ["Confirmed commitment", "Draft / concept \u2014 not yet confirmed"],
              optionLabels: { "Draft / concept \u2014 not yet confirmed": "Draft or concept, not yet confirmed" },
              required: true,
            },
            { key: "visible", label: "Visible", type: "boolean" },
            { key: "order_index", label: "Display order", type: "number" },
          ]}
        />
      );
    case "Curriculum documents":
      return (
        <SimpleListEditor
          table="curriculum_documents"
          title="Curriculum documents"
          description="Scheme-of-work / subject overview PDFs shown on each key stage's curriculum page."
          orderKey="order_index"
          rowLabel={(r) => `${r.title} (${r.key_stage} · ${r.subject})`}
          fields={[
            { key: "key_stage", label: "Key stage slug (e.g. year-3-6)", required: true },
            { key: "subject", label: "Subject", required: true },
            { key: "title", label: "Title", required: true },
            { key: "term", label: "Term", type: "select", options: ["autumn", "spring", "summer"] },
            { key: "file_url", label: "File URL", required: true },
            { key: "order_index", label: "Display order", type: "number" },
          ]}
        />
      );
  }
}

function ContentAdmin() {
  const [tab, setTabState] = useState<Tab>("Site settings");
  // Editors you have opened stay mounted (just hidden), so switching to
  // another section and back no longer throws away unsaved typing.
  const [visited, setVisited] = useState<Tab[]>(["Site settings"]);
  const setTab = (t: Tab) => {
    setTabState(t);
    setVisited((v) => (v.includes(t) ? v : [...v, t]));
    try {
      window.history.replaceState(null, "", `#${slug(t)}`);
    } catch {
      /* ignore */
    }
  };
  // Reloading the page keeps you on the same editor.
  useEffect(() => {
    const t = fromSlug(window.location.hash.slice(1));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of the URL hash on mount
    if (t) setTab(t);
  }, []);
  const group = GROUPS.find((g) => g.key === groupOf(tab)) || GROUPS[0];
  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "Home", href: "/admin/dashboard" }, { label: "Website content" }]}
        title="Website content"
        subtitle="Everything published on the public website. Most changes go live a few minutes after you save."
      />
      <Tabs
        items={GROUPS.map((g) => ({ key: g.key, label: g.label }))}
        value={group.key}
        onChange={(k) => setTab(GROUPS.find((g) => g.key === k)!.tabs[0])}
        label="Website content sections"
      />
      {group.tabs.length > 1 && <Tabs variant="switch" items={group.tabs.map((t) => ({ key: t, label: t }))} value={tab} onChange={setTab} label={`${group.label} editors`} />}
      {tab === "Policies" && (
        <p className="text-sm text-ink/65">
          To choose who has to sign a policy, use <Link href="/admin/documents" className="font-medium text-teal-700 underline">Policies and signatures</Link>.
        </p>
      )}
      {visited.map((t) => (
        <div key={t} hidden={t !== tab}>
          <TabContent tab={t} />
        </div>
      ))}
    </div>
  );
}

export default function AdminWebsiteContentPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <ContentAdmin />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
