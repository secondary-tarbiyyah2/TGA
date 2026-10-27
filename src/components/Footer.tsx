import Image from "next/image";
import Link from "next/link";
import { Container } from "./Container";
import { footerColumns } from "@/lib/nav";
import { getSiteSettings } from "@/lib/content";
import { LEARN_ORIGIN } from "@/lib/learn/origin";
import { CookieSettingsLink } from "./CookieSettingsLink";

export async function Footer() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || "globalacademy@tarbiyyah.co.uk";

  return (
    <footer className="geo-texture border-t border-gold-light/30 bg-ink text-cream/90">
      <Container className="grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div>
          <Image src="/brand/ga-wordmark-white.png" alt="Tarbiyyah Global Academy" width={200} height={61} />
          <p className="mt-4 text-sm text-white/70">Part of the Tarbiyyah Education Trust.</p>
          <p className="mt-2 text-sm text-white/70">
            A specialist, quality education, rooted in faith, delivered live, wherever your family calls home.
          </p>
          <ul className="mt-4 text-sm">
            <li><a className="inline-block py-1.5 text-cream/75 hover:text-cream" href={`mailto:${email}`}>{email}</a></li>
            {settings.contactPhone && (
              <li><a className="inline-block py-1.5 text-cream/75 hover:text-cream" href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`}>{settings.contactPhone}</a></li>
            )}
            {settings.contactAddress ? (
              <li className="whitespace-pre-line text-cream/75">{settings.contactAddress}</li>
            ) : (
              <li className="text-cream/75">United Kingdom</li>
            )}
            {settings.openingHours && <li className="text-cream/75">{settings.openingHours}</li>}
          </ul>
        </div>

        {footerColumns.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gold-light">{col.heading}</h2>
            <ul className="mt-3 text-sm">
              {col.links.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="inline-block py-1.5 text-cream/75 hover:text-cream">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

      </Container>

      <div className="border-t border-white/10 py-5">
        <Container className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-semibold uppercase tracking-wide text-gold-light text-xs">The Trust</span>
          <a href="https://tarbiyyaheducationtrust.com" target="_blank" rel="noopener" className="inline-block py-1.5 text-cream/75 hover:text-cream">Tarbiyyah Education Trust<span className="sr-only"> (opens in a new tab)</span></a>
          <a href="https://tarbiyyah.co.uk" target="_blank" rel="noopener" className="inline-block py-1.5 text-cream/75 hover:text-cream">Tarbiyyah Primary<span className="sr-only"> (opens in a new tab)</span></a>
          <a href="https://tarbiyyahsecondaryboys.co.uk" target="_blank" rel="noopener" className="inline-block py-1.5 text-cream/75 hover:text-cream">Tarbiyyah Secondary (Boys)<span className="sr-only"> (opens in a new tab)</span></a>
          <a href="https://tarbiyyahalbanaat.co.uk" target="_blank" rel="noopener" className="inline-block py-1.5 text-cream/75 hover:text-cream">Tarbiyyah Al-Banaat<span className="sr-only"> (opens in a new tab)</span></a>
        </Container>
      </div>

      <div className="border-t border-white/10 pt-6 pb-24 md:pb-6">
        <Container className="flex flex-col gap-2 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Tarbiyyah Education Trust. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <CookieSettingsLink className="inline-block py-1.5 text-white/60 underline-offset-2 hover:text-cream hover:underline" />
            <Link href={`${LEARN_ORIGIN}/login/?as=staff`} className="inline-block py-1.5 text-white/60 hover:text-cream">Staff sign-in</Link>
          </div>
        </Container>
      </div>
    </footer>
  );
}
