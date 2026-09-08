// ============================================================================
// Credit-check & affordability analysis service (Phase 1, Task 8)
//
// HONEST SCOPE NOTE: there is no real credit bureau (TransUnion/Experian/
// Compuscan) or Open Banking integration wired up here — that requires a
// commercial contract and API credentials this project doesn't have yet.
// What IS real and fully deterministic:
//   - South African ID number validation (checksum + date-of-birth/gender/
//     citizenship extraction) — this is a public, documented algorithm and
//     needs no external service at all.
//   - Affordability calculation (income vs. rent ratio) — pure arithmetic
//     on data we already collect.
// What is a STUB, clearly labeled as such, ready to swap for a real
// provider later:
//   - Bank statement analysis
//   - The overall "risk score" is an affordability-based heuristic, NOT an
//     actual credit bureau score, even though it's stored in a 0-999 field
//     originally intended for one.
// ============================================================================

// ----------------------------------------------------------------------------
// South African ID number validation
// Format: YYMMDD SSSS C A Z  (13 digits)
//   YYMMDD - date of birth
//   SSSS   - gender sequence: 0000-4999 female, 5000-9999 male
//   C      - citizenship: 0 = SA citizen, 1 = permanent resident
//   A      - historically a race indicator, now unused (usually 8)
//   Z      - checksum digit (Luhn-based)
// ----------------------------------------------------------------------------

export interface IdNumberDetails {
  dateOfBirth: string; // ISO YYYY-MM-DD
  gender: 'male' | 'female';
  citizenship: 'citizen' | 'permanent_resident';
}

export interface IdValidationResult {
  valid: boolean;
  errors: string[];
  details: IdNumberDetails | null;
}

/**
 * Computes the Luhn-based checksum digit for the first 12 digits of an SA ID
 * number. Algorithm:
 *   1. Sum the digits at odd positions (1st, 3rd, 5th, ...).
 *   2. Concatenate the digits at even positions into a number, double it,
 *      then sum the digits of THAT result.
 *   3. checksum = (10 - ((oddSum + evenSum) % 10)) % 10
 */
function computeChecksumDigit(first12: string): number {
  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) {
    oddSum += parseInt(first12[i], 10);
  }

  let evenDigits = '';
  for (let i = 1; i < 12; i += 2) {
    evenDigits += first12[i];
  }
  const doubled = String(parseInt(evenDigits, 10) * 2);
  let evenSum = 0;
  for (const ch of doubled) {
    evenSum += parseInt(ch, 10);
  }

  const total = oddSum + evenSum;
  return (10 - (total % 10)) % 10;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

/**
 * Validates a South African ID number's format and checksum, and extracts
 * date of birth, gender, and citizenship if valid. This does NOT confirm
 * the ID belongs to the applicant or that it's registered with Home
 * Affairs — it only confirms the number is well-formed. Confirming it
 * actually belongs to a real, living person is what a real KYC/ID
 * verification provider would add on top of this.
 */
export function validateSAIdNumber(idNumber: string): IdValidationResult {
  const errors: string[] = [];
  const cleaned = (idNumber || '').replace(/\s/g, '');

  if (!/^\d{13}$/.test(cleaned)) {
    return { valid: false, errors: ['ID number must be exactly 13 digits.'], details: null };
  }

  const yy = parseInt(cleaned.slice(0, 2), 10);
  const mm = parseInt(cleaned.slice(2, 4), 10);
  const dd = parseInt(cleaned.slice(4, 6), 10);

  // SA ID numbers don't encode the century — assume 1900s if the resulting
  // date would otherwise be in the future, otherwise 2000s. This is the
  // conventional heuristic (not perfect for people turning 100, but correct
  // for the overwhelming majority of real applicants).
  const currentYear2Digit = new Date().getFullYear() % 100;
  const century = yy > currentYear2Digit ? 1900 : 2000;
  const fullYear = century + yy;

  if (!isValidCalendarDate(fullYear, mm, dd)) {
    errors.push('ID number does not contain a valid date of birth.');
  }

  const genderSequence = parseInt(cleaned.slice(6, 10), 10);
  const gender: 'male' | 'female' = genderSequence >= 5000 ? 'male' : 'female';

  const citizenshipDigit = cleaned[10];
  if (citizenshipDigit !== '0' && citizenshipDigit !== '1') {
    errors.push('ID number has an invalid citizenship digit.');
  }
  const citizenship: 'citizen' | 'permanent_resident' = citizenshipDigit === '1' ? 'permanent_resident' : 'citizen';

  const expectedChecksum = computeChecksumDigit(cleaned.slice(0, 12));
  const actualChecksum = parseInt(cleaned[12], 10);
  if (expectedChecksum !== actualChecksum) {
    errors.push('ID number checksum is invalid.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, details: null };
  }

  const mmStr = String(mm).padStart(2, '0');
  const ddStr = String(dd).padStart(2, '0');

  return {
    valid: true,
    errors: [],
    details: {
      dateOfBirth: `${fullYear}-${mmStr}-${ddStr}`,
      gender,
      citizenship,
    },
  };
}

// ----------------------------------------------------------------------------
// Affordability calculation
// ----------------------------------------------------------------------------

export interface AffordabilityResult {
  ratio: number; // rent / income, e.g. 0.30 means rent is 30% of income
  passes: boolean; // true if rent <= 1/3 of income (standard SA rental guideline)
  maxAffordableRent: number; // income / 3, rounded to 2 decimals
}

const AFFORDABILITY_THRESHOLD = 1 / 3;

/**
 * Standard South African rental affordability guideline: rent should not
 * exceed one-third of gross monthly income. This is the same rule of thumb
 * used by most SA letting agents and credit providers, not something we
 * invented — but note it's a heuristic, not a guarantee of ability to pay.
 */
export function calculateAffordability(monthlyIncome: number, rentAmount: number): AffordabilityResult {
  if (monthlyIncome <= 0) {
    return { ratio: Infinity, passes: false, maxAffordableRent: 0 };
  }
  const ratio = rentAmount / monthlyIncome;
  return {
    ratio: Math.round(ratio * 10000) / 10000,
    passes: ratio <= AFFORDABILITY_THRESHOLD,
    maxAffordableRent: Math.round((monthlyIncome / 3) * 100) / 100,
  };
}

// ----------------------------------------------------------------------------
// Bank statement analysis — STUB
// ----------------------------------------------------------------------------

export interface BankStatementAnalysis {
  provider: 'MOCK_STUB';
  analyzed: false;
  note: string;
}

/**
 * Placeholder for real bank statement analysis (would require an Open
 * Banking integration or document-parsing/OCR service). Always returns a
 * clearly-marked non-result — this function exists so the API shape is
 * ready for a real provider to be dropped in later without changing every
 * caller.
 */
export function analyzeBankStatementStub(_documentPath: string): BankStatementAnalysis {
  return {
    provider: 'MOCK_STUB',
    analyzed: false,
    note: 'Real bank statement analysis requires an Open Banking or document-parsing integration, not yet implemented. This is a placeholder so the application flow works end-to-end.',
  };
}

// ----------------------------------------------------------------------------
// Overall risk assessment
// ----------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface RiskAssessmentInput {
  idValid: boolean;
  affordability: AffordabilityResult;
}

export interface RiskAssessmentResult {
  riskScore: number; // 0-999, HEURISTIC — not a real credit bureau score
  riskLevel: RiskLevel;
  isHeuristic: true; // always true — a flag so nothing downstream mistakes this for a real bureau score
}

/**
 * Produces a heuristic risk score in the 0-999 range (matching the schema's
 * `risk_score` column, which was designed with a real credit bureau score
 * in mind). This is NOT that — it's a deterministic score based only on ID
 * validity and affordability, until a real credit bureau is integrated.
 * `riskLevel` is what should actually drive landlord-facing UI language;
 * `riskScore` is a supporting number, not a substitute for real credit history.
 */
export function computeRiskAssessment(input: RiskAssessmentInput): RiskAssessmentResult {
  let score = 500; // neutral baseline

  if (!input.idValid) {
    score -= 300;
  }

  if (input.affordability.passes) {
    score += 200;
  } else if (input.affordability.ratio <= 0.5) {
    score += 50; // over the 1/3 guideline but not drastically
  } else {
    score -= 200; // rent is more than half of income — high risk
  }

  score = Math.max(0, Math.min(999, score));

  let riskLevel: RiskLevel;
  if (!input.idValid) {
    riskLevel = 'high';
  } else if (score >= 650) {
    riskLevel = 'low';
  } else if (score >= 400) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'high';
  }

  return { riskScore: score, riskLevel, isHeuristic: true };
}
