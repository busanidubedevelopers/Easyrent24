import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { requireAuthenticatedRole } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { leaseTermsSchema } from '@backend/lib/lease';
import { LEASE_COLUMNS, buildPartiesSnapshot, documentForLease, type LeaseRow } from '@backend/lib/leaseRecords';
import { validatePayloadSize, validateSchema } from '@backend/lib/security/validation';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';
import { isValidUUID } from '@/lib/validation';
import { loadApplicationForCaller } from '@backend/lib/applicationAccess';
import { loadApplicationReview } from '@backend/lib/applicationReview';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Loads the application with its property, and confirms the caller is that
 * property's landlord/agent (or an admin). Returns null when they aren't —
 * reported as 404 so application IDs can't be probed.
 */
async function loadApplicationForLandlord(id: string, profile: { id: string; role: 'tenant' | 'landlord' | 'handyman' | 'admin' }) {
  const found = await loadApplicationForCaller(getAdminDb(), id, profile);
  if (!found || !found.property || found.role === 'applicant') return null;
  return { application: found.application, property: found.property };
}

/**
 * GET /api/applications/[id]/lease
 *
 * The lease for this application (with its rendered text), or `lease: null`
 * if none has been drafted yet — in which case `defaults` suggests starting
 * terms (the deposit follows the affordability recommendation). Landlord/agent of the property only.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await requireAuthenticatedRole(db, ['landlord', 'admin']);

    const found = await loadApplicationForLandlord(id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const admin = getAdminDb();
    const { data: lease, error } = await admin.from('leases').select(LEASE_COLUMNS).eq('application_id', id).maybeSingle();
    if (error) throw new Error(`lease fetch failed: ${error.message}`);

    // Suggested defaults: listing price, one month's deposit, starting on
    // the 1st of next month, 12 months, 8% escalation (typical in SA).
    const now = new Date();
    const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const price = Number(found.property.price);
    // The affordability recommendation drives the suggested deposit
    // (e.g. 2 months when approving with conditions).
    const { assessment } = await loadApplicationReview(admin, found);
    const depositMonths = assessment.recommended_deposit_months;

    return NextResponse.json({
      application: {
        id: found.application.id,
        status: found.application.status,
        tenant_name: `${found.application.first_name} ${found.application.last_name}`,
      },
      property: { id: found.property.id, title: found.property.title, address: found.property.address, price },
      assessment: {
        recommendation: assessment.recommendation,
        score: assessment.score,
        headline: assessment.headline,
        conditions: assessment.conditions,
        recommended_deposit_months: depositMonths,
      },
      lease: lease ?? null,
      document: lease ? documentForLease(lease as unknown as LeaseRow) : null,
      defaults: {
        monthly_rent: price,
        deposit: price * depositMonths,
        start_date: firstOfNextMonth,
        term_months: 12,
        escalation_pct: 8,
        rent_due_day: 1,
        pets_allowed: false,
        utilities: 'tenant_prepaid',
        special_conditions: null,
      },
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/applications/[id]/lease
 *
 * Creates the lease draft for this application with the terms the
 * landlord/agent sets, or updates the terms of an existing draft. Once a
 * lease has been sent to the tenant its terms are frozen — unless the
 * landlord cancels it, in which case this starts a fresh draft.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    validatePayloadSize(request.headers.get('content-length'));

    const db = await getServerDb();
    const profile = await requireAuthenticatedRole(db, ['landlord', 'admin']);

    const rateLimit = await checkRateLimit(profile.id, 'MUTATIONS');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const terms = validateSchema(leaseTermsSchema, await request.json());

    const found = await loadApplicationForLandlord(id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    if (['declined', 'cancelled'].includes(found.application.status)) {
      return NextResponse.json({ error: `This application has been ${found.application.status}.` }, { status: 409 });
    }

    const admin = getAdminDb();
    const { data: existing, error: existingError } = await admin
      .from('leases')
      .select('id, status')
      .eq('application_id', id)
      .maybeSingle();
    if (existingError) throw new Error(`lease fetch failed: ${existingError.message}`);

    if (existing && existing.status !== 'draft' && existing.status !== 'cancelled') {
      return NextResponse.json({ error: 'This lease has already been sent to the tenant and can no longer be edited.' }, { status: 409 });
    }

    // Re-snapshot the parties on every draft save so corrections to the
    // application are picked up until the lease is sent.
    const parties = await buildPartiesSnapshot(admin, found.application as never, found.property);
    const fields = {
      ...terms,
      special_conditions: terms.special_conditions || null,
      parties,
      updated_at: new Date().toISOString(),
    };

    // Re-issuing a cancelled lease starts a clean draft: the old text hash
    // and any (voided) signatures must not carry over to the new terms.
    const reset =
      existing?.status === 'cancelled'
        ? { status: 'draft', document_hash: null, sent_at: null, tenant_signature: null, landlord_signature: null, executed_at: null, pdf_path: null }
        : {};

    const query = existing
      ? admin.from('leases').update({ ...fields, ...reset }).eq('id', existing.id).eq('status', existing.status)
      : admin.from('leases').insert([
          {
            ...fields,
            application_id: id,
            property_id: found.property.id,
            landlord_id: found.property.landlord_id,
            tenant_id: found.application.applicant_id,
            status: 'draft',
          },
        ]);

    const { data: lease, error: saveError } = await query.select(LEASE_COLUMNS).single();
    if (saveError || !lease) {
      console.error(`POST /api/applications/${id}/lease: DB save error`, saveError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json(
      { lease, document: documentForLease(lease as unknown as LeaseRow) },
      { status: existing ? 200 : 201 }
    );
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
