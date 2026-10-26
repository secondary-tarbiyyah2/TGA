import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/Container";
import { getSiteSettings } from "@/lib/content";

export function PrelaunchHeader() {
  return (
    <header className="bg-cream">
      <Container className="flex h-24 items-center justify-center">
        <Link href="/" aria-label="Tarbiyyah Global Academy: home" className="flex items-center">
          <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={190} height={57} priority className="h-[56px] w-auto" />
        </Link>
      </Container>
    </header>
  );
}

export async function PrelaunchFooter() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";
  return (
    <footer className="border-t border-gold-light/40 bg-cream">
      <Container className="flex flex-col items-center gap-3 py-8 text-center text-xs text-ink/60 sm:flex-row sm:justify-between sm:text-left">
        <p>© {new Date().getFullYear()} Tarbiyyah Education Trust · Part of the Tarbiyyah family of schools</p>
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          <li><a className="hover:text-ink" href={`mailto:${email}`}>{email}</a></li>
          <li><Link className="hover:text-ink" href="/legal/privacy/">Privacy</Link></li>
          <li><Link className="hover:text-ink" href="/legal/cookies/">Cookies</Link></li>
        </ul>
      </Container>
    </footer>
  );
}
