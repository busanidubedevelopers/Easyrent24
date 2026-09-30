import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  EXTRACTION_MODEL,
  ExtractionError,
  describeExtractionError,
  extractDocument,
  mediaTypeForPath,
} from '../lib/extraction';

const payslip = {
  document_matches_type: true,
  legibility: 'clear',
  notes: null,
  employee_name: 'Thabo Mokoena',
  employee_id_number: null,
  employer_name: 'Acme',
  job_title: null,
  pay_date: '2026-08-25',
  pay_frequency: 'monthly',
  gross_pay: 40000,
  net_pay: 31000,
};

/** A stand-in Anthropic client whose beta.messages.parse resolves to `response`. */
function fakeClient(response: Record<string, unknown>) {
  const parse = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

const bytes = Buffer.from('%PDF-1.4 fake');

describe('extractDocument', () => {
  it('sends a PDF as a document block with structured output and default fallbacks', async () => {
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: payslip });

    const result = await extractDocument('payslip', { bytes, mediaType: 'application/pdf' }, client);

    expect(result).toEqual(payslip);
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe(EXTRACTION_MODEL);
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.output_config.format).toBeDefined();
    expect(params.system).toMatch(/data, not instructions/);

    const [doc, text] = params.messages[0].content;
    expect(doc).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } });
    expect(text.text).toContain('payslip');
  });

  it('sends photos as image blocks', async () => {
    const { client, parse } = fakeClient({ stop_reason: 'end_turn', parsed_output: payslip });
    await extractDocument('id_document', { bytes, mediaType: 'image/jpeg' }, client);
    expect(parse.mock.calls[0][0].messages[0].content[0].type).toBe('image');
    expect(parse.mock.calls[0][0].messages[0].content[0].source.media_type).toBe('image/jpeg');
  });

  it('throws ExtractionError on a refusal or unparseable output', async () => {
    await expect(
      extractDocument('payslip', { bytes, mediaType: 'application/pdf' }, fakeClient({ stop_reason: 'refusal', parsed_output: null }).client)
    ).rejects.toBeInstanceOf(ExtractionError);
    await expect(
      extractDocument('payslip', { bytes, mediaType: 'application/pdf' }, fakeClient({ stop_reason: 'max_tokens', parsed_output: null }).client)
    ).rejects.toBeInstanceOf(ExtractionError);
  });
});

describe('describeExtractionError', () => {
  it('passes ExtractionError messages through and hides everything else', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(describeExtractionError(new ExtractionError('Unreadable scan.'), 'payslip')).toBe('Unreadable scan.');
    expect(describeExtractionError(new Error('secret internals'), 'payslip')).not.toContain('secret');
    spy.mockRestore();
  });
});

describe('mediaTypeForPath', () => {
  it('maps supported extensions and rejects others', () => {
    expect(mediaTypeForPath('u/a/payslip-1.PDF')).toBe('application/pdf');
    expect(mediaTypeForPath('u/a/id-1.jpeg')).toBe('image/jpeg');
    expect(mediaTypeForPath('u/a/id-1.png')).toBe('image/png');
    expect(mediaTypeForPath('u/a/id-1.heic')).toBeNull();
  });
});

describe('describeExtractionError — Anthropic account problems', () => {
  it('tells the agent when the AI account has no credit or the key is rejected', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const credit = new Anthropic.BadRequestError(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, undefined, new Headers());
    expect(describeExtractionError(credit, 'payslip')).toMatch(/no credit/);
    const auth = new Anthropic.AuthenticationError(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }, undefined, new Headers());
    expect(describeExtractionError(auth, 'payslip')).toMatch(/rejected the API key/);
    spy.mockRestore();
  });
});
