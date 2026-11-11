"use client";

// The Portal guide home (journey map and A to Z): GuideHome. Outside the role
// areas, like Your account, so it keeps the sidebar of your main area; add
// ?area=teach (or admin, family, student) to read another area's guide.

import { GuideHome } from "@/components/learn/guide/GuideHome";
import { LearnGate } from "@/components/learn/LearnGate";
import { LEARN_ROLES, useLearnSession } from "@/lib/learn/session";

function Content() {
  const { session } = useLearnSession();
  const userId = session && session !== "loading" ? session.user.id : null;
  if (!userId) return null;
  return <GuideHome userId={userId} />;
}

export default function PortalGuidePage() {
  return (
    <section className="app-pad">
      <LearnGate allowedRoles={[...LEARN_ROLES]}>
        <Content />
      </LearnGate>
    </section>
  );
}
