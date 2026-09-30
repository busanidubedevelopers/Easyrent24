import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  buildLeaseDocument,
  formatLeaseDate,
  hashLeaseDocument,
  leaseEndDate,
  leaseTermsSchema,
  nextSigner,
  signatureNameMatches,
  termsFromRow,
  type LeaseParties,
  type LeaseTerms,
} from '../lib/lease';
import { renderLeasePdf } from '../lib/leasePdf';

const parties: LeaseParties = {
  landlord: { name: 'Lindiwe Dlamini', email: 'lindiwe@example.com', is_agent: false },
  tenant: { name: 'Thabo Mokoena', id_number: '8001015009087', email: 'thabo@example.com', phone: '0821234567', current_address: null },
  co_tenant: null,
  property: { title: 'Unit 4, Sea Breeze', address: '45 Main Road, Sea Point' },
};

const terms: LeaseTerms = {
  monthly_rent: 12500,
  deposit: 12500,
  start_date: '2026-11-01',
  term_months: 12,
  escalation_pct: 8,
  rent_due_day: 1,
  pets_allowed: false,
  utilities: 'tenant_prepaid',
  special_conditions: null,
};

const allText = (doc: ReturnType<typeof buildLeaseDocument>) =>
  doc.sections.flatMap((s) => [s.heading, ...s.paragraphs]).join('\n');

describe('leaseEndDate', () => {
  it('ends the day before the anniversary', () => {
    expect(leaseEndDate('2026-11-01', 12)).toBe('2027-10-31');
    expect(leaseEndDate('2026-01-15', 1)).toBe('2026-02-14');
  });

  it('clamps to the end of a shorter month instead of spilling over', () => {
    expect(leaseEndDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(leaseEndDate('2027-12-31', 2)).toBe('2028-02-29'); // leap year
  });
});

describe('formatLeaseDate', () => {
  it('formats without depending on the server timezone', () => {
    expect(formatLeaseDate('2026-11-01')).toBe('1 November 2026');
  });
});

describe('leaseTermsSchema', () => {
  it('accepts sensible terms and rejects impossible ones', () => {
    expect(leaseTermsSchema.safeParse(terms).success).toBe(true);
    expect(leaseTermsSchema.safeParse({ ...terms, monthly_rent: 0 }).success).toBe(false);
    expect(leaseTermsSchema.safeParse({ ...terms, term_months: 61 }).success).toBe(false);
    expect(leaseTermsSchema.safeParse({ ...terms, rent_due_day: 31 }).success).toBe(false);
    expect(leaseTermsSchema.safeParse({ ...terms, start_date: '2026-13-01' }).success).toBe(false);
    expect(leaseTermsSchema.safeParse({ ...terms, start_date: '01/11/2026' }).success).toBe(false);
  });
});

describe('buildLeaseDocument', () => {
  it('puts the parties, premises, dates and money terms into the lease', () => {
    const text = allText(buildLeaseDocument(parties, terms));
    expect(text).toContain('Lindiwe Dlamini');
    expect(text).toContain('Thabo Mokoena (ID/Passport No. 8001015009087)');
    expect(text).toContain('Unit 4, Sea Breeze, 45 Main Road, Sea Point');
    expect(text).toContain('starts on 1 November 2026 and ends on 31 October 2027 (12 months)');
    expect(text).toContain('R12 500,00');
    expect(text).toContain('on or before the 1st day of each month');
    expect(text).toContain('escalates by 8%');
    expect(text).toContain('interest-bearing account');
  });

  it('reflects the chosen options', () => {
    const text = allText(buildLeaseDocument(parties, { ...terms, deposit: 0, escalation_pct: 0, pets_allowed: true, utilities: 'included' }));
    expect(text).toContain('No deposit is payable');
    expect(text).toContain('does not escalate');
    expect(text).toContain('Pets are allowed');
    expect(text).toContain('included in the monthly rent');
  });

  it('names an agent as acting for the owner, and adds a co-tenant jointly', () => {
    const text = allText(
      buildLeaseDocument(
        { ...parties, landlord: { ...parties.landlord, is_agent: true }, co_tenant: { name: 'Naledi Mokoena', id_number: null } },
        terms
      )
    );
    expect(text).toContain('duly authorised agent for the owner');
    expect(text).toContain('and Naledi Mokoena, jointly and severally');
  });

  it('numbers sections consecutively with or without special conditions', () => {
    for (const special of [null, 'One parking bay is included.']) {
      const doc = buildLeaseDocument(parties, { ...terms, special_conditions: special });
      const numbers = doc.sections.map((s) => Number(s.heading.split('.')[0]));
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    }
  });
});

describe('hashLeaseDocument', () => {
  it('is stable for the same text and changes when any term changes', () => {
    const a = hashLeaseDocument(buildLeaseDocument(parties, terms));
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(hashLeaseDocument(buildLeaseDocument(parties, terms))).toBe(a);
    expect(hashLeaseDocument(buildLeaseDocument(parties, { ...terms, monthly_rent: 12501 }))).not.toBe(a);
  });

  it('matches after a round trip through a database row (numeric columns come back as strings)', () => {
    const row = { ...terms, monthly_rent: '12500.00', deposit: '12500.00', escalation_pct: '8.00' };
    expect(hashLeaseDocument(buildLeaseDocument(parties, termsFromRow(row)))).toBe(
      hashLeaseDocument(buildLeaseDocument(parties, terms))
    );
  });
});

describe('signing rules', () => {
  it('matches the typed name ignoring case and extra spaces, but not a different name', () => {
    expect(signatureNameMatches('  thabo   MOKOENA ', 'Thabo Mokoena')).toBe(true);
    expect(signatureNameMatches('Thabo', 'Thabo Mokoena')).toBe(false);
    expect(signatureNameMatches('', 'Thabo Mokoena')).toBe(false);
  });

  it('has the tenant sign first, then the landlord', () => {
    expect(nextSigner('draft')).toBeNull();
    expect(nextSigner('sent')).toBe('tenant');
    expect(nextSigner('tenant_signed')).toBe('landlord');
    expect(nextSigner('executed')).toBeNull();
  });
});

describe('renderLeasePdf', () => {
  it('renders a multi-page PDF with signatures', async () => {
    const doc = buildLeaseDocument(parties, terms);
    const sig = { name: 'Thabo Mokoena', signed_at: '2026-10-01T10:00:00Z', ip: '41.0.0.1', user_agent: null, document_hash: 'a'.repeat(64) };
    const bytes = await renderLeasePdf(doc, {
      documentHash: 'a'.repeat(64),
      signatures: { tenant: sig, landlord: { ...sig, name: 'Lindiwe Dlamini' }, tenantName: 'Thabo Mokoena', landlordName: 'Lindiwe Dlamini' },
    });

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
    expect(loaded.getTitle()).toBe('Residential Lease Agreement');
  });

  it('does not crash on characters outside the standard PDF fonts', async () => {
    const doc = buildLeaseDocument(
      { ...parties, tenant: { ...parties.tenant, name: 'Zoë Nǃxau “Tš” Ngcobo ✓' } },
      { ...terms, special_conditions: 'Parking — bay 14 ✓ “covered”' }
    );
    const bytes = await renderLeasePdf(doc, { watermark: 'DRAFT' });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
