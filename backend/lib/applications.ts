export type ApplicationStatus = 'pending' | 'reviewing' | 'approved' | 'declined' | 'cancelled';
export type DocumentType = 'payslip' | 'id_document' | 'bank_statement';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'pending',
  'reviewing',
  'approved',
  'declined',
  'cancelled',
];

export const DOCUMENT_TYPES: DocumentType[] = ['payslip', 'id_document', 'bank_statement'];

/**
 * Allowed status transitions. Applicants can only ever move their own
 * application to 'cancelled', and only while it's still 'pending' (enforced
 * by RLS, migration 004). Everything else (reviewing/approved/declined) is
 * a landlord decision.
 */
const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['reviewing', 'approved', 'declined', 'cancelled'],
  reviewing: ['approved', 'declined', 'cancelled'],
  approved: [], // terminal
  declined: [], // terminal
  cancelled: [], // terminal
};

export function isValidApplicationStatusTransition(
  from: ApplicationStatus,
  to: ApplicationStatus
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface ApplicationInput {
  first_name?: string;
  last_name?: string;
  id_number?: string;
  current_address?: string;
  phone?: string;
  employer_name?: string;
  job_title?: string;
  employment_type?: string;
  monthly_income?: number;
  consent_credit?: boolean;
  consent_id_check?: boolean;
  consent_bank_statements?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a new application submission. Consent fields are required to
 * be explicitly true — an application can't proceed to credit/ID checks
 * (Task 8) without the applicant having actually agreed to them.
 */
export function validateApplicationInput(input: ApplicationInput): ValidationResult {
  const errors: string[] = [];

  if (!input.first_name || input.first_name.trim().length === 0) {
    errors.push('First name is required.');
  } else if (input.first_name.length > 100) {
    errors.push('First name must be 100 characters or fewer.');
  }

  if (!input.last_name || input.last_name.trim().length === 0) {
    errors.push('Last name is required.');
  } else if (input.last_name.length > 100) {
    errors.push('Last name must be 100 characters or fewer.');
  }

  if (input.id_number !== undefined && input.id_number.length > 13) {
    errors.push('ID number must be 13 characters or fewer.');
  }
  if (input.phone !== undefined && input.phone.length > 20) {
    errors.push('Phone must be 20 characters or fewer.');
  }
  if (input.current_address !== undefined && input.current_address.length > 300) {
    errors.push('Current address must be 300 characters or fewer.');
  }
  if (input.employer_name !== undefined && input.employer_name.length > 200) {
    errors.push('Employer name must be 200 characters or fewer.');
  }
  if (input.job_title !== undefined && input.job_title.length > 100) {
    errors.push('Job title must be 100 characters or fewer.');
  }

  if (!input.consent_credit) {
    errors.push('Consent to a credit check is required.');
  }
  if (!input.consent_id_check) {
    errors.push('Consent to ID verification is required.');
  }
  if (!input.consent_bank_statements) {
    errors.push('Consent to bank statement review is required.');
  }
  if (
    input.monthly_income !== undefined &&
    (typeof input.monthly_income !== 'number' || input.monthly_income < 0)
  ) {
    errors.push('Monthly income must be a non-negative number.');
  }

  return { valid: errors.length === 0, errors };
}
