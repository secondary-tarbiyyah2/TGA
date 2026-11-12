"use client";

import { FocusView } from "@/components/learn/FocusView";
import { Button, EmptyState } from "@/components/learn/ui";

/**
 * Shown in place of the quiz builder (or a quiz a pupil would sit) while the
 * Headteacher has Quizzes switched off (Settings, School features; owner,
 * 11 Nov 2026: "for now, lock up the quiz builder feature"). Nothing is
 * deleted: quizzes already made come back when the switch is turned on.
 */
export function QuizzesOffNotice({ onBack }: { onBack?: () => void }) {
  return (
    <EmptyState
      title="Quizzes are switched off by the head teacher"
      icon="lock"
      action={
        onBack ? (
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        ) : undefined
      }
    >
      The quiz builder is locked for now. Nothing has been deleted: quizzes already made will be here again when the head teacher switches Quizzes back on in Settings, School features.
    </EmptyState>
  );
}

/** The full-screen version, where the quiz builder would have opened. */
export function QuizzesOffView({ onClose }: { onClose: () => void }) {
  return (
    <FocusView title="Quizzes" eyebrow="Classwork" onClose={onClose} width="reading" label="Quizzes are switched off">
      <QuizzesOffNotice onBack={onClose} />
    </FocusView>
  );
}
