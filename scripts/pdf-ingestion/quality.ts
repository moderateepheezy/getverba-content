/**
 * Quality Checks
 * 
 * Validates candidate quality and checks against quality gates.
 */

import type { Candidate } from './segment.js';

// Scenario token dictionaries (from existing quality gates)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address'],
  government_office: ['appointment', 'form', 'document', 'passport', 'registration', 'office', 'official', 'termin', 'formular', 'pass', 'anmeldung', 'unterlagen', 'amt', 'behörde'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time']
};

// Generic template denylist
const DENYLIST_PHRASES = [
  "in today's lesson",
  "let's practice",
  "this sentence",
  "i like to",
  "the quick brown fox",
  "lorem ipsum"
];

/**
 * Count scenario tokens in text
 */
function countScenarioTokens(text: string, requiredTokens: string[]): number {
  const textLower = text.toLowerCase();
  let count = 0;
  for (const token of requiredTokens) {
    if (textLower.includes(token.toLowerCase())) {
      count++;
    }
  }
  return count;
}

/**
 * Check if text contains banned phrases
 */
function containsBannedPhrases(text: string): boolean {
  const textLower = text.toLowerCase();
  for (const phrase of DENYLIST_PHRASES) {
    if (textLower.includes(phrase.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Check if candidate is dialogue-like (not a heading or front matter)
 */
export function isDialogueLike(candidate: Candidate): boolean {
  const text = candidate.text.trim();
  
  // Too short
  if (text.length < 10) return false;
  
  // Too long (likely a paragraph, not dialogue)
  if (text.length > 300) return false;
  
  // Check for heading patterns
  const headingPatterns = [
    /^[A-ZÄÖÜ][a-zäöüß]+\s*$/, // Single capitalized word
    /^[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+\s*$/, // Two capitalized words
    /^\d+\.\s+[A-ZÄÖÜ]/, // Numbered heading
    /^[IVX]+\.\s+[A-ZÄÖÜ]/, // Roman numeral heading
    /^Kapitel\s+\d+/i, // "Kapitel 1"
    /^Chapter\s+\d+/i, // "Chapter 1"
    /^Inhaltsverzeichnis/i, // Table of contents
    /^Contents/i,
    /^Index/i
  ];
  
  for (const pattern of headingPatterns) {
    if (pattern.test(text)) return false;
  }
  
  // Check for dialogue indicators (quotes, question marks, etc.)
  const hasDialogueIndicator = /["'„"«]/.test(text) || 
                                text.includes('?') || 
                                text.includes('!') ||
                                /^(Ich|Du|Er|Sie|Wir|Ihr|Sie)\s/.test(text) ||
                                /^(I|You|He|She|We|They)\s/.test(text);
  
  // If it has dialogue indicators, it's likely dialogue
  if (hasDialogueIndicator) return true;
  
  // Otherwise, check if it looks like a sentence (has punctuation, multiple words)
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  const hasPunctuation = /[.!?]/.test(text);
  
  return wordCount >= 3 && hasPunctuation;
}

/**
 * Check if text has concreteness marker
 */
function hasConcretenessMarker(text: string): boolean {
  // Check for digit
  if (/\d/.test(text)) return true;
  // Check for currency
  if (/[€$]/.test(text)) return true;
  // Check for time marker
  if (/\d{1,2}:\d{2}/.test(text)) return true;
  // Check for weekday
  const weekdays = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
  const textLower = text.toLowerCase();
  for (const weekday of weekdays) {
    if (textLower.includes(weekday)) return true;
  }
  return false;
}

export interface QualityCheckResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    candidatesWithScenarioTokens: number;
    candidatesWithConcreteness: number;
    candidatesWithBannedPhrases: number;
  };
}

/**
 * Check candidate quality against quality gates
 */
export function checkCandidateQuality(
  candidates: Candidate[],
  scenario: string,
  requiredTokens?: string[]
): QualityCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const tokens = requiredTokens || SCENARIO_TOKEN_DICTS[scenario] || [];
  let candidatesWithScenarioTokens = 0;
  let candidatesWithConcreteness = 0;
  let candidatesWithBannedPhrases = 0;
  
  // Check each candidate
  for (const candidate of candidates) {
    // Check for banned phrases (hard fail)
    if (containsBannedPhrases(candidate.text)) {
      candidatesWithBannedPhrases++;
      errors.push(`Candidate ${candidate.id} contains denylisted phrase: "${candidate.text.substring(0, 50)}..."`);
    }
    
    // Count scenario tokens
    const tokenCount = countScenarioTokens(candidate.text, tokens);
    if (tokenCount >= 2) {
      candidatesWithScenarioTokens++;
    } else if (tokenCount === 0 && tokens.length > 0) {
      warnings.push(`Candidate ${candidate.id} has no scenario tokens: "${candidate.text.substring(0, 50)}..."`);
    }
    
    // Check concreteness
    if (hasConcretenessMarker(candidate.text)) {
      candidatesWithConcreteness++;
    }
  }
  
  // Quality gate: At least 2 prompts must have concreteness markers
  if (candidatesWithConcreteness < 2) {
    errors.push(`Quality gate failed: Only ${candidatesWithConcreteness} candidate(s) have concreteness markers (required: 2)`);
  }
  
  // Quality gate: At least 80% of prompts should have scenario tokens (if scenario has tokens)
  if (tokens.length > 0) {
    const tokenRatio = candidatesWithScenarioTokens / candidates.length;
    if (tokenRatio < 0.8) {
      warnings.push(
        `Only ${(tokenRatio * 100).toFixed(1)}% of candidates have scenario tokens ` +
        `(recommended: 80%+, found: ${candidatesWithScenarioTokens}/${candidates.length})`
      );
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      candidatesWithScenarioTokens,
      candidatesWithConcreteness,
      candidatesWithBannedPhrases
    }
  };
}

