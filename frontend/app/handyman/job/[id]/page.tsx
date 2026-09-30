"use client";

import { useState, useEffect } from "react";
import { Clock, MapPin, Star, MessageSquare, ShieldCheck, Check, User, DollarSign, Phone, Send, Navigation } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { db } from "@/lib/apiClient";

interface HandymanJob {
  id: string;
  title: string;
  category: string;
  description: string;
  budget: string;
  status: string;
  postedBy: string;
  location: string;
  date: string;
  posterId?: string;
  agreedPrice?: number | null;
}

interface HandymanBid {
  id: string | number;
  handymanId: string;
  provider: string;
  rating: number;
  jobs: number;
  price: number;
  comment: string;
  status: string;
}

interface EscrowTransaction {
  id: string;
  status: "held" | "released" | "refunded" | "disputed";
  amount: number;
}

export default function JobDetailPage() {
  const params = useParams(); // Get params
  const id = params?.id as string | undefined;

  const [jobStatus, setJobStatus] = useState("open"); // open -> pending_payment -> en_route -> in_progress -> completed
  const [acceptedBidId, setAcceptedBidId] = useState<string | number | null>(null);
  const [escrow, setEscrow] = useState<EscrowTransaction | null>(null);
  const [isFundingEscrow, setIsFundingEscrow] = useState(false);
  const [isReleasingFunds, setIsReleasingFunds] = useState(false);
  const [isAcceptingBid, setIsAcceptingBid] = useState(false);
  const [userRole, setUserRole] = useState<"client" | "provider">("client");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [job, setJob] = useState<HandymanJob | null>(null);
  const [bids, setBids] = useState<HandymanBid[]>([]);
  const [messages, setMessages] = useState([
    { id: 1, sender: "provider", text: "Hi! Thanks for accepting. I'm packing up and will be there shortly.", time: "10:30 AM" },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [trackingProgress, setTrackingProgress] = useState(0); // 0-100 for simulated map movement
  const [isReviewed, setIsReviewed] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");

  // Bidding Form State
  const [bidForm, setBidForm] = useState({ price: "", comment: "" });
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);

  const handleSubmitReview = () => {
    setIsReviewed(true);
  };

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bidForm.price || !bidForm.comment || !id) return;
    setIsSubmittingBid(true);

    try {
      const res = await fetch(`/api/handyman/jobs/${id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: parseFloat(bidForm.price),
          message: bidForm.comment,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);

      const bid = json.bid;
      const newBid: HandymanBid = {
        id: bid.id,
        handymanId: bid.handyman_id,
        provider: 'You',
        rating: 5.0,
        jobs: 0,
        price: bid.amount,
        comment: bid.message,
        status: bid.status,
      };
      setBids([...bids, newBid]);
      setBidForm({ price: '', comment: '' });
    } catch (err: unknown) {
      console.error('Error placing bid:', err);
      alert(`Failed to place bid: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSubmittingBid(false);
    }
  };



    // Real backend state (job.status + whether/how escrow was funded) is the
  // source of truth; this derives which of this page's UI states to show
  // from it. Needed because funding escrow round-trips through PayFast and
  // back to this same page — a plain reload after that redirect has to land
  // on the right screen, not just whatever state existed before navigating
  // away, which a naive "jobData.status → jobStatus" pass-through can't do
  // since the DB has no 'pending_payment' or 'en_route' status of its own.
  function deriveJobStatus(dbStatus: string, escrowRow: EscrowTransaction | null): string {
    if (dbStatus === 'open' || dbStatus === 'bidding') return 'open';
    if (dbStatus === 'in_progress') {
      return escrowRow?.status === 'held' ? 'in_progress' : 'pending_payment';
    }
    if (dbStatus === 'completed') {
      // The handyman marking the job 'completed' just submits it for review
      // — escrow only actually moves when the poster releases it. Funds
      // still 'held' at this point means "awaiting the poster's approval",
      // not "done"; only a 'released' escrow (or no escrow at all, e.g. a
      // job that never went through funding) counts as fully finished.
      return escrowRow?.status === 'held' ? 'awaiting_release' : 'completed';
    }
    return dbStatus;
  }

  // Which side of the job this viewer sees (client vs provider) has to come
  // from who's actually signed in, not a manual switch — a real handyman
  // hitting this page should see the provider view, and a real poster the
  // client view, with no way to flip into the other side's controls.
  useEffect(() => {
    async function fetchCurrentUser() {
      const { data } = await db.auth.getUser();
      if (data?.user) {
        setCurrentUserId(data.user.id);
        setUserRole(data.user.user_metadata?.role === 'handyman' ? 'provider' : 'client');
      }
    }
    fetchCurrentUser();
  }, []);

  useEffect(() => {
     async function fetchJobAndBids() {
        if (!id) return;
        try {
           const [jobRes, escrowRes] = await Promise.all([
             fetch(`/api/handyman/jobs/${id}`, { credentials: 'include' }),
             fetch(`/api/handyman/jobs/${id}/escrow`, { credentials: 'include' }),
           ]);
           if (!jobRes.ok) return;
           const json = await jobRes.json();

           const escrowData = escrowRes.ok ? (await escrowRes.json()).escrow : null;
           setEscrow(escrowData);

           const jobData = json.job;
           if (jobData) {
              setJob({
                 id: jobData.id,
                 title: jobData.title,
                 category: jobData.category || 'General',
                 description: jobData.description || '',
                 budget: jobData.budget_range || 'TBD',
                 status: jobData.status,
                 postedBy: 'Client',
                 location: jobData.location,
                 date: new Date(jobData.created_at).toLocaleDateString(),
                 posterId: jobData.poster_id,
                 agreedPrice: jobData.agreed_price !== null ? Number(jobData.agreed_price) : null,
              });
              setJobStatus(deriveJobStatus(jobData.status, escrowData));
              if (jobData.assigned_handyman_id) {
                setAcceptedBidId(jobData.assigned_handyman_id);
              }
           }

           const bidsData: any[] = json.bids ?? [];
           if (bidsData.length > 0) {
              setBids(bidsData.map((bid: any) => ({
                 id: bid.id,
                 handymanId: bid.handyman_id,
                 provider: 'Handyman',
                 rating: 5.0,
                 jobs: 0,
                 price: bid.amount,
                 comment: bid.message,
                 status: bid.status,
              })));
           }
        } catch (err) {
           console.error('Error fetching job and bids', err);
        }
     }
     fetchJobAndBids();
  }, [id]);

  // Simulate tracking updates when en_route — purely a visual flourish, only
  // reachable if something sets jobStatus to 'en_route'; nothing does
  // currently since escrow funding now redirects through real PayFast and
  // back rather than faking a driving animation.
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobStatus === "en_route") {
      interval = setInterval(() => {
        setTrackingProgress(prev => {
          if (prev >= 100) {
             setJobStatus("in_progress"); // Auto-arrive
             return 100;
          }
          return prev + 10;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [jobStatus]);

  const handleAcceptBid = async (bidId: string | number) => {
    if (!id) return;
    const bid = bids.find((b) => b.id === bidId);
    if (!bid) return;

    setIsAcceptingBid(true);
    try {
      const res = await fetch(`/api/handyman/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          assigned_handyman_id: bid.handymanId,
          agreed_price: bid.price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);

      setAcceptedBidId(bidId);
      setJob((prev) => (prev ? { ...prev, agreedPrice: bid.price } : prev));
      setJobStatus("pending_payment");
    } catch (err: unknown) {
      console.error('Error accepting bid:', err);
      alert(`Failed to accept bid: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsAcceptingBid(false);
    }
  };

  const handleFundEscrow = async () => {
    if (!id) return;
    setIsFundingEscrow(true);
    try {
      const res = await fetch(`/api/handyman/jobs/${id}/escrow/checkout`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.processUrl) {
        throw new Error(data.error || 'Failed to initialize PayFast');
      }

      // Same hidden-form auto-submit PayFast requires everywhere else in
      // this app (see /checkout) — a GET redirect with query params isn't
      // how PayFast's flow works.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.processUrl;
      for (const [key, value] of Object.entries(data.fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err: unknown) {
      console.error('Error funding escrow:', err);
      alert(`Failed to fund escrow: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsFundingEscrow(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setMessages([...messages, {
      id: Date.now(),
      sender: userRole === "client" ? "client" : "provider",
      text: newMessage,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setNewMessage("");
  };

  const handleReleaseFunds = async () => {
    if (!id) return;
    setIsReleasingFunds(true);
    try {
      const res = await fetch(`/api/handyman/jobs/${id}/escrow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'release' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);

      setEscrow(data.escrow);
      setJobStatus('completed');
    } catch (err: unknown) {
      console.error('Error releasing funds:', err);
      alert(`Failed to release funds: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsReleasingFunds(false);
    }
  };

  // The handyman submitting work only marks the job 'completed' — escrow
  // stays 'held' until the poster separately reviews and releases it via
  // handleReleaseFunds above. A handyman can't release their own payment;
  // the backend enforces this too (only the poster can PATCH escrow).
  const handleSubmitWorkForReview = async () => {
    if (!id) return;
    setIsReleasingFunds(true);
    try {
      const res = await fetch(`/api/handyman/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'completed' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);

      setJobStatus('awaiting_release');
    } catch (err: unknown) {
      console.error('Error submitting work:', err);
      alert(`Failed to submit work: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsReleasingFunds(false);
    }
  };

  return (
    <div className="container max-w-6xl pt-20 pb-6 md:pb-10">
      <div className="grid gap-6 lg:grid-cols-3 h-[calc(100vh-8rem)]">
        {/* Left Column: Job Info & Tracking */}
        <div className="lg:col-span-2 flex flex-col gap-6 overflow-y-auto pr-2">
           
           {/* Tracking Map Card - Shows when En Route or In Progress */}
           {(jobStatus === "en_route" || jobStatus === "in_progress") && (
             <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm flex-shrink-0">
               <div className="bg-muted h-[300px] relative w-full">
                  {/* Simulated Map Background */}
                  <div className="absolute inset-0 bg-zinc-200 dark:bg-zinc-800" />
                  <div className="absolute inset-0 bg-slate-100/50 dark:bg-slate-900/50 backdrop-blur-[1px]" />
                  
                  {/* Streets / Route Line Pattern (CSS Art) */}
                  <div className="absolute left-[20%] top-[30%] right-[20%] h-2 bg-blue-400/30 rounded-full" />
                  
                  {/* Client Location Pin */}
                  <div className="absolute right-[20%] top-[25%] flex flex-col items-center">
                     <div className="h-8 w-8 bg-brand rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                     </div>
                     <span className="bg-white px-2 py-1 rounded text-xs font-bold shadow mt-1">You</span>
                  </div>

                  {/* Provider Moving Car */}
                   <div 
                     className="absolute top-[25%] flex flex-col items-center transition-all duration-1000 ease-linear"
                     style={{ left: `${20 + (trackingProgress * 0.6)}%` }}
                   >
                     <div className="h-10 w-10 bg-black text-white rounded-full border-4 border-white shadow-xl flex items-center justify-center z-10">
                        <Navigation className="h-5 w-5 transform rotate-90" />
                     </div>
                     {jobStatus === "en_route" && (
                        <span className="bg-black text-white px-2 py-1 rounded text-xs font-bold shadow mt-1 whitespace-nowrap">
                           {10 - Math.floor(trackingProgress / 10)} min away
                        </span>
                     )}
                  </div>
               </div>
               
               <div className="p-4 bg-card flex items-center justify-between">
                  <div>
                     <h3 className="font-bold text-lg flex items-center gap-2">
                        {jobStatus === "en_route" ? "Driver is on the way" : "Driver has arrived"}
                     </h3>
                     <p className="text-muted-foreground text-sm">
                        {jobStatus === "en_route" ? "Your provider is navigating to your location." : "Work is currently in progress."}
                     </p>
                  </div>
                  <div className="flex gap-3">
                     <button className="h-10 w-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
                        <Phone className="h-5 w-5" />
                     </button>
                     <button 
                       onClick={() => setShowChat(!showChat)}
                       className="h-10 w-10 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand/90"
                     >
                        <MessageSquare className="h-5 w-5" />
                     </button>
                  </div>
               </div>
             </div>
           )}

           {/* Job Details Card */}
           <div className="rounded-xl border border-border bg-card p-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                 <div>
                    <div className="flex items-center gap-2 mb-2">
                       <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                          {job?.category}
                       </span>
                       <span className="text-sm text-muted-foreground flex items-center">
                          <Clock className="mr-1 h-3.5 w-3.5" /> Posted {job?.date}
                       </span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">{job?.title}</h1>
                    <div className="flex items-center text-muted-foreground">
                       <MapPin className="mr-1.5 h-4 w-4" /> {job?.location}
                    </div>
                 </div>
                 <div className="text-right">
                    <div className="text-sm text-muted-foreground mb-1">Estimated Budget</div>
                    <div className="text-2xl font-bold text-brand">{job?.budget}</div>
                 </div>
              </div>
             
             {/* Simple Status Steps */}
             <div className="flex items-center gap-2 text-sm mt-6 overflow-x-auto pb-2">
                {[
                  { id: "open", label: "Posted" },
                  { id: "pending_payment", label: "Bid Accepted" },
                  { id: "in_progress", label: "Escrow Held" },
                  { id: "awaiting_release", label: "Work Submitted" },
                  { id: "completed", label: "Done" }
                ].map((s, i) => (
                   <div key={s.id} className="flex items-center flex-shrink-0">
                      <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                        jobStatus === s.id
                           ? "bg-brand text-white border-brand"
                           : (["open", "pending_payment", "in_progress", "awaiting_release", "completed"].indexOf(jobStatus) > i
                              ? "bg-green-100 text-green-700 border-green-200"
                              : "bg-muted text-muted-foreground border-transparent")
                      )}>
                         {s.label}
                      </div>
                      {i < 4 && <div className="w-4 h-px bg-border mx-1" />}
                   </div>
                ))}
             </div>
           </div>

           {/* Site Photos Card */}
            <div className="bg-card border border-border p-6 rounded-xl mb-6">
               <h3 className="font-semibold text-lg mb-3">Job Description</h3>
               <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {job?.description}
               </p>
            </div>
            
           <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-lg mb-4">Site Photos</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <div className="relative aspect-square rounded-lg overflow-hidden border border-border group cursor-zoom-in">
                    <Image 
                       src="/images/plumbing-professional.png" // Placeholder for actual job photo
                       alt="Issue Photo 1" 
                       fill
                       className="object-cover transition-transform group-hover:scale-105"
                    />
                 </div>
                 {[1, 2].map(i => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center text-muted-foreground">
                       <span className="text-xs">No Image</span>
                    </div>
                 ))}
                 <div className="relative aspect-square rounded-lg overflow-hidden border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 cursor-pointer transition-colors">
                    <span className="text-2xl font-light">+</span>
                    <span className="text-xs">Add Photo</span>
                 </div>
              </div>
           </div>

           {/* Bids List (Only show if not started) */}
           {jobStatus === "open" && (

             <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <h3 className="font-semibold text-lg">Offers ({bids.length})</h3>
               </div>
               
               {bids.map((bid) => (
                  <div key={bid.id} className="rounded-lg border border-border bg-card p-4 flex justify-between items-center hover:border-brand/40 transition-colors">
                     <div className="flex gap-3">
                        <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center font-bold text-zinc-500 shrink-0">
                           {bid.provider.charAt(0)}
                        </div>
                        <div>
                           <div className="font-semibold">{bid.provider}</div>
                           <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {bid.rating} ({bid.jobs} jobs)
                           </div>
                           <p className="text-xs text-muted-foreground mt-1 italic">&quot;{bid.comment}&quot;</p>
                        </div>
                     </div>
                     <div className="text-right shrink-0">
                        <div className="font-bold text-lg">R {bid.price}</div>
                        {userRole === "client" && (
                           <button
                             onClick={() => handleAcceptBid(bid.id)}
                             disabled={isAcceptingBid}
                             className="mt-2 text-xs bg-foreground text-background px-4 py-2.5 rounded font-medium hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50"
                           >
                              {isAcceptingBid ? "Accepting..." : "Accept Bid"}
                           </button>
                        )}
                        {bid.provider.includes("You") && (
                            <span className="text-[10px] bg-brand/10 text-brand px-2 py-0.5 rounded-full block mt-2 mx-auto w-fit">Your Bid</span>
                        )}
                     </div>
                  </div>
               ))}

               {/* Provider Bid Form */}
               {userRole === "provider" && jobStatus === "open" && (
                   <div className="mt-8 pt-6 border-t border-dashed border-border animate-in fade-in slide-in-from-bottom-4">
                       <h3 className="font-bold text-lg mb-4">Place Your Bid</h3>
                       <form onSubmit={handlePlaceBid} className="space-y-4 bg-muted/30 p-4 rounded-xl border border-border">
                           <div>
                               <label className="block text-sm font-medium mb-1">Your Price (ZAR)</label>
                               <div className="relative">
                                   <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                   <input 
                                       type="number" 
                                       placeholder="e.g. 750" 
                                       className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background focus:ring-2 focus:ring-brand"
                                       value={bidForm.price}
                                       onChange={e => setBidForm({...bidForm, price: e.target.value})}
                                       required
                                   />
                               </div>
                           </div>
                           <div>
                               <label className="block text-sm font-medium mb-1">Proposal / Comment</label>
                               <textarea 
                                   placeholder="Describe when you can come and what's included..." 
                                   className="w-full px-4 py-2.5 rounded-lg border border-input bg-background focus:ring-2 focus:ring-brand min-h-[80px]"
                                   value={bidForm.comment}
                                   onChange={e => setBidForm({...bidForm, comment: e.target.value})}
                                   required
                               />
                           </div>
                           <button 
                               type="submit" 
                               disabled={isSubmittingBid}
                               className="w-full bg-brand text-white py-3 rounded-lg font-bold hover:bg-brand/90 transition-all flex items-center justify-center gap-2"
                           >
                               {isSubmittingBid ? "Submitting..." : "Submit Bid"}
                           </button>
                       </form>
                   </div>
               )}
             </div>
           )}
        </div>

        {/* Right Column: Chat & Actions */}
        <div className="lg:col-span-1 flex flex-col gap-6 h-full">
           {/* Chat Interface */}
           {(acceptedBidId || showChat) && (
              <div className="rounded-xl border border-border bg-card flex flex-col shadow-sm flex-grow h-[500px] lg:h-auto">
                 <div className="p-4 border-b border-border bg-muted/30">
                    <h3 className="font-semibold flex items-center gap-2">
                       <MessageSquare className="h-4 w-4" /> 
                       Chat with Pro
                    </h3>
                 </div>
                 
                 <div className="flex-grow overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                       <div key={msg.id} className={cn("flex", msg.sender === userRole ? "justify-end" : "justify-start")}>
                          <div className={cn(
                             "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                             msg.sender === userRole 
                                ? "bg-brand text-white rounded-br-none" 
                                : "bg-muted text-foreground rounded-bl-none"
                          )}>
                             <p>{msg.text}</p>
                             <p className={cn("text-[10px] mt-1 opacity-70", msg.sender === userRole ? "text-blue-100" : "text-muted-foreground")}>{msg.time}</p>
                          </div>
                       </div>
                    ))}
                 </div>
                 
                 <form onSubmit={handleSendMessage} className="p-3 border-t border-border flex gap-2">
                    <input 
                      className="flex-grow bg-muted/50 border-none rounded-full px-4 text-sm focus:ring-1 focus:ring-brand"
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                    <button type="submit" className="h-9 w-9 bg-brand text-white rounded-full flex items-center justify-center hover:bg-brand/90">
                       <Send className="h-4 w-4" />
                    </button>
                 </form>
              </div>
           )}

           {/* Action / Escrow Card */}
           {jobStatus === "pending_payment" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-6 shadow-sm">
                 <h3 className="font-semibold flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-5 w-5 text-brand" /> Escrow Secure
                 </h3>
                 <p className="text-sm text-muted-foreground mb-4">
                    Fund the escrow to start the job. The provider starts driving once funds are secured.
                 </p>
                 <div className="flex justify-between font-bold mb-4 border-t border-blue-200 pt-2">
                    <span>Total</span>
                    <span>R {job?.agreedPrice ?? bids.find(b => b.handymanId === acceptedBidId)?.price}</span>
                 </div>
                 {userRole === "client" && (
                    <div className="space-y-3">
                       <button
                          onClick={handleFundEscrow}
                          disabled={isFundingEscrow}
                          className="w-full bg-brand text-white py-2 rounded-md font-medium shadow hover:bg-brand/90 transition-colors disabled:opacity-50"
                       >
                          {isFundingEscrow ? "Redirecting to PayFast..." : "Pay & Start Job"}
                       </button>
                       <div className="relative flex items-center py-1">
                          <div className="flex-grow border-t border-blue-200/50"></div>
                          <span className="flex-shrink-0 mx-2 text-xs text-muted-foreground">OR</span>
                          <div className="flex-grow border-t border-blue-200/50"></div>
                       </div>
                       <Link
                          href={`/financing?jobId=${job?.id}&amount=${job?.agreedPrice ?? ''}`}
                          className="w-full inline-flex items-center justify-center rounded-md border border-brand/50 bg-background px-4 py-2 text-sm font-medium text-brand shadow-sm hover:bg-brand/5 transition-colors"
                       >
                          <DollarSign className="mr-2 h-4 w-4" />
                          Get Financing Assistance
                       </Link>
                    </div>
                 )}
              </div>
           )}

           {jobStatus === "in_progress" && (
              <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-6 shadow-sm">
                 <h3 className="font-semibold flex items-center gap-2 mb-2 text-green-700 dark:text-green-400">
                    <ShieldCheck className="h-5 w-5" /> Escrow Held — R {escrow?.amount ?? job?.agreedPrice}
                 </h3>
                 <p className="text-sm text-muted-foreground mb-4">
                    {userRole === "client"
                       ? "Funds are held securely. Once the provider submits the work, you'll be able to review and release payment."
                       : "You are currently working on this job — the client's payment is held in escrow. Once done, submit the work for the client's approval."}
                 </p>
                 {userRole === "provider" && (
                    <div className="space-y-3 mt-4">
                       <label className="block border-2 border-dashed border-green-300 rounded-lg p-4 text-center cursor-pointer bg-white dark:bg-card hover:bg-green-50/50 transition-colors">
                          <span className="text-sm font-medium text-green-700 dark:text-green-400 block mb-1">📸 Upload After Photos</span>
                          <span className="text-xs text-muted-foreground">Optional, helps the client approve faster</span>
                          <input type="file" className="hidden" multiple />
                       </label>
                       <button
                          onClick={handleSubmitWorkForReview}
                          disabled={isReleasingFunds}
                          className="w-full bg-brand text-white py-2 rounded-md font-medium shadow hover:bg-brand/90 transition-colors disabled:opacity-50"
                       >
                          {isReleasingFunds ? "Submitting..." : "Submit Work for Review"}
                       </button>
                    </div>
                 )}
              </div>
           )}

           {jobStatus === "awaiting_release" && (
              <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-6 shadow-sm">
                 <h3 className="font-semibold flex items-center gap-2 mb-2 text-green-700 dark:text-green-400">
                    <Check className="h-5 w-5" /> Work Submitted
                 </h3>
                 <p className="text-sm text-muted-foreground mb-4">
                    {userRole === "client"
                       ? "The provider has marked this job as done. Review the work, then release the R " + (escrow?.amount ?? job?.agreedPrice) + " held in escrow."
                       : "Submitted — waiting for the client to review and release the held payment."}
                 </p>
                 {userRole === "client" && (
                    <button
                       onClick={handleReleaseFunds}
                       disabled={isReleasingFunds}
                       className="w-full bg-green-600 text-white py-2 rounded-md font-medium shadow hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                       {isReleasingFunds ? "Releasing..." : "Approve Work & Release Funds"}
                    </button>
                 )}
              </div>
           )}

           {jobStatus === "completed" && (
              <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm h-full flex flex-col justify-center">
                 {!isReviewed ? (
                   <>
                     <div className="mx-auto h-12 w-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-3">
                        <Check className="h-6 w-6" />
                     </div>
                     <h3 className="font-bold text-lg mb-1">Job Complete!</h3>
                     <p className="text-muted-foreground text-sm mb-6">Funds released. Please rate your experience.</p>
                     
                     <div className="space-y-4 text-left">
                        <div>
                           <label className="text-sm font-medium mb-1 block">Rating</label>
                           <div className="flex gap-2 justify-center py-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                 <button 
                                   key={star}
                                   type="button"
                                   onClick={() => setRating(star)}
                                   className="focus:outline-none transition-transform hover:scale-110"
                                 >
                                    <Star 
                                      className={cn(
                                         "h-8 w-8 transition-colors", 
                                         rating >= star ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
                                      )} 
                                    />
                                 </button>
                              ))}
                           </div>
                        </div>
                        
                        <div>
                           <label className="text-sm font-medium mb-1 block">Review Comment</label>
                           <textarea 
                             className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                             placeholder="How was the service?"
                             value={reviewComment}
                             onChange={(e) => setReviewComment(e.target.value)}
                           />
                        </div>
                        
                        <button 
                           onClick={handleSubmitReview}
                           disabled={rating === 0}
                           className="w-full inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-brand/90 disabled:opacity-50 disabled:pointer-events-none"
                        >
                           Submit Review
                        </button>
                     </div>
                   </>
                 ) : (
                   <div className="animate-in fade-in zoom-in duration-300">
                      <div className="mx-auto h-16 w-16 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 mb-4">
                         <Star className="h-8 w-8 fill-current" />
                      </div>
                      <h3 className="font-bold text-xl mb-2">Thank You!</h3>
                      <p className="text-muted-foreground">Your feedback helps us improve.</p>
                      <div className="mt-6 p-4 bg-muted/30 rounded-lg max-w-xs mx-auto text-sm italic">
                         &quot;{reviewComment}&quot;
                      </div>
                   </div>
                 )}
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
