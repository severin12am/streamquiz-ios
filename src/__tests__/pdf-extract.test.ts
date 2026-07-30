/**
 * Native PDFKit extraction wrapper — caps, error mapping, and the minimum-text
 * gate that keeps scanned (image-only) PDFs from reaching create-game.
 * The native module is mocked; this covers our logic, not PDFKit.
 */
jest.mock('expo-pdf-text-extract', () => ({
  isAvailable: jest.fn(() => true),
  getPageCount: jest.fn(),
  extractTextFromPage: jest.fn(),
}));

import {
  extractTextFromPage,
  getPageCount,
  isAvailable,
} from 'expo-pdf-text-extract';
import {
  MIN_PDF_TEXT_CHARS,
  PdfExtractError,
  extractPdfSource,
} from '@/lib/extract-pdf-text';
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from '@/lib/pdf-source';

const mockAvailable = isAvailable as jest.Mock;
const mockPageCount = getPageCount as jest.Mock;
const mockPageText = extractTextFromPage as jest.Mock;

const args = { uri: 'file:///cache/DocumentPicker/abc.pdf', fileName: 'notes.pdf' };

/** Text comfortably above the gate. */
const REAL_PAGE = 'The mitochondria is the powerhouse of the cell, and much more.';

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof PdfExtractError) return e.code;
    throw e;
  }
  throw new Error('expected extractPdfSource to reject');
}

describe('minimum text gate', () => {
  it('rejects a scan with no extractable text', async () => {
    mockPageCount.mockResolvedValue(100);
    mockPageText.mockResolvedValue('');
    expect(await codeOf(extractPdfSource(args))).toBe('not_enough_text');
  });

  // Regression: the "[Quiz uses the first N of M pages.]" note is ~38-40 chars.
  // When the gate ran after appending it, the note alone could satisfy the
  // threshold and an empty scan would sail through to create-game.
  it('rejects an empty scan no matter how many pages it claims', async () => {
    mockPageText.mockResolvedValue('');
    for (const totalPages of [100, 1_000, 10_000]) {
      mockPageCount.mockResolvedValue(totalPages);
      expect(await codeOf(extractPdfSource(args))).toBe('not_enough_text');
    }
  });

  it('rejects a scan that yields only a stray heading', async () => {
    mockPageCount.mockResolvedValue(100);
    mockPageText.mockImplementation(async (_uri: string, page: number) =>
      page === 1 ? 'Chapter 1' : '',
    );
    expect(await codeOf(extractPdfSource(args))).toBe('not_enough_text');
  });

  it('accepts text that just clears the threshold', async () => {
    mockPageCount.mockResolvedValue(1);
    mockPageText.mockResolvedValue('x'.repeat(MIN_PDF_TEXT_CHARS));
    await expect(extractPdfSource(args)).resolves.toMatchObject({
      totalPages: 1,
      usedPages: 1,
    });
  });
});

describe('page cap', () => {
  it('reads only the first MAX_PDF_PAGES and notes the truncation', async () => {
    mockPageCount.mockResolvedValue(120);
    mockPageText.mockResolvedValue(REAL_PAGE);

    const source = await extractPdfSource(args);

    expect(mockPageText).toHaveBeenCalledTimes(MAX_PDF_PAGES);
    expect(source.usedPages).toBe(MAX_PDF_PAGES);
    expect(source.totalPages).toBe(120);
    expect(source.text).toContain(`[Quiz uses the first ${MAX_PDF_PAGES} of 120 pages.]`);
  });

  it('adds no truncation note when the whole file fits', async () => {
    mockPageCount.mockResolvedValue(3);
    mockPageText.mockResolvedValue(REAL_PAGE);

    const source = await extractPdfSource(args);

    expect(source.usedPages).toBe(3);
    expect(source.text).not.toContain('[Quiz uses the first');
  });

  it('skips pages the native module cannot read', async () => {
    mockPageCount.mockResolvedValue(3);
    mockPageText.mockImplementation(async (_uri: string, page: number) => {
      if (page === 2) throw new Error('page broken');
      return REAL_PAGE;
    });

    await expect(extractPdfSource(args)).resolves.toMatchObject({ usedPages: 3 });
  });
});

describe('input validation', () => {
  it('reports an unavailable native module', async () => {
    mockAvailable.mockReturnValue(false);
    expect(await codeOf(extractPdfSource(args))).toBe('unavailable');
  });

  it('rejects non-PDF files', async () => {
    expect(await codeOf(extractPdfSource({ ...args, fileName: 'notes.txt' }))).toBe(
      'not_pdf',
    );
  });

  it('rejects files over the size cap before opening them', async () => {
    expect(await codeOf(extractPdfSource({ ...args, size: MAX_PDF_BYTES + 1 }))).toBe(
      'too_large',
    );
    expect(mockPageCount).not.toHaveBeenCalled();
  });

  it('still attempts extraction when the picker reports no size', async () => {
    mockPageCount.mockResolvedValue(1);
    mockPageText.mockResolvedValue(REAL_PAGE);
    await expect(extractPdfSource({ ...args, size: null })).resolves.toBeTruthy();
  });
});

describe('native error mapping', () => {
  it.each(['PASSWORD_REQUIRED', 'INCORRECT_PASSWORD'])(
    'maps %s to a password error',
    async (code) => {
      mockPageCount.mockRejectedValue(Object.assign(new Error('locked'), { code }));
      expect(await codeOf(extractPdfSource(args))).toBe('password');
    },
  );

  it('maps other open failures to a read error', async () => {
    mockPageCount.mockRejectedValue(
      Object.assign(new Error('bad'), { code: 'PDF_LOAD_ERROR' }),
    );
    expect(await codeOf(extractPdfSource(args))).toBe('read_failed');
  });

  it('treats a zero page count as unreadable', async () => {
    mockPageCount.mockResolvedValue(0);
    expect(await codeOf(extractPdfSource(args))).toBe('read_failed');
  });
});
