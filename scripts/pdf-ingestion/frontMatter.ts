/**
 * Front Matter Detection
 * 
 * Detects and skips front matter pages (TOC, intro, copyright, etc.)
 */

import type { PageText } from './extract.js';

export interface FrontMatterResult {
  skipUntilPageIndex: number;
  evidence: {
    frontMatterPages: number[];
    reasons: string[];
    firstContentPage: number;
  };
}

const FRONT_MATTER_KEYWORDS = [
  'Inhalt',
  'Table of Contents',
  'Contents',
  'Kapitel',
  'Chapter',
  'Einleitung',
  'Introduction',
  'Vorwort',
  'Preface',
  'ISBN',
  'OER',
  'Copyright',
  'Library of Congress',
  'Manufactured in',
  'Contributors',
  'Produced by',
  'Second Edition',
  'Creative Commons'
];

/**
 * Check if a line looks like a heading
 */
function isHeadingLike(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  
  // Very short lines without punctuation are likely headings
  if (trimmed.length < 40 && !/[.!?]/.test(trimmed)) {
    return true;
  }
  
  // ALL CAPS lines are likely headings
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-ZÄÖÜ]/.test(trimmed)) {
    return true;
  }
  
  // Title Case short lines are likely headings
  if (trimmed.length < 60 && /^[A-ZÄÖÜ][a-zäöüß]/.test(trimmed) && !/[.!?]$/.test(trimmed)) {
    return true;
  }
  
  return false;
}

/**
 * Calculate heading ratio for a page
 */
function calculateHeadingRatio(page: PageText): number {
  const lines = page.text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return 0;
  
  const headingLines = lines.filter(isHeadingLike);
  return headingLines.length / lines.length;
}

/**
 * Calculate punctuation density (sentences per 1000 chars)
 */
function calculatePunctuationDensity(page: PageText): number {
  const punctuationCount = (page.text.match(/[.!?]/g) || []).length;
  return (punctuationCount / page.text.length) * 1000;
}

/**
 * Check if page contains front matter keywords
 */
function hasFrontMatterKeywords(page: PageText): boolean {
  const textLower = page.text.toLowerCase();
  return FRONT_MATTER_KEYWORDS.some(keyword => 
    textLower.includes(keyword.toLowerCase())
  );
}

/**
 * Check if page looks like normal prose/dialogue
 */
function looksLikeContent(page: PageText): boolean {
  const headingRatio = calculateHeadingRatio(page);
  const punctuationDensity = calculatePunctuationDensity(page);
  
  // Normal content has:
  // - Low heading ratio (< 40%)
  // - Higher punctuation density (> 5 per 1000 chars)
  // - Reasonable length (> 200 chars)
  
  return page.text.length > 200 &&
         headingRatio < 0.4 &&
         punctuationDensity > 5;
}

/**
 * Detect front matter pages
 */
export function detectFrontMatterPages(
  pages: PageText[],
  maxPages: number = 40
): FrontMatterResult {
  const frontMatterPages: number[] = [];
  const reasons: string[] = [];
  let firstContentPage = -1;
  
  // Check pages up to maxPages
  const checkLimit = Math.min(maxPages, pages.length);
  
  for (let i = 0; i < checkLimit; i++) {
    const page = pages[i];
    let frontMatterScore = 0;
    const pageReasons: string[] = [];
    
    // Check for keywords
    if (hasFrontMatterKeywords(page)) {
      frontMatterScore += 2;
      pageReasons.push('contains front matter keywords');
    }
    
    // Check heading ratio
    const headingRatio = calculateHeadingRatio(page);
    if (headingRatio > 0.6) {
      frontMatterScore += 2;
      pageReasons.push(`high heading ratio (${(headingRatio * 100).toFixed(0)}%)`);
    }
    
    // Check punctuation density
    const punctuationDensity = calculatePunctuationDensity(page);
    if (punctuationDensity < 3) {
      frontMatterScore += 1;
      pageReasons.push(`low sentence density (${punctuationDensity.toFixed(1)} per 1000 chars)`);
    }
    
    // Mark as front matter if 2+ indicators
    if (frontMatterScore >= 2) {
      frontMatterPages.push(i);
      if (pageReasons.length > 0) {
        reasons.push(`Page ${i + 1}: ${pageReasons.join(', ')}`);
      }
    }
    
    // Track first content page (2 consecutive content pages)
    if (firstContentPage === -1 && looksLikeContent(page)) {
      // Check if next page also looks like content
      if (i + 1 < pages.length && looksLikeContent(pages[i + 1])) {
        firstContentPage = i;
      }
    }
  }
  
  // Determine skip index
  let skipUntilPageIndex = 0;
  
  if (frontMatterPages.length > 0) {
    // Skip until first content page, or end of front matter cluster
    if (firstContentPage >= 0) {
      skipUntilPageIndex = firstContentPage;
    } else {
      // If no clear content page found, skip the last front matter page + 1
      skipUntilPageIndex = Math.max(...frontMatterPages) + 1;
    }
  }
  
  // Don't skip more than maxPages
  skipUntilPageIndex = Math.min(skipUntilPageIndex, maxPages);
  
  return {
    skipUntilPageIndex,
    evidence: {
      frontMatterPages,
      reasons,
      firstContentPage: firstContentPage >= 0 ? firstContentPage : skipUntilPageIndex
    }
  };
}

