/**
 * Text Normalization
 * 
 * Normalizes extracted PDF text by:
 * - Removing repeated headers/footers
 * - De-hyphenating line breaks
 * - Collapsing whitespace
 * - Removing page numbers
 * - Preserving punctuation
 */

import type { PageText } from './extract.js';

export interface NormalizationResult {
  normalizedText: string;
  actions: string[];
  headerFooterLines: string[];
}

/**
 * Detect lines that appear on >60% of pages (likely headers/footers)
 */
function detectHeaderFooterLines(pages: PageText[]): Set<string> {
  const lineCounts = new Map<string, number>();
  const headerFooterLines = new Set<string>();
  
  // If only one page, skip header/footer detection (would mark everything)
  if (pages.length <= 1) {
    return headerFooterLines;
  }
  
  // Count occurrences of each line across pages
  for (const page of pages) {
    const lines = page.text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    const seenInPage = new Set<string>();
    
    for (const line of lines) {
      // Only consider short lines (likely headers/footers)
      if (line.length < 100 && !/^\d+$/.test(line)) {
        const key = line.toLowerCase();
        if (!seenInPage.has(key)) {
          seenInPage.add(key);
          lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
        }
      }
    }
  }
  
  // Lines appearing on >60% of pages are likely headers/footers
  // But require at least 2 pages for a line to be considered
  const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
  for (const [line, count] of lineCounts.entries()) {
    if (count >= threshold) {
      headerFooterLines.add(line);
    }
  }
  
  return headerFooterLines;
}

/**
 * De-hyphenate line breaks (e.g., "Infor- mation" -> "Information")
 */
function dehyphenate(text: string): string {
  // Pattern: word ending with hyphen, followed by whitespace and continuation
  // Match: "word- \nword" or "word-\nword"
  return text
    .replace(/([a-zA-ZäöüÄÖÜß])-\s*\n\s*([a-zA-ZäöüÄÖÜß])/g, '$1$2')
    .replace(/([a-zA-ZäöüÄÖÜß])-\s+([a-zA-ZäöüÄÖÜß])/g, '$1$2');
}

/**
 * Remove page numbers (standalone numbers, especially at start/end of lines)
 */
function removePageNumbers(text: string): string {
  // Remove standalone numbers at start of line
  text = text.replace(/^\d+\s*\n?/gm, '');
  // Remove standalone numbers at end of line
  text = text.replace(/\s*\n?\d+$/gm, '');
  // Remove "Page X" or "Seite X" patterns
  text = text.replace(/\b(Page|Seite)\s+\d+/gi, '');
  return text;
}

/**
 * Normalize a single page (without header/footer detection)
 */
export function normalizeSinglePage(page: PageText): { normalizedText: string; actions: string[] } {
  const actions: string[] = [];
  let normalizedText = page.text;
  
  // De-hyphenate
  const beforeHyphen = normalizedText.length;
  normalizedText = dehyphenate(normalizedText);
  if (normalizedText.length !== beforeHyphen) {
    actions.push('De-hyphenated line breaks');
  }
  
  // Remove page numbers
  normalizedText = removePageNumbers(normalizedText);
  actions.push('Removed page numbers');
  
  // Collapse whitespace (but preserve paragraph breaks)
  normalizedText = normalizedText
    .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs -> single space
    .replace(/\n{3,}/g, '\n\n') // 3+ newlines -> 2 newlines
    .trim();
  
  actions.push('Collapsed whitespace');
  
  return { normalizedText, actions };
}

/**
 * Normalize text from PDF pages
 */
export function normalizeText(pages: PageText[]): NormalizationResult {
  const actions: string[] = [];
  const headerFooterLines = detectHeaderFooterLines(pages);
  
  // Combine all pages
  let normalizedText = pages.map(p => p.text).join('\n\n');
  
  // Remove header/footer lines
  if (headerFooterLines.size > 0) {
    const lines = normalizedText.split(/\n/);
    const filteredLines = lines.filter(line => {
      const lineLower = line.trim().toLowerCase();
      // Check if this line matches any header/footer pattern
      for (const hfLine of headerFooterLines) {
        if (lineLower === hfLine || lineLower.includes(hfLine) || hfLine.includes(lineLower)) {
          return false;
        }
      }
      return true;
    });
    normalizedText = filteredLines.join('\n');
    actions.push(`Removed ${headerFooterLines.size} header/footer line(s) appearing on >60% of pages`);
  }
  
  // De-hyphenate
  const beforeHyphen = normalizedText.length;
  normalizedText = dehyphenate(normalizedText);
  if (normalizedText.length !== beforeHyphen) {
    actions.push('De-hyphenated line breaks');
  }
  
  // Remove page numbers
  normalizedText = removePageNumbers(normalizedText);
  actions.push('Removed page numbers');
  
  // Collapse whitespace (but preserve paragraph breaks)
  normalizedText = normalizedText
    .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs -> single space
    .replace(/\n{3,}/g, '\n\n') // 3+ newlines -> 2 newlines
    .trim();
  
  actions.push('Collapsed whitespace');
  
  return {
    normalizedText,
    actions,
    headerFooterLines: Array.from(headerFooterLines)
  };
}

