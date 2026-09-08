"use client";

import { useState, useEffect, Suspense } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, FileCheck, Landmark, ScanFace, Upload, User, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";

import { useApplyStore } from "@/store/useApplyStore";

const STEPS = [
  { id: 1, title: "Personal Details", icon: User },
  { id: 2, title: "Employment", icon: Building2 },
  { id: 3, title: "Financials", icon: Landmark },
  { id: 4, title: "Consent", icon: FileCheck },
];

function ApplyForm() {
  const searchParams = useSearchParams();
  
  const { 
    currentStep, 
    formData, 
    nextStep, 
    prevStep, 
    updateFormData, 
    updateCoApplicantData, 
    toggleCoApplicant,
    resetForm
  } = useApplyStore();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      const title = searchParams.get("title") || "";
      updateFormData("propertyRef", `REF-${ref} ${title ? `(${title})` : ''}`);
      updateFormData("propertyId", ref); // Assuming ref is the UUID here.
    }
  }, [searchParams, updateFormData]);

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      nextStep();
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      prevStep();
    }
  };

  const uploadDocument = async (file: File | null, pathPrefix: string): Promise<string | null> => {
    if (!file) return null;
    const filePath = `${pathPrefix}/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage.from('application-documents').upload(filePath, file);
    if (error) {
       console.error("Document upload error:", error);
       return null;
    }
    return data.path;
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    
    try {
       const { data: userData, error: authError } = await supabase.auth.getUser();
       if (authError || !userData?.user) {
          alert("You must be logged in to submit an application.");
          setIsLoading(false);
          return;
       }

       // 1. Upload Documents
       const userId = userData.user.id;
       await uploadDocument(formData.idFile, `${userId}/id`);
       await uploadDocument(formData.payslipFile, `${userId}/payslip`);
       // TODO: Upload Co-Applicant docs similarly if needed...

       // 2. Prepare payload
       const payload = {
          property_id: formData.propertyId, // Requires proper property UUID
          first_name: formData.firstName,
          last_name: formData.lastName,
          id_number: formData.idNumber,
          current_address: formData.currentAddress,
          phone: formData.phone,
          employer_name: formData.employerName,
          job_title: formData.jobTitle,
          employment_type: formData.employmentType,
          monthly_income: formData.monthlyIncome ? parseFloat(formData.monthlyIncome) : null,
          bank_name: formData.bankName,
          account_number: formData.accountNumber,
          account_type: formData.accountType,
          co_applicant_details: formData.hasCoApplicant ? {
             firstName: formData.coApplicant.firstName,
             lastName: formData.coApplicant.lastName,
             idNumber: formData.coApplicant.idNumber,
             email: formData.coApplicant.email,
             phone: formData.coApplicant.phone,
          } : null,
          consent_credit: formData.consentCreditCheck,
          consent_id_check: formData.consentIdVerification,
          consent_bank_statements: formData.consentBankStatements,
          // document paths could be stored in metadata if backend supported it, but we uploaded them to the bucket anyway
       };

       // 3. Post to backend
       const res = await fetch('/api/applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
       });

       const resData = await res.json();
       
       if (!res.ok) {
          alert(`Application Error: ${resData.error || 'Unknown error'}`);
          setIsLoading(false);
          return;
       }

       resetForm();
       setIsSubmitted(true);
    } catch (err) {
       console.error("Submission failed:", err);
       alert("An unexpected error occurred. Please try again.");
    } finally {
       setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="container min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12">
        <div className="mx-auto max-w-md text-center">
          <div className="relative h-48 w-full rounded-2xl overflow-hidden mb-6 shadow-lg">
             {/* eslint-disable-next-line @next/next/no-img-element */}
             <img src="/images/happy-tenant.png" alt="Happy Tenant" className="w-full h-full object-cover" />
             <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
             <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/80 backdrop-blur shadow-lg">
                  <Check className="h-8 w-8 text-green-600 dark:text-green-500" />
                </div>
             </div>
          </div>
          
          <h1 className="mb-4 text-3xl font-bold tracking-tight">Application Submitted!</h1>
          <p className="mb-8 text-muted-foreground">
            Your rental application has been securely received. We will process your verification and notify you within 24 hours.
          </p>
          <div className="flex justify-center gap-4">
            <Link 
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-8 text-sm font-medium text-white shadow transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-12 md:py-16">
      <div className="mb-8 md:mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Rental Application</h1>
        <p className="mt-2 text-muted-foreground">Complete the steps below to apply for a property and verify your details.</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-12">
        <div className="relative flex justify-between">
          <div className="absolute top-1/2 left-0 -z-10 h-0.5 w-full -translate-y-1/2 bg-border"></div>
          {STEPS.map((step) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <div key={step.id} className="flex flex-col items-center gap-2 bg-background px-2">
                <div 
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                    isCompleted || isCurrent ? "border-brand bg-brand text-white" : "border-muted-foreground/30 bg-background text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
                </div>
                <span className={cn(
                  "text-xs font-medium hidden sm:block",
                  isCurrent ? "text-brand" : "text-muted-foreground"
                )}>
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-6 md:p-8">
          {/* Step 1: Personal Details */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              
              {/* Property Reference Section */}
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/50 rounded-lg mb-6">
                 <label className="block text-sm font-medium text-indigo-900 dark:text-indigo-100 mb-1">
                    Property Reference Code
                 </label>
                 <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-3">
                    Enter the reference code of the property you are applying for. This can be found on the listing.
                 </p>
                 <div className="relative">
                    <FileText className="absolute left-3 top-2.5 h-5 w-5 text-indigo-400" />
                    <input
                      type="text"
                      name="propertyRef"
                      placeholder="e.g. REF-12345"
                      className="w-full pl-10 pr-4 py-2 rounded-md border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                      value={formData.propertyRef}
                      onChange={(e) => updateFormData("propertyRef", e.target.value)}
                      required
                    />
                 </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
                 <div className="space-y-1">
                   <h2 className="text-xl font-semibold">Personal Information</h2>
                   <p className="text-sm text-muted-foreground">Please provide your official identification details.</p>
                 </div>
                 <div className="flex items-center space-x-2 bg-muted/50 p-3 rounded-lg border border-border">
                    <input 
                      type="checkbox" 
                      id="jointApp" 
                      checked={formData.hasCoApplicant}
                      onChange={(e) => toggleCoApplicant(e.target.checked)}
                      className="h-4 w-4 rounded border-primary text-brand focus:ring-brand"
                    />
                    <label htmlFor="jointApp" className="text-sm font-medium cursor-pointer">
                       Joint Application (2 Applicants)
                    </label>
                 </div>
              </div>

               {/* Main Applicant */}
               <div>
                  {formData.hasCoApplicant && <h3 className="font-bold text-lg mb-4 text-brand">Main Applicant</h3>}
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="firstName" className="text-sm font-medium leading-none">First Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <input
                          id="firstName"
                          value={formData.firstName}
                          onChange={(e) => updateFormData("firstName", e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-transparent px-9 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          placeholder="Jane"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="lastName" className="text-sm font-medium leading-none">Last Name</label>
                      <input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => updateFormData("lastName", e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Doe"
                      />
                    </div>
                    
                    <div className="space-y-2 md:col-span-2">
                         <label className="block text-sm font-medium leading-none">Residency Status</label>
                         <select
                            name="residencyStatus"
                            className="w-full px-3 h-10 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                            value={formData.residencyStatus}
                            onChange={(e) => updateFormData("residencyStatus", e.target.value)}
                            required
                         >
                            <option value="sa_citizen">South African Citizen</option>
                            <option value="non_resident">Non-Resident / Foreign National</option>
                         </select>
                    </div>

                    {formData.residencyStatus === 'non_resident' && (
                         <div className="space-y-2 md:col-span-2">
                            <label className="block text-sm font-medium leading-none">Country of Origin</label>
                            <input
                               type="text"
                               name="countryOfOrigin"
                               placeholder="e.g. United Kingdom"
                               className="w-full px-3 h-10 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                               value={formData.countryOfOrigin}
                               onChange={(e) => updateFormData("countryOfOrigin", e.target.value)}
                               required
                            />
                         </div>
                    )}

                    <div className="space-y-2 md:col-span-2">
                      <label htmlFor="idNumber" className="text-sm font-medium leading-none">
                          {formData.residencyStatus === 'sa_citizen' ? 'ID Number (South African)' : 'Passport Number'}
                      </label>
                      <div className="relative">
                         <ScanFace className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <input
                          id="idNumber"
                          value={formData.idNumber}
                          onChange={(e) => updateFormData("idNumber", e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-transparent px-9 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          placeholder={formData.residencyStatus === 'sa_citizen' ? "Enter your 13-digit ID number" : "Enter your passport number"}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium leading-none">
                           Upload {formData.residencyStatus === 'sa_citizen' ? 'ID Document' : 'Passport'}
                        </label>
                        <label className="flex h-[100px] w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-colors hover:bg-muted relative">
                           <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
                           <p className="text-xs text-muted-foreground">Drag & drop or click to upload PDF/Image</p>
                           <input 
                             type="file" 
                             className="hidden" 
                             onChange={(e) => updateFormData("idFile", e.target.files?.[0] || null)}
                           />
                        </label>
                        <p className="text-[0.8rem] text-muted-foreground text-right">{formData.idFile ? formData.idFile.name : "No file selected"}</p>
                     </div>

                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium leading-none">Email Address</label>
                      <input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateFormData("email", e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="jane@example.com"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label htmlFor="phone" className="text-sm font-medium leading-none">Phone Number</label>
                      <input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => updateFormData("phone", e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="082 123 4567"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label htmlFor="currentAddress" className="text-sm font-medium leading-none">Current Residential Address</label>
                      <textarea
                        id="currentAddress"
                        value={formData.currentAddress}
                        onChange={(e) => updateFormData("currentAddress", e.target.value)}
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="Street address, Suburb, City, Code"
                      />
                    </div>
                  </div>

              {/* Co-Applicant Section for Personal Details */}
              {formData.hasCoApplicant && (
                 <div className="mt-8 border-t border-border pt-8 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="font-bold text-lg mb-4 text-brand">Co-Applicant Details</h3>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">First Name</label>
                        <div className="relative">
                          <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <input
                            value={formData.coApplicant.firstName}
                            onChange={(e) => updateCoApplicantData("firstName", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-transparent px-9 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder="John"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">Last Name</label>
                        <input
                          value={formData.coApplicant.lastName}
                          onChange={(e) => updateCoApplicantData("lastName", e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          placeholder="Smith"
                        />
                      </div>
                      
                      <div className="space-y-2 md:col-span-2 mt-4">
                           <label className="block text-sm font-medium leading-none">Residency Status</label>
                           <select
                              name="coResidencyStatus"
                              className="w-full px-3 h-10 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                              value={formData.coApplicant.residencyStatus}
                              onChange={(e) => updateCoApplicantData("residencyStatus", e.target.value)}
                              required
                           >
                              <option value="sa_citizen">South African Citizen</option>
                              <option value="non_resident">Non-Resident / Foreign National</option>
                           </select>
                      </div>

                      {formData.coApplicant.residencyStatus === 'non_resident' && (
                           <div className="space-y-2 md:col-span-2 mt-4">
                              <label className="block text-sm font-medium leading-none">Country of Origin</label>
                              <input
                                 type="text"
                                 name="coCountryOfOrigin"
                                 placeholder="e.g. United Kingdom"
                                 className="w-full px-3 h-10 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                                 value={formData.coApplicant.countryOfOrigin}
                                 onChange={(e) => updateCoApplicantData("countryOfOrigin", e.target.value)}
                                 required
                              />
                           </div>
                      )}
      
                      <div className="space-y-2 mt-4 md:col-span-2">
                        <label className="text-sm font-medium leading-none">
                            {formData.coApplicant.residencyStatus === 'sa_citizen' ? 'ID Number (South African)' : 'Passport Number'}
                        </label>
                        <div className="relative">
                           <ScanFace className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <input
                            value={formData.coApplicant.idNumber}
                            onChange={(e) => updateCoApplicantData("idNumber", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-transparent px-9 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder={formData.coApplicant.residencyStatus === 'sa_citizen' ? "Enter 13-digit ID number" : "Enter passport number"}
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2 mt-4 md:col-span-2">
                         <label className="text-sm font-medium leading-none">
                            Upload {formData.coApplicant.residencyStatus === 'sa_citizen' ? 'ID Document' : 'Passport'}
                         </label>
                         <label className="flex h-[100px] w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-colors hover:bg-muted relative">
                            <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Drag & drop or click to upload PDF/Image</p>
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => updateCoApplicantData("idFile", e.target.files?.[0] || null)}
                            />
                         </label>
                         <p className="text-[0.8rem] text-muted-foreground text-right">{formData.coApplicant.idFile ? formData.coApplicant.idFile.name : "No file selected"}</p>
                      </div>
                      
                      <div className="space-y-2 mt-4">
                        <label className="text-sm font-medium leading-none">Email Address</label>
                        <input
                          type="email"
                          value={formData.coApplicant.email}
                          onChange={(e) => updateCoApplicantData("email", e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          placeholder="john@example.com"
                        />
                      </div>
                      
                      <div className="space-y-2 mt-4">
                        <label className="text-sm font-medium leading-none">Phone Number</label>
                        <input
                          type="tel"
                          value={formData.coApplicant.phone}
                          onChange={(e) => updateCoApplicantData("phone", e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          placeholder="082 123 4567"
                        />
                      </div>
      
                      <div className="space-y-2 mt-4 md:col-span-2">
                        <label className="text-sm font-medium leading-none">Current Residential Address</label>
                        <textarea
                          value={formData.coApplicant.currentAddress}
                          onChange={(e) => updateCoApplicantData("currentAddress", e.target.value)}
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          placeholder="Street address, Suburb, City, Code"
                        />
                      </div>
                    </div>
                 </div>
              )}
              </div>
            </div>
          )}

          {/* Step 2: Employment Details */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Employment Details</h2>
                <p className="text-sm text-muted-foreground">Tell us about your current work and income.</p>
              </div>
              
              {formData.hasCoApplicant && <h3 className="font-bold text-lg mb-4 text-brand">Main Applicant</h3>}
              
              <div className="space-y-2">
                <label htmlFor="employerName" className="text-sm font-medium leading-none">Employer Name</label>
                 <div className="relative">
                   <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <input
                      id="employerName"
                      value={formData.employerName}
                      onChange={(e) => updateFormData("employerName", e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-9 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder="Company Ltd"
                    />
                 </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="jobTitle" className="text-sm font-medium leading-none">Job Title</label>
                  <input
                    id="jobTitle"
                    value={formData.jobTitle}
                    onChange={(e) => updateFormData("jobTitle", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="e.g. Software Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="employmentType" className="text-sm font-medium leading-none">Employment Type</label>
                  <select
                    id="employmentType"
                    value={formData.employmentType}
                    onChange={(e) => updateFormData("employmentType", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="" disabled>Select type</option>
                    <option value="permanent">Permanent Full-time</option>
                    <option value="contract">Fixed Term Contract</option>
                    <option value="part-time">Part-time</option>
                    <option value="self-employed">Self Employed</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="monthlyIncome" className="text-sm font-medium leading-none">Net Monthly Income (After Tax)</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-sm text-muted-foreground">R</span>
                  <input
                    id="monthlyIncome"
                    type="number"
                    value={formData.monthlyIncome}
                    onChange={(e) => updateFormData("monthlyIncome", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-7 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              {/* Co-Applicant Employment */}
              {formData.hasCoApplicant && (
                 <div className="mt-8 border-t border-border pt-8 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="font-bold text-lg mb-4 text-brand">Co-Applicant Employment</h3>
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">Employer Name</label>
                         <div className="relative">
                           <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <input
                              value={formData.coApplicant.employerName}
                              onChange={(e) => updateCoApplicantData("employerName", e.target.value)}
                              className="flex h-10 w-full rounded-md border border-input bg-transparent px-9 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              placeholder="Company Ltd"
                            />
                         </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 mt-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium leading-none">Job Title</label>
                          <input
                            value={formData.coApplicant.jobTitle}
                            onChange={(e) => updateCoApplicantData("jobTitle", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder="e.g. Designer"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium leading-none">Employment Type</label>
                          <select
                            value={formData.coApplicant.employmentType}
                            onChange={(e) => updateCoApplicantData("employmentType", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <option value="" disabled>Select type</option>
                            <option value="permanent">Permanent Full-time</option>
                            <option value="contract">Fixed Term Contract</option>
                            <option value="part-time">Part-time</option>
                            <option value="self-employed">Self Employed</option>
                          </select>
                        </div>
                    </div>

                    <div className="space-y-2 mt-4">
                        <label className="text-sm font-medium leading-none">Net Monthly Income (After Tax)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-3 text-sm text-muted-foreground">R</span>
                          <input
                            type="number"
                            value={formData.coApplicant.monthlyIncome}
                            onChange={(e) => updateCoApplicantData("monthlyIncome", e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-transparent px-7 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            placeholder="0.00"
                          />
                        </div>
                    </div>
                 </div>
              )}
            </div>
          )}

          {/* Step 3: Financial & Uploads */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="space-y-1">
                <h2 className="text-xl font-semibold">Financial & Banking</h2>
                <p className="text-sm text-muted-foreground">Provide banking details for statement verification.</p>
              </div>

              {formData.hasCoApplicant && <h3 className="font-bold text-lg mb-4 text-brand">Main Applicant</h3>}
              
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="bankName" className="text-sm font-medium leading-none">Bank Name</label>
                   <div className="relative">
                     <Landmark className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <select
                      id="bankName"
                      value={formData.bankName}
                      onChange={(e) => updateFormData("bankName", e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="" disabled>Select Bank</option>
                      <option value="fnb">FNB</option>
                      <option value="absa">Absa</option>
                      <option value="standard_bank">Standard Bank</option>
                      <option value="nedbank">Nedbank</option>
                      <option value="capitec">Capitec</option>
                      <option value="tyme">TymeBank</option>
                      <option value="discovery">Discovery Bank</option>
                    </select>
                   </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="accountType" className="text-sm font-medium leading-none">Account Type</label>
                  <select
                    id="accountType"
                    value={formData.accountType}
                    onChange={(e) => updateFormData("accountType", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="" disabled>Select Type</option>
                    <option value="cheque">Cheque / Current</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>
              
              <div className="space-y-2">
                  <label htmlFor="accountNumber" className="text-sm font-medium leading-none">Account Number</label>
                  <input
                    id="accountNumber"
                    value={formData.accountNumber}
                    onChange={(e) => updateFormData("accountNumber", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Enter account number"
                  />
              </div>
              
              <div className="space-y-2 pt-4">
                 <label className="text-sm font-medium leading-none">Upload Latest Payslip</label>
                 <label className="flex h-[120px] w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-colors hover:bg-muted relative">
                    <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Drag & drop or click to upload PDF/Image</p>
                    <input 
                      type="file" 
                      className="hidden" 
                      onChange={(e) => updateFormData("payslipFile", e.target.files?.[0] || null)}
                    />
                 </label>
                 <p className="text-[0.8rem] text-muted-foreground text-right">{formData.payslipFile ? formData.payslipFile.name : "No file selected"}</p>
              </div>

               {/* Co-Applicant Financials */}
               {formData.hasCoApplicant && (
                  <div className="mt-8 border-t border-border pt-8 animate-in fade-in slide-in-from-bottom-4">
                     <h3 className="font-bold text-lg mb-4 text-brand">Co-Applicant Financials</h3>
                     <div className="grid gap-6 md:grid-cols-2">
                         <div className="space-y-2">
                           <label className="text-sm font-medium leading-none">Bank Name</label>
                            <div className="relative">
                              <Landmark className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                             <select
                               value={formData.coApplicant.bankName}
                               onChange={(e) => updateCoApplicantData("bankName", e.target.value)}
                               className="flex h-10 w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                             >
                               <option value="" disabled>Select Bank</option>
                               <option value="fnb">FNB</option>
                               <option value="absa">Absa</option>
                               <option value="standard_bank">Standard Bank</option>
                               <option value="nedbank">Nedbank</option>
                               <option value="capitec">Capitec</option>
                               <option value="tyme">TymeBank</option>
                               <option value="discovery">Discovery Bank</option>
                             </select>
                            </div>
                         </div>
                         <div className="space-y-2">
                           <label className="text-sm font-medium leading-none">Account Type</label>
                           <select
                             value={formData.coApplicant.accountType}
                             onChange={(e) => updateCoApplicantData("accountType", e.target.value)}
                             className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                           >
                             <option value="" disabled>Select Type</option>
                             <option value="cheque">Cheque / Current</option>
                             <option value="savings">Savings</option>
                           </select>
                         </div>
                       </div>
                       
                       <div className="space-y-2 mt-4">
                           <label className="text-sm font-medium leading-none">Account Number</label>
                           <input
                             value={formData.coApplicant.accountNumber}
                             onChange={(e) => updateCoApplicantData("accountNumber", e.target.value)}
                             className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                             placeholder="Enter account number"
                           />
                       </div>
                       
                       <div className="space-y-2 pt-4">
                          <label className="text-sm font-medium leading-none">Co-Applicant Payslip</label>
                          <label className="flex h-[120px] w-full cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-colors hover:bg-muted relative">
                             <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                             <p className="text-xs text-muted-foreground">Drag & drop or click to upload PDF/Image</p>
                             <input 
                               type="file" 
                               className="hidden" 
                               onChange={(e) => updateCoApplicantData("payslipFile", e.target.files?.[0] || null)}
                             />
                          </label>
                          <p className="text-[0.8rem] text-muted-foreground text-right">{formData.coApplicant.payslipFile ? formData.coApplicant.payslipFile.name : "No file selected"}</p>
                       </div>
                  </div>
               )}
            </div>
          )}

          {/* Step 4: Consent */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="space-y-1">
                <h2 className="text-xl font-semibold">Consent & Authorization</h2>
                <p className="text-sm text-muted-foreground">We need your permission to perform necessary verification checks.</p>
              </div>

              {/* Trust Image Block */}
              <div className="relative mb-6 rounded-xl overflow-hidden bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900">
                 <div className="flex items-center gap-4 p-4 md:p-6">
                    <div className="h-24 w-24 flex-shrink-0 rounded-lg overflow-hidden bg-white shadow-sm hidden sm:block">
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img src="/images/secure-check.png" alt="Secure Identity" className="h-full w-full object-cover" />
                    </div>
                    <div>
                       <h3 className="font-bold text-blue-900 dark:text-blue-200">Bank-Grade Security</h3>
                       <p className="text-xs md:text-sm text-blue-700 dark:text-blue-300 mt-1">
                          We use advanced encryption to protect your identity. Your consent is required by law (NCA & POPIA) and ensures a transparent rental process.
                       </p>
                    </div>
                 </div>
              </div>
              
              {formData.hasCoApplicant && <h3 className="font-bold text-lg mb-4 text-brand">Main Applicant Consent</h3>}
              
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                 <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      id="consentCreditCheck"
                      checked={formData.consentCreditCheck}
                      onChange={(e) => updateFormData("consentCreditCheck", e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-primary text-brand focus:ring-brand"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label htmlFor="consentCreditCheck" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Consent to Credit Bureau Inquiry
                      </label>
                      <p className="text-sm text-muted-foreground">
                        I hereby authorize EasyRent to perform a full credit check on my profile with registered credit bureaus to assess my creditworthiness and risk profile.
                      </p>
                    </div>
                 </div>
                 
                 <div className="flex items-start space-x-3 pt-2">
                    <input
                      type="checkbox"
                      id="consentIdVerification"
                      checked={formData.consentIdVerification}
                      onChange={(e) => updateFormData("consentIdVerification", e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-primary text-brand focus:ring-brand"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label htmlFor="consentIdVerification" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Consent to Identity Verification
                      </label>
                      <p className="text-sm text-muted-foreground">
                        I authorize the verification of my personal identity details against the Department of Home Affairs population register.
                      </p>
                    </div>
                 </div>
                 
                 <div className="flex items-start space-x-3 pt-2">
                    <input
                      type="checkbox"
                      id="consentBankStatements"
                      checked={formData.consentBankStatements}
                      onChange={(e) => updateFormData("consentBankStatements", e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-primary text-brand focus:ring-brand"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label htmlFor="consentBankStatements" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Consent to Bank Statement Retrieval
                      </label>
                      <p className="text-sm text-muted-foreground">
                        I authorize EasyRent to request my last 3 months of bank statements directly from my bank for income verification and fraud prevention purposes.
                      </p>
                    </div>
                 </div>
              </div>
              
               {/* Co-Applicant Consent */}
               {formData.hasCoApplicant && (
                  <div className="mt-8 border-t border-border pt-8 animate-in fade-in slide-in-from-bottom-4">
                     <h3 className="font-bold text-lg mb-4 text-brand">Co-Applicant Consent</h3>
                     <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                        <div className="flex items-start space-x-3">
                           <input
                             type="checkbox"
                             id="coConsentCreditCheck"
                             checked={formData.coApplicant.consentCreditCheck}
                             onChange={(e) => updateCoApplicantData("consentCreditCheck", e.target.checked)}
                             className="mt-1 h-4 w-4 rounded border-primary text-brand focus:ring-brand"
                           />
                           <div className="grid gap-1.5 leading-none">
                             <label htmlFor="coConsentCreditCheck" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                               Consent to Credit Bureau Inquiry
                             </label>
                             <p className="text-sm text-muted-foreground">
                               I hereby authorize EasyRent to perform a full credit check on my profile with registered credit bureaus.
                             </p>
                           </div>
                        </div>
                        
                        <div className="flex items-start space-x-3 pt-2">
                           <input
                             type="checkbox"
                             id="coConsentIdVerification"
                             checked={formData.coApplicant.consentIdVerification}
                             onChange={(e) => updateCoApplicantData("consentIdVerification", e.target.checked)}
                             className="mt-1 h-4 w-4 rounded border-primary text-brand focus:ring-brand"
                           />
                           <div className="grid gap-1.5 leading-none">
                             <label htmlFor="coConsentIdVerification" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                               Consent to Identity Verification
                             </label>
                             <p className="text-sm text-muted-foreground">
                               I authorize the verification of my personal identity details against the Department of Home Affairs population register.
                             </p>
                           </div>
                        </div>
                        
                        <div className="flex items-start space-x-3 pt-2">
                           <input
                             type="checkbox"
                             id="coConsentBankStatements"
                             checked={formData.coApplicant.consentBankStatements}
                             onChange={(e) => updateCoApplicantData("consentBankStatements", e.target.checked)}
                             className="mt-1 h-4 w-4 rounded border-primary text-brand focus:ring-brand"
                           />
                           <div className="grid gap-1.5 leading-none">
                             <label htmlFor="coConsentBankStatements" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                               Consent to Bank Statement Retrieval
                             </label>
                             <p className="text-sm text-muted-foreground">
                               I authorize EasyRent to request my last 3 months of bank statements.
                             </p>
                           </div>
                        </div>
                     </div>
                  </div>
               )}
              
              <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-950/30">
                 <div className="flex items-start">
                    <div className="ml-3">
                       <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Data Privacy Promise</h3>
                       <div className="mt-2 text-sm text-blue-700 dark:text-blue-400">
                          <p>
                             Your data is encrypted and processed securely in accordance with POPIA. We only share verification results with your prospective landlord/agent.
                          </p>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-6 py-4 md:px-8">
           <button
             onClick={handleBack}
             disabled={currentStep === 1 || isLoading}
             className={cn(
               "flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
               currentStep === 1 && "opacity-0 pointer-events-none"
             )}
           >
             <ChevronLeft className="mr-1 h-4 w-4" />
             Back
           </button>
           
           <button
             onClick={handleNext}
             disabled={
               isLoading || 
               (currentStep === 4 && (
                 !formData.consentCreditCheck || !formData.consentIdVerification || !formData.consentBankStatements ||
                 (formData.hasCoApplicant && (!formData.coApplicant.consentCreditCheck || !formData.coApplicant.consentIdVerification || !formData.coApplicant.consentBankStatements))
               ))
             }
             className={cn(
               "inline-flex h-10 items-center justify-center rounded-md bg-brand px-8 text-sm font-medium text-white shadow transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
               isLoading && "w-32"
             )}
           >
             {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-r-transparent mr-2"></span>
                  Processing
                </>
             ) : currentStep === STEPS.length ? (
               "Submit Application"
             ) : (
               <>
                 Next
                 <ChevronRight className="ml-1 h-4 w-4" />
               </>
             )}
           </button>
        </div>
      </div>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>}>
      <ApplyForm />
    </Suspense>
  );
}
