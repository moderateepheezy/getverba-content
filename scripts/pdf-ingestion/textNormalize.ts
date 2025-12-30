/**
 * Text Normalization for Matching
 * 
 * Normalizes text for scenario token matching:
 * - Lowercase
 * - Normalize umlauts: ä->ae, ö->oe, ü->ue, ß->ss
 * - Strip punctuation
 * - Collapse whitespace
 */

/**
 * Normalize text for token matching
 */
export function normalizeForMatching(text: string): string {
  let normalized = text.toLowerCase();
  
  // Normalize umlauts and ß
  normalized = normalized
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/Ä/g, 'ae')
    .replace(/Ö/g, 'oe')
    .replace(/Ü/g, 'ue');
  
  // Strip punctuation (keep spaces for phrase matching)
  normalized = normalized.replace(/[^\w\s]/g, ' ');
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Check if a phrase token matches in normalized text
 * Uses word-boundary-like matching for phrases
 */
export function matchesPhrase(normalizedText: string, phrase: string): boolean {
  const normalizedPhrase = normalizeForMatching(phrase);
  
  // For single words, use word boundary
  if (!normalizedPhrase.includes(' ')) {
    const regex = new RegExp(`\\b${normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(normalizedText);
  }
  
  // For phrases, check if all words appear in sequence
  // This is more lenient than strict word boundaries for phrases
  const phraseWords = normalizedPhrase.split(/\s+/).filter(w => w.length > 0);
  if (phraseWords.length === 0) return false;
  
  // Find first word
  let searchStart = 0;
  for (let i = 0; i < phraseWords.length; i++) {
    const word = phraseWords[i];
    const wordIndex = normalizedText.indexOf(word, searchStart);
    
    if (wordIndex === -1) {
      return false;
    }
    
    // For subsequent words, check they appear close together (within reasonable distance)
    if (i > 0) {
      const prevWordEnd = searchStart;
      const distance = wordIndex - prevWordEnd;
      // Allow up to 50 chars between words (for punctuation/formatting)
      if (distance > 50) {
        return false;
      }
    }
    
    searchStart = wordIndex + word.length;
  }
  
  return true;
}

