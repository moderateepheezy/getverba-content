#!/usr/bin/env tsx

/**
 * Deterministic Analytics Computation
 * 
 * Computes analytics metrics from pack/drill entries deterministically.
 * No ML/LLM runtime - pure computation from normalized tokens and metadata.
 * 
 * Usage:
 *   import { computePackAnalytics } from './computeAnalytics';
 *   const analytics = computePackAnalytics(packEntry);
 */

// Scenario token dictionaries (from QUALITY_GATES.md)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time'],
  government_office: ['termin', 'formular', 'anmeldung', 'bescheinigung', 'unterlagen', 'ausweis', 'amt', 'beamte', 'sachbearbeiter', 'aufenthaltserlaubnis', 'pass', 'bürgeramt', 'ausländeramt', 'jobcenter', 'krankenkasse'],
  friends_small_talk: ['wochenende', 'heute', 'morgen', 'spaeter', 'abends', 'zeit', 'lust', 'plan', 'idee', 'treffen', 'mitkommen', 'kino', 'cafe', 'restaurant', 'spaziergang', 'park', 'training', 'gym', 'serie', 'film', 'konzert', 'bar', 'pizza', 'kaffee', 'hast du lust', 'lass uns', 'wie waere es', 'hast du zeit', 'wollen wir', 'ich haette lust', 'kommst du mit', 'ich kann heute nicht']
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

// Weekday tokens
const WEEKDAY_TOKENS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];

// Minimum required tokens per prompt (from quality gates)
const MIN_SCENARIO_TOKENS_PER_PROMPT = 2;

interface PackEntry {
  id: string;
  kind: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  prompts?: Array<{
    id: string;
    text: string;
    slotsChanged?: string[];
  }>;
  provenance?: {
    source: string;
  };
}

interface DrillEntry {
  id: string;
  kind: string;
  level?: string;
  exercises?: Array<{
    id: string;
    prompt?: string;
    text?: string;
  }>;
  provenance?: {
    source: string;
  };
}

export interface PackAnalytics {
  version: number;
  qualityGateVersion: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  promptCount: number;
  multiSlotRate: number; // 0..1
  scenarioTokenHitAvg: number; // >=0
  scenarioTokenQualifiedRate: number; // 0..1, % prompts meeting min tokens
  uniqueTokenRate: number; // 0..1, normalized unique tokens / total tokens
  bannedPhraseViolations: number; // should be 0
  passesQualityGates: boolean;
}

export interface DrillAnalytics {
  version: number;
  qualityGateVersion: string;
  level?: string;
  itemCount: number; // exercises or prompts
  uniqueTokenRate: number; // 0..1
  passesQualityGates: boolean;
}

/**
 * Normalize text for token counting (lowercase, remove punctuation)
 */
function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[.,!?;:]/g, '').trim();
}

/**
 * Extract tokens from text (simple word splitting)
 */
function extractTokens(text: string): string[] {
  return text.split(/\s+/).map(normalizeToken).filter(t => t.length > 0);
}

/**
 * Count scenario tokens in text
 */
function countScenarioTokens(text: string, scenario: string): number {
  const tokens = SCENARIO_TOKEN_DICTS[scenario] || [];
  if (tokens.length === 0) return 0;
  
  const textLower = text.toLowerCase();
  let count = 0;
  for (const token of tokens) {
    if (textLower.includes(token.toLowerCase())) {
      count++;
    }
  }
  return count;
}

/**
 * Check if text contains banned phrase
 */
function containsBannedPhrase(text: string): boolean {
  const textLower = text.toLowerCase();
  for (const phrase of DENYLIST_PHRASES) {
    if (textLower.includes(phrase.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Compute unique token rate (simple approximation)
 * Returns ratio of unique normalized tokens to total tokens
 */
function computeUniqueTokenRate(prompts: Array<{ text: string }>): number {
  if (prompts.length === 0) return 0;
  
  const allTokens = new Set<string>();
  let totalTokens = 0;
  
  for (const prompt of prompts) {
    const tokens = extractTokens(prompt.text);
    totalTokens += tokens.length;
    tokens.forEach(t => allTokens.add(t));
  }
  
  if (totalTokens === 0) return 0;
  return allTokens.size / totalTokens;
}

/**
 * Compute multi-slot rate (ratio of prompts with 2+ slotsChanged)
 */
function computeMultiSlotRate(prompts: Array<{ slotsChanged?: string[] }>): number {
  if (prompts.length === 0) return 0;
  
  let multiSlotCount = 0;
  for (const prompt of prompts) {
    if (prompt.slotsChanged && prompt.slotsChanged.length >= 2) {
      multiSlotCount++;
    }
  }
  
  return multiSlotCount / prompts.length;
}

/**
 * Compute scenario token metrics
 */
function computeScenarioTokenMetrics(
  prompts: Array<{ text: string }>,
  scenario: string
): { avgHits: number; qualifiedRate: number } {
  if (prompts.length === 0) {
    return { avgHits: 0, qualifiedRate: 0 };
  }
  
  let totalHits = 0;
  let qualifiedCount = 0;
  
  for (const prompt of prompts) {
    const hits = countScenarioTokens(prompt.text, scenario);
    totalHits += hits;
    if (hits >= MIN_SCENARIO_TOKENS_PER_PROMPT) {
      qualifiedCount++;
    }
  }
  
  return {
    avgHits: totalHits / prompts.length,
    qualifiedRate: qualifiedCount / prompts.length
  };
}

/**
 * Check if pack passes quality gates
 */
function checkQualityGates(
  pack: PackEntry,
  analytics: PackAnalytics
): boolean {
  // Must have prompts
  if (!pack.prompts || pack.prompts.length === 0) {
    return false;
  }
  
  // No banned phrases
  if (analytics.bannedPhraseViolations > 0) {
    return false;
  }
  
  // Multi-slot rate should be >= 0.3 (30%)
  if (analytics.multiSlotRate < 0.3) {
    return false;
  }
  
  // Scenario token qualified rate should be high (>= 0.8, 80% of prompts meet min tokens)
  if (analytics.scenarioTokenQualifiedRate < 0.8) {
    return false;
  }
  
  // Register consistency: if formal, must have Sie/Ihnen
  if (pack.register === 'formal') {
    let hasFormalMarker = false;
    for (const prompt of pack.prompts) {
      if (/\bSie\b/.test(prompt.text) || /\bIhnen\b/.test(prompt.text)) {
        hasFormalMarker = true;
        break;
      }
    }
    if (!hasFormalMarker) {
      return false;
    }
  }
  
  // Concreteness: at least 2 prompts with markers
  let concretenessCount = 0;
  for (const prompt of pack.prompts) {
    const text = prompt.text;
    let hasMarker = false;
    
    if (/\d/.test(text)) hasMarker = true;
    else if (/[€$]/.test(text)) hasMarker = true;
    else if (/\d{1,2}:\d{2}/.test(text)) hasMarker = true;
    else {
      const textLower = text.toLowerCase();
      for (const weekday of WEEKDAY_TOKENS) {
        if (textLower.includes(weekday)) {
          hasMarker = true;
          break;
        }
      }
    }
    
    if (hasMarker) concretenessCount++;
  }
  
  if (concretenessCount < 2) {
    return false;
  }
  
  return true;
}

/**
 * Compute analytics for a pack entry
 */
export function computePackAnalytics(pack: PackEntry): PackAnalytics {
  const prompts = pack.prompts || [];
  const promptCount = prompts.length;
  
  // Compute multi-slot rate
  const multiSlotRate = computeMultiSlotRate(prompts);
  
  // Compute scenario token metrics
  const scenarioMetrics = computeScenarioTokenMetrics(prompts, pack.scenario);
  
  // Compute unique token rate
  const uniqueTokenRate = computeUniqueTokenRate(prompts);
  
  // Count banned phrase violations
  let bannedPhraseViolations = 0;
  for (const prompt of prompts) {
    if (containsBannedPhrase(prompt.text)) {
      bannedPhraseViolations++;
    }
  }
  
  // Create analytics object
  const analytics: PackAnalytics = {
    version: 1,
    qualityGateVersion: 'qg-2025-01-01', // Update this when quality gates change
    scenario: pack.scenario || '',
    register: pack.register || '',
    primaryStructure: pack.primaryStructure || '',
    variationSlots: pack.variationSlots || [],
    promptCount,
    multiSlotRate,
    scenarioTokenHitAvg: scenarioMetrics.avgHits,
    scenarioTokenQualifiedRate: scenarioMetrics.qualifiedRate,
    uniqueTokenRate,
    bannedPhraseViolations,
    passesQualityGates: false // Will be computed below
  };
  
  // Check quality gates
  analytics.passesQualityGates = checkQualityGates(pack, analytics);
  
  return analytics;
}

/**
 * Compute analytics for a drill entry
 */
export function computeDrillAnalytics(drill: DrillEntry): DrillAnalytics {
  const exercises = drill.exercises || [];
  const itemCount = exercises.length;
  
  // Extract text from exercises (prompt or text field)
  const texts: string[] = [];
  for (const ex of exercises) {
    const text = ex.prompt || ex.text || '';
    if (text) {
      texts.push(text);
    }
  }
  
  // Compute unique token rate
  const uniqueTokenRate = computeUniqueTokenRate(
    texts.map(t => ({ text: t }))
  );
  
  // For drills, we have simpler quality gates
  // Passes if has exercises and no obvious issues
  const passesQualityGates = itemCount > 0 && uniqueTokenRate > 0;
  
  return {
    version: 1,
    qualityGateVersion: 'qg-2025-01-01',
    level: drill.level,
    itemCount,
    uniqueTokenRate,
    passesQualityGates
  };
}

