"use client";

import { LeaseList } from "@/components/LeaseList";

export default function MyLeasesPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12">
      <div className="container max-w-6xl mx-auto px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My lease</h1>
          <p className="text-muted-foreground">Leases sent to you for signature, and your signed agreements.</p>
        </div>
        <LeaseList emptyMessage="No leases yet. Once your application is approved, your lease will appear here to review and sign." />
      </div>
    </div>
  );
}
