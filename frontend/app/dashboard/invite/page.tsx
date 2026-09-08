"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, Mail, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface Property {
  id: string;
  title: string;
  address: string;
}

export default function InviteTenantPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [propertyRef, setPropertyRef] = useState("");

  useEffect(() => {
    async function fetchProperties() {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const { data } = await supabase
          .from('properties')
          .select('id, title, address')
          .eq('landlord_id', authData.user.id);
        
        if (data) {
          setProperties(data);
          if (data.length > 0) setSelectedProperty(data[0].id);
        }
      } else {
        // Mock properties if not logged in for demo purposes
        const staticMocks = [
          { id: "101", title: "Modern Apartment in Sea Point", address: "45 Main Road, Sea Point" },
          { id: "102", title: "Spacious Family Home", address: "12 Oak Avenue, Suburbs" }
        ];
        
        let localMocks: Property[] = [];
        try {
          const stored = localStorage.getItem('mock_properties');
          if (stored) localMocks = JSON.parse(stored);
        } catch (e) {
          console.error("Failed to parse mock properties", e);
        }

        const combined = [...localMocks, ...staticMocks];
        setProperties(combined);
        if (combined.length > 0) setSelectedProperty(combined[0].id);
      }
    }
    fetchProperties();
  }, []);

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);

    const prop = properties.find(p => p.id === selectedProperty);
    const ref = `REF-${selectedProperty}`;
    setPropertyRef(ref);

    // Generate the invite link (points to the /apply page we created earlier)
    const link = `${window.location.origin}/apply?ref=${selectedProperty}&title=${encodeURIComponent(prop?.title || '')}&address=${encodeURIComponent(prop?.address || '')}`;
    setInviteLink(link);

    // Simulate sending email
    setTimeout(() => {
      setIsSending(false);
      setInviteSent(true);
    }, 1500);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink);
    alert("Invite link copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12">
      <div className="container max-w-3xl mx-auto px-4">
        
        <div className="flex items-center gap-4 mb-8">
           <button onClick={() => router.back()} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft className="h-5 w-5" />
           </button>
           <div>
              <h1 className="text-2xl font-bold">Invite Prospective Tenant</h1>
              <p className="text-muted-foreground">Send a direct application link for a specific property.</p>
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
                  <option value="" disabled>Select a property...</option>
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

              <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/50 rounded-lg text-sm text-blue-800 dark:text-blue-200 flex gap-3">
                 <Mail className="h-5 w-5 shrink-0" />
                 <p>
                   An email will be sent to the prospective tenant containing the property details, a unique application link, and the property reference number.
                 </p>
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                 <button
                    type="submit"
                    disabled={isSending || !selectedProperty}
                    className="bg-brand text-white px-8 py-3 rounded-md font-bold flex items-center gap-2 hover:bg-brand/90 transition-all shadow-md"
                 >
                    {isSending ? "Sending Invite..." : (
                      <>
                        <Send className="h-5 w-5" />
                        Send Invite Email
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
                  <h2 className="text-2xl font-bold mb-2">Invite Sent Successfully!</h2>
                  <p className="text-muted-foreground">
                    An email has been dispatched to <strong>{tenantEmail}</strong>.
                  </p>
               </div>

               <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-lg border border-border mb-6">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">Email Preview</h3>
                  
                  <div className="space-y-4 font-mono text-sm bg-white dark:bg-slate-900 p-4 rounded border border-border shadow-sm">
                     <p><strong>Subject:</strong> Invitation to apply for {properties.find(p => p.id === selectedProperty)?.title}</p>
                     <p>Hi {tenantName},</p>
                     <p>You have been invited by the landlord to submit a rental application for the following property:</p>
                     <p className="pl-4 border-l-2 border-brand">
                        <strong>{properties.find(p => p.id === selectedProperty)?.title}</strong><br/>
                        {properties.find(p => p.id === selectedProperty)?.address}
                     </p>
                     <p>
                        Your Property Reference Number is: <strong className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded">{propertyRef}</strong>
                     </p>
                     <p>Please click the link below to begin your secure application process. You will need to enter the reference number above if it is not pre-filled.</p>
                     <p>
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
                    onClick={() => setInviteSent(false)}
                    className="w-full sm:w-auto px-6 py-3 rounded-md bg-brand text-white font-medium flex items-center justify-center gap-2 hover:bg-brand/90 transition-colors"
                  >
                     Send Another Invite
                  </button>
               </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
