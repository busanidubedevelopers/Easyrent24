import { describe, it, expect } from 'vitest';
import { rankApplicantsByRisk, countByField, buildDashboardSummary, type ApplicantSummary } from '../lib/landlordDashboard';

const applicants: ApplicantSummary[] = [
  { id: 'a', first_name: 'A', last_name: 'A', status: 'pending', risk_score: 300, risk_level: 'high', monthly_income: 5000, created_at: '2026-08-01' },
  { id: 'b', first_name: 'B', last_name: 'B', status: 'pending', risk_score: 800, risk_level: 'low', monthly_income: 20000, created_at: '2026-08-02' },
  { id: 'c', first_name: 'C', last_name: 'C', status: 'pending', risk_score: null, risk_level: null, monthly_income: null, created_at: '2026-08-03' },
  { id: 'd', first_name: 'D', last_name: 'D', status: 'pending', risk_score: 600, risk_level: 'medium', monthly_income: 15000, created_at: '2026-08-04' },
  { id: 'e', first_name: 'E', last_name: 'E', status: 'pending', risk_score: null, risk_level: null, monthly_income: null, created_at: '2026-08-01' },
];

describe('rankApplicantsByRisk', () => {
  it('best_first: orders scored applicants highest-score-first', () => {
    const result = rankApplicantsByRisk(applicants, 'best_first');
    expect(result.map((a) => a.id).slice(0, 3)).toEqual(['b', 'd', 'a']);
  });

  it('best_first: places unscored applicants after all scored ones', () => {
    const result = rankApplicantsByRisk(applicants, 'best_first');
    expect(result.slice(3).every((a) => a.risk_score === null)).toBe(true);
  });

  it('best_first: orders unscored applicants oldest-first', () => {
    const result = rankApplicantsByRisk(applicants, 'best_first');
    expect(result.slice(3).map((a) => a.id)).toEqual(['e', 'c']);
  });

  it('attention_first: orders scored applicants lowest-score-first', () => {
    const result = rankApplicantsByRisk(applicants, 'attention_first');
    expect(result.map((a) => a.id).slice(0, 3)).toEqual(['a', 'd', 'b']);
  });

  it('attention_first: STILL places unscored applicants last, not treated as urgent', () => {
    const result = rankApplicantsByRisk(applicants, 'attention_first');
    expect(result.slice(3).every((a) => a.risk_score === null)).toBe(true);
  });

  it('does not mutate the original array', () => {
    rankApplicantsByRisk(applicants, 'best_first');
    expect(applicants[0].id).toBe('a');
  });
});

describe('countByField', () => {
  it('counts occurrences per value correctly', () => {
    const result = countByField(
      [{ status: 'published' }, { status: 'published' }, { status: 'draft' }, { status: 'archived' }],
      'status'
    );
    expect(result.published).toBe(2);
    expect(result.draft).toBe(1);
    expect(result.total).toBe(4);
  });

  it('groups null values under "unknown"', () => {
    const result = countByField([{ risk_level: 'low' }, { risk_level: null }, { risk_level: null }], 'risk_level');
    expect(result.unknown).toBe(2);
    expect(result.low).toBe(1);
  });
});

describe('buildDashboardSummary', () => {
  const summary = buildDashboardSummary(
    [
      { id: 'p1', status: 'published' },
      { id: 'p2', status: 'draft' },
    ],
    [
      { id: 'app1', status: 'pending', risk_level: 'high', property_id: 'p1' },
      { id: 'app2', status: 'approved', risk_level: 'low', property_id: 'p1' },
      { id: 'app3', status: 'reviewing', risk_level: null, property_id: 'p2' },
    ]
  );

  it('counts properties correctly', () => {
    expect(summary.properties.total).toBe(2);
  });
  it('counts applications correctly', () => {
    expect(summary.applications.total).toBe(3);
  });
  it('needsAttention includes only pending + reviewing', () => {
    expect(summary.needsAttention).toHaveLength(2);
    expect(summary.needsAttention.some((a) => a.id === 'app2')).toBe(false);
  });
  it('risk breakdown groups null risk_level as unknown', () => {
    expect(summary.applicationsByRisk.unknown).toBe(1);
  });
});
