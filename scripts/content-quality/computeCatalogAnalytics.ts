#!/usr/bin/env tsx

/**
 * Catalog-Level Analytics Computation
 * 
 * Computes deterministic analytics metrics for Pack and Drill entries:
 * - slotSwitchDensity: % of prompts that change ≥2 slots
 * - promptDiversityScore: lexical + structural uniqueness across prompts
 * - scenarioCoverageScore: % of scenario token groups represented
 * 
 * These metrics are REQUIRED and must be computed deterministically (no ML/LLM).
 */

// Scenario token dictionaries (from QUALITY_GATES.md and computeAnalytics.ts)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination', 'termin', 'symptom', 'rezept', 'medizin', 'behandlung', 'diagnose', 'gesundheit', 'patient', 'klinik', 'untersuchung', 'arzt'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address', 'wohnung', 'miete', 'mietvertrag', 'vermieter', 'mieter', 'kaution', 'nebenkosten', 'möbel', 'nachbarschaft', 'adresse'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time', 'grüßen', 'hallo', 'auf wiedersehen', 'morgen', 'abend', 'tag', 'sehen', 'treffen', 'freund', 'zeit', 'tschüss'],
  government_office: ['termin', 'formular', 'anmeldung', 'bescheinigung', 'unterlagen', 'ausweis', 'amt', 'beamte', 'sachbearbeiter', 'aufenthaltserlaubnis', 'pass', 'bürgeramt', 'ausländeramt', 'jobcenter', 'krankenkasse'],
  friends_small_talk: ['wochenende', 'heute', 'morgen', 'spaeter', 'abends', 'zeit', 'lust', 'plan', 'idee', 'treffen', 'mitkommen', 'kino', 'cafe', 'restaurant', 'spaziergang', 'park', 'training', 'gym', 'serie', 'film', 'konzert', 'bar', 'pizza', 'kaffee', 'hast du lust', 'lass uns', 'wie waere es', 'hast du zeit', 'wollen wir', 'ich haette lust', 'kommst du mit', 'ich kann heute nicht']
};

interface Prompt {
  id: string;
  text: string;
  slotsChanged?: string[];
  slots?: Record<string, string[]>;
}

interface PackEntry {
  id: string;
  kind: string;
  scenario?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  prompts?: Prompt[];
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
 * Compute slotSwitchDensity: % of prompts that change ≥2 slots
 * 
 * This measures how much variation exists across prompts.
 * Higher density = more diverse practice.
 */
export function computeSlotSwitchDensity(prompts: Prompt[]): number {
  if (prompts.length === 0) return 0;
  
  let multiSlotCount = 0;
  for (const prompt of prompts) {
    const slotsChanged = prompt.slotsChanged || [];
    if (slotsChanged.length >= 2) {
      multiSlotCount++;
    }
  }
  
  return multiSlotCount / prompts.length;
}

/**
 * Compute promptDiversityScore: lexical + structural uniqueness across prompts
 * 
 * Combines:
 * - Lexical diversity: unique tokens / total tokens
 * - Structural diversity: variation in prompt lengths and patterns
 * 
 * Returns a score between 0 and 1.
 */
export function computePromptDiversityScore(prompts: Prompt[]): number {
  if (prompts.length === 0) return 0;
  if (prompts.length === 1) return 0.5; // Single prompt has moderate diversity
  
  // Lexical diversity: unique tokens / total tokens
  const allTokens = new Set<string>();
  let totalTokens = 0;
  const promptLengths: number[] = [];
  
  for (const prompt of prompts) {
    const tokens = extractTokens(prompt.text);
    totalTokens += tokens.length;
    promptLengths.push(tokens.length);
    tokens.forEach(t => allTokens.add(t));
  }
  
  const lexicalDiversity = totalTokens > 0 ? allTokens.size / totalTokens : 0;
  
  // Structural diversity: coefficient of variation of prompt lengths
  const avgLength = promptLengths.reduce((a, b) => a + b, 0) / promptLengths.length;
  const variance = promptLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / promptLengths.length;
  const stdDev = Math.sqrt(variance);
  const structuralDiversity = avgLength > 0 ? Math.min(1, stdDev / avgLength) : 0;
  
  // Weighted average: 70% lexical, 30% structural
  return (lexicalDiversity * 0.7) + (structuralDiversity * 0.3);
}

/**
 * Compute scenarioCoverageScore: % of scenario token groups represented
 * 
 * Groups scenario tokens into semantic clusters and measures how many
 * clusters are represented in the prompts.
 * 
 * Returns a score between 0 and 1.
 */
export function computeScenarioCoverageScore(
  prompts: Prompt[],
  scenario: string
): number {
  if (prompts.length === 0 || !scenario) return 0;
  
  const scenarioTokens = SCENARIO_TOKEN_DICTS[scenario] || [];
  if (scenarioTokens.length === 0) return 0;
  
  // Group tokens into clusters (simple: first 3 tokens = cluster 1, next 3 = cluster 2, etc.)
  const CLUSTER_SIZE = 3;
  const clusters: string[][] = [];
  for (let i = 0; i < scenarioTokens.length; i += CLUSTER_SIZE) {
    clusters.push(scenarioTokens.slice(i, i + CLUSTER_SIZE));
  }
  
  if (clusters.length === 0) return 0;
  
  // Count how many clusters are represented
  const allPromptText = prompts.map(p => p.text.toLowerCase()).join(' ');
  let representedClusters = 0;
  
  for (const cluster of clusters) {
    const clusterRepresented = cluster.some(token => 
      allPromptText.includes(token.toLowerCase())
    );
    if (clusterRepresented) {
      representedClusters++;
    }
  }
  
  return representedClusters / clusters.length;
}

/**
 * Estimate cognitive load based on pack characteristics
 * 
 * Factors:
 * - Number of variation slots
 * - Slot switch density
 * - Average response length (estimated from prompt length)
 */
export function estimateCognitiveLoad(
  variationSlots: string[],
  slotSwitchDensity: number,
  prompts: Prompt[]
): 'low' | 'medium' | 'high' {
  const slotCount = variationSlots.length;
  
  // Compute average prompt length (words)
  const avgLength = prompts.length > 0
    ? prompts.reduce((sum, p) => sum + extractTokens(p.text).length, 0) / prompts.length
    : 0;
  
  // Scoring system
  let score = 0;
  
  // Slot count contribution (0-3 points)
  if (slotCount <= 2) score += 1;
  else if (slotCount <= 3) score += 2;
  else score += 3;
  
  // Switch density contribution (0-2 points)
  if (slotSwitchDensity >= 0.5) score += 2;
  else if (slotSwitchDensity >= 0.3) score += 1;
  
  // Length contribution (0-2 points)
  if (avgLength >= 10) score += 2;
  else if (avgLength >= 6) score += 1;
  
  // Map score to cognitive load
  if (score <= 2) return 'low';
  if (score <= 4) return 'medium';
  return 'high';
}

/**
 * Compute all catalog-level analytics for a pack
 */
export function computePackCatalogAnalytics(pack: PackEntry): {
  primaryStructure: string;
  variationSlots: string[];
  slotSwitchDensity: number;
  promptDiversityScore: number;
  scenarioCoverageScore: number;
  estimatedCognitiveLoad: 'low' | 'medium' | 'high';
} {
  const prompts = pack.prompts || [];
  const scenario = pack.scenario || '';
  const variationSlots = pack.variationSlots || [];
  const primaryStructure = pack.primaryStructure || '';
  
  const slotSwitchDensity = computeSlotSwitchDensity(prompts);
  const promptDiversityScore = computePromptDiversityScore(prompts);
  const scenarioCoverageScore = computeScenarioCoverageScore(prompts, scenario);
  const estimatedCognitiveLoad = estimateCognitiveLoad(
    variationSlots,
    slotSwitchDensity,
    prompts
  );
  
  return {
    primaryStructure,
    variationSlots,
    slotSwitchDensity,
    promptDiversityScore,
    scenarioCoverageScore,
    estimatedCognitiveLoad
  };
}

/**
 * Compute catalog-level analytics for a drill
 * 
 * Drills have simpler analytics - we compute diversity from exercises.
 */
export function computeDrillCatalogAnalytics(drill: DrillEntry): {
  primaryStructure: string;
  variationSlots: string[];
  slotSwitchDensity: number;
  promptDiversityScore: number;
  scenarioCoverageScore: number;
  estimatedCognitiveLoad: 'low' | 'medium' | 'high';
} {
  const exercises = drill.exercises || [];
  
  // Convert exercises to prompt-like format
  const prompts: Prompt[] = exercises.map(ex => ({
    id: ex.id,
    text: ex.prompt || ex.text || '',
    slotsChanged: [] // Drills don't have slot variation
  }));
  
  // For drills, we use simpler defaults
  const slotSwitchDensity = 0; // Drills don't vary slots
  const promptDiversityScore = computePromptDiversityScore(prompts);
  const scenarioCoverageScore = 0; // Drills don't have scenarios
  
  // Estimate cognitive load from exercise count and diversity
  const estimatedCognitiveLoad: 'low' | 'medium' | 'high' = 
    exercises.length <= 5 ? 'low' :
    exercises.length <= 10 ? 'medium' : 'high';
  
  return {
    primaryStructure: 'drill_pattern', // Default for drills
    variationSlots: [],
    slotSwitchDensity,
    promptDiversityScore,
    scenarioCoverageScore,
    estimatedCognitiveLoad
  };
}

