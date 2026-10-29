import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = pageMetadata({
  title: "Terms",
  description: "Terms of use for the Tarbiyyah Global Academy website.",
  path: "/legal/terms",
});

export default async function TermsPage() {
  const settings = await getSiteSettings();
  const contactEmail = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";

  return (
    <section className="section-pad">
      <Container className="max-w-2xl">
        <Kicker>Legal</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink">Terms of Use</h1>
        <p className="mt-6 text-sm text-ink/70">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <p className="mt-6 text-ink/75">
          These terms govern your use of this website (globalacademy.tarbiyyah.co.uk), operated by Tarbiyyah Global
          Academy, part of the Tarbiyyah Education Trust.
        </p>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">Using this site</h2>
        <p className="mt-2 text-ink/75">
          This website is provided to give information about Tarbiyyah Global Academy and to let families register
          interest, apply, and book admissions calls or open evenings. You agree to use it only for these purposes,
          and not to attempt to disrupt it or access any part of it you&apos;re not authorised to use, including the
          staff, teacher, parent and student areas at <code>/learn</code>, which are restricted to account holders.
        </p>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">Content and accuracy</h2>
        <p className="mt-2 text-ink/75">
          We aim to keep the information on this site accurate and up to date, including fees, term dates and
          policies, all of which are managed directly by the school. Where a figure or date could change, the
          current published version on this site is the one that applies.
        </p>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">Enrolment terms</h2>
        <p className="mt-2 text-ink/75">
          These website terms cover browsing and using this site. Separate enrolment terms and conditions, covering
          fees, withdrawal and the Fee Policy, apply once a place is offered and accepted, see the{" "}
          <Link href="/policies" className="underline">Policies</Link> page.
        </p>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">Contact</h2>
        <p className="mt-2 text-ink/75">
          Questions about these terms can be sent to{" "}
          <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a>.
        </p>
      </Container>
    </section>
  );
}
