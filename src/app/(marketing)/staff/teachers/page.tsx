import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { StaffApp } from "@/components/staff/StaffApp";

export const metadata: Metadata = {
  title: "Teacher Accounts",
  description: "Manage staff accounts for the admissions booking panel.",
  robots: { index: false, follow: false },
};

export default function TeachersPage() {
  return (
    <section className="section-pad">
      <Container>
        <StaffApp view="teachers" />
      </Container>
    </section>
  );
}
