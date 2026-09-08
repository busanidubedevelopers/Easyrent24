import { describe, it, expect } from 'vitest';
import {
  extractLocality,
  computeSimilarityScore,
  rankComparables,
  computeMarketStats,
  type ComparisonTarget,
  type ComparableCandidate,
  type RankedComparable,
} from '../lib/marketComparison';

describe('extractLocality', () => {
  it('extracts the segment after the last comma', () => {
    expect(extractLocality('12 Oak St, Sandton')).toBe('sandton');
  });
  it('extracts the last segment when there are multiple commas', () => {
    expect(extractLocality('12 Oak St, Sandton, Johannesburg')).toBe('johannesburg');
  });
  it('falls back to the whole address when there is no comma', () => {
    expect(extractLocality('Sandton')).toBe('sandton');
  });
  it('lowercases the result', () => {
    expect(extractLocality('12 Oak St, SANDTON')).toBe('sandton');
  });
});

describe('computeSimilarityScore', () => {
  const target: ComparisonTarget = { address: '1 Main St, Sandton', propertyType: 'apartment', bedrooms: 2, price: 10000 };

  it('scores a near-identical property highly', () => {
    const candidate: ComparableCandidate = { id: 'a', address: '2 Oak Ave, Sandton', propertyType: 'apartment', bedrooms: 2, price: 999999 };
    expect(computeSimilarityScore(target, candidate)).toBe(80); // 30 type + 20 bedrooms + 30 locality (no size)
  });

  it('scores 100 when size is also within 20% difference', () => {
    const targetWithSize: ComparisonTarget = { ...target, size_m2: 100 };
    const candidate: ComparableCandidate = { id: 'a', address: '2 Oak Ave, Sandton', propertyType: 'apartment', bedrooms: 2, size_m2: 110, price: 999999 };
    expect(computeSimilarityScore(targetWithSize, candidate)).toBe(100); // 30 type + 20 bedrooms + 30 locality + 20 size
  });

  it('does NOT let price influence similarity at all', () => {
    const cheap: ComparableCandidate = { id: 'a', address: '2 Oak Ave, Sandton', propertyType: 'apartment', bedrooms: 2, price: 1 };
    const expensive: ComparableCandidate = { id: 'b', address: '2 Oak Ave, Sandton', propertyType: 'apartment', bedrooms: 2, price: 999999999 };
    expect(computeSimilarityScore(target, cheap)).toBe(computeSimilarityScore(target, expensive));
  });

  it('gives partial credit for a 1-bedroom difference', () => {
    const candidate: ComparableCandidate = { id: 'a', address: '2 Oak Ave, Sandton', propertyType: 'apartment', bedrooms: 3, price: 1 };
    const score = computeSimilarityScore(target, candidate);
    expect(score).toBe(72); // 30 type + 12 (1-bed diff) + 30 locality
  });

  it('gives no bedroom points for a 3+ bedroom difference', () => {
    const candidate: ComparableCandidate = { id: 'a', address: '2 Oak Ave, Sandton', propertyType: 'apartment', bedrooms: 6, price: 1 };
    expect(computeSimilarityScore(target, candidate)).toBe(60); // 30 type + 0 bedrooms + 30 locality
  });

  it('scores zero for a completely different property type and locality', () => {
    const candidate: ComparableCandidate = { id: 'a', address: '99 Far Rd, Polokwane', propertyType: 'house', bedrooms: 2, price: 1 };
    expect(computeSimilarityScore(target, candidate)).toBe(20); // only bedroom match (20)
  });

  it('gives partial locality credit for overlapping words', () => {
    const t: ComparisonTarget = { address: '1 Main St, Sandton Central', propertyType: null, bedrooms: null, price: 1 };
    const c: ComparableCandidate = { id: 'a', address: '2 Oak Ave, Sandton', propertyType: null, bedrooms: null, price: 1 };
    expect(computeSimilarityScore(t, c)).toBe(15);
  });
});

describe('rankComparables', () => {
  const target: ComparisonTarget = { address: '1 Main St, Sandton', propertyType: 'apartment', bedrooms: 2, price: 10000 };

  const candidates: ComparableCandidate[] = [
    { id: 'perfect', address: '2 Oak Ave, Sandton', propertyType: 'apartment', bedrooms: 2, price: 11000 },
    { id: 'decent', address: '5 Elm Rd, Sandton', propertyType: 'house', bedrooms: 2, price: 9000 },
    { id: 'unrelated', address: '99 Far Rd, Polokwane', propertyType: 'studio', bedrooms: 5, price: 3000 },
  ];

  it('ranks the most similar candidate first', () => {
    const result = rankComparables(target, candidates);
    expect(result[0].id).toBe('perfect');
  });

  it('filters out candidates below the minimum similarity threshold', () => {
    const result = rankComparables(target, candidates, { minSimilarity: 30 });
    expect(result.some((c) => c.id === 'unrelated')).toBe(false);
  });

  it('respects the limit option', () => {
    const result = rankComparables(target, candidates, { limit: 1, minSimilarity: 0 });
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when nothing meets the threshold', () => {
    const result = rankComparables(target, candidates, { minSimilarity: 101 });
    expect(result).toHaveLength(0);
  });
});

describe('computeMarketStats', () => {
  const comparables: RankedComparable[] = [
    { id: 'a', address: 'x', propertyType: 'apartment', bedrooms: 2, price: 10000, similarity: 90 },
    { id: 'b', address: 'x', propertyType: 'apartment', bedrooms: 2, price: 12000, similarity: 80 },
  ];

  it('computes the correct market average', () => {
    expect(computeMarketStats(11000, comparables).marketAverage).toBe(11000);
  });

  it('reports "fair" when price is within 10% of the average', () => {
    expect(computeMarketStats(11000, comparables).recommendation?.type).toBe('fair');
  });

  it('reports "high" when price is more than 10% above average', () => {
    expect(computeMarketStats(13000, comparables).recommendation?.type).toBe('high');
  });

  it('reports "low" when price is more than 10% below average', () => {
    expect(computeMarketStats(9000, comparables).recommendation?.type).toBe('low');
  });

  it('computes priceDiffPct correctly', () => {
    const stats = computeMarketStats(12100, comparables); // avg=11000, diff = +10%
    expect(stats.priceDiffPct).toBe(10);
  });

  it('returns null stats (not fabricated ones) when there are no comparables at all', () => {
    const stats = computeMarketStats(10000, []);
    expect(stats.marketAverage).toBeNull();
    expect(stats.recommendation).toBeNull();
    expect(stats.comparableCount).toBe(0);
  });
});
