import { create } from 'zustand';

export type ApplicantData = {
  firstName: string;
  lastName: string;
  residencyStatus: string;
  idNumber: string;
  countryOfOrigin: string;
  currentAddress: string;
  email: string;
  phone: string;
  idFile: File | null;
  
  employerName: string;
  jobTitle: string;
  employmentType: string;
  monthlyIncome: string;
  
  bankName: string;
  accountNumber: string;
  accountType: string;
  payslipFile: File | null;
  
  consentCreditCheck: boolean;
  consentIdVerification: boolean;
  consentBankStatements: boolean;
};

export type ApplyFormData = ApplicantData & {
  propertyRef: string;
  propertyId: string | null;
  hasCoApplicant: boolean;
  coApplicant: ApplicantData;
};

export const INITIAL_APPLICANT: ApplicantData = {
  firstName: "",
  lastName: "",
  residencyStatus: "sa_citizen",
  idNumber: "",
  countryOfOrigin: "South Africa",
  currentAddress: "",
  email: "",
  phone: "",
  idFile: null,
  employerName: "",
  jobTitle: "",
  employmentType: "",
  monthlyIncome: "",
  bankName: "",
  accountNumber: "",
  accountType: "",
  payslipFile: null,
  consentCreditCheck: false,
  consentIdVerification: false,
  consentBankStatements: false,
};

interface ApplyStore {
  currentStep: number;
  formData: ApplyFormData;
  setStep: (step: number | ((prev: number) => number)) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateFormData: <K extends keyof ApplyFormData>(field: K, value: ApplyFormData[K]) => void;
  updateCoApplicantData: <K extends keyof ApplicantData>(field: K, value: ApplicantData[K]) => void;
  toggleCoApplicant: (checked: boolean) => void;
  resetForm: () => void;
}

export const useApplyStore = create<ApplyStore>((set) => ({
  currentStep: 1,
  formData: {
    ...INITIAL_APPLICANT,
    propertyRef: "",
    propertyId: null,
    hasCoApplicant: false,
    coApplicant: { ...INITIAL_APPLICANT },
  },
  
  setStep: (step) => set((state) => ({
    currentStep: typeof step === 'function' ? step(state.currentStep) : step
  })),
  
  nextStep: () => set((state) => ({ currentStep: state.currentStep + 1 })),
  
  prevStep: () => set((state) => ({ currentStep: Math.max(1, state.currentStep - 1) })),
  
  updateFormData: (field, value) => set((state) => {
    const updates = { ...state.formData, [field]: value };
    if (field === "residencyStatus") {
      updates.countryOfOrigin = value === "sa_citizen" ? "South Africa" : "";
    }
    return { formData: updates };
  }),
  
  updateCoApplicantData: (field, value) => set((state) => {
    const coUpdates = { ...state.formData.coApplicant, [field]: value };
    if (field === "residencyStatus") {
      coUpdates.countryOfOrigin = value === "sa_citizen" ? "South Africa" : "";
    }
    return { formData: { ...state.formData, coApplicant: coUpdates } };
  }),
  
  toggleCoApplicant: (checked) => set((state) => ({
    formData: { ...state.formData, hasCoApplicant: checked }
  })),

  resetForm: () => set({
    currentStep: 1,
    formData: {
      ...INITIAL_APPLICANT,
      propertyRef: "",
      propertyId: null,
      hasCoApplicant: false,
      coApplicant: { ...INITIAL_APPLICANT },
    }
  }),
}));
