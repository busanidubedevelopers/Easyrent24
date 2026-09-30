import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Writer } from './leasePdf';
import { formatRand, RENT_TO_GROSS_TARGET } from './affordability';
import type { DiligenceStatus, DueDiligence } from './dueDiligence';

// Printable due diligence report for the agent's file or the property owner.

const STATUS_TEXT: Record<DiligenceStatus, string> = {
  passed: 'PASSED',
  attention: 'NEEDS ATTENTION',
  failed: 'FAILED',
  outstanding: 'OUTSTANDING',
};
const STATUS_COLOR: Record<DiligenceStatus, [number, number, number]> = {
  passed: [0.05, 0.5, 0.2],
  attention: [0.75, 0.45, 0.0],
  failed: [0.75, 0.1, 0.1],
  outstanding: [0.4, 0.4, 0.45],
};
const RECOMMENDATION_TEXT = {
  approve: 'APPROVE',
  approve_with_conditions: 'APPROVE WITH CONDITIONS',
  decline: 'DECLINE',
  insufficient_information: 'NEED MORE INFORMATION',
} as const;

const date = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export async function renderDueDiligencePdf(dd: DueDiligence, preparedFor: string | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Due diligence report ${dd.reference}`);
  pdf.setProducer('EasyRent24');
  pdf.setCreator('EasyRent24');
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(pdf, fonts);
  const grey: [number, number, number] = [0.4, 0.4, 0.45];

  // ── Header
  w.text('APPLICATION DUE DILIGENCE REPORT', { size: 16, bold: true, gapAfter: 2 });
  w.text(`Reference ${dd.reference} · Generated ${date(dd.generated_at)}${preparedFor ? ` · Prepared for ${preparedFor}` : ''}`, { size: 8, color: grey, gapAfter: 2 });
  w.rule();

  w.text(`Applicant: ${dd.applicant.name}${dd.applicant.id_number ? ` (ID ${dd.applicant.id_number})` : ''}`, { bold: true, gapAfter: 1 });
  if (dd.applicant.co_applicant) w.text(`Co-applicant: ${dd.applicant.co_applicant}`, { gapAfter: 1 });
  const contact = [dd.applicant.email, dd.applicant.phone].filter(Boolean).join(' · ');
  if (contact) w.text(contact, { size: 9, color: grey, gapAfter: 1 });
  if (dd.property) w.text(`Property: ${dd.property.title}, ${dd.property.address} — rent ${formatRand(dd.property.rent)}/month`, { gapAfter: 8 });

  // ── Verdict
  w.text(`Due diligence: ${STATUS_TEXT[dd.overall]}`, { size: 13, bold: true, color: STATUS_COLOR[dd.overall], gapAfter: 2 });
  w.text(dd.overall_summary, { gapAfter: 6 });
  const a = dd.assessment;
  w.text(`System recommendation: ${RECOMMENDATION_TEXT[a.recommendation]}${a.score !== null ? ` — score ${a.score}/100` : ''}`, { size: 12, bold: true, gapAfter: 2 });
  w.text(a.headline, { gapAfter: 4 });
  if (a.conditions.length) {
    w.text('Recommended conditions:', { bold: true, gapAfter: 2 });
    for (const c of a.conditions) w.text(`• ${c}`, { gapAfter: 1 });
    w.y -= 4;
  }

  // ── Affordability figures
  w.rule();
  w.text('Affordability figures (per month)', { size: 11, bold: true, gapAfter: 4 });
  const f = a.figures;
  const basis = { verified: 'from documents', partly_verified: 'partly from documents', declared: 'declared, not verified', none: 'no information' }[f.income_basis];
  const rows: [string, string][] = [
    ['Rent asked', f.proposed_rent === null ? '—' : formatRand(f.proposed_rent)],
    ['Gross income', `${formatRand(f.gross_income)} (${basis})`],
    ['Take-home income', formatRand(f.net_income)],
    ['Current rent', f.current_rent === null ? 'not renting / unknown' : `${formatRand(f.current_rent)} (${f.current_rent_source === 'bank_statement' ? 'seen on bank statement' : 'declared'})`],
    ['Debt repayments', `${formatRand(f.debt_repayments)}${f.debt_to_net_pct !== null ? ` (${f.debt_to_net_pct}% of take-home)` : ''}`],
    ['Living costs (estimate)', formatRand(f.living_costs)],
    ['Left after rent', f.disposable_after_rent === null ? '—' : formatRand(f.disposable_after_rent)],
    ['Rent to gross income', f.rent_to_gross_pct === null ? '—' : `${f.rent_to_gross_pct}% (favourable up to ${RENT_TO_GROSS_TARGET}%)`],
    ['Maximum affordable rent', formatRand(f.max_affordable_rent)],
  ];
  for (const [k, v] of rows) w.text(`${k}: ${v}`, { size: 10, gapAfter: 1 });
  w.y -= 4;

  // ── Sections
  for (const s of dd.sections) {
    w.rule();
    w.ensure(50);
    w.text(`${s.title} — ${STATUS_TEXT[s.status]}`, { size: 11, bold: true, color: STATUS_COLOR[s.status], gapAfter: 2 });
    w.text(s.summary, { size: 9, color: grey, gapAfter: 4 });
    for (const item of s.items) {
      w.text(`[${STATUS_TEXT[item.status]}] ${item.label}: ${item.detail}`, { size: 9, color: item.status === 'passed' ? undefined : STATUS_COLOR[item.status], gapAfter: 2 });
    }
    w.y -= 2;
  }

  // ── Flags
  if (a.flags.length) {
    w.rule();
    w.text('Red flags and positives', { size: 11, bold: true, gapAfter: 4 });
    for (const flag of a.flags) {
      const tag = flag.severity === 'positive' ? '+' : flag.severity === 'high' ? '!!' : '!';
      w.text(`${tag} ${flag.text}`, { size: 9, color: flag.severity === 'positive' ? STATUS_COLOR.passed : flag.severity === 'high' ? STATUS_COLOR.failed : STATUS_COLOR.attention, gapAfter: 2 });
    }
  }

  // ── AI analyst (if run)
  if (dd.ai_report) {
    const r = dd.ai_report;
    w.rule();
    w.text('AI analyst opinion', { size: 11, bold: true, gapAfter: 4 });
    w.text(r.summary, { size: 9, gapAfter: 3 });
    w.text(`${r.agrees_with_assessment ? 'Agrees' : 'Disagrees'} with the system recommendation: ${r.assessment_comment}`, { size: 9, gapAfter: 3 });
    for (const risk of r.additional_risks) w.text(`! ${risk.finding} (${risk.evidence})`, { size: 9, color: STATUS_COLOR[risk.severity === 'high' ? 'failed' : 'attention'], gapAfter: 2 });
    if (r.questions_for_applicant.length) {
      w.text('Questions for the applicant:', { size: 9, bold: true, gapAfter: 2 });
      for (const q of r.questions_for_applicant) w.text(`? ${q}`, { size: 9, gapAfter: 1 });
    }
  }

  // ── Decision
  w.ensure(120);
  w.rule();
  w.text('Decision', { size: 11, bold: true, gapAfter: 8 });
  w.text('[  ] Approve     [  ] Approve with conditions     [  ] Decline', { gapAfter: 14 });
  w.text('Conditions / notes: ____________________________________________________________', { gapAfter: 14 });
  w.text('Name: ____________________   Signature: ____________________   Date: ____________', { gapAfter: 16 });

  w.text(
    'Prepared by EasyRent24 from documents supplied by the applicant, with their consent. The recommendation is decision support; the decision rests with the landlord or agent. This report contains personal information protected under POPIA — keep it confidential and use it only to assess this application.',
    { size: 7, color: grey }
  );

  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    page.drawText(`${dd.reference} · Page ${i + 1} of ${total}`, { x: 400, y: 28, size: 8, font: fonts.regular });
  });
  return pdf.save();
}
