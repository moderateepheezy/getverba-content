/**
 * PDF Text Extraction (Text-First)
 * 
 * Extracts text from PDFs with text-first approach.
 * Detects scanned PDFs and fails fast unless OCR is enabled.
 */

import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export interface PageText {
  pageNumber: number;
  text: string;
  charCount: number;
}

export interface ExtractionResult {
  pages: PageText[];
  method: 'text' | 'ocr';
  warnings: string[];
  pageCount: number;
  totalChars: number;
  avgCharsPerPage: number;
}

const MIN_TOTAL_CHARS = 2000;
const MIN_CHARS_PER_PAGE = 250;

/**
 * Extract text from PDF using pdf-parse (text-first)
 */
export async function extractPdfTextTextFirst(
  pdfPath: string,
  ocrEnabled: boolean = false
): Promise<ExtractionResult> {
  const warnings: string[] = [];
  
  try {
    // Dynamic import to handle optional dependency
    // Use require for pdf-parse as it works better with older versions
    const pdfParse = require('pdf-parse');
    const dataBuffer = readFileSync(pdfPath);
    const pdfData = await pdfParse(dataBuffer);
    
    const pageCount = pdfData.numpages;
    const fullText = pdfData.text || '';
    
    // Try to extract per-page text if available
    const pages: PageText[] = [];
    
    // pdf-parse doesn't always provide per-page text, so we'll split by page breaks
    // This is a heuristic - actual page boundaries may vary
    const pageTexts = fullText.split(/\f+/).filter(t => t.trim().length > 0);
    
    if (pageTexts.length === 0 && fullText.trim().length === 0) {
      // No text extracted at all
      if (!ocrEnabled) {
        throw new Error('ERR_PDF_SCAN_UNSUPPORTED: PDF appears to be scanned/image-only. No text could be extracted. Use --ocr=on to enable OCR (not yet implemented).');
      }
      // OCR would go here (stub for now)
      throw new Error('ERR_OCR_NOT_IMPLEMENTED: OCR support is not yet implemented. Please use a text-based PDF or export the PDF as searchable text.');
    }
    
    // Build page array
    for (let i = 0; i < Math.max(pageCount, pageTexts.length); i++) {
      const pageText = pageTexts[i] || '';
      pages.push({
        pageNumber: i + 1,
        text: pageText.trim(),
        charCount: pageText.length
      });
    }
    
    const totalChars = pages.reduce((sum, p) => sum + p.charCount, 0);
    const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : 0;
    
    // Check if text is too sparse (scanned PDF heuristic)
    if (totalChars < MIN_TOTAL_CHARS || avgCharsPerPage < MIN_CHARS_PER_PAGE) {
      if (!ocrEnabled) {
        throw new Error(
          `ERR_PDF_SCAN_UNSUPPORTED: PDF appears to be scanned/image-only. ` +
          `Extracted only ${totalChars} characters (minimum ${MIN_TOTAL_CHARS}) ` +
          `with ${avgCharsPerPage.toFixed(0)} chars/page average (minimum ${MIN_CHARS_PER_PAGE}). ` +
          `Use --ocr=on to enable OCR (not yet implemented), or export the PDF as searchable text.`
        );
      }
      // OCR would go here (stub for now)
      warnings.push(`Low text density detected. OCR recommended but not yet implemented.`);
    }
    
    if (pageTexts.length < pageCount) {
      warnings.push(`Could not extract per-page text for all ${pageCount} pages. Using full text.`);
    }
    
    return {
      pages,
      method: 'text',
      warnings,
      pageCount,
      totalChars,
      avgCharsPerPage
    };
  } catch (error: any) {
    if (error.message.includes('ERR_PDF_SCAN_UNSUPPORTED') || error.message.includes('ERR_OCR_NOT_IMPLEMENTED')) {
      throw error;
    }
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'pdf-parse is not installed. Install it with: npm install --save-dev pdf-parse'
      );
    }
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Compute PDF fingerprint (SHA256 hash)
 */
export function computePdfFingerprint(pdfPath: string): string {
  const dataBuffer = readFileSync(pdfPath);
  return createHash('sha256').update(dataBuffer).digest('hex');
}

