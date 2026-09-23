import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getPolicyLinks } from "@/lib/content";

export const metadata: Metadata = {
  title: "Policies",
  description: "Published school policy documents, including our Fee Policy and Safeguarding Policy.",
};

export default async function PoliciesPage() {
  const policies = await getPolicyLinks();

  return (
    <section className="py-16">
      <Container className="max-w-2xl">
        <Kicker>Policies</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">School policies.</h1>
        <ul className="mt-10 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
          {policies.map((p) => (
            <li key={p._id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="font-medium text-ink">{p.title}</p>
                {p.summary && <p className="text-xs text-ink/70">{p.summary}</p>}
              </div>
              <a href={p.fileUrl} className="text-sm font-semibold text-gold-700 underline">View</a>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
