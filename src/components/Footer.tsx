import Image from "next/image";
import Link from "next/link";
import { Container } from "./Container";
import { footerColumns } from "@/lib/nav";
import { getSiteSettings } from "@/lib/content";
import { LEARN_ORIGIN } from "@/lib/learn/origin";
import { ViewSettingsMenu } from "./ViewSettings";
import { StarMark } from "./StarMark";
import { ROLE_EMAILS } from "@/content/contacts";

export async function Footer() {
  const settings = await getSiteSettings();
  const email = settings.admissionsEmail || ROLE_EMAILS.general;

  return (
    <footer className="geo-texture-dark relative overflow-hidden border-t border-gold-light/30 bg-ink text-cream/90">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent" />
      <StarMark className="pointer-events-none absolute -left-24 top-10 h-80 w-80 text-gold-300/10" />
      <Container className="relative grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div>
          <Image src="/brand/ga-wordmark-white.png" alt="Tarbiyyah Global Academy" width={200} height={61} />
          <p className="mt-4 text-sm text-white/70">Part of the Tarbiyyah Education Trust.</p>
          <p className="mt-2 text-sm text-white/70">
            A specialist, quality education, rooted in faith, delivered live, wherever your family calls home.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <li><a className="text-cream/75 hover:text-cream" href={`mailto:${email}`}>{email}</a></li>
            {settings.contactPhone && (
              <li><a className="text-cream/75 hover:text-cream" href={`tel:${settings.contactPhone.replace(/\s+/g, "")}`}>{settings.contactPhone}</a></li>
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
          <div key={col.heading}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gold-light">{col.heading}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {col.links.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-cream/75 hover:text-cream">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

      </Container>

      <div className="border-t border-white/10 py-5">
        <Container className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-semibold uppercase tracking-wide text-gold-light text-xs">The Trust</span>
          <a className="text-cream/75 hover:text-cream" href="https://tarbiyyaheducationtrust.com" target="_blank" rel="noopener">Tarbiyyah Education Trust</a>
          <a className="text-cream/75 hover:text-cream" href="https://tarbiyyah.co.uk" target="_blank" rel="noopener">Tarbiyyah Primary</a>
          <a className="text-cream/75 hover:text-cream" href="https://tarbiyyahsecondaryboys.co.uk" target="_blank" rel="noopener">Tarbiyyah Secondary (Boys)</a>
          <a className="text-cream/75 hover:text-cream" href="https://tarbiyyahalbanaat.co.uk" target="_blank" rel="noopener">Tarbiyyah Al-Banaat</a>
        </Container>
      </div>

      <div className="border-t border-white/10 pt-6 pb-24 md:pb-6">
        <Container className="flex flex-col gap-2 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Tarbiyyah Education Trust. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ViewSettingsMenu variant="footer" />
            <p>globalacademy.tarbiyyah.co.uk</p>
            <Link href={`${LEARN_ORIGIN}/login/?as=staff`} className="text-white/60 hover:text-cream">Staff sign-in</Link>
          </div>
        </Container>
      </div>
    </footer>
  );
}
