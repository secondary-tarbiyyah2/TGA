"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { PageHeader } from "@/components/learn/PageHeader";
import { SectionLayout, SectionNav } from "@/components/learn/SectionNav";

export type SettingsSection<K extends string> = {
  key: K;
  label: string;
  /** One line under the section's heading saying what it changes. */
  description?: ReactNode;
  content: ReactNode;
  count?: number;
};

/**
 * Settings page layout (Reports > Settings, School settings, Account, Admissions and
 * Recruitment settings, Academic setup): grouped configuration with the sections down the
 * left (a dropdown on phones) and one section shown at a time, so there is little scrolling.
 *
 * Inside a section, use SettingsGroup (label and description left, controls right) for each
 * group, and a SaveBar where a form saves as a whole. Lists that save as you add (a comment
 * bank) need no SaveBar: they confirm with a toast.
 *
 * `embedded` drops the page header, for a settings view inside a workspace that already has
 * one (Reports). Give `value` and `onChange` to keep the section in the address.
 */
export function SettingsPage<K extends string>({ header, sections, value, onChange, embedded = false, guide, navLabel = "Settings sections" }: { header?: ComponentProps<typeof PageHeader>; sections: SettingsSection<K>[]; value?: K; onChange?: (k: K) => void; embedded?: boolean; guide?: string; navLabel?: string }) {
  const [own, setOwn] = useState<K>(sections[0]?.key);
  const current = (value && sections.some((s) => s.key === value) ? value : own) as K;
  const pick = (k: K) => (onChange ? onChange(k) : setOwn(k));
  const s = sections.find((x) => x.key === current) || sections[0];
  const body = s && (
    <section aria-labelledby={`settings-${s.key}`} className="min-w-0">
      <div className="mb-5">
        <h2 id={`settings-${s.key}`} className="t-section text-base">
          {s.label}
        </h2>
        {s.description && <p className="t-meta mt-0.5 max-w-prose">{s.description}</p>}
      </div>
      {s.content}
    </section>
  );
  return (
    <div data-template="settings" data-guide={guide} className="min-w-0">
      {header && !embedded && <PageHeader {...header} />}
      {sections.length > 1 ? (
        <SectionLayout nav={<SectionNav id="settings-section" label={navLabel} items={sections.map(({ key, label, count }) => ({ key, label, count }))} value={current} onChange={pick} />}>{body}</SectionLayout>
      ) : (
        body
      )}
    </div>
  );
}
