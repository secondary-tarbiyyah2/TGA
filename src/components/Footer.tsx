import Image from "next/image";
import Link from "next/link";
import { Container } from "./Container";
import { footerNav } from "@/lib/nav";

export function Footer() {
  return (
    <footer className="geo-texture mt-24 border-t border-gold-light/30 bg-ink text-cream/90">
      <Container className="grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Image src="/brand/ga-wordmark-white.png" alt="Tarbiyyah Global Academy" width={200} height={61} />
          <p className="mt-4 text-sm text-white/70">Part of the Tarbiyyah Education Trust.</p>
          <p className="mt-2 text-sm text-white/70">
            A British education, rooted in faith — delivered live, wherever your family calls home.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold-light">Explore</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {footerNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-cream/75 hover:text-cream">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold-light">The Trust</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li><a className="text-cream/75 hover:text-cream" href="https://tarbiyyaheducationtrust.com" target="_blank" rel="noopener">Tarbiyyah Education Trust</a></li>
            <li><a className="text-cream/75 hover:text-cream" href="https://tarbiyyah.co.uk" target="_blank" rel="noopener">Tarbiyyah Primary</a></li>
            <li><a className="text-cream/75 hover:text-cream" href="https://tarbiyyahsecondaryboys.co.uk" target="_blank" rel="noopener">Tarbiyyah Secondary (Boys)</a></li>
            <li><a className="text-cream/75 hover:text-cream" href="https://tarbiyyahalbanaat.co.uk" target="_blank" rel="noopener">Tarbiyyah Al-Banaat</a></li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold-light">Contact</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li><a className="text-cream/75 hover:text-cream" href="mailto:globalacademy@tarbiyyah.co.uk">globalacademy@tarbiyyah.co.uk</a></li>
            <li className="text-cream/75">United Kingdom</li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10 py-6">
        <Container className="flex flex-col gap-2 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Tarbiyyah Education Trust. All rights reserved.</p>
          <p>globalacademy.tarbiyyah.co.uk</p>
        </Container>
      </div>
    </footer>
  );
}
