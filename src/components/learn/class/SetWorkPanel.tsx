"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllClasses, fetchTeacherClasses } from "@/lib/learn/classes";
import { SidePanel, Loading } from "@/components/learn/kit";
import { HomeworkEditor, type HomeworkKind } from "@/components/learn/homework/HomeworkEditor";
import type { Homework } from "@/lib/learn/homework";

/** Fired after work is set or changed in a panel, so a class's Classwork list (or any list of
 * work on the page) can refresh without a reload. */
export const CLASSWORK_CHANGED = "tga:classwork-changed";
export function announceClassworkChanged(classId: string | null) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CLASSWORK_CHANGED, { detail: { classId } }));
}

/** Asks an open Classwork section to show its "Create" cards (the class header's "Set work"). */
export const CLASSWORK_CREATE = "tga:classwork-create";

/**
 * Set (or edit) an assignment or quiz in a panel over the page you are on, never on a page of
 * its own (owner, 11 Nov 2026; docs/portal-structure.md, pattern 3). It is the class's own
 * editor (`HomeworkEditor`), so validation, permissions and what is saved are unchanged.
 *
 * Inside a class pass `classId` (the class is fixed and its topics are offered). From Today or
 * the class list leave it out: the teacher picks one of their classes (`scope="mine"`), or the
 * head any class (`scope="all"`).
 */
export function SetWorkPanel({
  classId,
  className,
  kind = "assignment",
  editing = null,
  topicId = "",
  scope = "mine",
  onClose,
  onSaved,
}: {
  classId?: string;
  className?: string;
  kind?: HomeworkKind;
  editing?: (Homework & { topic_id?: string | null }) | null;
  topicId?: string;
  scope?: "mine" | "all";
  onClose: () => void;
  onSaved?: (note?: string) => void;
}) {
  const [classes, setClasses] = useState<{ id: string; name: string }[] | null>(classId ? [{ id: classId, name: className || "This class" }] : null);
  const [topics, setTopics] = useState<{ id: string; name: string }[] | null>(classId ? null : []);

  useEffect(() => {
    let cancelled = false;
    if (classId) {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      supabase
        .from("class_topics")
        .select("id, name, position")
        .eq("class_id", classId)
        .order("position")
        .order("name")
        .then(({ data }) => {
          if (!cancelled) setTopics(((data as { id: string; name: string }[] | null) || []).map((t) => ({ id: t.id, name: t.name })));
        });
    } else {
      (scope === "all" ? fetchAllClasses() : fetchTeacherClasses()).then((list) => {
        if (!cancelled) setClasses(list.map((c) => ({ id: c.id, name: c.name })));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [classId, scope]);

  const title = editing ? `Edit “${editing.title}”` : kind === "quiz" ? "New quiz" : "Set work";
  return (
    <SidePanel title={title} eyebrow={className || (editing ? "Classwork" : "Assignment")} onClose={onClose} size="lg">
      {classes === null || topics === null ? (
        <Loading label="Loading your classes" />
      ) : classes.length === 0 ? (
        <p className="text-sm text-ink-500">You have no classes yet. Once you are given a class, you can set work for it here.</p>
      ) : (
        <div data-guide="set-work-panel">
          <HomeworkEditor
            key={editing?.id || `new-${kind}-${classId || "any"}`}
            classes={classes}
            initialClassId={classId || (classes.length === 1 ? classes[0].id : undefined)}
            lockClass={!!classId}
            topics={classId ? topics : undefined}
            initialTopicId={editing?.topic_id || topicId}
            kind={kind}
            editing={editing}
            onCancel={onClose}
            onSaved={(note) => {
              announceClassworkChanged(classId || editing?.class_id || null);
              onSaved?.(note);
              onClose();
            }}
          />
        </div>
      )}
    </SidePanel>
  );
}
