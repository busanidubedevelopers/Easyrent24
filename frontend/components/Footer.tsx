import { Instagram, Linkedin, Twitter } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

const linkClass = "text-brand-300 hover:text-gold-400 transition-colors";
const socialClass =
  "flex h-9 w-9 items-center justify-center rounded-full border border-brand-700 text-white hover:bg-gold-600 hover:border-gold-600 transition-all";

/** Navy footer, as on easyrent24.co.za. */
export function Footer() {
  return (
    <footer className="relative mt-24 bg-brand-900 text-brand-300 pt-16 pb-8 overflow-hidden">
      <div className="container relative z-10 px-4 md:px-6 mx-auto">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href="/">
              <BrandLogo onDark />
            </Link>
            <p className="text-sm leading-relaxed max-w-xs">
              A rental platform for South Africa: verified tenant applications, affordability checks and digital leases in one place.
            </p>
          </div>

          <div className="grid gap-4 content-start">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">Platform</p>
            <ul className="grid gap-3 text-sm">
              <li><Link href="/find-home" className={linkClass}>Find Homes</Link></li>
              <li><Link href="/list-property" className={linkClass}>List Properties</Link></li>
              <li><Link href="/credit-check" className={linkClass}>Rental Application</Link></li>
              <li><Link href="/handyman" className={linkClass}>Handyman Hub</Link></li>
            </ul>
          </div>

          <div className="grid gap-4 content-start">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">Company</p>
            <ul className="grid gap-3 text-sm">
              <li><Link href="#" className={linkClass}>About Us</Link></li>
              <li><Link href="#" className={linkClass}>Careers</Link></li>
              <li><Link href="#" className={linkClass}>Privacy Policy</Link></li>
              <li><Link href="#" className={linkClass}>Terms of Service</Link></li>
            </ul>
          </div>

          <div className="grid gap-4 content-start">
            <p className="text-xs font-bold uppercase tracking-widest text-gold">Connect</p>
            <div className="flex gap-3">
              <Link href="#" aria-label="Twitter" className={socialClass}><Twitter className="h-4 w-4" /></Link>
              <Link href="#" aria-label="Instagram" className={socialClass}><Instagram className="h-4 w-4" /></Link>
              <Link href="#" aria-label="LinkedIn" className={socialClass}><Linkedin className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-brand-800 pt-8 text-center text-sm text-brand-400">
          <p>&copy; {new Date().getFullYear()} Easy Rent 24. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
