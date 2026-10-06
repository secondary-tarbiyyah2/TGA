import { FamilyPinGate } from "@/components/learn/pin/FamilyPinGate";

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <FamilyPinGate>
      {children}
    </FamilyPinGate>
  );
}
