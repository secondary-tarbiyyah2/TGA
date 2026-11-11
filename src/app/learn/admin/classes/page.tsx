"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { WorkspaceHeader } from "@/components/learn/kit";
import { Button } from "@/components/learn/ui";
import { ClassGrid } from "@/components/learn/class/ClassGrid";
import { AddClassPanel } from "@/components/learn/academic/ClassesSection";
import { useAcademicData } from "@/components/learn/academic/useAcademicData";
import { useViewerClasses, type ClassViewer } from "@/lib/learn/classes";

const VIEWER: ClassViewer = { kind: "staff" };

function ClassesList({ onAdd }: { onAdd: () => void }) {
  const classes = useViewerClasses(VIEWER);
  return (
    <>
      <div className="mb-6">
        <WorkspaceHeader
          eyebrow={[{ label: "Today", href: "/admin/dashboard" }, { label: "Teaching" }]}
          title="Classes"
          description="Every class in the school. Open one to see its week-by-week course page."
          stats={classes ? [{ value: classes.length, label: classes.length === 1 ? "class" : "classes" }, { value: new Set(classes.map((c) => c.yearGroup).filter(Boolean)).size, label: "year groups" }] : undefined}
          primary={
            <Button variant="primary" icon="plus" onClick={onAdd} data-guide="classes-add">
              Add a class
            </Button>
          }
          menu={[
            { label: "Classes and teachers (enrol pupils, choose teachers)", icon: "users", href: "/admin/academic/classes" },
            { label: "Timetable", icon: "calendarDays", href: "/admin/lessons" },
            { label: "Classwork to action", icon: "notebookPen", href: "/admin/homework" },
          ]}
        />
      </div>
      <ClassGrid viewer={VIEWER} classes={classes} hrefFor={(c) => `/admin/class?id=${c.id}`} emptyLabel="No classes yet. Use Add a class to create one." />
    </>
  );
}

/** "Add a class" opens over the class list (owner, 11 Nov 2026: actions open in place). */
function AddClass({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { data, reload } = useAcademicData();
  return (
    <AddClassPanel
      props={{
        classes: data.classes,
        yearGroups: data.yearGroups,
        subjects: data.subjects,
        years: data.years,
        kids: data.children,
        enrolments: data.enrolments,
        teachers: data.teachers,
        classTeachers: data.classTeachers,
        subjectTeachers: data.subjectTeachers,
        reload,
        ready: data.loaded && data.years.length > 0 && data.yearGroups.length > 0 && data.subjects.length > 0,
      }}
      onClose={onClose}
      onAdded={onAdded}
    />
  );
}

function AdminClassesContent() {
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <>
      <ClassesList key={version} onAdd={() => setAdding(true)} />
      {adding && <AddClass onClose={() => setAdding(false)} onAdded={() => setVersion((v) => v + 1)} />}
    </>
  );
}

export default function AdminClassesPage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin"]}>
        <AdminClassesContent />
      </LearnGate>
    </section>
  );
}
