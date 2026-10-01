"use client";


import { useState } from "react";
import Image from "next/image";
import { 
  Check, 
  Clock, 
  Download, 
  FileText, 
  Plus, 
  Send, 
  Trash2, 
  Upload
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { LeaseList } from "@/components/LeaseList";

// Demo data is intentionally empty so the documents center starts with a clean, live-state empty view.
const TENANTS: Array<{ id: number; name: string; unit: string; rent: number }> = [];
const INVOICE_HISTORY: Array<{ id: string; tenant: string; date: string; amount: number; status: string }> = [];
const DOCUMENTS: Array<{ id: number; name: string; type: string; provider: string; date: string; size: string }> = [];

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState("invoices"); // invoices, contracts, storage
  const [notification, setNotification] = useState<string | null>(null);

  // Invoice Builder State
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null);
  const [recipientId, setRecipientId] = useState('');
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState([
    { description: "Monthly Rent", amount: 0, locked: true },
    { description: "Water Usage", amount: 0, locked: false },
    { description: "Electricity", amount: 0, locked: false },
  ]);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [deliveryMethods, setDeliveryMethods] = useState<string[]>(["email"]);

  const handleTenantSelect = (id: string) => {
    const tenantId = parseInt(id);
    setSelectedTenant(tenantId);
    if (tenantId) {
      const tenant = TENANTS.find(t => t.id === tenantId);
      if (tenant) {
        // Reset and set base rent
        setInvoiceItems([
             { description: "Monthly Rent", amount: tenant.rent, locked: true },
             { description: "Water Usage", amount: 0, locked: false },
             { description: "Electricity", amount: 0, locked: false },
        ]);
      }
    }
  };

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...invoiceItems];
    // @ts-expect-error dynamic field index
    newItems[index][field] = field === "amount" ? parseFloat(value) || 0 : value;
    setInvoiceItems(newItems);
  };

  const addItem = () => {
    setInvoiceItems([...invoiceItems, { description: "", amount: 0, locked: false }]);
  };

  const removeItem = (index: number) => {
    if (!invoiceItems[index].locked) {
      const newItems = invoiceItems.filter((_, i) => i !== index);
      setInvoiceItems(newItems);
    }
  };

  const calculateTotal = () => {
    return invoiceItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const toggleDeliveryMethod = (method: string) => {
    setDeliveryMethods(prev => 
      prev.includes(method) 
        ? prev.filter(m => m !== method)
        : [...prev, method]
    );
  };

  const handleCreateInvoice = async () => {
    if (deliveryMethods.length === 0) {
       setNotification("Please select at least one delivery method.");
       setTimeout(() => setNotification(null), 3000);
       return;
    }

    if (!recipientId.trim()) {
      setNotification('Enter a valid tenant user ID (UUID) to create the invoice.');
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    try {
      setIsSubmittingInvoice(true);
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipient_id: recipientId,
          line_items: invoiceItems.map((item) => ({
            description: item.description || 'Charge',
            amount: Number(item.amount) || 0,
            locked: Boolean(item.locked),
          })),
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invoice');
      }

      const methods = deliveryMethods.map(m => m.toUpperCase()).join(' & ');
      const invoiceNumber = data.invoice?.invoice_number || data.invoice?.id || 'invoice';
      setNotification(`Invoice ${invoiceNumber} created and queued via ${methods}${autoSchedule ? ' (Scheduled)' : ''}.`);
      setTimeout(() => setNotification(null), 4000);
    } catch (error) {
      console.error('Invoice create error:', error);
      setNotification((error as Error)?.message || 'Invoice creation failed.');
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setIsSubmittingInvoice(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      
      {/* Toast Notification */}
      {notification && (
          <div className="fixed top-24 right-4 z-50 bg-green-600 text-white px-6 py-4 rounded-lg shadow-xl animate-in fade-in slide-in-from-right-10 flex items-center gap-2">
            <Check className="h-5 w-5" />
            {notification}
          </div>
      )}

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-border pt-20 pb-8">
         <div className="container mx-auto px-4">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Documents Centre</h1>
            <p className="text-muted-foreground">Manage invoices, contracts, and service provider records.</p>
         </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        
        {/* Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-indigo-950 p-8 text-white shadow-lg mb-8">
           <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-indigo-800/30 blur-3xl"></div>
           <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl"></div>
           
           <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                 <div className="inline-flex items-center rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-200 ring-1 ring-inset ring-blue-500/30">
                    <Check className="mr-1 h-3 w-3" /> Auto-Verified
                 </div>
                 <h2 className="text-2xl font-bold">Secure Document Storage</h2>
                 <p className="text-indigo-200">
                    All your contracts and financial documents are encrypted and backed up automatically. Access them anywhere, anytime.
                 </p>
              </div>
              <div className="hidden md:block relative h-32 w-32 lg:h-40 lg:w-40 flex-shrink-0">
                 <Image 
                   src="/images/secure-check.png" 
                   alt="Secure Documents" 
                   fill
                   className="object-contain"
                 />
              </div>
           </div>
        </div>
        
        {/* Tabs */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 border-b border-border mb-8 overflow-x-auto">
          <button 
             onClick={() => setActiveTab("invoices")}
             className={cn(
               "pb-3 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
               activeTab === "invoices" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
             )}
          >
             Invoicing & Billing
          </button>
          <button 
             onClick={() => setActiveTab("contracts")}
             className={cn(
               "pb-3 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
               activeTab === "contracts" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
             )}
          >
             Contracts & Leases
          </button>
          <button 
             onClick={() => setActiveTab("storage")}
             className={cn(
               "pb-3 px-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
               activeTab === "storage" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
             )}
          >
             Digital Cabinet
          </button>
        </div>

        {/* --- INVOICES TAB --- */}
        {activeTab === "invoices" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-2">
            {/* Invoice Builder */}
            <div className="lg:col-span-8 space-y-6">
               <div className="bg-white dark:bg-slate-900 rounded-xl border border-border overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-border flex justify-between items-center">
                     <div>
                        <h2 className="text-xl font-bold">Create Invoice</h2>
                        <p className="text-sm text-muted-foreground">Configure monthly charges for your tenant.</p>
                     </div>
                     <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs font-semibold">
                        FEB 2026
                     </div>
                  </div>
                  
                  <div className="p-6 space-y-6">
                     {/* Tenant Selector */}
                     <div className="space-y-2">
                        <label className="text-sm font-medium">Select Tenant</label>
                        <select 
                           className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                           onChange={(e) => {
                              handleTenantSelect(e.target.value);
                              setRecipientId((TENANTS.find((tenant) => tenant.id === Number(e.target.value)) as any)?.id ? String((TENANTS.find((tenant) => tenant.id === Number(e.target.value)) as any)?.id) : '');
                           }}
                           defaultValue=""
                        >
                           <option value="" disabled>Choose a tenant...</option>
                           {TENANTS.map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.unit})</option>
                           ))}
                        </select>
                     </div>

                     <div className="space-y-2">
                        <label className="text-sm font-medium">Tenant User ID (UUID)</label>
                        <input
                          value={recipientId}
                          onChange={(e) => setRecipientId(e.target.value)}
                          placeholder="Paste the tenant user UUID here"
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                     </div>

                     {/* Line Items */}
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                           <label className="text-sm font-medium">Invoice Items</label>
                           <button onClick={addItem} className="text-xs text-brand hover:underline flex items-center gap-1">
                              <Plus className="h-3 w-3" /> Add Item
                           </button>
                        </div>
                        
                        <div className="space-y-3">
                           {invoiceItems.map((item, index) => (
                              <div key={index} className="flex gap-3 items-center">
                                 <input 
                                    type="text" 
                                    value={item.description}
                                    onChange={(e) => handleItemChange(index, "description", e.target.value)}
                                    disabled={item.locked}
                                    placeholder="Description"
                                    className="flex-1 h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
                                 />
                                 <div className="relative w-32">
                                     <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">R</span>
                                     <input 
                                       type="number"
                                       value={item.amount}
                                       onChange={(e) => handleItemChange(index, "amount", e.target.value)}
                                       className="w-full h-10 rounded-md border border-input bg-transparent px-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand text-right"
                                     />
                                 </div>
                                 <button 
                                    onClick={() => removeItem(index)}
                                    disabled={item.locked}
                                    className="p-2 text-muted-foreground hover:text-red-500 disabled:opacity-0 transition-colors"
                                 >
                                    <Trash2 className="h-4 w-4" />
                                 </button>
                              </div>
                           ))}
                        </div>

                        <div className="flex justify-end pt-4 border-t border-border">
                           <div className="text-right">
                              <span className="text-sm text-muted-foreground mr-4">Total Amount</span>
                              <span className="text-xl font-bold">R {calculateTotal().toLocaleString('en-US')}</span>
                           </div>
                        </div>
                     </div>

                     {/* Settings & Action */}
                     <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-border space-y-4">
                        {/* Delivery Method */}
                        <div className="flex items-center justify-between border-b border-border pb-4">
                           <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                                 <Send className="h-4 w-4" />
                              </div>
                              <div>
                                 <h4 className="text-sm font-medium">Delivery Method</h4>
                                 <p className="text-xs text-muted-foreground">Select how the tenant receives this invoice</p>
                              </div>
                           </div>
                           <div className="flex gap-2">
                              <button 
                                onClick={() => toggleDeliveryMethod('email')}
                                className={cn("px-3 py-1.5 rounded-md text-xs font-medium border transition-colors", deliveryMethods.includes('email') ? "bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-transparent border-border text-muted-foreground hover:bg-slate-50")}
                              >
                                Email
                              </button>
                              <button 
                                onClick={() => toggleDeliveryMethod('sms')}
                                className={cn("px-3 py-1.5 rounded-md text-xs font-medium border transition-colors", deliveryMethods.includes('sms') ? "bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-transparent border-border text-muted-foreground hover:bg-slate-50")}
                              >
                                SMS
                              </button>
                           </div>
                        </div>

                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2">
                              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-colors", autoSchedule ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-500")}>
                                 <Clock className="h-4 w-4" />
                              </div>
                              <div>
                                 <h4 className="text-sm font-medium">Auto-Schedule</h4>
                                 <p className="text-xs text-muted-foreground">Send automatically on the 25th of each month</p>
                              </div>
                           </div>
                           <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" className="sr-only peer" checked={autoSchedule} onChange={(e) => setAutoSchedule(e.target.checked)} />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
                           </label>
                        </div>
                     </div>

                     <div className="pt-2">
                        <button 
                           onClick={handleCreateInvoice}
                           disabled={isSubmittingInvoice}
                           className="w-full bg-brand text-white h-11 rounded-md font-medium hover:bg-gold-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                           <Send className="h-4 w-4" />
                           {isSubmittingInvoice ? 'Creating...' : autoSchedule ? "Save & Schedule" : "Create & Send Invoice"}
                        </button>
                     </div>

                  </div>
               </div>
            </div>

            {/* Sidebar: History */}
            <div className="lg:col-span-4 space-y-6">
               <div className="bg-white dark:bg-slate-900 rounded-xl border border-border p-6 shadow-sm">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                     <FileText className="h-4 w-4 text-brand" />
                     Recent Invoices
                  </h3>
                  <div className="space-y-4">
                     {INVOICE_HISTORY.map((inv) => (
                        <div key={inv.id} className="flex justify-between items-center pb-3 border-b border-border/50 last:border-0 last:pb-0">
                           <div>
                              <div className="font-medium text-sm">{inv.tenant}</div>
                              <div className="text-xs text-muted-foreground">{inv.id} • {inv.date}</div>
                           </div>
                           <div className="text-right">
                              <div className="font-bold text-sm">R {inv.amount.toLocaleString('en-US')}</div>
                              <span className={cn(
                                 "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm",
                                 inv.status === "Paid" ? "bg-green-100 text-green-700" :
                                 inv.status === "Overdue" ? "bg-red-100 text-red-700" :
                                 "bg-blue-100 text-blue-700"
                              )}>
                                 {inv.status}
                              </span>
                           </div>
                        </div>
                     ))}
                  </div>
                  <button className="w-full mt-4 text-sm text-brand font-medium border border-brand/20 rounded-md py-2 hover:bg-brand/5 transition-colors">
                     View All History
                  </button>
               </div>
            </div>
          </div>
        )}

        {/* --- CONTRACTS TAB --- */}
        {activeTab === "contracts" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
             <LeaseList
               emptyMessage={<>No leases yet. Approve an application in <Link href="/applications" className="text-brand underline">Applications</Link> to generate one.</>}
             />
          </div>
        )}

        {/* --- DIGITAL CABINET TAB --- */}
        {activeTab === "storage" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
             <div className="bg-white dark:bg-slate-900 rounded-xl border border-border overflow-hidden">
                <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                   <div>
                      <h2 className="text-xl font-bold">Service Provider Documents</h2>
                      <p className="text-sm text-muted-foreground">Store invoices, certificates, and maintenance receipts.</p>
                   </div>
                   <div className="flex gap-2">
                      <button className="border border-input px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                         Filter
                      </button>
                      <button className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gold-600 transition-colors flex items-center gap-2">
                         <Upload className="h-4 w-4" /> Upload File
                      </button>
                   </div>
                </div>

                <div className="p-0">
                   <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 dark:bg-slate-900/50 text-muted-foreground font-medium">
                         <tr>
                            <th className="px-6 py-4">Document Name</th>
                            <th className="px-6 py-4">Type</th>
                            <th className="px-6 py-4">Provider</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4 text-right">Size</th>
                            <th className="px-6 py-4"></th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                         {DOCUMENTS.map((doc) => (
                            <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                               <td className="px-6 py-4 font-medium flex items-center gap-3">
                                  <div className="h-8 w-8 rounded bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-red-600">
                                     <FileText className="h-4 w-4" />
                                  </div>
                                  {doc.name}
                               </td>
                               <td className="px-6 py-4">
                                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                     {doc.type}
                                  </span>
                               </td>
                               <td className="px-6 py-4 text-muted-foreground">{doc.provider}</td>
                               <td className="px-6 py-4 text-muted-foreground">{doc.date}</td>
                               <td className="px-6 py-4 text-right text-muted-foreground font-mono text-xs">{doc.size}</td>
                               <td className="px-6 py-4 text-right">
                                  <button className="text-muted-foreground hover:text-brand transition-colors">
                                     <Download className="h-4 w-4" />
                                  </button>
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}
