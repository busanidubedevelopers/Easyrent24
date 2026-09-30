import crypto from 'crypto';
import { z } from 'zod';

// ============================================================================
// Residential lease generation
//
// Builds a South African residential lease (Rental Housing Act 50 of 1999,
// Consumer Protection Act 68 of 2008 s14, ECTA 25 of 2002, POPIA) from the
// terms a landlord/agent sets at approval plus a frozen snapshot of both
// parties. The document is plain data (sections of paragraphs) so the same
// text renders on screen, into the PDF, and into the hash both signatures
// bind to.
//
// This is a sound starting template, not legal advice — have the wording
// reviewed by a property attorney before relying on it in production.
// ============================================================================

export type LeaseStatus = 'draft' | 'sent' | 'tenant_signed' | 'executed' | 'cancelled';
export type Utilities = 'tenant_prepaid' | 'tenant_metered' | 'included';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const leaseTermsSchema = z.object({
  monthly_rent: z.number().positive('Rent must be more than R0').max(1_000_000),
  deposit: z.number().min(0).max(5_000_000),
  start_date: z
    .string()
    .regex(DATE_RE, 'start_date must be YYYY-MM-DD')
    .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()), 'start_date must be a real date'),
  term_months: z.number().int().min(1).max(60),
  escalation_pct: z.number().min(0).max(25),
  rent_due_day: z.number().int().min(1).max(28),
  pets_allowed: z.boolean(),
  utilities: z.enum(['tenant_prepaid', 'tenant_metered', 'included']),
  special_conditions: z.string().trim().max(2000).nullable().optional(),
});

export type LeaseTerms = z.infer<typeof leaseTermsSchema>;

export interface LeaseParties {
  landlord: { name: string; email: string | null; is_agent: boolean };
  tenant: { name: string; id_number: string | null; email: string | null; phone: string | null; current_address: string | null };
  co_tenant: { name: string; id_number: string | null } | null;
  property: { title: string; address: string };
}

export interface LeaseSection {
  heading: string;
  paragraphs: string[];
}

export interface LeaseDocument {
  title: string;
  sections: LeaseSection[];
}

export interface LeaseSignature {
  name: string;
  signed_at: string;
  ip: string | null;
  user_agent: string | null;
  document_hash: string;
}

const money = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ')}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-01" → "1 November 2026" (timezone-independent). */
export function formatLeaseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Last day of the lease: start + term months − 1 day. When the start day
 * doesn't exist in the end month (31 Jan + 1 month), the lease runs to the
 * last day of that month instead of spilling into the next.
 */
export function leaseEndDate(startDate: string, termMonths: number): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const targetMonth = m - 1 + termMonths;
  const daysInTarget = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  const end =
    d > daysInTarget
      ? new Date(Date.UTC(y, targetMonth, daysInTarget))
      : new Date(Date.UTC(y, targetMonth, d - 1));
  return end.toISOString().slice(0, 10);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const UTILITIES_TEXT: Record<Utilities, string> = {
  tenant_prepaid:
    'Electricity and water are supplied through prepaid meters. The Tenant buys all prepaid units for the Premises at their own cost.',
  tenant_metered:
    'Electricity and water are metered. The Landlord will invoice the Tenant monthly for actual consumption as charged by the municipality or supplier, payable together with the next rental payment.',
  included: 'Water and electricity are included in the monthly rent, subject to reasonable household use.',
};

export function buildLeaseDocument(parties: LeaseParties, terms: LeaseTerms): LeaseDocument {
  const { landlord, tenant, co_tenant, property } = parties;
  const end = leaseEndDate(terms.start_date, terms.term_months);
  const tenantLine = [
    tenant.name,
    tenant.id_number ? `(ID/Passport No. ${tenant.id_number})` : null,
    co_tenant ? `and ${co_tenant.name}${co_tenant.id_number ? ` (ID/Passport No. ${co_tenant.id_number})` : ''}, jointly and severally` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const sections: LeaseSection[] = [
    {
      heading: '1. Parties',
      paragraphs: [
        `This lease is entered into between ${landlord.name}${landlord.is_agent ? ', acting as duly authorised agent for the owner' : ''} ("the Landlord") and ${tenantLine} ("the Tenant").`,
      ],
    },
    {
      heading: '2. Premises',
      paragraphs: [
        `The Landlord lets to the Tenant, who hires, the residential premises known as ${property.title}, ${property.address} ("the Premises"), together with any fixtures and fittings recorded in the ingoing inspection report.`,
      ],
    },
    {
      heading: '3. Lease period and renewal',
      paragraphs: [
        `This lease starts on ${formatLeaseDate(terms.start_date)} and ends on ${formatLeaseDate(end)} (${terms.term_months} month${terms.term_months === 1 ? '' : 's'}).`,
        'In line with section 14 of the Consumer Protection Act, the Landlord will notify the Tenant in writing between 40 and 80 business days before the lease expires of the expiry date and of any proposed material changes for renewal. If the Tenant stays on after expiry without a new agreement, the lease continues on a month-to-month basis on the same terms, terminable by either party on one calendar month\'s written notice.',
      ],
    },
    {
      heading: '4. Rent',
      paragraphs: [
        `The monthly rent is ${money(terms.monthly_rent)}, payable in advance on or before the ${ordinal(terms.rent_due_day)} day of each month, without deduction or set-off, by electronic transfer into the account nominated by the Landlord, quoting the Premises as reference.`,
        terms.escalation_pct > 0
          ? `The rent escalates by ${terms.escalation_pct}% on each anniversary of the start date.`
          : 'The rent does not escalate during the lease period.',
        'Rent paid late bears interest at the rate allowed by the National Credit Act from the due date until paid. The Landlord will give the Tenant a written receipt for every payment made in cash or on request, as required by the Rental Housing Act.',
      ],
    },
    {
      heading: '5. Deposit',
      paragraphs: [
        terms.deposit > 0
          ? `The Tenant pays a deposit of ${money(terms.deposit)} before taking occupation. The Landlord will invest the deposit in an interest-bearing account with a financial institution, and the interest accrues to the Tenant, as required by section 5(3) of the Rental Housing Act. The Tenant may ask for written proof of the interest earned at any time.`
          : 'No deposit is payable under this lease.',
        'The Landlord and Tenant will jointly inspect the Premises within 3 days before the Tenant moves in, and again within 3 days before the lease ends, and record any defects or damage in writing.',
        'On expiry, the Landlord may use the deposit and interest to pay rent or other amounts due and the reasonable cost of repairing damage caused during the lease (not fair wear and tear). The balance is refunded within 14 days of the Premises being restored to the Landlord, with an itemised account of any deductions. If nothing is owed, the full deposit and interest is refunded within 7 days of expiry.',
      ],
    },
    {
      heading: '6. Utilities',
      paragraphs: [UTILITIES_TEXT[terms.utilities], 'Refuse removal and rates remain the Landlord\'s responsibility.'],
    },
    {
      heading: '7. Use of the Premises',
      paragraphs: [
        'The Premises may only be used as a private residence. The Tenant may not sublet, cede this lease, or allow anyone else to live in the Premises without the Landlord\'s prior written consent, which will not be unreasonably withheld.',
        terms.pets_allowed
          ? 'Pets are allowed, provided they do not cause a nuisance or damage. The Tenant is liable for any damage caused by their pets.'
          : 'No pets may be kept on the Premises without the Landlord\'s prior written consent.',
        'The Tenant must comply with any body corporate or estate rules that apply to the Premises.',
      ],
    },
    {
      heading: '8. Maintenance and repairs',
      paragraphs: [
        'The Landlord keeps the Premises in a condition reasonably suitable for habitation, and maintains the structure, roof, and the plumbing and electrical installations.',
        'The Tenant keeps the interior of the Premises clean and in good order, replaces light bulbs and fuses, and repairs any damage caused by the Tenant, their household or visitors, fair wear and tear excepted. The Tenant must report defects promptly, and may not make alterations without the Landlord\'s written consent.',
      ],
    },
    {
      heading: '9. Access',
      paragraphs: [
        'The Landlord may inspect the Premises, carry out repairs, or show the Premises to prospective tenants or buyers at reasonable times, on at least 24 hours\' notice, and with regard to the Tenant\'s right to privacy.',
      ],
    },
    {
      heading: '10. Breach and cancellation',
      paragraphs: [
        'If the Tenant breaches this lease, the Landlord must give written notice to remedy the breach within 20 business days. If the breach is not remedied, the Landlord may cancel the lease, without prejudice to any claim for damages.',
        'The Tenant may cancel this lease at any time on 20 business days\' written notice, as allowed by section 14 of the Consumer Protection Act. The Tenant remains liable for amounts owed up to the cancellation date and a reasonable cancellation penalty as permitted by the Act.',
        'Neither party may evict or lock out the other without a court order.',
      ],
    },
  ];

  if (terms.special_conditions) {
    sections.push({ heading: `${sections.length + 1}. Special conditions`, paragraphs: [terms.special_conditions] });
  }

  const tenantContact = [tenant.email, tenant.phone].filter(Boolean).join(', ');
  sections.push(
    {
      heading: `${sections.length + 1}. Notices`,
      paragraphs: [
        `The parties choose the following addresses for notices: the Landlord at ${landlord.email ?? 'the address provided in writing to the Tenant'}, and the Tenant at the Premises${tenantContact ? ` and ${tenantContact}` : ''}. Notices sent by email are valid.`,
      ],
    },
    {
      heading: `${sections.length + 2}. Personal information`,
      paragraphs: [
        'The Landlord processes the Tenant\'s personal information only to administer this lease, collect rent, and meet legal obligations, in line with the Protection of Personal Information Act 4 of 2013.',
      ],
    },
    {
      heading: `${sections.length + 3}. General`,
      paragraphs: [
        'This lease is the entire agreement between the parties. No change is valid unless in writing and signed by both parties.',
        'The parties agree to sign this lease electronically. Each electronic signature is recorded with the signer\'s name, the date and time, IP address, and a fingerprint (SHA-256 hash) of this exact lease text, and has the same effect as a handwritten signature under the Electronic Communications and Transactions Act 25 of 2002.',
      ],
    }
  );

  return { title: 'Residential Lease Agreement', sections };
}

/** SHA-256 fingerprint of the exact lease text both parties sign. */
export function hashLeaseDocument(doc: LeaseDocument): string {
  return crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex');
}

/** Pulls the stored terms out of a leases row. */
export function termsFromRow(row: Record<string, unknown>): LeaseTerms {
  return {
    monthly_rent: Number(row.monthly_rent),
    deposit: Number(row.deposit),
    start_date: String(row.start_date),
    term_months: Number(row.term_months),
    escalation_pct: Number(row.escalation_pct),
    rent_due_day: Number(row.rent_due_day),
    pets_allowed: Boolean(row.pets_allowed),
    utilities: row.utilities as Utilities,
    special_conditions: (row.special_conditions as string | null) ?? null,
  };
}

const collapse = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** A typed signature must be the signer's full name as it appears on the lease. */
export function signatureNameMatches(typed: string, expected: string): boolean {
  return typed.trim().length > 0 && collapse(typed) === collapse(expected);
}

/**
 * Who may sign next, if anyone. The tenant signs first, then the landlord
 * countersigns, which executes the lease.
 */
export function nextSigner(status: LeaseStatus): 'tenant' | 'landlord' | null {
  if (status === 'sent') return 'tenant';
  if (status === 'tenant_signed') return 'landlord';
  return null;
}
