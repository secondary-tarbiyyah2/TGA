import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";

// The Complaint Form, a document of its own (owner, Tafweed 3, 11 Nov 2026:
// "Complaint form as appendix a needs to be separated"). It used to be
// Appendix A of the Concerns and Complaints Policy (policy 26), which now
// links here. Printable: the questions with room to write.

export const metadata: Metadata = pageMetadata({
  title: "Complaint Form",
  description: "The form for making a formal complaint to Tarbiyyah Global Academy, under the Concerns and Complaints Policy.",
  path: "/policies/complaint-form",
});

const QUESTIONS = [
  "Your name",
  "Your email address and phone number",
  "Your child's name and year group",
  "What is your complaint about?",
  "Who have you already raised it with, and when?",
  "What was the result?",
  "What would you like the Academy to do to put it right?",
  "Anything else you would like us to know, or documents you are sending with this form",
  "Signature and date",
];

export default function ComplaintFormPage() {
  return (
    <>
      <section className="geo-texture bg-cream section-pad print:p-0">
        <Container>
          <div className="mx-auto max-w-3xl">
            <Kicker>Concerns and complaints</Kicker>
            <h1 className="font-serif text-4xl font-semibold text-ink sm:text-5xl">Complaint Form</h1>
            <p className="mt-4 text-lg text-ink/75">
              Use this form to make a formal complaint (Stage 2 of the{" "}
              <Link href="/policies/26-concerns-and-complaints/" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">
                Concerns and Complaints Policy
              </Link>
              ). Most concerns are put right quickly by talking to your child&apos;s teacher or form tutor first, so please try that before
              making a formal complaint.
            </p>
          </div>
        </Container>
      </section>

      <section className="section-pad print:p-0">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-serif text-2xl font-semibold text-ink">How to send it</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-ink/80">
              <li>
                Print this page and fill it in, or copy the questions into an email and answer each one.
              </li>
              <li>
                Send it to{" "}
                <a href="mailto:globalacademy@tarbiyyah.co.uk" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">
                  globalacademy@tarbiyyah.co.uk
                </a>
                , marked &ldquo;For the attention of the Headteacher&rdquo;. If your complaint is about the Headteacher, mark it &ldquo;For the
                attention of the Chair of Trustees&rdquo;.
              </li>
              <li>Please send it within three months of the issue arising.</li>
              <li>
                We acknowledge it within five school days and send a written response within ten school days of the acknowledgement, as the
                policy explains.
              </li>
              <li>
                A worry about a child&apos;s safety is never a complaint: tell the Designated Safeguarding Lead straight away (see{" "}
                <Link href="/safeguarding/" className="font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-900">
                  Safeguarding
                </Link>
                ).
              </li>
            </ul>

            <h2 className="mt-10 font-serif text-2xl font-semibold text-ink">The form</h2>
            <table className="mt-4 w-full border-collapse text-sm">
              <caption className="sr-only">Complaint Form: each question with space for your answer</caption>
              <tbody>
                {QUESTIONS.map((q) => (
                  <tr key={q} className="border border-gold-light">
                    <th scope="row" className="w-2/5 bg-cream p-3 text-left align-top font-semibold text-ink">
                      {q}
                    </th>
                    <td className="h-20 p-3 align-top" />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 text-sm text-ink/70">
              Available in large print or another accessible format on request. Your complaint is kept confidential and handled in line with
              our Data Protection Policy.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
