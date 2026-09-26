import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { StaffApp } from "@/components/staff/StaffApp";

export const metadata: Metadata = {
  title: "Staff",
  robots: { index: false, follow: false },
};

export default function StaffPage() {
  return (
    <section className="section-pad">
      <Container>
        <StaffApp />
      </Container>
    </section>
  );
}
