import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { toErrorResponse } from '@backend/lib/apiError';
import {
  rankComparables,
  computeMarketStats,
  type ComparisonTarget,
  type ComparableCandidate,
} from '@backend/lib/marketComparison';

/**
 * GET /api/properties/compare
 *
 * Compares a target price/address/type/bedrooms against REAL published
 * listings already in our database. This is deliberately NOT what the
 * current frontend component (MarketPriceComparison.tsx) does — that
 * component fabricates fake "Property24/Gumtree" comparables by randomly
 * perturbing the caller's own price, which will always claim the price is
 * "roughly fair." See backend/lib/marketComparison.ts for the full note.
 *
 * No auth required — this only ever reads already-public (status =
 * 'published') listings, the same data anyone can already see on the
 * find-home page. It's used during property creation, before a listing
 * necessarily exists yet, so it can't be scoped to an existing property ID.
 *
 * Query params:
 *   address        (required)
 *   price          (required) — the price being validated
 *   property_type  (optional)
 *   bedrooms       (optional)
 *   exclude_id     (optional) — pass the property's own ID when re-checking
 *                  an existing listing, so it doesn't get compared against
 *                  itself
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const address = params.get('address');
    const priceParam = params.get('price');

    if (!address || !priceParam) {
      return NextResponse.json({ error: 'address and price are required.' }, { status: 400 });
    }

    const price = Number(priceParam);
    if (Number.isNaN(price) || price <= 0) {
      return NextResponse.json({ error: 'price must be a positive number.' }, { status: 400 });
    }

    const propertyType = params.get('property_type');
    const bedroomsParam = params.get('bedrooms');
    const bedrooms = bedroomsParam !== null ? Number(bedroomsParam) : null;
    const sizeParam = params.get('size');
    const size_m2 = sizeParam !== null ? Number(sizeParam) : null;
    const excludeId = params.get('exclude_id');

    const target: ComparisonTarget = {
      address,
      propertyType: propertyType || null,
      bedrooms: bedrooms !== null && !Number.isNaN(bedrooms) ? bedrooms : null,
      size_m2: size_m2 !== null && !Number.isNaN(size_m2) ? size_m2 : null,
      price,
    };

    const db = await getServerDb();

    // Only published listings count as real market data — draft/archived
    // properties aren't actually on the market, so including them would
    // pollute the comparison with prices nobody is actually being asked to
    // pay right now.
    let query = db
      .from('properties')
      .select('id, address, property_type, bedrooms, size_m2, price')
      .eq('status', 'published');

    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const candidates: ComparableCandidate[] = (data ?? []).map((p: any) => ({
      id: p.id,
      address: p.address,
      propertyType: p.property_type,
      bedrooms: p.bedrooms !== null ? Number(p.bedrooms) : null,
      size_m2: p.size_m2 !== null ? Number(p.size_m2) : null,
      price: Number(p.price),
    }));

    const comparables = rankComparables(target, candidates);
    const stats = computeMarketStats(price, comparables);

    return NextResponse.json({
      targetPrice: price,
      ...stats,
      comparables,
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
