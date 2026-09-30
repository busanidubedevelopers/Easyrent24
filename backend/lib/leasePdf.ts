import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { LeaseDocument, LeaseSignature } from './lease';

// ============================================================================
// Lease PDF rendering (pdf-lib — pure JS, no native deps, bundles cleanly
// into the Next.js standalone build).
// ============================================================================

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 10;
const LINE_GAP = 4;

export interface LeasePdfOptions {
  /** Watermark every page, e.g. "DRAFT" before the lease is executed. */
  watermark?: string;
  documentHash?: string | null;
  signatures?: { tenant?: LeaseSignature | null; landlord?: LeaseSignature | null; tenantName: string; landlordName: string };
  reference?: string;
}

/**
 * Standard PDF fonts only cover WinAnsi (Latin-1-ish). Replace anything
 * outside it — typographic quotes are mapped, everything else becomes '?'
 * — so an unusual character in a name can never crash PDF generation.
 */
function toWinAnsi(font: PDFFont, text: string): string {
  const mapped = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ');
  const supported = new Set(font.getCharacterSet());
  return Array.from(mapped)
    .map((ch) => (ch === '\n' || supported.has(ch.codePointAt(0)!) ? ch : '?'))
    .join('');
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];

  constructor(private pdf: PDFDocument, private fonts: { regular: PDFFont; bold: PDFFont }) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 20) this.newPage();
  }

  text(text: string, opts: { size?: number; bold?: boolean; gapAfter?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? BODY_SIZE;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const lines = wrap(font, toWinAnsi(font, text), size, PAGE_WIDTH - MARGIN * 2);
    for (const line of lines) {
      this.ensure(size + LINE_GAP);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y - size,
        size,
        font,
        color: opts.color ? rgb(...opts.color) : rgb(0.1, 0.1, 0.12),
      });
      this.y -= size + LINE_GAP;
    }
    this.y -= opts.gapAfter ?? 6;
  }

  rule() {
    this.ensure(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 4 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y - 4 },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.78),
    });
    this.y -= 12;
  }
}

function signatureBlock(w: Writer, role: string, name: string, sig: LeaseSignature | null | undefined) {
  w.ensure(90);
  w.text(role, { bold: true, gapAfter: 2 });
  if (sig) {
    w.text(`Signed electronically by ${sig.name}`, { size: 12, bold: true, gapAfter: 2, color: [0.05, 0.25, 0.55] });
    w.text(`Date/time: ${new Date(sig.signed_at).toISOString().replace('T', ' ').slice(0, 19)} UTC`, { size: 8, gapAfter: 1 });
    w.text(`IP address: ${sig.ip ?? 'not recorded'}`, { size: 8, gapAfter: 1 });
    w.text(`Document fingerprint: ${sig.document_hash}`, { size: 8, gapAfter: 10 });
  } else {
    w.text(`${name}: ____________________________   Date: ______________`, { gapAfter: 14 });
  }
}

export async function renderLeasePdf(doc: LeaseDocument, options: LeasePdfOptions = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setProducer('EasyRent24');
  pdf.setCreator('EasyRent24');

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const w = new Writer(pdf, fonts);

  w.text(doc.title.toUpperCase(), { size: 16, bold: true, gapAfter: 2 });
  if (options.reference) w.text(`Reference: ${options.reference}`, { size: 8, gapAfter: 2, color: [0.4, 0.4, 0.45] });
  w.rule();

  for (const section of doc.sections) {
    w.ensure(40);
    w.text(section.heading, { size: 11, bold: true, gapAfter: 3 });
    for (const paragraph of section.paragraphs) w.text(paragraph);
    w.y -= 4;
  }

  if (options.signatures) {
    const { tenant, landlord, tenantName, landlordName } = options.signatures;
    w.ensure(220);
    w.rule();
    w.text('Signatures', { size: 11, bold: true, gapAfter: 8 });
    signatureBlock(w, 'Tenant', tenantName, tenant);
    signatureBlock(w, 'Landlord', landlordName, landlord);
  }

  if (options.documentHash) {
    w.text(
      `SHA-256 fingerprint of the lease text: ${options.documentHash}. Any change to the text produces a different fingerprint.`,
      { size: 7, color: [0.45, 0.45, 0.5] }
    );
  }

  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    page.drawText(`Page ${i + 1} of ${total}`, {
      x: PAGE_WIDTH - MARGIN - 60,
      y: MARGIN / 2,
      size: 8,
      font: fonts.regular,
      color: rgb(0.5, 0.5, 0.55),
    });
    if (options.watermark) {
      page.drawText(options.watermark, {
        x: 150,
        y: 300,
        size: 110,
        font: fonts.bold,
        color: rgb(0.85, 0.85, 0.88),
        rotate: degrees(40),
        opacity: 0.35,
      });
    }
  });

  return pdf.save();
}
