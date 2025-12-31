/**
 * Scenario-Aware Candidate Scoring
 * 
 * Scores candidates based on how well they match the requested scenario.
 */

import type { Candidate } from './segment.js';
import { normalizeForMatching, matchesPhrase } from './textNormalize.js';

export interface ScoreBreakdown {
  totalScore: number;
  scenarioTokenHits: number;
  strongTokenHits: number;
  dialogueBonus: number;
  concretenessBonus: number;
  headingPenalty: number;
  lengthPenalty: number;
  matchedTokens: string[];
  reasons: string[];
}

const GERMAN_PRONOUNS = ['ich', 'wir', 'sie', 'Sie', 'du', 'ihr', 'er', 'es'];
const ENGLISH_PRONOUNS = ['i', 'we', 'you', 'he', 'she', 'they', 'it'];

/**
 * Check if text looks like dialogue
 */
function looksLikeDialogue(text: string, language: 'de' | 'en'): boolean {
  // Contains colon (speaker lines)
  if (/:/.test(text)) {
    return true;
  }
  
  // Contains question mark
  if (/\?/.test(text)) {
    return true;
  }
  
  // Contains language-specific pronouns
  const pronouns = language === 'de' ? GERMAN_PRONOUNS : ENGLISH_PRONOUNS;
  const textLower = text.toLowerCase();
  return pronouns.some(pronoun => 
    new RegExp(`\\b${pronoun}\\b`, 'i').test(textLower)
  );
}

/**
 * Check if text looks like a heading/title
 */
function looksLikeHeading(text: string): boolean {
  const trimmed = text.trim();
  
  // Very short without punctuation
  if (trimmed.length < 35 && !/[.!?]/.test(trimmed)) {
    return true;
  }
  
  // ALL CAPS
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && /[A-ZÄÖÜ]/.test(trimmed)) {
    return true;
  }
  
  // Title Case short lines
  if (trimmed.length < 60 && /^[A-ZÄÖÜ][a-zäöüß]/.test(trimmed) && !/[.!?]$/.test(trimmed)) {
    return true;
  }
  
  // Contains chapter/table of contents indicators
  if (/^(Chapter|Kapitel|Table of Contents|Inhalt|INTRODUCTION|EINLEITUNG)/i.test(trimmed)) {
    return true;
  }
  
  return false;
}

/**
 * Count concreteness markers
 */
export function countConcretenessMarkers(text: string): number {
  let count = 0;
  
  // Digits
  if (/\d/.test(text)) count++;
  
  // Currency
  if (/[€$]/.test(text)) count++;
  
  // Time markers
  if (/\d{1,2}:\d{2}/.test(text)) count++;
  
  // Weekdays
  const weekdays = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
  const textLower = text.toLowerCase();
  for (const weekday of weekdays) {
    if (textLower.includes(weekday)) {
      count++;
      break;
    }
  }
  
  return count;
}

/**
 * Count scenario token hits with phrase support
 */
function countScenarioTokenHits(
  text: string,
  scenarioTokens: string[],
  strongTokens?: string[]
): { totalHits: number; strongHits: number; matchedTokens: string[] } {
  const normalizedText = normalizeForMatching(text);
  let hits = 0;
  let strongHits = 0;
  const matchedTokens: string[] = [];
  
  for (const token of scenarioTokens) {
    if (matchesPhrase(normalizedText, token)) {
      hits++;
      matchedTokens.push(token);
      
      // Check if it's a strong token
      if (strongTokens && strongTokens.includes(token)) {
        strongHits++;
      }
    }
  }
  
  return { totalHits: hits, strongHits, matchedTokens };
}

/**
 * Score a candidate for scenario match
 */
export function scoreCandidate(
  candidate: Candidate,
  scenarioTokens: string[],
  language: 'de' | 'en' = 'de',
  minScenarioHits: number = 2,
  strongTokens?: string[]
): ScoreBreakdown {
  const reasons: string[] = [];
  let totalScore = 0;
  
  // Scenario token hits (with phrase support)
  const tokenResult = countScenarioTokenHits(candidate.text, scenarioTokens, strongTokens);
  const scenarioTokenHits = tokenResult.totalHits;
  const strongTokenHits = tokenResult.strongHits;
  
  totalScore += scenarioTokenHits * 5; // 5 points per token
  totalScore += strongTokenHits * 3; // Bonus for strong tokens
  
  if (scenarioTokenHits > 0) {
    reasons.push(`${scenarioTokenHits} scenario token(s)`);
    if (strongTokenHits > 0) {
      reasons.push(`${strongTokenHits} strong token(s)`);
    }
  }
  
  // Dialogue bonus
  let dialogueBonus = 0;
  if (looksLikeDialogue(candidate.text, language)) {
    if (/:/.test(candidate.text)) {
      dialogueBonus += 3;
      reasons.push('dialogue pattern (speaker line)');
    } else if (/\?/.test(candidate.text)) {
      dialogueBonus += 2;
      reasons.push('question pattern');
    } else {
      dialogueBonus += 2;
      reasons.push('pronoun usage (dialogue-like)');
    }
  }
  totalScore += dialogueBonus;
  
  // Concreteness bonus
  const concretenessCount = countConcretenessMarkers(candidate.text);
  const concretenessBonus = concretenessCount;
  totalScore += concretenessBonus;
  if (concretenessCount > 0) {
    reasons.push(`${concretenessCount} concreteness marker(s)`);
  }
  
  // Heading penalty
  let headingPenalty = 0;
  if (looksLikeHeading(candidate.text)) {
    headingPenalty = -5;
    totalScore += headingPenalty;
    reasons.push('heading-like (penalty)');
  }
  
  // Length penalties
  let lengthPenalty = 0;
  if (candidate.charCount < 35) {
    lengthPenalty = -3;
    totalScore += lengthPenalty;
    reasons.push('too short (penalty)');
  } else if (candidate.charCount > 200) {
    lengthPenalty = -3;
    totalScore += lengthPenalty;
    reasons.push('too long (penalty)');
  }
  
  return {
    totalScore,
    scenarioTokenHits,
    strongTokenHits,
    dialogueBonus,
    concretenessBonus,
    headingPenalty,
    lengthPenalty,
    matchedTokens: tokenResult.matchedTokens,
    reasons
  };
}

