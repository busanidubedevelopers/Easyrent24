// ============================================================================
// Market price comparison (Phase 3, Task 25)
//
// HONEST SCOPE NOTE: the existing frontend component (MarketPriceComparison)
// fabricates fake "comparable properties" attributed to Property24/Gumtree/
// Private Property by randomly perturbing the user's OWN input price — it
// isn't scraping anything, and the numbers it shows are mathematically
// derived from the very price it's supposedly validating, so it will
// essentially always report "you're roughly at market." That's misleading
// if shipped as-is.
//
// This module instead compares against REAL data we actually have: other
// published listings already in our own database. It won't have the reach
// of an actual Property24/Gumtree scrape (that would need a real data
// partnership or scraping infrastructure this project doesn't have), but
// every number it produces is genuine, not fabricated.
// ============================================================================

export interface ComparisonTarget {
  address: string;
  propertyType: string | null;
  bedrooms: number | null;
  size_m2?: number | null;
  price: number;
}

export interface ComparableCandidate {
  id: string;
  address: string;
  propertyType: string | null;
  bedrooms: number | null;
  size_m2?: number | null;
  price: number;
}

export interface RankedComparable extends ComparableCandidate {
  similarity: number; // 0-100
}

/**
 * Extracts a rough "locality" token from a free-text address for matching
 * purposes, since there's no lat/long or geocoding in this schema (that's
 * Task 24, not yet built). Takes the text after the last comma (commonly
 * the suburb/area in South African addresses, e.g. "12 Oak St, Sandton" ->
 * "sandton"), falling back to the whole address if there's no comma.
 *
 * This is a deliberately simple heuristic, not real geospatial matching —
 * it's what's honestly achievable without a mapping API.
 */
export function extractLocality(address: string): string {
  const parts = address.split(',').map((p) => p.trim());
  const locality = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return locality.toLowerCase();
}

/**
 * Scores how similar a candidate property is to the target, from 0-100.
 * Deliberately does NOT factor in price — the whole point of finding
 * comparables is to then compare their prices to the target, so weighting
 * similarity by price would be circular and make every result look
 * artificially "fair."
 *
 * Weights: property type match (30), locality match (30), bedroom closeness (20), 
 * size proximity (20).
 */
export function computeSimilarityScore(target: ComparisonTarget, candidate: ComparableCandidate): number {
  let score = 0;

  if (target.propertyType && candidate.propertyType === target.propertyType) {
    score += 30;
  }

  if (target.bedrooms !== null && candidate.bedrooms !== null) {
    const diff = Math.abs(target.bedrooms - candidate.bedrooms);
    if (diff === 0) score += 20;
    else if (diff === 1) score += 12;
    else if (diff === 2) score += 5;
    // diff >= 3: no points
  }

  const targetLocality = extractLocality(target.address);
  const candidateLocality = extractLocality(candidate.address);
  if (targetLocality && candidateLocality) {
    if (targetLocality === candidateLocality) {
      score += 30;
    } else {
      // Partial credit for shared words (e.g. "sandton central" vs "sandton")
      const targetWords = new Set(targetLocality.split(/\s+/));
      const candidateWords = candidateLocality.split(/\s+/);
      const overlap = candidateWords.some((w) => targetWords.has(w));
      if (overlap) score += 15;
    }
  }

  if (target.size_m2 != null && candidate.size_m2 != null) {
    const sizeRatio = Math.max(target.size_m2, candidate.size_m2) / Math.max(Math.min(target.size_m2, candidate.size_m2), 1);
    // If size is within 20% difference (ratio <= 1.2), full points
    if (sizeRatio <= 1.2) score += 20;
    // If size is within 50% difference (ratio <= 1.5), partial points
    else if (sizeRatio <= 1.5) score += 10;
    // ratio > 1.5: no points
  }

  return Math.min(100, score);
}

/**
 * Ranks candidates by similarity to the target, filters out weak matches
 * (below minSimilarity — an unrelated property showing up as a "comparable"
 * is worse than showing fewer, more genuine ones), and returns the top N.
 */
export function rankComparables(
  target: ComparisonTarget,
  candidates: ComparableCandidate[],
  options: { limit?: number; minSimilarity?: number } = {}
): RankedComparable[] {
  const limit = options.limit ?? 5;
  const minSimilarity = options.minSimilarity ?? 30;

  return candidates
    .map((c) => ({ ...c, similarity: computeSimilarityScore(target, c) }))
    .filter((c) => c.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export type RecommendationType = 'high' | 'low' | 'fair';

export interface Recommendation {
  type: RecommendationType;
  text: string;
}

export interface MarketStats {
  marketAverage: number | null;
  priceDiffPct: number | null;
  recommendation: Recommendation | null;
  comparableCount: number;
}

// Same +/-10% thresholds as the original (fake) frontend component, kept
// consistent so the recommendation language doesn't change out from under
// the existing UI copy once this is wired up to real data.
const PRICE_DIFF_THRESHOLD_PCT = 10;

/**
 * Computes the market average from a set of ranked comparables and compares
 * the target price against it. Returns null stats if there are no
 * comparables at all — showing a fabricated "market average" of a single
 * data point (or none) would be worse than admitting there isn't enough
 * data yet.
 */
export function computeMarketStats(targetPrice: number, comparables: RankedComparable[]): MarketStats {
  if (comparables.length === 0) {
    return { marketAverage: null, priceDiffPct: null, recommendation: null, comparableCount: 0 };
  }

  const marketAverage =
    Math.round((comparables.reduce((sum, c) => sum + c.price, 0) / comparables.length) * 100) / 100;

  const priceDiffPct = Math.round(((targetPrice - marketAverage) / marketAverage) * 1000) / 10;

  let recommendation: Recommendation;
  if (priceDiffPct > PRICE_DIFF_THRESHOLD_PCT) {
    recommendation = { type: 'high', text: 'Consider lowering your price to be competitive.' };
  } else if (priceDiffPct < -PRICE_DIFF_THRESHOLD_PCT) {
    recommendation = { type: 'low', text: 'You might be undervaluing your property.' };
  } else {
    recommendation = { type: 'fair', text: 'Your price is competitive with the market.' };
  }

  return { marketAverage, priceDiffPct, recommendation, comparableCount: comparables.length };
}
