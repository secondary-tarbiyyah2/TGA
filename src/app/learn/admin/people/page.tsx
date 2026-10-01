"use client";

import { useState } from "react";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { AddPersonModal, type PersonType } from "@/components/learn/people/AddPersonModal";
import { PeopleList } from "@/components/learn/people/PeopleList";
import { usePeople } from "@/components/learn/people/usePeople";
import { GOLD_BUTTON } from "@/components/learn/people/shared";

type ModalState = { open: boolean; type?: PersonType; parentId?: string; nonce: number };

function PeopleContent() {
  const data = usePeople();
  const [modal, setModal] = useState<ModalState>({ open: false, nonce: 0 });

  const openModal = (type?: PersonType, parentId?: string) => setModal((m) => ({ open: true, type, parentId, nonce: m.nonce + 1 }));

  return (
    <div>
      <PageHeader
        title="People"
        subtitle="Students, parents, teachers and staff. Everyone gets an email to set their own password."
        actions={
          <button type="button" onClick={() => openModal()} className={GOLD_BUTTON}>
            + Add person
          </button>
        }
      />
      <PeopleList
        people={data.people}
        loading={data.loading}
        error={data.error}
        onAdd={() => openModal()}
        onAddChild={(parentId) => openModal("student", parentId)}
        onChanged={data.reload}
      />
      {modal.open && (
        <AddPersonModal
          key={modal.nonce}
          initialType={modal.type}
          presetParentId={modal.parentId}
          yearGroups={data.yearGroups}
          classes={data.classes}
          parents={data.parents}
          onClose={() => setModal((m) => ({ ...m, open: false }))}
          onChanged={data.reload}
        />
      )}
    </div>
  );
}

export default function AdminPeoplePage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={["head_teacher", "admin", "admissions"]}>
        <AdminShell>
          <PeopleContent />
        </AdminShell>
      </LearnGate>
    </section>
  );
}
