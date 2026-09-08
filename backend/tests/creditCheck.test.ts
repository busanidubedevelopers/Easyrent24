import { describe, it, expect } from 'vitest';
import {
  validateSAIdNumber,
  calculateAffordability,
  computeRiskAssessment,
  analyzeBankStatementStub,
} from '../lib/creditCheck';

describe('validateSAIdNumber', () => {
  // Both test IDs below have checksums computed BY HAND (see backend/lib
  // creditCheck.ts comments / project history), independent of the code
  // under test — the same cross-check discipline used for PayFast's MD5.

  it('validates a correct male citizen ID (DOB 1990-01-01)', () => {
    const result = validateSAIdNumber('9001015000085');
    expect(result.valid).toBe(true);
    expect(result.details?.dateOfBirth).toBe('1990-01-01');
    expect(result.details?.gender).toBe('male');
    expect(result.details?.citizenship).toBe('citizen');
  });

  it('validates a correct female citizen ID (DOB 1985-06-15)', () => {
    const result = validateSAIdNumber('8506152500086');
    expect(result.valid).toBe(true);
    expect(result.details?.dateOfBirth).toBe('1985-06-15');
    expect(result.details?.gender).toBe('female');
  });

  it('rejects a tampered checksum digit', () => {
    const result = validateSAIdNumber('8506152500080'); // last digit changed from 6 to 0
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('checksum'))).toBe(true);
  });

  it('rejects an invalid calendar date (month 13)', () => {
    const result = validateSAIdNumber('9013015000085');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('date'))).toBe(true);
  });

  it('rejects a 12-digit (too short) ID', () => {
    expect(validateSAIdNumber('123456789012').valid).toBe(false);
  });
  it('rejects a 14-digit (too long) ID', () => {
    expect(validateSAIdNumber('12345678901234').valid).toBe(false);
  });
  it('rejects a non-numeric ID', () => {
    expect(validateSAIdNumber('90010150000AB').valid).toBe(false);
  });
  it('rejects an empty string', () => {
    expect(validateSAIdNumber('').valid).toBe(false);
  });

  it('correctly extracts permanent-resident citizenship', () => {
    // Same DOB/gender as the first test ID, citizenship digit changed to 1,
    // checksum recomputed by hand for the new 12-digit base.
    const result = validateSAIdNumber('9001015000184');
    expect(result.valid).toBe(true);
    expect(result.details?.citizenship).toBe('permanent_resident');
  });
});

describe('calculateAffordability', () => {
  it('passes when rent is exactly 1/3 of income', () => {
    expect(calculateAffordability(15000, 5000).passes).toBe(true);
  });
  it('fails when rent is 40% of income', () => {
    expect(calculateAffordability(15000, 6000).passes).toBe(false);
  });
  it('calculates the ratio correctly', () => {
    expect(calculateAffordability(10000, 3000).ratio).toBe(0.3);
  });
  it('calculates maxAffordableRent as income/3', () => {
    expect(calculateAffordability(9000, 1).maxAffordableRent).toBe(3000);
  });
  it('handles zero income without throwing', () => {
    expect(calculateAffordability(0, 5000).passes).toBe(false);
  });
});

describe('computeRiskAssessment', () => {
  it('rates valid ID + affordable rent as low risk', () => {
    const result = computeRiskAssessment({ idValid: true, affordability: calculateAffordability(15000, 4000) });
    expect(result.riskLevel).toBe('low');
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(999);
  });

  it('rates an invalid ID as high risk regardless of affordability', () => {
    const result = computeRiskAssessment({ idValid: false, affordability: calculateAffordability(15000, 4000) });
    expect(result.riskLevel).toBe('high');
  });

  it('rates rent over half of income as high risk even with a valid ID', () => {
    const result = computeRiskAssessment({ idValid: true, affordability: calculateAffordability(5000, 4000) });
    expect(result.riskLevel).toBe('high');
  });

  it('always flags the result as a heuristic, never a real bureau score', () => {
    const result = computeRiskAssessment({ idValid: true, affordability: calculateAffordability(15000, 4000) });
    expect(result.isHeuristic).toBe(true);
  });
});

describe('analyzeBankStatementStub', () => {
  it('is clearly marked as an unanalyzed stub, not a real result', () => {
    const result = analyzeBankStatementStub('/some/path.pdf');
    expect(result.analyzed).toBe(false);
    expect(result.provider).toBe('MOCK_STUB');
  });
});
