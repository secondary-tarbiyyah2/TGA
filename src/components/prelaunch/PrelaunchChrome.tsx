import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/Container";
import { getSiteSettings } from "@/lib/content";

export function PrelaunchHeader() {
  return (
    <header className="border-b border-gold-light/40 bg-cream">
      <div role="note" className="bg-ink px-4 py-2 text-center text-xs font-medium text-cream sm:text-sm">
        Our website is under development. For now, please register your interest and we will be in touch.
      </div>
      <Container className="flex h-[72px] items-center justify-between gap-4">
        <Link href="/" aria-label="Tarbiyyah Global Academy: home" className="flex shrink-0 items-center">
          <Image src="/brand/ga-wordmark.png" alt="Tarbiyyah Global Academy" width={150} height={45} priority className="h-[44px] w-auto" />
        </Link>
        <a href="#register" className="rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 hover:brightness-95">Register interest</a>
      </Container>
    </header>
  );
}

export async function PrelaunchFooter() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";
  return (
    <footer className="geo-texture mt-20 border-t border-gold-light/30 bg-ink text-cream/90">
      <Container className="flex flex-col gap-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Image src="/brand/ga-wordmark-white.png" alt="Tarbiyyah Global Academy" width={180} height={55} />
          <p className="mt-3 text-sm text-white/70">Part of the Tarbiyyah Education Trust.</p>
          <p className="mt-1 text-sm"><a className="text-cream/80 hover:text-cream" href={`mailto:${email}`}>{email}</a></p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <li><Link className="text-cream/75 hover:text-cream" href="/legal/privacy/">Privacy notice</Link></li>
          <li><Link className="text-cream/75 hover:text-cream" href="/legal/cookies/">Cookies</Link></li>
          <li><Link className="text-cream/75 hover:text-cream" href="/legal/terms/">Terms</Link></li>
        </ul>
      </Container>
      <div className="border-t border-white/10 py-5">
        <Container className="flex flex-col gap-2 text-xs text-white/60 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Tarbiyyah Education Trust. All rights reserved.</p>
          <p>Sister schools: Tarbiyyah Primary · Tarbiyyah Secondary (Boys) · Tarbiyyah Al-Banaat</p>
        </Container>
      </div>
    </footer>
  );
}
