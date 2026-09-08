"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Building2, Plus, FileText, Hammer, Loader2, ArrowRight, DollarSign, UserPlus, Wrench } from 'lucide-react';

interface Property {
  id: string;
  title: string;
  address: string;
  price: number;
  status: string;
  created_at: string;
  // images: string[];
}

interface DashboardSummary {
  properties: { total: number };
  applications: { total: number };
  needsAttention?: Array<{ id: string }>;
}

interface MaintenanceTicket {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
}

import { User } from '@supabase/supabase-js';

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [maintenanceTickets, setMaintenanceTickets] = useState<MaintenanceTicket[]>([]);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          setUser(null);
          setIsLoading(false);
          return;
        }
        setUser(data.user);
        await Promise.all([
          fetchProperties(data.user.id),
          fetchDashboardSummary(),
          fetchMaintenanceTickets(data.user.id)
        ]);
      } catch (err) {
        console.error('Auth check error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkUser();
  }, []);

  const fetchProperties = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('landlord_id', userId)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setProperties(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching properties:', err);
      setProperties([]);
    }
  };

  const fetchDashboardSummary = async () => {
    try {
      const res = await fetch('/api/landlord/dashboard');
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard summary:", err);
    }
  };

  const fetchMaintenanceTickets = async (userId: string) => {
    try {
      if (userId === 'mock-landlord') return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
        
      if (!profile) return;
      
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('routed_to', profile.role)
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (!error && data) {
        setMaintenanceTickets(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <Building2 className="h-12 w-12 text-indigo-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Landlord Dashboard</h1>
          <p className="text-muted-foreground text-sm mb-6">Please sign in to your landlord account to view your properties, applications, and financials.</p>
          <Link
            href="/signin"
            className="w-full inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white py-2.5 font-medium hover:bg-indigo-700 transition-colors"
          >
            Sign In to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      {/* Dashboard Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
           <h1 className="text-xl font-bold">Landlord Dashboard</h1>
           <div className="text-sm text-muted-foreground">{user?.email}</div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Quick Actions / Stats */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
           <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                 <div className="text-sm text-muted-foreground font-medium">Total Properties</div>
                 <div className="text-3xl font-bold mt-1">{summary ? summary.properties.total : properties.length}</div>
              </div>
              <div className="h-12 w-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                 <Building2 className="h-6 w-6" />
              </div>
           </div>
           
           <Link href="/applications" className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-500 transition-colors cursor-pointer group flex items-center justify-between">
              <div>
                 <div className="text-sm text-muted-foreground font-medium group-hover:text-indigo-600 transition-colors">Tenant Applications</div>
                 <div className="text-3xl font-bold mt-1">{summary ? summary.applications.total : 0}</div>
                 <div className="text-sm mt-2 text-indigo-600 font-medium flex items-center gap-1">
                    {summary?.needsAttention?.length || 0} Needs Attention <ArrowRight className="h-4 w-4" />
                 </div>
              </div>
              <div className="h-12 w-12 bg-green-50 rounded-full flex items-center justify-center text-green-600">
                 <FileText className="h-6 w-6" />
              </div>
           </Link>

           <Link href="/handyman/request" className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-500 transition-colors cursor-pointer group flex items-center justify-between">
              <div>
                 <div className="text-sm text-muted-foreground font-medium group-hover:text-indigo-600 transition-colors">Handyman Request</div>
                 <div className="text-sm mt-2 text-indigo-600 font-medium flex items-center gap-1">
                    Post New Job <Plus className="h-4 w-4" />
                 </div>
              </div>
              <div className="h-12 w-12 bg-orange-50 rounded-full flex items-center justify-center text-orange-600">
                 <Hammer className="h-6 w-6" />
              </div>
           </Link>

           <Link href="/dashboard/invite" className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-500 transition-colors cursor-pointer group flex items-center justify-between">
              <div>
                 <div className="text-sm text-muted-foreground font-medium group-hover:text-indigo-600 transition-colors">Invite Tenant</div>
                 <div className="text-sm mt-2 text-indigo-600 font-medium flex items-center gap-1">
                    Send Link <UserPlus className="h-4 w-4" />
                 </div>
              </div>
              <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                 <UserPlus className="h-6 w-6" />
              </div>
           </Link>
        </div>

        {/* Financial Overview (Rent Roll) */}
        <section className="mb-10">
           <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Financial Overview (Rent Roll)
                </h2>
                <Link href="/collections" className="text-sm font-medium text-indigo-600 hover:underline">View Collections</Link>
           </div>
           <div className="grid md:grid-cols-4 gap-4 mb-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
                    <div className="text-sm text-muted-foreground mb-1">Expected Monthly</div>
                    <div className="text-2xl font-bold">
                      R {properties.reduce((acc, p) => acc + (Number(p.price) || 0), 0).toLocaleString()}
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
                    <div className="text-sm text-muted-foreground mb-1">Active Listings</div>
                    <div className="text-2xl font-bold text-green-600">{properties.filter(p => p.status?.toLowerCase() === 'active').length}</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-4 rounded-xl shadow-sm">
                    <div className="text-sm text-red-800 dark:text-red-300 mb-1">Applications Review</div>
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">{summary?.needsAttention?.length || 0}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col justify-center gap-2">
                    <Link href="/documents" className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-black py-2 rounded-md font-medium text-sm text-center hover:opacity-90 transition-opacity">
                        Create Invoices & Reminders
                    </Link>
                    <Link href="/documents" className="w-full border border-slate-200 py-2 rounded-md font-medium text-sm text-center hover:bg-slate-50 transition-colors">
                        Sign Digital Leases
                    </Link>
                </div>
           </div>
        </section>

        {/* Maintenance Tickets Section */}
        {maintenanceTickets.length > 0 && (
           <section className="mb-10">
              <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                      <Wrench className="h-5 w-5 text-orange-500" />
                      Active Maintenance Tickets
                  </h2>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                 <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {maintenanceTickets.map(ticket => (
                       <div key={ticket.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <div>
                             <h3 className="font-semibold">{ticket.title}</h3>
                             <p className="text-sm text-muted-foreground mt-1">{ticket.description}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                             <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                               ticket.priority === 'emergency' ? 'bg-red-100 text-red-800' :
                               ticket.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                               ticket.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                               'bg-blue-100 text-blue-800'
                             }`}>
                               {ticket.priority}
                             </span>
                             <span className="text-xs font-medium text-slate-500 capitalize">{ticket.status.replace("_", " ")}</span>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </section>
        )}

        {/* Property List */}
        <div className="flex items-center justify-between mb-6">
           <h2 className="text-lg font-bold">My Properties</h2>
           <Link 
             href="/list-property" 
             className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
           >
             <Plus className="h-4 w-4" />
             Add Property
           </Link>
        </div>

        {properties.length === 0 ? (
           <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
              <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900">No properties listed yet</h3>
              <p className="text-slate-500 mb-6">Start by listing your first rental property.</p>
              <Link href="/list-property" className="text-indigo-600 font-medium hover:underline">
                 Create Listing
              </Link>
           </div>
        ) : (
           <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {properties.map(property => (
                 <div key={property.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                    <div className="h-48 bg-slate-200 relative">
                       {/* Placeholder for Image */}
                       <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                          <Building2 className="h-12 w-12" />
                       </div>
                       <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
                          {property.status}
                       </div>
                    </div>
                    <div className="p-5">
                       <h3 className="font-bold text-lg mb-1 truncate">{property.title}</h3>
                       <p className="text-slate-500 text-sm mb-4 truncate">{property.address}</p>
                       <div className="flex items-center justify-between">
                          <span className="font-bold text-lg">R {Number(property.price || 0).toLocaleString()}</span>
                          <button className="text-indigo-600 text-sm font-medium hover:underline">
                             Manage
                          </button>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
        )}
      </main>
    </div>
  );
}
