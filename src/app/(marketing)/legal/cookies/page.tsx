import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Container } from "@/components/Container";
import { Kicker } from "@/components/Section";
import { CookieChoiceButton } from "./CookieChoiceButton";

export const metadata: Metadata = pageMetadata({
  title: "Cookie Policy",
  description: "How Tarbiyyah Global Academy uses essential and analytics cookies, and how to change your choice.",
  path: "/legal/cookies",
});

// What this site actually keeps in the browser (see CookieConsent,
// ViewSettings, lib/timezones and lib/leadRef). Keep in step if one is added.
const STORED = [
  { what: "Your cookie choice", why: "So the cookie banner does not ask again on every page." },
  { what: "Your display settings", why: "Text size, easy reading, contrast and motion, if you change them." },
  { what: "Your time zone", why: "So call and open evening times are shown in your local time." },
  { what: "Your register-interest details", why: "If you register interest, so the application form can be filled in for you on the same device." },
  { what: "Your portal sign-in", why: "If you have a parent, pupil or staff account, to keep you signed in securely." },
];

export default function CookiePolicyPage() {
  return (
    <section className="section-pad">
      <Container className="max-w-2xl">
        <Kicker>Legal</Kicker>
        <h1 className="font-serif text-4xl font-semibold text-ink">Cookie Policy</h1>
        <p className="mt-6 text-ink/75">
          We keep what this site stores on your device to a minimum. Nothing here is used for advertising, and nothing is sold.
        </p>

        <h2 className="mt-10 font-serif text-xl font-semibold text-ink">Essential storage</h2>
        <p className="mt-2 text-ink/75">
          Strictly necessary for the site to work. These cannot be switched off, and stay on your device only.
        </p>
        <dl className="mt-4 divide-y divide-gold-light/40 rounded-2xl border border-gold-light/50 bg-white">
          {STORED.map((s) => (
            <div key={s.what} className="px-5 py-3.5">
              <dt className="font-semibold text-ink">{s.what}</dt>
              <dd className="mt-0.5 text-sm text-ink/70">{s.why}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-10 font-serif text-xl font-semibold text-ink">Analytics</h2>
        <p className="mt-2 text-ink/75">
          Where analytics is switched on we use Plausible Analytics, a cookieless, privacy-friendly tool that counts visits
          without tracking individuals or storing personal data. You can find out more at{" "}
          <a href="https://plausible.io/data-policy" target="_blank" rel="noopener noreferrer" className="underline">
            plausible.io/data-policy
          </a>
          .
        </p>

        <h2 className="mt-10 font-serif text-xl font-semibold text-ink">Changing your choice</h2>
        <p className="mt-2 mb-4 text-ink/75">Press the button to clear your saved choice; the cookie banner will appear again so you can choose.</p>
        <CookieChoiceButton />

        <p className="mt-10 text-sm text-ink/70">
          For how we use personal information more widely, see our <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </Container>
    </section>
  );
}
