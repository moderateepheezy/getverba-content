/**
 * Text Segmentation
 * 
 * Segments normalized text into candidate "utterances" that can become prompts:
 * - Dialogue lines
 * - Q/A lines
 * - Short imperative sentences
 * - Avoids long paragraphs
 */

export interface Candidate {
  id: string;
  text: string;
  charCount: number;
  type: 'dialogue' | 'question' | 'imperative' | 'sentence' | 'other';
  pageIndex?: number; // Page index (0-based) where this candidate was found
  rawText?: string; // Original text before normalization
}

export interface SegmentationResult {
  candidates: Candidate[];
  stats: {
    total: number;
    byType: Record<string, number>;
    avgLength: number;
    duplicateCount: number;
    duplicateRatio: number;
  };
}

const MAX_CANDIDATE_LENGTH = 200;
const MIN_CANDIDATE_LENGTH = 10;
const DUPLICATE_THRESHOLD = 0.25; // 25% duplicates is too high

/**
 * Check if text is mostly symbols/non-language (garbage detection)
 */
function isGarbage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_CANDIDATE_LENGTH) return true;
  
  // Count alphanumeric vs non-alphanumeric
  const alphanumeric = (trimmed.match(/[a-zA-ZäöüÄÖÜß0-9]/g) || []).length;
  const total = trimmed.length;
  const ratio = alphanumeric / total;
  
  // If less than 60% alphanumeric, likely garbage
  if (ratio < 0.6) return true;
  
  // Check for excessive symbols
  const symbolCount = (trimmed.match(/[^\w\s]/g) || []).length;
  if (symbolCount > trimmed.length * 0.4) return true;
  
  return false;
}

/**
 * Determine candidate type
 */
function determineType(text: string): Candidate['type'] {
  const trimmed = text.trim();
  
  // Dialogue (quotes or dialogue markers)
  if (/^["'„"']/.test(trimmed) || /["'""']$/.test(trimmed)) {
    return 'dialogue';
  }
  
  // Question
  if (/\?$/.test(trimmed) || /^(Wer|Was|Wo|Wann|Warum|Wie|Welche|Welcher|Welches)\b/i.test(trimmed)) {
    return 'question';
  }
  
  // Imperative (commands starting with verb)
  if (/^(Bitte|Kann|Können|Soll|Sollen|Muss|Müssen|Darf|Dürfen|Zeig|Zeige|Gib|Geben|Mach|Machen|Geh|Gehen|Komm|Kommen)\b/i.test(trimmed)) {
    return 'imperative';
  }
  
  // Regular sentence
  if (/^[A-ZÄÖÜ]/.test(trimmed) && /[.!]$/.test(trimmed)) {
    return 'sentence';
  }
  
  return 'other';
}

/**
 * Segment normalized text into candidates
 * Can optionally segment per-page to preserve page indices
 */
export function segmentText(
  normalizedText: string,
  seed: number,
  pages?: Array<{ pageNumber: number; text: string }>
): SegmentationResult {
  const candidates: Candidate[] = [];
  const seen = new Map<string, number>(); // text -> count
  
  let candidateId = 1;
  
  // If pages provided, segment per-page to preserve page indices
  if (pages && pages.length > 0) {
    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const pageText = page.text || '';
      
      if (pageText.trim().length === 0) continue;
      
      // Split by sentence boundaries, dialogue markers, and line breaks
      const segments = pageText
        .split(/(?<=[.!?])\s+|(?<=\n\n)|(?<=["'„""'])\s*|(?=\n)/)
        .map(s => s.trim())
        .filter(s => s.length >= MIN_CANDIDATE_LENGTH && s.length <= MAX_CANDIDATE_LENGTH);
      
      for (const segment of segments) {
        // Skip garbage
        if (isGarbage(segment)) continue;
        
        // Track duplicates
        const normalized = segment.toLowerCase().trim();
        seen.set(normalized, (seen.get(normalized) || 0) + 1);
        
        // Only add first occurrence (skip exact duplicates)
        if (seen.get(normalized)! > 1) continue;
        
        const type = determineType(segment);
        
        candidates.push({
          id: `c${String(candidateId).padStart(3, '0')}`,
          text: segment,
          charCount: segment.length,
          type,
          pageIndex: pageIdx, // 0-based page index
          rawText: segment
        });
        
        candidateId++;
      }
    }
  } else {
    // Fallback: segment full normalized text
    const segments = normalizedText
      .split(/(?<=[.!?])\s+|(?<=\n\n)|(?<=["'„""'])\s*|(?=\n)/)
      .map(s => s.trim())
      .filter(s => s.length >= MIN_CANDIDATE_LENGTH && s.length <= MAX_CANDIDATE_LENGTH);
    
    for (const segment of segments) {
      // Skip garbage
      if (isGarbage(segment)) continue;
      
      // Track duplicates
      const normalized = segment.toLowerCase().trim();
      seen.set(normalized, (seen.get(normalized) || 0) + 1);
      
      // Only add first occurrence (skip exact duplicates)
      if (seen.get(normalized)! > 1) continue;
      
      const type = determineType(segment);
      
      candidates.push({
        id: `c${String(candidateId).padStart(3, '0')}`,
        text: segment,
        charCount: segment.length,
        type
      });
      
      candidateId++;
    }
  }
  
  // Calculate stats
  const duplicateCount = Array.from(seen.values()).filter(c => c > 1).length;
  const duplicateRatio = candidates.length > 0 ? duplicateCount / candidates.length : 0;
  
  const byType: Record<string, number> = {};
  for (const candidate of candidates) {
    byType[candidate.type] = (byType[candidate.type] || 0) + 1;
  }
  
  const avgLength = candidates.length > 0
    ? candidates.reduce((sum, c) => sum + c.charCount, 0) / candidates.length
    : 0;
  
  return {
    candidates,
    stats: {
      total: candidates.length,
      byType,
      avgLength,
      duplicateCount,
      duplicateRatio
    }
  };
}

/**
 * Validate segmentation quality
 */
export function validateSegmentation(
  result: SegmentationResult,
  requiredCount: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check minimum candidate count
  const minRequired = Math.floor(requiredCount * 0.8);
  if (result.candidates.length < minRequired) {
    errors.push(
      `Insufficient candidates: ${result.candidates.length} found, need at least ${minRequired} ` +
      `(required: ${requiredCount} for ${Math.ceil(requiredCount / 12)} pack(s) with 12 prompts each)`
    );
  }
  
  // Check duplicate ratio
  if (result.stats.duplicateRatio > DUPLICATE_THRESHOLD) {
    errors.push(
      `Too many duplicates: ${(result.stats.duplicateRatio * 100).toFixed(1)}% ` +
      `(${result.stats.duplicateCount} duplicates, threshold: ${(DUPLICATE_THRESHOLD * 100).toFixed(0)}%)`
    );
  }
  
  // Check for too many "other" type (low quality)
  // Note: Workbook-style content may have many "other" type candidates, so we're more lenient
  // This is now just a warning in the report, not a hard error
  // The quality checks will filter out actual garbage candidates
  
  return {
    valid: errors.length === 0,
    errors
  };
}

