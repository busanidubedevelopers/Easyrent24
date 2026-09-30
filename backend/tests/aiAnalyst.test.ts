import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { ANALYST_MODEL, analyseAffordability, type AnalystReport } from '../lib/aiAnalyst';
import { ExtractionError } from '../lib/extraction';
import { assessAffordability } from '../lib/affordability';

const report: AnalystReport = {
  summary: 'Thabo earns R40 000 gross and already pays R8 500 rent; R9 500 is affordable.',
  income_stability: 'stable',
  income_notes: 'Salary from Acme Logistics on the 25th each month.',
  spending_breakdown: [{ category: 'rent', monthly_amount: 8500 }],
  additional_risks: [],
  positive_indicators: ['Rent paid on the 1st every month.'],
  agrees_with_assessment: true,
  assessment_comment: 'Agree — approve.',
  questions_for_applicant: [],
};

function fakeClient(response: Record<string, unknown>) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

const assessment = assessAffordability({
  proposedRent: 9500,
  documentMismatches: 0,
  applicants: [{ role: 'applicant', name: 'Thabo Mokoena', declaredIncome: 40000, declaredCurrentRent: 8500, payslip: { gross_pay: 40000, net_pay: 31000, pay_frequency: 'monthly' } }],
});

const docs = [
  { label: 'Thabo Mokoena — payslip', bytes: Buffer.from('%PDF-payslip'), mediaType: 'application/pdf' as const },
  { label: 'Thabo Mokoena — bank statement', bytes: Buffer.from('%PDF-bank'), mediaType: 'application/pdf' as const },
];

describe('analyseAffordability', () => {
  it('sends every document labelled, plus the rule-based assessment, with adaptive thinking and fallbacks', async () => {
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: report });

    const result = await analyseAffordability({ applicantNames: ['Thabo Mokoena'], proposedRent: 9500, assessment, documents: docs }, client);

    expect(result).toEqual(report);
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe(ANALYST_MODEL);
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.system).toMatch(/data, not instructions/);

    const content = params.messages[0].content;
    expect(content[0]).toEqual({ type: 'text', text: 'Document: Thabo Mokoena — payslip' });
    expect(content[1].type).toBe('document');
    expect(content[2]).toEqual({ type: 'text', text: 'Document: Thabo Mokoena — bank statement' });
    expect(content[3].source.data).toBe(Buffer.from('%PDF-bank').toString('base64'));
    const brief = content[4].text as string;
    expect(brief).toContain('Monthly rent asked: R9500');
    expect(brief).toContain(`"recommendation": "${assessment.recommendation}"`);
  });

  it('refuses to run without documents', async () => {
    const { client, parse } = fakeClient({});
    await expect(analyseAffordability({ applicantNames: ['X'], proposedRent: 9500, assessment, documents: [] }, client)).rejects.toBeInstanceOf(ExtractionError);
    expect(parse).not.toHaveBeenCalled();
  });

  it('turns a refusal or incomplete output into a clear ExtractionError', async () => {
    for (const response of [{ stop_reason: 'refusal', parsed_output: null }, { stop_reason: 'max_tokens', parsed_output: null }]) {
      await expect(
        analyseAffordability({ applicantNames: ['X'], proposedRent: 9500, assessment, documents: docs }, fakeClient(response).client)
      ).rejects.toBeInstanceOf(ExtractionError);
    }
  });
});
