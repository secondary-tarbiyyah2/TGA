"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnGate } from "@/components/learn/LearnGate";
import { AdminShell } from "@/components/learn/AdminShell";
import { PageHeader } from "@/components/learn/PageHeader";
import { AddPersonModal, type PersonType } from "@/components/learn/people/AddPersonModal";
import { PeopleList } from "@/components/learn/people/PeopleList";
import { usePeople } from "@/components/learn/people/usePeople";
import { Button } from "@/components/learn/ui";

type ModalState = { open: boolean; type?: PersonType; parentId?: string; nonce: number };

function PeopleContent() {
  const data = usePeople();
  const initialSearch = useSearchParams().get("q") || "";
  const [modal, setModal] = useState<ModalState>({ open: false, nonce: 0 });

  const openModal = (type?: PersonType, parentId?: string) => setModal((m) => ({ open: true, type, parentId, nonce: m.nonce + 1 }));

  return (
    <div>
      <PageHeader
        title="People"
        subtitle="Staff (including teachers) and families. Adults get an email to set their own password; pupils can have a username login instead."
        action={
          <Button variant="primary" icon="plus" onClick={() => openModal()}>
            Add person
          </Button>
        }
      />
      <PeopleList
        people={data.people}
        loading={data.loading}
        error={data.error}
        onAdd={() => openModal()}
        onAddChild={(parentId) => openModal("student", parentId)}
        onChanged={data.reload}
        initialSearch={initialSearch}
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
          <Suspense fallback={null}>
            <PeopleContent />
          </Suspense>
        </AdminShell>
      </LearnGate>
    </section>
  );
}
