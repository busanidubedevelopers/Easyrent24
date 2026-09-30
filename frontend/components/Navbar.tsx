import Link from "next/link";
import { Building2, Menu, UserCircle, LogOut } from "lucide-react";
import { getServerDb } from "@/lib/serverDb";
import { NotificationBell } from "./NotificationBell";

export async function Navbar() {
  const db = await getServerDb();
  const { data: { user } } = await db.auth.getUser();

  let role = null;
  let displayName = "";
  if (user) {
    const { data: profile } = await db
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();
    role = profile?.role;
    displayName = profile?.full_name || user.email || "My Account";
  }

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg px-2 transition-all duration-500 hover:shadow-xl">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 group">
            <div className="rounded-xl bg-gradient-to-tr from-brand to-cyan-500 p-1.5 shadow-md shadow-brand/20 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gradient">EasyRent</span>
          </Link>

          {user && role === 'landlord' && (
            <Link
              href="/dashboard"
              className="shrink-0 text-sm font-bold text-brand relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-bottom-right after:scale-x-0 after:bg-brand after:transition-transform after:duration-300 hover:after:origin-bottom-left hover:after:scale-x-100"
            >
              Landlord Dashboard
            </Link>
          )}
        </div>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-6 text-sm font-medium text-muted-foreground lg:flex">
          {user && role === 'landlord' && (
            <>
              <Link href="/dashboard" className="text-brand font-bold relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-bottom-right after:scale-x-0 after:bg-brand after:transition-transform after:duration-300 hover:after:origin-bottom-left hover:after:scale-x-100">Dashboard</Link>
              <Link href="/collections" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Collections</Link>
              <Link href="/documents" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Documents</Link>
              <Link href="/applications" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Applications</Link>
            </>
          )}
          {user && role === 'admin' && (
            <>
              <Link href="/admin/accounts" className="text-brand font-bold">Account approvals</Link>
              <Link href="/applications" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Applications</Link>
            </>
          )}

          {(!user || role === 'tenant') && (
            <>
              <Link href="/find-home" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Find a Home</Link>
              {user && <Link href="/leases" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">My Lease</Link>}
              {user && <Link href="/maintenance" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Report an Issue</Link>}
              {!user && <Link href="/signin" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Sign In</Link>}
            </>
          )}
          {(!user || role === 'handyman') && (
            <Link href="/handyman" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Handyman Services</Link>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {!user ? (
            <>
              <Link href="/signin" className="hidden lg:block text-sm font-medium hover:text-brand transition-all duration-200 hover:-translate-y-[1px]">
                Sign In
              </Link>
              <Link
                href="/signup"
                className="hidden lg:flex items-center justify-center rounded-full bg-gradient-to-r from-brand to-indigo-500 px-6 py-2.5 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_14px_0_rgba(79,70,229,0.39)] transition-all duration-300 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_6px_20px_rgba(79,70,229,0.23)] hover:-translate-y-[2px]"
              >
                Get Started
              </Link>
            </>
          ) : (
            <>
              <NotificationBell />
              <Link
                href={role === 'handyman' ? '/handyman' : role === 'tenant' ? '/find-home' : '/dashboard'}
                className="hidden max-w-[220px] items-center gap-2 truncate rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200 lg:inline-flex"
              >
                <UserCircle className="h-4 w-4 shrink-0" />
                <span className="truncate">{displayName}</span>
              </Link>

              <form action="/api/auth/signout" method="post" className="hidden lg:block">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </>
          )}

          <button className="lg:hidden p-2 text-muted-foreground">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle menu</span>
          </button>
        </div>
      </div>
    </header>
  );
}
