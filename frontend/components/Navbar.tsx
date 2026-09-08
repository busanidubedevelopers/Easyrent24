import Link from "next/link";
import { Building2, Menu, UserCircle } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function Navbar() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let role = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    role = profile?.role;
  }

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl glass-heavy rounded-full px-2 transition-all duration-500 hover:shadow-xl">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="rounded-xl bg-gradient-to-tr from-brand to-cyan-500 p-1.5 shadow-md shadow-brand/20 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-gradient">EasyRent</span>
        </Link>
        
        <nav className="hidden lg:flex gap-6 items-center text-sm font-medium text-muted-foreground">
          {user && role === 'landlord' && (
            <Link href="/dashboard" className="text-brand font-bold relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:origin-bottom-right after:scale-x-0 after:bg-brand after:transition-transform after:duration-300 hover:after:origin-bottom-left hover:after:scale-x-100">Dashboard</Link>
          )}
          {(!user || role === 'tenant') && (
            <Link href="/find-home" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Find a Home</Link>
          )}
          {(!user || role === 'landlord') && (
            <Link href="/list-property" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">List Property</Link>
          )}
          {(!user || role === 'handyman') && (
            <Link href="/handyman" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Handyman Services</Link>
          )}
          {user && role === 'landlord' && (
            <>
              <Link href="/collections" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Collections</Link>
              <Link href="/documents" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Documents</Link>
              <Link href="/applications" className="hover:text-foreground transition-all duration-200 hover:-translate-y-[1px]">Applications</Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-4">
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
             <div className="hidden lg:flex items-center gap-4">
                <Link 
                  href={role === 'handyman' ? '/handyman' : role === 'tenant' ? '/find-home' : '/dashboard'} 
                  className="flex items-center gap-2 text-sm font-medium hover:text-brand transition-colors"
                >
                  <UserCircle className="h-5 w-5" />
                  My Account
                </Link>
             </div>
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
