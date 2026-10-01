import { FamilyPinGate } from "@/components/learn/pin/FamilyPinGate";
import { ClassroomTabs } from "@/components/learn/ClassroomTabs";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <FamilyPinGate>
      <ClassroomTabs />
      {children}
    </FamilyPinGate>
  );
}
