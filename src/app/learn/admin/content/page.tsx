"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { SiteSettingsEditor } from "@/components/learn/content/SiteSettingsEditor";
import { HomepageContentEditor } from "@/components/learn/content/HomepageContentEditor";
import { AboutContentEditor } from "@/components/learn/content/AboutContentEditor";
import { CurriculumContentEditor } from "@/components/learn/content/CurriculumContentEditor";
import { PolicyEditor } from "@/components/learn/documents/PolicyEditor";
import { FeesEditor } from "@/components/learn/content/FeesEditor";
import { SimpleListEditor } from "@/components/learn/content/SimpleListEditor";

// Real editor, replacing the old "link out to Sanity Studio" stub now
// that website content lives in this database (0025_website_content.sql)
// instead of a separate CMS — see content.ts for the read side. Tabbed
// rather than one long page: 12 content types is too much to scroll
// through, and most edits only ever touch one of them at a time.
const TABS = [
  "Site settings", "Homepage", "About page", "Curriculum page",
  "Fees", "FAQs", "Policies", "Term dates", "Testimonials", "Team", "Differentiators", "Curriculum documents",
] as const;
type Tab = (typeof TABS)[number];

function TabContent({ tab }: { tab: Tab }) {
  switch (tab) {
    case "Site settings":
      return <SiteSettingsEditor />;
    case "Homepage":
      return <HomepageContentEditor />;
    case "About page":
      return <AboutContentEditor />;
    case "Curriculum page":
      return <CurriculumContentEditor />;
    case "Fees":
      return <FeesEditor />;
    case "FAQs":
      return (
        <SimpleListEditor
          table="faq_entries"
          title="FAQs"
          description="Grouped by parent question on the public FAQs page. In answers, use {{applicationFee}}, {{registrationFee}}, {{terms}}, {{instalments}} and {{annualDiscount}} so figures follow your Fees settings automatically."
          orderKey="order_index"
          rowLabel={(r) => `${r.question}`}
          fields={[
            { key: "category", label: "Category", type: "select", options: ["Admissions", "Fees", "Curriculum", "Technology", "Islamic Studies", "SEND"], required: true },
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
          description="Only entries with Confirmed = on ever show on the public Term Dates page or its .ics download."
          orderKey="date"
          rowLabel={(r) => `${r.label} — ${r.date}${r.confirmed ? "" : " (not confirmed — hidden publicly)"}`}
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
          description="Placeholder testimonials never show publicly — only untick Placeholder once it's a real quote."
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
          description="Placeholder profiles never show publicly — only untick Placeholder once it's a real, confirmed bio."
          orderKey="order_index"
          rowLabel={(r) => `${r.name} — ${r.role_title}${r.is_placeholder ? " (placeholder)" : ""}`}
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
          rowLabel={(r) => `${r.title} — ${r.status}${r.visible ? "" : " (hidden)"}`}
          fields={[
            { key: "title", label: "Title", required: true },
            { key: "summary", label: "Summary", type: "textarea", required: true },
            { key: "detail", label: "Detail (optional, longer)", type: "textarea" },
            { key: "icon", label: "Icon key" },
            { key: "status", label: "Status", type: "select", options: ["Confirmed commitment", "Draft / concept — not yet confirmed"], required: true },
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
          rowLabel={(r) => `${r.title} (${r.key_stage} — ${r.subject})`}
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
  const [tab, setTab] = useState<Tab>("Site settings");
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold-light/50 bg-white p-6">
        <h1 className="font-serif text-h2 font-semibold text-ink">Website content</h1>
        <p className="mt-1 text-sm text-ink/60">Everything published on the public marketing site — managed here, not a separate CMS.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-gold-700 text-white" : "border border-gold-light/60 text-ink/70 hover:bg-cream"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <TabContent tab={tab} />
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
