import { Building2, Instagram, Linkedin, Twitter } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/20 bg-gradient-to-b from-transparent to-brand/5 dark:to-brand/10 backdrop-blur-3xl pt-16 pb-8 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
      <div className="container relative z-10 px-4 md:px-6 mx-auto">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="rounded-lg bg-brand p-1">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-foreground">EasyRent</span>
            </Link>
            <p className="text-sm leading-relaxed max-w-xs">
              The all-in-one platform for effortless renting. Verify tenants, find handymen, and manage listings with ease.
            </p>
          </div>
          
          <div className="grid gap-4">
            <h3 className="text-sm font-semibold text-foreground">Platform</h3>
            <ul className="grid gap-3 text-sm">
              <li><Link href="/find-home" className="hover:text-foreground transition-colors">Find Homes</Link></li>
              <li><Link href="/list-property" className="hover:text-foreground transition-colors">List Properties</Link></li>
              <li><Link href="/credit-check" className="hover:text-foreground transition-colors">Rental Application</Link></li>
              <li><Link href="/handyman" className="hover:text-foreground transition-colors">Handyman Hub</Link></li>
            </ul>
          </div>
          
          <div className="grid gap-4">
            <h3 className="text-sm font-semibold text-foreground">Company</h3>
            <ul className="grid gap-3 text-sm">
              <li><Link href="#" className="hover:text-foreground transition-colors">About Us</Link></li>
              <li><Link href="#" className="hover:text-foreground transition-colors">Careers</Link></li>
              <li><Link href="#" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link href="#" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
          
          <div className="grid gap-4">
            <h3 className="text-sm font-semibold text-foreground">Connect</h3>
            <div className="flex gap-4">
              <Link href="#" className="hover:text-brand transition-colors"><Twitter className="h-5 w-5" /></Link>
              <Link href="#" className="hover:text-brand transition-colors"><Instagram className="h-5 w-5" /></Link>
              <Link href="#" className="hover:text-brand transition-colors"><Linkedin className="h-5 w-5" /></Link>
            </div>
          </div>
        </div>
        
        <div className="mt-12 border-t border-border/40 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} EasyRent Inc. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
