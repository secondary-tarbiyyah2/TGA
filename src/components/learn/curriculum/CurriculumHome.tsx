"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/learn/PageHeader";
import { ActionsMenu, type MenuAction } from "@/components/learn/kit";
import { Icon } from "@/components/learn/Icon";
import { btn } from "@/components/learn/ui";
import { CurriculumBrowser } from "@/components/learn/curriculum/CurriculumBrowser";
import { CurriculumLibrary } from "@/components/learn/curriculum/CurriculumLibrary";
import { TermResources } from "@/components/learn/curriculum/TermResources";

/** The Curriculum's views and tools, offered from the browser's header (one menu, not a strip). */
export function curriculumTools(area: "admin" | "teach"): MenuAction[] {
  return [
    { label: "Curriculum map", icon: "map", href: `/${area}/curriculum/map`, hint: "The year as six half terms" },
    { label: "Planner", icon: "layoutGrid", href: `/${area}/planner`, hint: "Edit the long-term plan" },
    { label: "Lesson review", icon: "clipboardCheck", href: `/${area}/curriculum/review`, hint: "Approve and publish lessons" },
    { label: "Syllabus", icon: "scrollText", href: `/${area}/syllabus`, hint: "Specifications and plans by subject" },
    { label: "Resources by term", icon: "fileText", href: `/${area}/curriculum/resources?terms=1`, hint: "Each term's printable list" },
  ];
}

function Inner({ area, mode }: { area: "admin" | "teach"; mode: "library" | "resources" }) {
  const params = useSearchParams();
  const router = useRouter();
  const classic = params.get("classic") === "1";
  const terms = params.get("terms") === "1";
  // Resources live in the same browser now: the old Resources address opens it showing resources.
  const toBrowser = mode === "resources" && !terms;
  useEffect(() => {
    if (toBrowser) router.replace(`/${area}/curriculum?type=resources`);
  }, [toBrowser, area, router]);
  if (toBrowser) return null;
  const crumbs = [{ label: "Today", href: `/${area}/dashboard` }, { label: "Curriculum", href: `/${area}/curriculum` }];

  if (mode === "resources" && terms)
    return (
      <>
        <PageHeader crumbs={[...crumbs, { label: "Resources by term" }]} title="Resources by term" subtitle="Every resource the lessons use, term by term. The same resources sit in each unit's folder in the Curriculum." back={{ label: "Curriculum", href: `/${area}/curriculum?type=resources` }} />
        <TermResources area={area} />
      </>
    );

  if (classic)
    return (
      <>
        <PageHeader
          crumbs={[...crumbs, { label: "Unit tools" }]}
          title="Unit tools"
          subtitle="The unit's lessons with every action, its specification points, connections, revision pack and pupil results."
          back={{ label: "Back to the folder", href: `/${area}/curriculum?${new URLSearchParams([...params.entries()].filter(([k]) => k !== "classic")).toString()}` }}
        />
        <p className="-mt-3 mb-4 text-sm">
          <Link href={`/${area}/curriculum?${new URLSearchParams([...params.entries()].filter(([k]) => k !== "classic")).toString()}`} className="font-medium text-forest-700 hover:underline">
            Back to the folder
          </Link>
        </p>
        <CurriculumLibrary area={area} />
      </>
    );

  return (
    <>
      <PageHeader
        crumbs={[crumbs[0], { label: "Curriculum" }]}
        title="Curriculum"
        subtitle="Every year, subject and unit as folders, with its lessons, resources and weekly plan. Open a lesson for its slides, plan and review."
        actions={<ActionsMenu items={curriculumTools(area)} label="Views and tools" trigger="text" />}
      />
      <CurriculumBrowser area={area} />
    </>
  );
}

/** The Curriculum page: the browser, or (address `classic=1`) a unit's tools, or the term resource lists. */
export function CurriculumHome({ area, mode = "library" }: { area: "admin" | "teach"; mode?: "library" | "resources" }) {
  return (
    <Suspense fallback={null}>
      <Inner area={area} mode={mode} />
    </Suspense>
  );
}

/** The header actions on the Curriculum's other views (map, planner, review, syllabus): back to
 * the folders, and the same Views and tools menu, so they read as views of one browser. */
export function CurriculumViews({ area }: { area: "admin" | "teach" }) {
  return (
    <>
      <Link href={`/${area}/curriculum`} className={btn("secondary", "sm")}>
        <Icon name="folder" size="sm" /> Browse
      </Link>
      <ActionsMenu items={curriculumTools(area)} label="Views and tools" trigger="text" />
    </>
  );
}
