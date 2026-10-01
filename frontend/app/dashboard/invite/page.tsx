"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, Mail, Send } from "lucide-react";
import { db } from "@/lib/apiClient";
import { TENANT_FEE_ZAR } from "@backend/lib/applications";

interface Property {
  id: string;
  title: string;
  address: string;
}

interface SentInvite {
  id: string;
  invitee_name: string;
  invitee_email: string;
  admin_fee_amount: number;
  status: "pending" | "registered" | "paid" | "revoked";
  expires_at: string;
  created_at: string;
  properties: { title: string } | null;
  /** Present while the tenant hasn't signed up yet; uses the app's current address. */
  link: string | null;
}

const STATUS_LABELS: Record<SentInvite["status"], { label: string; className: string }> = {
  pending: { label: "Awaiting signup", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  registered: { label: "Registered, fee unpaid", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200" },
  paid: { label: "Admin fee paid", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  revoked: { label: "Revoked", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const formatRand = (amount: number) => `R${Number(amount).toFixed(2)}`;

export default function InviteTenantPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [sentFee, setSentFee] = useState(0);
  const [emailed, setEmailed] = useState(false);
  const [invites, setInvites] = useState<SentInvite[]>([]);

  const loadInvites = useCallback(async () => {
    const res = await fetch("/api/invites");
    if (res.ok) {
      const data = await res.json();
      setInvites(data.invites ?? []);
    }
  }, []);

  useEffect(() => {
    async function fetchProperties() {
      const { data: authData } = await db.auth.getUser();
      if (!authData?.user) return;
      const { data } = await db
        .from('properties')
        .select('id, title, address')
        .eq('landlord_id', authData.user.id);

      if (data) {
        setProperties(data);
        if (data.length > 0) setSelectedProperty(data[0].id);
      }
    }
    fetchProperties();
    loadInvites();
  }, [loadInvites]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setError(null);

    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: selectedProperty,
          invitee_name: tenantName,
          invitee_email: tenantEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = data.details ? Object.values(data.details as Record<string, string[]>).flat().join(" ") : "";
        throw new Error(details || data.error || "Failed to create invite");
      }

      setInviteLink(data.link);
      setSentFee(Number(data.invite.admin_fee_amount));
      setEmailed(Boolean(data.emailed));
      setInviteSent(true);
      loadInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setIsSending(false);
    }
  };

  // Optional: re-send a pending invite's link (e.g. after the app's address changed).
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyInviteLink = async (inv: SentInvite) => {
    if (!inv.link) return;
    try {
      await navigator.clipboard.writeText(inv.link);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((id) => (id === inv.id ? null : id)), 2000);
    } catch {
      window.prompt("Copy this registration link:", inv.link);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    alert("Invite link copied to clipboard!");
  };

  const resetForm = () => {
    setInviteSent(false);
    setTenantName("");
    setTenantEmail("");
  };

  const property = properties.find(p => p.id === selectedProperty);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12">
      <div className="container max-w-3xl mx-auto px-4">

        <div className="flex items-center gap-4 mb-8">
           <button onClick={() => router.back()} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="h-5 w-5" />
           </button>
           <div>
              <h1 className="text-2xl font-bold">Invite Prospective Tenant</h1>
              <p className="text-muted-foreground">Send a registration link. The tenant pays your admin fee when they sign up.</p>
           </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-border overflow-hidden shadow-sm">
          {!inviteSent ? (
            <form onSubmit={handleSendInvite} className="p-6 md:p-8 space-y-6">

              <div>
                <label className="block text-sm font-medium mb-2">Select Property</label>
                <select
                  className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-brand"
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  required
                >
                  <option value="" disabled>{properties.length ? "Select a property..." : "List a property first"}</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title} - {p.address}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Tenant Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Jane Doe"
                    className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-brand"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Tenant Email</label>
                  <input
                    type="email"
                    placeholder="jane@example.com"
                    className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-brand"
                    value={tenantEmail}
                    onChange={(e) => setTenantEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <p className="block text-sm font-medium mb-2">Tenant fee</p>
                <p className="w-full md:w-1/2 px-4 py-3 rounded-md border border-input bg-muted/40 font-semibold" data-testid="tenant-fee">
                  {formatRand(TENANT_FEE_ZAR)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">The same for every tenant. Paid online at registration and covers their application.</p>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/50 rounded-lg text-sm text-blue-800 dark:text-blue-200 flex gap-3">
                 <Mail className="h-5 w-5 shrink-0" />
                 <p>
                   The tenant receives a personal registration link. It only works for the email address above and expires after 14 days.
                 </p>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <div className="flex justify-end pt-4 border-t border-border">
                 <button
                    type="submit"
                    disabled={isSending || !selectedProperty}
                    className="bg-brand text-white px-8 py-3 rounded-md font-bold flex items-center gap-2 hover:bg-gold-600 transition-all shadow-md disabled:opacity-50"
                 >
                    {isSending ? "Creating Invite..." : (
                      <>
                        <Send className="h-5 w-5" />
                        Create Invite Link
                      </>
                    )}
                 </button>
              </div>
            </form>
          ) : (
            <div className="p-6 md:p-8 animate-in fade-in zoom-in duration-300">
               <div className="text-center mb-8">
                  <div className="h-16 w-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                     <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">{emailed ? "Invite Sent" : "Invite Link Created"}</h2>
                  <p className="text-muted-foreground">
                    {emailed
                      ? <>We emailed the registration link to <strong>{tenantEmail}</strong>. You can also copy it below.</>
                      : <>Email isn&apos;t set up yet — copy the link below and send it to <strong>{tenantEmail}</strong>.</>}
                  </p>
               </div>

               <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-lg border border-border mb-6">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">{emailed ? "Email Sent" : "Suggested Message"}</h3>

                  <div className="space-y-4 font-mono text-sm bg-white dark:bg-slate-900 p-4 rounded border border-border shadow-sm">
                     <p><strong>Subject:</strong> Register to apply for {property?.title}</p>
                     <p>Hi {tenantName},</p>
                     <p>You have been invited to register on EasyRent and apply for the following property:</p>
                     <p className="pl-4 border-l-2 border-brand">
                        <strong>{property?.title}</strong><br/>
                        {property?.address}
                     </p>
                     <p>
                        To register, create your account through the link below and pay the admin fee of <strong>{formatRand(sentFee)}</strong> online. Once the fee is paid you can complete your rental application.
                     </p>
                     <p className="break-all">
                        <a href={inviteLink} className="text-brand hover:underline">{inviteLink}</a>
                     </p>
                     <p>Best Regards,<br/>EasyRent Management</p>
                  </div>
               </div>

               <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-border">
                  <button
                    onClick={copyToClipboard}
                    className="w-full sm:w-auto px-6 py-3 rounded-md border border-input font-medium flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  >
                     <Copy className="h-4 w-4" /> Copy Link
                  </button>
                  <button
                    onClick={resetForm}
                    className="w-full sm:w-auto px-6 py-3 rounded-md bg-brand text-white font-medium flex items-center justify-center gap-2 hover:bg-gold-600 transition-colors"
                  >
                     Create Another Invite
                  </button>
               </div>
            </div>
          )}
        </div>

        {invites.length > 0 && (
          <div className="mt-8 bg-white dark:bg-slate-900 rounded-xl border border-border shadow-sm overflow-hidden">
            <h2 className="px-6 py-4 font-semibold border-b border-border">Sent Invites</h2>
            <ul className="divide-y divide-border">
              {invites.map(inv => {
                const expired = inv.status === "pending" && new Date(inv.expires_at) <= new Date();
                const badge = expired
                  ? { label: "Expired", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" }
                  : STATUS_LABELS[inv.status];
                return (
                  <li key={inv.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{inv.invitee_name} <span className="text-muted-foreground font-normal">· {inv.invitee_email}</span></p>
                      <p className="text-sm text-muted-foreground truncate">{inv.properties?.title ?? "Property removed"} · {formatRand(inv.admin_fee_amount)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {inv.link && (
                        <button
                          type="button"
                          onClick={() => copyInviteLink(inv)}
                          title="Copy the registration link to send it again"
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
                        >
                          {copiedId === inv.id ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === inv.id ? "Copied" : "Copy link"}
                        </button>
                      )}
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}
