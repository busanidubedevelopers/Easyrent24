import type { PropertyStatus } from './properties';
import type { ApplicationStatus } from './applications';
import type { RiskLevel } from './creditCheck';

export interface ApplicantSummary {
  id: string;
  first_name: string;
  last_name: string;
  status: ApplicationStatus;
  risk_score: number | null;
  risk_level: RiskLevel | null;
  monthly_income: number | null;
  created_at: string;
}

export type RankOrder = 'best_first' | 'attention_first';

/**
 * Ranks applicants for a property by their (heuristic) risk score.
 *
 * - 'best_first': highest risk_score (= lowest risk) first — for a landlord
 *   asking "who should I approve?"
 * - 'attention_first': lowest risk_score (= highest risk) first — for a
 *   landlord asking "who needs a closer look before I decide?"
 *
 * Applicants with no risk_score yet (never assessed via Task 8) are always
 * placed at the end, regardless of order — an unassessed applicant isn't
 * "good" or "bad", they just haven't been evaluated, and ranking them
 * alongside scored applicants would misrepresent that.
 */
export function rankApplicantsByRisk(
  applicants: ApplicantSummary[],
  order: RankOrder = 'best_first'
): ApplicantSummary[] {
  const scored = applicants.filter((a) => a.risk_score !== null);
  const unscored = applicants.filter((a) => a.risk_score === null);

  scored.sort((a, b) => {
    const diff = (a.risk_score as number) - (b.risk_score as number);
    return order === 'best_first' ? -diff : diff;
  });

  // Within the unscored group, surface the oldest applications first — those
  // are the ones most overdue for a landlord to actually assess.
  unscored.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return [...scored, ...unscored];
}

export interface StatusCounts {
  [status: string]: number;
}

/**
 * Generic counter: groups an array of items by a status-like field and
 * returns counts per value, plus a `total`. Used for both property status
 * counts and application status counts so the two summaries stay
 * consistent in shape.
 */
export function countByField<T>(items: T[], field: keyof T): StatusCounts & { total: number } {
  const counts: StatusCounts = {};
  for (const item of items) {
    const key = String(item[field] ?? 'unknown');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { ...counts, total: items.length };
}

export interface PropertyLite {
  id: string;
  status: PropertyStatus;
}

export interface ApplicationLite {
  id: string;
  status: ApplicationStatus;
  risk_level: RiskLevel | null;
  property_id: string | null;
}

export interface DashboardSummary {
  properties: StatusCounts & { total: number };
  applications: StatusCounts & { total: number };
  applicationsByRisk: StatusCounts & { total: number };
  needsAttention: ApplicationLite[];
}

/**
 * Builds the top-level landlord dashboard summary: property counts by
 * status, application counts by status and by risk level, and a
 * "needs attention" queue — applications still in 'pending' or 'reviewing'
 * that haven't reached a final decision yet.
 */
export function buildDashboardSummary(
  properties: PropertyLite[],
  applications: ApplicationLite[]
): DashboardSummary {
  const needsAttention = applications.filter(
    (a) => a.status === 'pending' || a.status === 'reviewing'
  );

  return {
    properties: countByField(properties, 'status'),
    applications: countByField(applications, 'status'),
    applicationsByRisk: countByField(applications, 'risk_level'),
    needsAttention,
  };
}
