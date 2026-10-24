import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { ManageOpenEveningClient } from "./ManageOpenEveningClient";

export const metadata: Metadata = {
  title: "Your open evening place",
  description: "Cancel or change your open evening booking.",
  robots: { index: false, follow: false },
};

export default function ManageOpenEveningPage() {
  return (
    <section className="section-pad">
      <Container className="max-w-xl">
        <Kicker>Open evenings</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink">Your place</h1>
        <ManageOpenEveningClient />
      </Container>
    </section>
  );
}
