import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireAuthenticatedRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { validateLineItems, calculateInvoiceTotal, type LineItem } from '@backend/lib/invoices';
import { isValidUUID } from '@/lib/validation';

/**
 * GET /api/invoices
 *
 * Returns invoices visible to the caller. RLS already scopes this to
 * invoices where the caller is either the issuer or the recipient — no
 * explicit filter needed here, same pattern as /api/applications.
 *
 * Optional query param: status
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    await requireAuthenticatedRole(supabase, ['landlord', 'tenant', 'handyman', 'admin']);

    let query = supabase.from('invoices').select('*').order('created_at', { ascending: false });

    const status = request.nextUrl.searchParams.get('status');
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      console.error('GET /api/invoices: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ invoices: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/invoices
 *
 * Creates an invoice manually with arbitrary line items. Issuer is always
 * the caller (a landlord or handyman) — you can't create an invoice on
 * someone else's behalf. For the common case of "generate this month's
 * rent invoice for a property", use POST /api/properties/[id]/generate-invoice
 * instead, which pre-fills the line items correctly.
 *
 * Exactly one of property_id / job_id may be set (or neither, for an
 * ad-hoc invoice) — enforced both here (clear error message) and by the
 * `invoice_has_one_source` DB constraint (migration 002) as a backstop.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const profile = await requireAuthenticatedRole(supabase, ['landlord', 'handyman', 'admin']);

    const body = await request.json();

    if (body.property_id && body.job_id) {
      return NextResponse.json(
        { error: 'An invoice can be linked to a property OR a job, not both.' },
        { status: 400 }
      );
    }
    if (!body.recipient_id || !isValidUUID(body.recipient_id)) {
      return NextResponse.json({ error: 'recipient_id must be a valid UUID.' }, { status: 400 });
    }
    if (body.property_id && !isValidUUID(body.property_id)) {
      return NextResponse.json({ error: 'Invalid property_id format.' }, { status: 400 });
    }
    if (body.job_id && !isValidUUID(body.job_id)) {
      return NextResponse.json({ error: 'Invalid job_id format.' }, { status: 400 });
    }

    const lineItems: LineItem[] = body.line_items ?? [];
    const { valid, errors } = validateLineItems(lineItems);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid line items.', details: errors }, { status: 400 });
    }

    const amount = calculateInvoiceTotal(lineItems);

    const { data, error } = await supabase
      .from('invoices')
      .insert([
        {
          issuer_id: profile.id,
          recipient_id: body.recipient_id,
          property_id: body.property_id ?? null,
          job_id: body.job_id ?? null,
          line_items: lineItems,
          amount,
          due_date: body.due_date ?? null,
          status: 'draft',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('POST /api/invoices: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ invoice: data }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
