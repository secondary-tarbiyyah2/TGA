import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { StaffApp } from "@/components/staff/StaffApp";

export const metadata: Metadata = {
  title: "Teacher Accounts",
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
