/**
 * Native PDF text extraction (PDFKit on iOS via expo-pdf-text-extract).
 * Never uploads the PDF binary — only returns capped source text for create-game.
 */
import {
  extractTextFromPage,
  getPageCount,
  isAvailable,
} from 'expo-pdf-text-extract';
import {
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  truncatePdfText,
  type PdfSource,
} from '@/lib/pdf-source';

export class PdfExtractError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'unavailable'
      | 'empty'
      | 'too_large'
      | 'not_pdf'
      | 'not_enough_text'
      | 'read_failed'
      | 'password',
  ) {
    super(message);
    this.name = 'PdfExtractError';
  }
}

export function pdfExtractAvailable(): boolean {
  try {
    return isAvailable();
  } catch {
    return false;
  }
}

function isPdfName(name: string | undefined, mime: string | undefined): boolean {
  if (mime === 'application/pdf') return true;
  return Boolean(name?.toLowerCase().endsWith('.pdf'));
}

/**
 * Extract capped text from a local PDF (file:// or absolute path).
 * Reads only the first MAX_PDF_PAGES pages, then applies the char cap.
 */
export async function extractPdfSource(args: {
  uri: string;
  fileName: string;
  size?: number | null;
  mimeType?: string | null;
}): Promise<PdfSource> {
  if (!pdfExtractAvailable()) {
    throw new PdfExtractError(
      'PDF extraction requires a development build.',
      'unavailable',
    );
  }

  const fileName = args.fileName || 'document.pdf';
  if (!isPdfName(fileName, args.mimeType ?? undefined)) {
    throw new PdfExtractError('Please choose a PDF file.', 'not_pdf');
  }

  const size = typeof args.size === 'number' ? args.size : 0;
  if (size > 0 && size > MAX_PDF_BYTES) {
    throw new PdfExtractError('PDF is too large (max 20 MB).', 'too_large');
  }
  if (size === 0) {
    // Size can be missing from some pickers; still try to open. Empty files fail below.
  }

  const path = args.uri;
  let totalPages: number;
  try {
    totalPages = await getPageCount(path);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'PASSWORD_REQUIRED' || code === 'INCORRECT_PASSWORD') {
      throw new PdfExtractError(
        'This PDF is password-protected. Try an unlocked copy.',
        'password',
      );
    }
    throw new PdfExtractError('Could not read that PDF.', 'read_failed');
  }

  if (!totalPages || totalPages < 1) {
    throw new PdfExtractError('Could not read that PDF.', 'read_failed');
  }

  const usedPages = Math.min(totalPages, MAX_PDF_PAGES);
  const pageTexts: string[] = [];
  for (let i = 1; i <= usedPages; i++) {
    try {
      const pageText = (await extractTextFromPage(path, i)).replace(/\s+/g, ' ').trim();
      if (pageText) pageTexts.push(pageText);
    } catch {
      // Skip unreadable pages; emptiness is checked after merge.
    }
  }

  let text = truncatePdfText(pageTexts.join('\n\n'));
  if (totalPages > usedPages) {
    text = `${text}\n\n[Quiz uses the first ${usedPages} of ${totalPages} pages.]`;
  }

  if (text.replace(/\s+/g, ' ').trim().length < 40) {
    throw new PdfExtractError(
      'Could not read enough text from that PDF. Try a text-based PDF (not a scanned image).',
      'not_enough_text',
    );
  }

  return {
    fileName,
    text,
    totalPages,
    usedPages,
  };
}
