/**
 * Unit tests for PDF topic encoding + text caps.
 * These constants must match web lib/pdf-source.ts — a drift here silently
 * changes what the server stores in games.source_text.
 */
import {
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_PDF_TEXT_CHARS,
  PDF_TOPIC_PREFIX,
  displayPdfTopic,
  encodePdfTopic,
  isPdfTopic,
  isPdfTruncated,
  truncatePdfText,
} from '@/lib/pdf-source';

describe('pdf constants parity', () => {
  it('matches web values', () => {
    expect(MAX_PDF_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_PDF_PAGES).toBe(30);
    expect(MAX_PDF_TEXT_CHARS).toBe(40_000);
    expect(PDF_TOPIC_PREFIX).toBe('PDF:');
  });
});

describe('isPdfTopic', () => {
  it('detects the prefix, ignoring surrounding space', () => {
    expect(isPdfTopic('PDF: notes.pdf')).toBe(true);
    expect(isPdfTopic('   PDF: notes.pdf')).toBe(true);
  });

  it('does not match ordinary topics', () => {
    expect(isPdfTopic('History of the PDF format')).toBe(false);
    expect(isPdfTopic('PDFs of the 90s')).toBe(false);
    expect(isPdfTopic('')).toBe(false);
  });

  it('is case sensitive so lowercase topics stay ordinary', () => {
    expect(isPdfTopic('pdf: notes')).toBe(false);
  });
});

describe('encodePdfTopic', () => {
  it('prefixes the filename', () => {
    expect(encodePdfTopic('notes.pdf')).toBe('PDF: notes.pdf');
  });

  it('collapses whitespace', () => {
    expect(encodePdfTopic('  my   long\tnotes.pdf ')).toBe('PDF: my long notes.pdf');
  });

  it('falls back when the name is blank', () => {
    expect(encodePdfTopic('   ')).toBe('PDF: document.pdf');
  });

  it('caps at 200 chars so the create payload stays valid', () => {
    const encoded = encodePdfTopic(`${'a'.repeat(300)}.pdf`);
    expect(encoded).toHaveLength(200);
    expect(encoded.endsWith('...')).toBe(true);
    expect(isPdfTopic(encoded)).toBe(true);
  });
});

describe('displayPdfTopic', () => {
  it('strips the prefix for display', () => {
    expect(displayPdfTopic('PDF: notes.pdf')).toBe('notes.pdf');
  });

  it('round-trips with encodePdfTopic', () => {
    expect(displayPdfTopic(encodePdfTopic('notes.pdf'))).toBe('notes.pdf');
  });

  it('leaves ordinary topics untouched', () => {
    expect(displayPdfTopic('90s movies')).toBe('90s movies');
  });

  it('keeps the raw topic when nothing follows the prefix', () => {
    expect(displayPdfTopic('PDF:')).toBe('PDF:');
  });
});

describe('truncatePdfText', () => {
  it('collapses whitespace and leaves short text alone', () => {
    expect(truncatePdfText('  one\n\ntwo   three ')).toBe('one two three');
  });

  it('keeps text that lands exactly on the cap', () => {
    const exact = 'a'.repeat(MAX_PDF_TEXT_CHARS);
    expect(truncatePdfText(exact)).toBe(exact);
  });

  it('cuts at the cap and appends a notice', () => {
    const long = 'a'.repeat(MAX_PDF_TEXT_CHARS + 5_000);
    const out = truncatePdfText(long);
    expect(out.startsWith('a'.repeat(MAX_PDF_TEXT_CHARS))).toBe(true);
    expect(out).toContain('[Document truncated for quiz generation.]');
    // The notice is allowed to push slightly past the cap, but only slightly.
    expect(out.length).toBeLessThan(MAX_PDF_TEXT_CHARS + 100);
  });
});

describe('isPdfTruncated', () => {
  it('is true only when pages were dropped', () => {
    expect(isPdfTruncated({ totalPages: 100, usedPages: 30 })).toBe(true);
    expect(isPdfTruncated({ totalPages: 30, usedPages: 30 })).toBe(false);
    expect(isPdfTruncated({ totalPages: 4, usedPages: 4 })).toBe(false);
  });
});
