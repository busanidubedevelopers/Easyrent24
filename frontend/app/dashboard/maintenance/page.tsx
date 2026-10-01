"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Wrench, Plus, Loader2, AlertCircle } from "lucide-react";
import { db } from "@/lib/apiClient";

interface MaintenanceRequest {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "emergency";
  status: "pending" | "in_progress" | "resolved" | "closed";
  created_at: string;
}

interface Property {
  id: string;
  title: string;
}

export default function TenantMaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "low",
    property_id: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const { data: { user } } = await db.auth.getUser();
      if (!user) return;

      // 1. Fetch user's requests
      const { data: reqs } = await db
        .from("maintenance_requests")
        .select("*")
        .eq("tenant_id", user.id)
        .order("created_at", { ascending: false });
        
      if (reqs) setRequests(reqs);

      // 2. Fetch properties the user is renting (Mocking this for the UI, 
      // in reality this would query a leases or rentals table)
      const { data: props } = await db
        .from("properties")
        .select("id, title")
        .limit(3);
        
      if (props) {
         setProperties(props);
         if (props.length > 0) {
            setFormData(prev => ({ ...prev, property_id: props[0].id }));
         }
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      if (!res.ok) throw new Error("Failed to submit request");
      
      const newRequest = await res.json();
      setRequests([newRequest, ...requests]);
      setFormData(prev => ({ ...prev, title: "", description: "" }));
      alert("Repair request logged successfully!");
    } catch (error) {
      console.error(error);
      alert("Error submitting request. Please ensure you are logged in as a tenant.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const priorityColors = {
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    emergency: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
  };

  const statusColors = {
    pending: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
    in_progress: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    closed: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8 flex items-center gap-3">
        <div className="p-3 bg-brand/10 rounded-xl">
           <Wrench className="h-6 w-6 text-brand" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Maintenance Requests</h1>
          <p className="text-muted-foreground">Log and track repairs for your rental properties.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Submission Form */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1"
        >
           <form onSubmit={handleSubmit} className="card-premium p-6 sticky top-24">
             <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Plus className="h-5 w-5" /> New Request
             </h2>
             
             <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Property</label>
                  <select 
                    value={formData.property_id}
                    onChange={e => setFormData({...formData, property_id: e.target.value})}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="" disabled>Select Property</option>
                    {properties.map(p => (
                       <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Issue Title</label>
                  <input 
                    type="text" 
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g. Leaking kitchen sink"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Description</label>
                  <textarea 
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Provide details about the issue..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-24 resize-none"
                    required
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Priority</label>
                  <select 
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: e.target.value as MaintenanceRequest['priority']})}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="low">Low - General maintenance</option>
                    <option value="medium">Medium - Needs attention soon</option>
                    <option value="high">High - Urgent repair</option>
                    <option value="emergency">Emergency - Safety hazard / Major leak</option>
                  </select>
                </div>
                
                <button 
                  type="submit" 
                  disabled={isSubmitting || properties.length === 0}
                  className="w-full inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Request"}
                </button>
                {properties.length === 0 && !loading && (
                   <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                     <AlertCircle className="h-3 w-3" /> No active leases found.
                   </p>
                )}
             </div>
           </form>
        </motion.div>

        {/* Requests List */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 space-y-4"
        >
           {loading ? (
             <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
             </div>
           ) : requests.length === 0 ? (
             <div className="card-premium p-12 text-center flex flex-col items-center justify-center border-dashed border-2">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                   <Wrench className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No maintenance requests</h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                   You haven&apos;t logged any repairs. When you do, they will appear here and be routed automatically.
                </p>
             </div>
           ) : (
             requests.map(req => (
               <div key={req.id} className="card-premium p-5 flex flex-col sm:flex-row gap-4 justify-between group hover:shadow-lg transition-all">
                  <div className="space-y-2">
                     <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{req.title}</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${priorityColors[req.priority]}`}>
                           {req.priority}
                        </span>
                     </div>
                     <p className="text-sm text-muted-foreground line-clamp-2">{req.description}</p>
                     <div className="text-xs text-muted-foreground pt-2">
                        Submitted on {new Date(req.created_at).toLocaleDateString()}
                     </div>
                  </div>
                  <div className="flex items-start sm:items-center">
                     <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${statusColors[req.status]}`}>
                        {req.status.replace("_", " ")}
                     </span>
                  </div>
               </div>
             ))
           )}
        </motion.div>
      </div>
    </div>
  );
}
