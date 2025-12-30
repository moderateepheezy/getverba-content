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

