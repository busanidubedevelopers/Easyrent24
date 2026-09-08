import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { buildRentInvoiceLineItems, validateLineItems, calculateInvoiceTotal, type LineItem } from '@backend/lib/invoices';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/properties/[id]/generate-invoice
 *
 * The "dynamic invoice generation" this task is named for: given a
 * property, auto-generates a draft rent invoice with the locked "Monthly
 * Rent" line item pre-filled from the property's current price — exactly
 * matching the shape frontend/app/documents/page.tsx's UI already expects
 * (locked rent line + optional extra items), so wiring that page up to
 * this endpoint should be a drop-in replacement for its mock data.
 *
 * Body (all optional):
 *   recipient_id  - the tenant to bill. If omitted, falls back to the
 *                   applicant of this property's most recently approved
 *                   application, if one exists.
 *   extra_items   - additional line items (e.g. water, electricity) to
 *                   append after the locked rent line.
 *   due_date
 *
 * Landlord (owner of the property) or admin only.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const supabase = await getSupabaseServerClient();
    const profile = await getAuthenticatedProfile(supabase);

    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('id, landlord_id, price, title')
      .eq('id', id)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }
    if (!property) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }
    if (property.landlord_id !== profile.id && profile.role !== 'admin') {
      throw new ForbiddenError('You can only generate invoices for your own properties.');
    }

    const body = await request.json().catch(() => ({}));

    let recipientId: string | undefined = body.recipient_id;

    if (!recipientId) {
      const { data: approvedApplication } = await supabase
        .from('applications')
        .select('applicant_id')
        .eq('property_id', id)
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      recipientId = approvedApplication?.applicant_id;
    }

    if (!recipientId) {
      return NextResponse.json(
        {
          error:
            'No recipient_id provided and no approved application found for this property. Pass recipient_id explicitly.',
        },
        { status: 400 }
      );
    }

    const extraItems: LineItem[] = Array.isArray(body.extra_items) ? body.extra_items : [];
    if (extraItems.length > 0) {
      const { valid, errors } = validateLineItems(extraItems);
      if (!valid) {
        return NextResponse.json({ error: 'Invalid extra_items.', details: errors }, { status: 400 });
      }
    }

    const lineItems = [...buildRentInvoiceLineItems(Number(property.price)), ...extraItems];
    const amount = calculateInvoiceTotal(lineItems);

    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert([
        {
          issuer_id: profile.id,
          recipient_id: recipientId,
          property_id: property.id,
          line_items: lineItems,
          amount,
          due_date: body.due_date ?? null,
          status: 'draft',
        },
      ])
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
