"use client";

import { useState } from "react";
import { Building2, PaintBucket, Upload, Wrench, Sparkles, Loader2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";

type JobType = "handyman" | "cleaning";

const CATEGORIES = {
  handyman: [
    { id: "plumbing", label: "Plumbing", icon: Wrench },
    { id: "electrical", label: "Electrical", icon: Sparkles }, // Sparkles roughly works for electricity... I guess Zap would be better if available
    { id: "painting", label: "Painting", icon: PaintBucket },
    { id: "general", label: "General Repairs", icon: Building2 },
  ],
  cleaning: [
    { id: "standard", label: "Standard Cleaning", icon: Sparkles },
    { id: "deep", label: "Deep Cleaning", icon: Sparkles },
    { id: "spring", label: "Spring Cleaning", icon: Sparkles },
    { id: "move-in-out", label: "Move In/Out", icon: Sparkles },
  ],
};

export default function RequestServicePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    type: "" as JobType | "", // handyman or cleaning
    category: "",
    description: "",
    location: "",
    images: [] as File[],
  });

  const updateField = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/handyman/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: `New ${formData.category} request`,
          description: formData.description,
          category: formData.category,
          location: formData.location,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      const json = await res.json();
      const newJobId = json.job?.id || 'unknown';
      router.push(`/handyman/job/${newJobId}`);
    } catch (err) {
      console.error("Error posting job:", err);
      alert(`Error posting job: ${(err as Error)?.message || "Unknown error"}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-3xl pt-20 pb-12 md:pb-16">
      <div className="mb-8 md:mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Post a Job</h1>
        <p className="mt-2 text-muted-foreground">Describe your needs and receive competitive bids from verified professionals.</p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm p-6 md:p-8">
        
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-xl font-semibold">What service do you need?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => { updateField("type", "handyman"); handleNext(); }}
                className="group relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-muted p-0 overflow-hidden transition-all hover:border-brand hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 h-64"
              >
                <div className="absolute inset-0 z-0">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img src="/images/plumbing-professional.png" alt="Handyman" className="h-full w-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" />
                   <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
                </div>
                
                <div className="relative z-10 flex flex-col items-center p-6">
                   <div className="rounded-full bg-blue-100 p-4 dark:bg-blue-900/30 mb-2 shadow-sm">
                     <Wrench className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                   </div>
                   <div className="text-center">
                     <h3 className="font-bold text-xl">Handyman</h3>
                     <p className="text-sm text-muted-foreground mt-1 max-w-[200px]">Repairs, installations, and maintenance.</p>
                   </div>
                </div>
              </button>

              <button
                onClick={() => { updateField("type", "cleaning"); handleNext(); }}
                className="group relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-muted p-0 overflow-hidden transition-all hover:border-brand hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 h-64"
              >
                <div className="absolute inset-0 z-0">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img src="/images/cleaning-service.png" alt="Cleaning" className="h-full w-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" />
                   <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
                </div>

                <div className="relative z-10 flex flex-col items-center p-6">
                   <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/30 mb-2 shadow-sm">
                     <Sparkles className="h-8 w-8 text-green-600 dark:text-green-400" />
                   </div>
                   <div className="text-center">
                     <h3 className="font-bold text-xl">Cleaning Services</h3>
                     <p className="text-sm text-muted-foreground mt-1 max-w-[200px]">Home cleaning, deep cleaning, and sanitation.</p>
                   </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === 2 && formData.type && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between">
               <h2 className="text-xl font-semibold">Select a Category</h2>
               <button onClick={handleBack} className="text-sm text-muted-foreground hover:underline">Change Service Type</button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {CATEGORIES[formData.type].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { updateField("category", cat.id); handleNext(); }}
                  className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border p-4 transition-all hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
                >
                  <cat.icon className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm font-medium">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between">
               <h2 className="text-xl font-semibold">Job Details</h2>
               <button type="button" onClick={handleBack} className="text-sm text-muted-foreground hover:underline">Back</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  className="mt-2 flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder={formData.type === "handyman" ? "Describe the repair needed (e.g., Leaking faucet in the kitchen...)" : "Detailed cleaning requirements (e.g., Spring cleaning for 3 bedroom house...)"}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Location</label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-2.5 text-muted-foreground"><MapPin className="h-4 w-4" /></span>
                  <input
                    required
                    type="text"
                    value={formData.location}
                    onChange={(e) => updateField("location", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-9 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="e.g. 123 Main St, Cape Town"
                  />
                </div>
              </div>


              
              <div>
                <label className="text-sm font-medium">Upload Photos (Optional)</label>
                <div className="mt-2 border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors cursor-pointer">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">Click to upload or drag and drop</p>
                  <p className="text-xs text-muted-foreground mt-1">SVG, PNG, JPG or GIF (max. 800x400px)</p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex h-11 items-center justify-center rounded-md bg-brand px-8 text-sm font-medium text-white shadow transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Posting Job...
                  </>
                ) : (
                  "Post Job for Bidding"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
