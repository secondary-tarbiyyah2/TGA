import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { getSiteSettings } from "@/lib/content";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPolicyPage() {
  const settings = await getSiteSettings();
  const contactEmail = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";

  return (
    <section className="py-16">
      <Container className="prose max-w-2xl">
        <Kicker>Legal</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink">Privacy Policy</h1>
        <p className="mt-6 text-sm text-ink/60">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <p className="mt-6 text-ink/75">
          Tarbiyyah Global Academy, part of the Tarbiyyah Education Trust, is the data controller for the personal
          data collected through this website. This notice explains what we collect, why, and your rights under UK
          GDPR and the Data Protection Act 2018.
        </p>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">What we collect, and why</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-ink/75">
          <li>
            <strong>Registering interest or applying:</strong> your name, contact details, and information about your
            child, so we can process your enquiry or application. Lawful basis: taking steps at your request before
            entering into a contract with you.
          </li>
          <li>
            <strong>Booking an admissions call or open evening:</strong> your name, email and the time you booked, so
            we can arrange and manage that meeting. Lawful basis: contract / legitimate interest in running our
            admissions process.
          </li>
          <li>
            <strong>The family-fit eligibility check:</strong> your answers, so we can give you a personalised
            result and, if you consent, follow up. Lawful basis: consent.
          </li>
          <li>
            <strong>Signing in to a staff, teacher, parent or student account:</strong> your account details and
            activity within that account, to provide the service and keep it secure. Lawful basis: contract /
            legitimate interest in running the school safely.
          </li>
        </ul>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">Children&apos;s data</h2>
        <p className="mt-2 text-ink/75">
          Where a form asks about your child, you are providing that information as their parent or guardian. We
          collect the minimum needed for admissions and, once enrolled, safeguarding and education — never more than
          the purpose requires, in line with the ICO&apos;s Children&apos;s Code.
        </p>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">Who we share data with</h2>
        <p className="mt-2 text-ink/75">
          We use a small number of processors to run this website and its systems, each bound by a data processing
          agreement: Supabase (database, authentication and booking systems), Sanity (website content management),
          and, where enabled, Resend (transactional email) and Plausible (cookieless analytics — see our{" "}
          <a href="/legal/cookies" className="underline">Cookie Policy</a>). We do not sell personal data, and we
          only share it with anyone else where the law requires it or you&apos;ve asked us to.
        </p>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">How long we keep it</h2>
        <p className="mt-2 text-ink/75">
          We keep personal data only for as long as necessary for the purpose it was collected for, in line with the
          school&apos;s retention schedule — for example, an unsuccessful application is not kept indefinitely.
          Contact us for specifics about any particular record.
        </p>

        <h2 className="mt-8 font-serif text-lg font-semibold text-ink">Your rights</h2>
        <p className="mt-2 text-ink/75">
          Under UK GDPR you can ask us to: confirm what data we hold about you or your child, correct it, delete it,
          restrict or object to its use, or provide it to you in a portable format. To exercise any of these, or if
          you have a concern about how we&apos;ve handled your data, contact us at{" "}
          <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a>. You can also complain to the
          UK&apos;s data protection regulator, the{" "}
          <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener" className="underline">Information Commissioner&apos;s Office (ICO)</a>.
        </p>
      </Container>
    </section>
  );
}
