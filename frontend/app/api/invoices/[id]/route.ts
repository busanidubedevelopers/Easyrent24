import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import {
  isValidInvoiceStatusTransition,
  validateLineItems,
  calculateInvoiceTotal,
  INVOICE_STATUSES,
  type InvoiceStatus,
  type LineItem,
} from '@backend/lib/invoices';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/invoices/[id]
 *
 * RLS handles visibility (issuer or recipient only). 404 rather than 403
 * for anyone else, same "don't confirm the ID exists" reasoning used
 * throughout this project.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    await getAuthenticatedProfile(db);

    const { data, error } = await db.from('invoices').select('*').eq('id', id).maybeSingle();

    if (error) {
      console.error(`GET /api/invoices/${id}: DB error`, error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    return NextResponse.json({ invoice: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/invoices/[id]
 *
 * Issuer-only. Two kinds of updates:
 *   - Editing line items (only meaningful while still 'draft' — once sent,
 *     changing the amount behind a tenant's back would be exactly the kind
 *     of silent change a billing system must never allow)
 *   - Changing status, validated against the transition graph
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: existing, error: fetchError } = await db
      .from('invoices')
      .select('issuer_id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`PATCH /api/invoices/${id}: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }
    if (existing.issuer_id !== profile.id && profile.role !== 'admin') {
      throw new ForbiddenError('You can only edit your own invoices.');
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.line_items !== undefined) {
      if (existing.status !== 'draft') {
        return NextResponse.json(
          { error: 'Line items can only be changed while the invoice is still a draft.' },
          { status: 400 }
        );
      }
      const lineItems: LineItem[] = body.line_items;
      const { valid, errors } = validateLineItems(lineItems);
      if (!valid) {
        return NextResponse.json({ error: 'Invalid line items.', details: errors }, { status: 400 });
      }
      // Same raw-object-to-jsonb issue as invoice creation — this client
      // binds params via node-postgres directly, so a plain array must be
      // stringified or Postgres rejects it as invalid JSON.
      updates.line_items = JSON.stringify(lineItems);
      updates.amount = calculateInvoiceTotal(lineItems);
    }

    if (body.due_date !== undefined) {
      // due_date can only be set while the invoice is still a draft —
      // changing it after sending would silently alter the terms the
      // recipient agreed to.
      if (existing.status !== 'draft') {
        return NextResponse.json(
          { error: 'due_date can only be changed while the invoice is still a draft.' },
          { status: 400 }
        );
      }
      if (Number.isNaN(Date.parse(body.due_date))) {
        return NextResponse.json({ error: 'due_date must be a valid ISO date string.' }, { status: 400 });
      }
      updates.due_date = body.due_date;
    }

    if (body.status !== undefined) {
      if (!INVOICE_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${INVOICE_STATUSES.join(', ')}.` },
          { status: 400 }
        );
      }
      const from = existing.status as InvoiceStatus;
      const to = body.status as InvoiceStatus;
      if (!isValidInvoiceStatusTransition(from, to)) {
        return NextResponse.json(
          { error: `Cannot change status from '${from}' to '${to}'.` },
          { status: 400 }
        );
      }
      updates.status = to;
      if (to === 'paid') updates.paid_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { data, error } = await db.from('invoices').update(updates).eq('id', id).select().single();

    if (error) {
      console.error(`PATCH /api/invoices/${id}: DB update error`, error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ invoice: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * DELETE /api/invoices/[id]
 *
 * Issuer-only, and RLS (migration 006) only permits this while status is
 * still 'draft' — enforced redundantly here too, so the error message
 * explains why rather than the request just silently affecting 0 rows.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: existing, error: fetchError } = await db
      .from('invoices')
      .select('issuer_id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`DELETE /api/invoices/${id}: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }
    if (existing.issuer_id !== profile.id && profile.role !== 'admin') {
      throw new ForbiddenError('You can only delete your own invoices.');
    }
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: "Only 'draft' invoices can be deleted. Cancel a sent invoice instead." },
        { status: 400 }
      );
    }

    const { error } = await db.from('invoices').delete().eq('id', id);

    if (error) {
      console.error(`DELETE /api/invoices/${id}: DB error`, error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
