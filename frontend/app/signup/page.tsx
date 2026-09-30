"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { Building2, Eye, EyeOff, Loader2, Mail, Lock, User, Briefcase, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";

interface InvitePreview {
  invitee_name: string;
  invitee_email: string;
  admin_fee_amount: number;
  status: "pending" | "registered" | "paid";
  expired: boolean;
  property: { title: string; address: string } | null;
  inviter_name: string | null;
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center">Loading...</div>}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const inviteToken = useSearchParams().get("invite");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [userType, setUserType] = useState<"tenant" | "landlord" | "handyman" | "agent">("tenant");
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  // Landlord/agent signups wait for a super admin's approval.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
     name: "",
     email: "",
     company: "",
     password: "",
     services: "",
     experience: "",
     certifications: ""
  });

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/invites/${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invalid invite link.");
        const preview = data.invite as InvitePreview;
        if (preview.expired) throw new Error("This invite has expired. Ask your agent or landlord for a new link.");
        if (preview.status !== "pending") throw new Error("This invite has already been used. Sign in instead.");
        setInvite(preview);
        setFormData(prev => ({ ...prev, name: preview.invitee_name, email: preview.invitee_email }));
      })
      .catch((err: Error) => setInviteError(err.message));
  }, [inviteToken]);

  // Tenants can only register through an invite link from their agent/landlord.
  const tenantBlocked = userType === "tenant" && !invite;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tenantBlocked) return;
    setIsLoading(true);
    setErrorMessage(null);

    const payPath = inviteToken ? `/register/pay?invite=${encodeURIComponent(inviteToken)}` : null;

    try {
      const effectiveRole = userType === 'agent' ? 'landlord' : userType;
      const servicesOffered = effectiveRole === 'handyman'
        ? formData.services.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.name,
          phone: undefined,
          // "agent" is sent as-is so the account is recorded as an agent.
          role: userType,
          servicesOffered,
          experienceYears: effectiveRole === 'handyman' ? Number(formData.experience || 0) : 0,
          certifications: effectiveRole === 'handyman'
            ? formData.certifications.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      if (data.pending) {
        setPendingMessage(data.message);
        return;
      }

      // Invited tenants go straight on to pay the admin fee; /register/pay
      // links the invite to this new account first.
      const destination = effectiveRole === 'tenant' && payPath
        ? payPath
        : effectiveRole === 'handyman' ? '/handyman' : effectiveRole === 'landlord' ? '/dashboard' : '/find-home';
      router.push(destination);
      router.refresh();
    } catch (error) {
      console.error('Signup error:', error);
      const errMessage = (error as Error)?.message || (typeof error === 'string' ? error : 'Failed to create account');
      setErrorMessage(errMessage);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="container relative flex min-h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&auto=format&fit=crop&w=1973&q=80')] bg-cover bg-center opacity-50 mix-blend-overlay" /> 
        <Link href="/" className="relative z-20 flex items-center gap-2 text-lg font-medium">
          <div className="rounded-lg bg-brand p-1">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          EasyRent
        </Link>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              &ldquo;This platform has completely transformed how I manage my properties. The tenant verification is a game-changer.&rdquo;
            </p>
            <footer className="text-sm">Sofia Davis, Property Manager</footer>
          </blockquote>
        </div>
      </div>
      <div className="lg:p-8 w-full">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          {pendingMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-6 text-center space-y-3" data-testid="signup-pending">
              <h1 className="text-xl font-semibold">Awaiting approval</h1>
              <p className="text-sm text-amber-900 dark:text-amber-200">{pendingMessage}</p>
              <p className="text-xs text-muted-foreground">
                Every landlord and agent on EasyRent24 is checked by our team before they can list properties or invite tenants.
              </p>
              <Link href="/signin" className="inline-block text-sm font-medium text-brand underline underline-offset-4">Go to sign in</Link>
            </div>
          ) : (<>
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
            <p className="text-sm text-muted-foreground">
              Enter your details below to create your standard account
            </p>
          </div>

          {invite && (
            <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 text-sm flex gap-3">
              <Ticket className="h-5 w-5 shrink-0 text-brand" />
              <div className="space-y-1">
                <p>
                  {invite.inviter_name ? <><strong>{invite.inviter_name}</strong> invited you</> : "You've been invited"} to apply for{" "}
                  <strong>{invite.property?.title ?? "a property"}</strong>{invite.property?.address ? `, ${invite.property.address}` : ""}.
                </p>
                <p className="text-muted-foreground">
                  Registration admin fee: <strong className="text-foreground">R{invite.admin_fee_amount.toFixed(2)}</strong>, payable online after you create your account.
                </p>
              </div>
            </div>
          )}

          {inviteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-300">
              {inviteError}
            </div>
          )}

          {!invite && (
          <div className="flex w-full rounded-lg border border-border bg-muted/50 p-1">
             <button
                type="button"
                onClick={() => setUserType("tenant")}
                className={cn(
                  "flex-1 rounded-md px-2 py-2 text-sm font-medium transition-all",
                  userType === "tenant" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
             >
                Tenant
             </button>
             <button
                type="button"
                onClick={() => setUserType("landlord")}
                className={cn(
                  "flex-1 rounded-md px-2 py-2 text-sm font-medium transition-all",
                  userType === "landlord" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
             >
                Landlord
             </button>
             <button
                type="button"
                onClick={() => setUserType("handyman")}
                className={cn(
                  "flex-1 rounded-md px-2 py-2 text-sm font-medium transition-all",
                  userType === "handyman" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
             >
                Handyman
             </button>
             <button
                type="button"
                onClick={() => setUserType("agent")}
                className={cn(
                  "flex-1 rounded-md px-2 py-2 text-sm font-medium transition-all",
                  userType === "agent" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
             >
                Agent
             </button>
          </div>
          )}

          {tenantBlocked && !inviteError && !inviteToken && (
            <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
              Tenants register through a personal invite link from their agent or landlord. Ask them to send you one, then open it to create your account.
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="name">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    id="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    type="text"
                    autoCapitalize="none"
                    autoComplete="name"
                    autoCorrect="off"
                    disabled={isLoading}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
              
              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="email">
                  Email
                </label>
                <div className="relative">
                   <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                   <input
                    id="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="name@example.com"
                    type="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    disabled={isLoading}
                    readOnly={!!invite}
                    title={invite ? "Your invite is linked to this email address" : undefined}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
              
               {userType === "agent" && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="company">
                    Agency / Company Name
                  </label>
                   <div className="relative">
                    <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <input
                      id="company"
                      value={formData.company}
                      onChange={handleChange}
                      placeholder="Prestige Realty"
                      type="text"
                      disabled={isLoading}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                   </div>
                </div>
              )}

              {userType === "handyman" && (
                <>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium leading-none" htmlFor="services">
                      Services Offered
                    </label>
                    <input
                      id="services"
                      value={formData.services}
                      onChange={handleChange}
                      placeholder="Plumbing, Electrical, Painting"
                      disabled={isLoading}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium leading-none" htmlFor="experience">
                      Years of Experience
                    </label>
                    <input
                      id="experience"
                      value={formData.experience}
                      onChange={handleChange}
                      placeholder="5"
                      type="number"
                      min="0"
                      disabled={isLoading}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium leading-none" htmlFor="certifications">
                      Certifications (optional)
                    </label>
                    <input
                      id="certifications"
                      value={formData.certifications}
                      onChange={handleChange}
                      placeholder="NQF 4, PR Plumbing, OSHA"
                      disabled={isLoading}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </>
              )}

              <div className="grid gap-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                   <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                   <input
                    id="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    disabled={isLoading}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              {errorMessage && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive border border-destructive/20">
                  {errorMessage}
                </div>
              )}

              <button disabled={isLoading || tenantBlocked} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-brand text-brand-foreground hover:bg-brand/90 h-10 px-4 py-2 w-full mt-2">
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {invite ? "Create Account & Continue to Payment" : "Create Account"}
              </button>
            </div>
          </form>
          
          <div className="relative">
             <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
             </div>
             <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                   Or continue with
                </span>
             </div>
          </div>
          
           <div className="grid grid-cols-2 gap-4">
               <button
                  type="button"
                  disabled={isLoading}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
               >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                     <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                     />
                     <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                     />
                     <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                     />
                     <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                     />
                  </svg>
                  Google
               </button>
               <button
                  type="button"
                  disabled={isLoading}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
               >
                   <svg role="img" viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>Apple</title><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.127 3.675-.552 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702z"/></svg>
                  Apple
               </button>
           </div>
          
          <p className="px-8 text-center text-sm text-muted-foreground">
            By clicking continue, you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">
              Privacy Policy
            </Link>
            .
          </p>
          </>)}
        </div>
      </div>
    </div>
  );
}
