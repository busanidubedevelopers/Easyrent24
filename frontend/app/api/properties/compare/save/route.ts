import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';

/**
 * POST /api/properties/compare/save
 *
 * Saves a market-comparison result for the authenticated user.
 * Uses getAuthenticatedProfile (JWT cookie) — no real Supabase SDK.
 */
export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const body = await request.json();
    const { search_criteria, suggested_price, comparable_properties } = body;

    if (!search_criteria || !comparable_properties) {
      return NextResponse.json({ error: 'search_criteria and comparable_properties are required.' }, { status: 400 });
    }

    const { data, error } = await db
      .from('market_comparisons')
      .insert([
        {
          user_id: profile.id,
          // Same raw-object-to-jsonb issue as invoices.line_items and the
          // other jsonb writers — this client binds params via node-postgres
          // directly, so a plain object/array must be stringified or
          // Postgres rejects it as invalid JSON.
          search_criteria: JSON.stringify(search_criteria),
          suggested_price: suggested_price ?? null,
          comparable_properties: JSON.stringify(comparable_properties),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('POST /api/properties/compare/save: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
