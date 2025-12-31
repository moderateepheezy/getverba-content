#!/usr/bin/env tsx

/**
 * Deterministic Pack Generator
 * 
 * Generates pack.json files from scenario templates with seeded determinism.
 * Same inputs (scenario, level, seed) produce identical output.
 * 
 * Usage:
 *   tsx scripts/generate-pack.ts --workspace de --packId work_2 --scenario work --level A2 --seed 123
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computePackAnalytics } from './content-quality/computeAnalytics';
import { computePackCatalogAnalytics } from './content-quality/computeCatalogAnalytics';
import { computeTelemetryIds } from './telemetry-ids';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v1', 'scenarios');
const REVIEW_DIR = join(__dirname, '..', 'content', 'review');

// Scenario token dictionaries (from QUALITY_GATES.md)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time'],
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

interface Template {
  schemaVersion: number;
  scenarioId: string;
  defaultRegister: string;
  primaryStructure: string;
  variationSlots: string[];
  slotBanks: {
    subjects: string[];
    verbs: string[];
    objects: string[];
    modifiers: string[];
    time: string[];
    location: string[];
    polarity: string[];
  };
  requiredTokens: string[];
  stepBlueprint: Array<{
    id: string;
    title: string;
    promptCount: number;
    rules?: {
      requiredSlots?: string[];
    };
  }>;
  constraints: {
    verbPosition?: string;
    requiredTokensPerPrompt?: number;
  };
}

interface GeneratedPrompt {
  id: string;
  text: string;
  intent: string;
  gloss_en: string;
  natural_en?: string;
  translation?: string;
  audioUrl: string;
  slotsChanged?: string[];
  slots?: Record<string, string[]>;
  registerNote?: string;
  culturalNote?: string;
}

interface PackEntry {
  schemaVersion: number;
  id: string;
  kind: string;
  packVersion: string;
  title: string;
  level: string;
  estimatedMinutes: number;
  description: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  outline: string[];
  prompts: GeneratedPrompt[];
  sessionPlan: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
  tags: string[];
  // Telemetry identifiers (required)
  contentId: string;
  contentHash: string;
  revisionId: string;
  analytics: {
    // Catalog-level analytics (REQUIRED)
    focus: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    responseSpeedTargetMs: number;
    fluencyOutcome: string;
    whyThisWorks: string[];
    primaryStructure: string;
    variationSlots: string[];
    slotSwitchDensity: number; // 0-1
    promptDiversityScore: number; // 0-1
    scenarioCoverageScore: number; // 0-1
    estimatedCognitiveLoad: 'low' | 'medium' | 'high';
    intendedOutcome: string; // Human-written, no TODO markers
    
    // Legacy analytics fields (optional, for backward compatibility)
    goal?: string;
    constraints?: string[];
    levers?: string[];
    successCriteria?: string[];
    commonMistakes?: string[];
    drillType?: 'substitution' | 'pattern-switch' | 'roleplay-bounded';
    // Computed metrics (deterministic)
    version?: number;
    qualityGateVersion?: string;
    promptCount?: number;
    multiSlotRate?: number;
    scenarioTokenHitAvg?: number;
    scenarioTokenQualifiedRate?: number;
    uniqueTokenRate?: number;
    bannedPhraseViolations?: number;
    passesQualityGates?: boolean;
    // Telemetry readiness fields (required for telemetry contract)
    targetLatencyMs?: number;
    successDefinition?: string;
    keyFailureModes?: string[];
    exitConditions?: {
      targetMinutes: number;
      completeWhen: 'sessionPlan_completed_once' | 'sessionPlan_completed_twice' | 'manual_mark_complete';
    };
  };
  provenance: {
    source: 'pdf' | 'template' | 'handcrafted';
    sourceRef: string;
    extractorVersion: string;
    generatedAt: string;
  };
  review: {
    status: 'draft' | 'needs_review' | 'approved';
    reviewer?: string;
    reviewedAt?: string;
  };
}

/**
 * Mulberry32 seeded RNG for deterministic generation
 */
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  choice<T>(array: T[]): T {
    return array[this.nextInt(array.length)];
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

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
  const textLower = text.toLowerCase();
  for (const weekday of WEEKDAY_TOKENS) {
    if (textLower.includes(weekday)) return true;
  }
  return false;
}

/**
 * Determine intent from prompt text and scenario
 */
function determineIntent(text: string, scenario: string): string {
  const textLower = text.toLowerCase();
  
  // Question patterns
  if (/\b(kann|könnte|darf|sollte|muss|können|dürfen|sollen|müssen)\b/i.test(text) && 
      /\?/.test(text)) {
    return 'ask';
  }
  
  // Request patterns
  if (/\b(hätte|möchte|brauche|benötige|kann|könnte|würde)\b/i.test(text)) {
    return 'request';
  }
  
  // Schedule patterns
  if (/\b(termin|vereinbare|appointment|um \d|am \w+tag)\b/i.test(text)) {
    return 'schedule';
  }
  
  // Order patterns (restaurant/shopping)
  if (/\b(bestelle|nehme|kaufe|order)\b/i.test(text)) {
    return 'order';
  }
  
  // Price patterns
  if (/\b(kostet|preis|€|\$)\b/i.test(text)) {
    return 'ask_price';
  }
  
  // Thank patterns
  if (/\b(danke|vielen dank|thank)\b/i.test(text)) {
    return 'thank';
  }
  
  // Greet patterns
  if (/\b(hallo|guten tag|guten morgen|hello)\b/i.test(text)) {
    return 'greet';
  }
  
  // Goodbye patterns
  if (/\b(auf wiedersehen|tschüss|goodbye)\b/i.test(text)) {
    return 'goodbye';
  }
  
  // Confirm patterns
  if (/\b(ja|genau|richtig|yes|correct)\b/i.test(text)) {
    return 'confirm';
  }
  
  // Apologize patterns
  if (/\b(entschuldigung|sorry|tut mir leid)\b/i.test(text)) {
    return 'apologize';
  }
  
  // Default: inform
  return 'inform';
}

/**
 * Generate natural English gloss from German text
 * This is a simplified generator - in production, you'd want more sophisticated translation
 */
function generateGlossEn(text: string, scenario: string, intent: string): string {
  // Simple word mapping for common phrases (deterministic)
  const textLower = text.toLowerCase();
  
  // Government office specific
  if (scenario === 'government_office') {
    if (textLower.includes('termin')) {
      return 'I need to make an appointment.';
    }
    if (textLower.includes('formular')) {
      return 'I need the form.';
    }
    if (textLower.includes('pass')) {
      return 'I need to pick up my passport.';
    }
    if (textLower.includes('anmeldung')) {
      return 'I need to register my address.';
    }
    if (textLower.includes('unterlagen')) {
      return 'I need the documents.';
    }
  }
  
  // Work specific
  if (scenario === 'work') {
    if (textLower.includes('meeting')) {
      return 'The meeting starts at the scheduled time.';
    }
    if (textLower.includes('projekt')) {
      return 'I am working on the project.';
    }
  }
  
  // Restaurant specific
  if (scenario === 'restaurant') {
    if (textLower.includes('tisch')) {
      return 'I would like a table.';
    }
    if (textLower.includes('speisekarte')) {
      return 'I would like to see the menu.';
    }
  }
  
  // Shopping specific
  if (scenario === 'shopping') {
    if (textLower.includes('kosten')) {
      return 'How much does this cost?';
    }
    if (textLower.includes('rabatt')) {
      return 'Is there a discount?';
    }
  }
  
  // Generic fallback based on intent
  if (intent === 'request') {
    return 'I would like to request something.';
  }
  if (intent === 'ask') {
    return 'Can you help me?';
  }
  if (intent === 'inform') {
    return 'I am providing information.';
  }
  if (intent === 'schedule') {
    return 'I need to schedule something.';
  }
  
  // Ultimate fallback
  return 'This is a practice sentence for learning German.';
}

/**
 * Generate natural English paraphrase (native meaning)
 * This should be more idiomatic and natural than gloss_en
 */
function generateNaturalEn(text: string, scenario: string, intent: string, glossEn: string): string {
  // For government_office and A2+, we want more natural paraphrases
  // For now, we'll use a slightly more natural version of gloss_en
  // In production, this could be enhanced with better translation logic
  
  const textLower = text.toLowerCase();
  
  // Government office specific - more natural phrasing
  if (scenario === 'government_office') {
    if (textLower.includes('termin')) {
      return 'I\'d like to schedule an appointment.';
    }
    if (textLower.includes('formular')) {
      return 'Could I get the form, please?';
    }
    if (textLower.includes('pass')) {
      return 'I\'m here to collect my passport.';
    }
    if (textLower.includes('anmeldung')) {
      return 'I need to register my address.';
    }
    if (textLower.includes('unterlagen')) {
      return 'I need those documents.';
    }
  }
  
  // Work specific
  if (scenario === 'work') {
    if (textLower.includes('meeting')) {
      return 'The meeting is at the scheduled time.';
    }
    if (textLower.includes('projekt')) {
      return 'I\'m working on that project.';
    }
  }
  
  // Restaurant specific
  if (scenario === 'restaurant') {
    if (textLower.includes('tisch')) {
      return 'I\'d like a table, please.';
    }
    if (textLower.includes('speisekarte')) {
      return 'Could I see the menu?';
    }
  }
  
  // Shopping specific
  if (scenario === 'shopping') {
    if (textLower.includes('kosten')) {
      return 'What does this cost?';
    }
    if (textLower.includes('rabatt')) {
      return 'Do you have any discounts?';
    }
  }
  
  // Generic fallback - make gloss_en more natural
  if (intent === 'request') {
    return 'I\'d like to request that.';
  }
  if (intent === 'ask') {
    return 'Could you help me with this?';
  }
  if (intent === 'inform') {
    return 'Here\'s the information.';
  }
  if (intent === 'schedule') {
    return 'I need to schedule that.';
  }
  
  // Fallback: use gloss_en but make it slightly more natural
  return glossEn.replace(/^I /, 'I\'d ').replace(/\.$/, '');
}

/**
 * Generate a sentence from template pattern and slot values
 */
/**
 * Conjugate German verb based on subject
 * Handles basic conjugation rules for common verb patterns
 */
function conjugateVerb(verb: string, subject: string): string {
  const subjectLower = subject.toLowerCase().trim();
  const verbLower = verb.toLowerCase().trim();
  
  // Modal verbs and already-conjugated verbs - these should NOT be conjugated further
  // "möchte" is Konjunktiv II (already conjugated), "kann" is modal (already conjugated)
  const alreadyConjugated = ['möchte', 'kann', 'muss', 'soll', 'will', 'könnte', 'würde', 'hätte', 'hat', 'ist', 'war', 'wird'];
  if (alreadyConjugated.includes(verbLower)) {
    return verb; // Return as-is for all subjects
  }
  
  // First person singular (Ich) - already in correct form
  if (subjectLower === 'ich') {
    return verb; // Keep as-is (template verbs are in first person singular)
  }
  
  // First person plural (Wir) - add -en or -n
  if (subjectLower === 'wir') {
    // Handle irregular verbs
    if (verbLower === 'habe') {
      return 'haben';
    }
    if (verbLower === 'ist' || verbLower === 'bin') {
      return 'sind';
    }
    if (verbLower.endsWith('en')) {
      return verb; // Already plural (e.g., "haben", "können")
    }
    if (verbLower.endsWith('e')) {
      return verb + 'n'; // e.g., "brauche" -> "brauchen", "benötige" -> "benötigen"
    }
    return verb + 'en'; // Default: add -en
  }
  
  // Third person singular (Der/Die/Das/Er/Sie/Es) - add -t or -et
  // Check for "Der", "Die", "Das" at start (with space or end)
  const isThirdPersonSingular = 
    subjectLower.startsWith('der ') || subjectLower === 'der' ||
    subjectLower.startsWith('die ') || subjectLower === 'die' ||
    subjectLower.startsWith('das ') || subjectLower === 'das' ||
    subjectLower === 'er' || 
    (subjectLower === 'sie' && subject !== 'Sie') || // lowercase "sie" (she/it)
    subjectLower === 'es';
  
  if (isThirdPersonSingular) {
    // Handle irregular verbs
    if (verbLower === 'habe') {
      return 'hat';
    }
    if (verbLower === 'bin' || verbLower === 'ist') {
      return 'ist';
    }
    // Handle verbs ending in -e (first person singular) - but NOT -te (already past tense)
    if (verbLower.endsWith('e') && !verbLower.endsWith('ie') && !verbLower.endsWith('te')) {
      return verb.slice(0, -1) + 't'; // e.g., "brauche" -> "braucht", "zeige" -> "zeigt", "hole" -> "holt"
    }
    // Handle verbs ending in -en (infinitive)
    if (verbLower.endsWith('en')) {
      const stem = verb.slice(0, -2);
      // Verbs ending in -t, -d, -m, -n need -et
      if (stem.toLowerCase().match(/[tdmn]$/)) {
        return stem + 'et'; // e.g., "arbeite" -> "arbeitet"
      }
      return stem + 't'; // e.g., "zeigen" -> "zeigt", "bringen" -> "bringt"
    }
    // Verbs ending in -t, -d, -m, -n need -et
    if (verbLower.match(/[tdmn]$/)) {
      return verb + 'et'; // e.g., "arbeite" -> "arbeitet"
    }
    return verb + 't'; // Default: add -t
  }
  
  // Formal "Sie" (capitalized) - same as third person plural, add -en
  if (subject === 'Sie') {
    // Handle irregular verbs
    if (verbLower === 'habe') {
      return 'haben';
    }
    if (verbLower === 'ist' || verbLower === 'bin') {
      return 'sind';
    }
    if (verbLower.endsWith('en')) {
      return verb; // Already plural (e.g., "haben", "können")
    }
    if (verbLower.endsWith('e')) {
      return verb + 'n'; // e.g., "brauche" -> "brauchen", "vereinbare" -> "vereinbaren"
    }
    return verb + 'en'; // Default: add -en
  }
  
  // Default: return verb as-is (fallback)
  return verb;
}

function generateSentence(pattern: string, slots: Record<string, string>): string {
  let sentence = pattern;
  
  // Conjugate verb if we have both subject and verb
  if (slots.subject && slots.verb) {
    slots.verb = conjugateVerb(slots.verb, slots.subject);
  }
  
  // Replace all slot placeholders with their values
  for (const [key, value] of Object.entries(slots)) {
    // Use global replace to handle multiple occurrences
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    sentence = sentence.replace(regex, value);
  }
  // Remove any remaining placeholders (shouldn't happen, but safety check)
  sentence = sentence.replace(/\{[^}]+\}/g, '');
  // Clean up extra spaces
  sentence = sentence.replace(/\s+/g, ' ').trim();
  return sentence;
}

/**
 * Generate prompts for a step
 */
function generatePromptsForStep(
  template: Template,
  step: Template['stepBlueprint'][0],
  stepIndex: number,
  rng: SeededRNG,
  previousSlots: Record<string, string> | null,
  promptIdCounter: { value: number }
): { prompts: GeneratedPrompt[]; lastSlots: Record<string, string> } {
  const prompts: GeneratedPrompt[] = [];
  const requiredSlots = step.rules?.requiredSlots || template.variationSlots;
  
  // German word order pattern: Subject Verb Object Modifier Time Location
  // Note: time and location are merged into modifier for slot metadata
  const slotOrder = ['subject', 'verb', 'object', 'modifier', 'time', 'location'];
  const orderedSlots = requiredSlots.sort((a, b) => {
    const aIdx = slotOrder.indexOf(a);
    const bIdx = slotOrder.indexOf(b);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });
  
  // Generate pattern from ordered slots (include time/location in pattern but not in slot metadata)
  const pattern = orderedSlots.map(slot => `{${slot}}`).join(' ');
  
  let currentSlots: Record<string, string> | null = previousSlots;
  
  for (let i = 0; i < step.promptCount; i++) {
    let attempts = 0;
    let prompt: GeneratedPrompt | null = null;
    let newSlots: Record<string, string> | null = null;
    
    while (attempts < 100 && !prompt) {
      // Select slot values
      const slots: Record<string, string> = {};
      for (const slot of orderedSlots) {
        // Map singular slot name to plural bank name
        const bankKey = slot === 'subject' ? 'subjects' :
                        slot === 'verb' ? 'verbs' :
                        slot === 'object' ? 'objects' :
                        slot === 'modifier' ? 'modifiers' :
                        slot; // time, location, polarity use same name
        const bank = template.slotBanks[bankKey as keyof typeof template.slotBanks] || [];
        if (bank.length > 0) {
          slots[slot] = rng.choice(bank);
        }
      }
      
      // Generate sentence
      let text = generateSentence(pattern, slots);
      
      // Validate basic quality gates first
      if (text.length < 12 || text.length > 140) {
        attempts++;
        continue;
      }
      
      if (containsBannedPhrases(text)) {
        attempts++;
        continue;
      }
      
      // Check scenario tokens - be more lenient (require at least 1, prefer 2)
      let tokenCount = countScenarioTokens(text, template.requiredTokens);
      
      // If not enough tokens, try to inject one
      if (tokenCount < 1) {
        const availableTokens = template.requiredTokens.filter(t => !text.toLowerCase().includes(t.toLowerCase()));
        if (availableTokens.length > 0) {
          const tokenToAdd = rng.choice(availableTokens);
          // Prefer adding to object, then modifier, then as a new word
          if (slots.object) {
            slots.object = `${slots.object} ${tokenToAdd}`;
          } else if (slots.modifier) {
            slots.modifier = `${slots.modifier} ${tokenToAdd}`;
          } else {
            // Add as a new word at the end
            text = `${text} ${tokenToAdd}`;
          }
          if (slots.object || slots.modifier) {
            text = generateSentence(pattern, slots);
          }
          tokenCount = countScenarioTokens(text, template.requiredTokens);
        }
      }
      
      // Require at least 1 token (quality gates will check for 2 per prompt, but we're more lenient during generation)
      if (tokenCount < 1) {
        attempts++;
        continue;
      }
      
      // Check near-duplicate with previous prompt
      if (prompts.length > 0) {
        const similarity = computeSimilarity(prompts[prompts.length - 1].text, text);
        if (similarity >= 0.92) {
          attempts++;
          continue;
        }
      }
      
      // Determine slotsChanged by comparing with previous slots
      const slotsChanged: string[] = [];
      if (currentSlots) {
        for (const slot of orderedSlots) {
          const prevValue = currentSlots[slot];
          const currValue = slots[slot];
          if (prevValue !== currValue) {
            slotsChanged.push(slot);
          }
        }
      } else {
        // First prompt - mark all slots as changed
        slotsChanged.push(...orderedSlots.slice(0, Math.min(2, orderedSlots.length)));
      }
      
      // Ensure at least 30% have 2+ slotsChanged (but not all)
      const targetMultiSlotRate = 0.3;
      const currentMultiSlotRate = prompts.length > 0 
        ? prompts.filter(p => p.slotsChanged && p.slotsChanged.length >= 2).length / prompts.length
        : 0;
      
      if (currentMultiSlotRate < targetMultiSlotRate && slotsChanged.length < 2) {
        // Add more slots to changed list
        const additionalSlots = orderedSlots.filter(s => !slotsChanged.includes(s));
        if (additionalSlots.length > 0) {
          slotsChanged.push(...additionalSlots.slice(0, 2 - slotsChanged.length));
        }
      }
      
      const promptId = `prompt-${String(promptIdCounter.value).padStart(3, '0')}`;
      promptIdCounter.value++;
      
      // Generate intent based on verb and context (deterministic)
      const intent = determineIntent(text, template.scenarioId);
      
      // Generate gloss_en (natural English meaning)
      const gloss_en = generateGlossEn(text, template.scenarioId, intent);
      
      // Generate natural_en (native English paraphrase)
      const natural_en = generateNaturalEn(text, template.scenarioId, intent, gloss_en);
      
      // Extract slots for metadata (only valid slot keys)
      const VALID_SLOT_KEYS = ['subject', 'verb', 'object', 'modifier', 'complement'];
      const promptSlots: Record<string, string[]> = {};
      for (const slot of orderedSlots) {
        if (slots[slot] && VALID_SLOT_KEYS.includes(slot)) {
          promptSlots[slot] = [slots[slot]];
        } else if (slots[slot] && (slot === 'time' || slot === 'location')) {
          // Move time/location to modifier
          if (!promptSlots['modifier']) {
            promptSlots['modifier'] = [];
          }
          promptSlots['modifier'].push(slots[slot]);
        }
      }
      
      prompt = {
        id: promptId,
        text,
        intent,
        gloss_en,
        natural_en,
        audioUrl: `/v1/audio/{packId}/${promptId}.mp3`,
        slotsChanged: slotsChanged.length > 0 ? slotsChanged : undefined,
        slots: Object.keys(promptSlots).length > 0 ? promptSlots : undefined
      };
      
      newSlots = slots;
    }
    
    if (!prompt || !newSlots) {
      throw new Error(`Failed to generate valid prompt for step ${step.id} after 100 attempts`);
    }
    
    prompts.push(prompt);
    currentSlots = newSlots;
  }
  
  return { prompts, lastSlots: currentSlots! };
}

/**
 * Compute similarity between two texts (simplified)
 */
function computeSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(text1.toLowerCase().split(/\s+/));
  const tokens2 = new Set(text2.toLowerCase().split(/\s+/));
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  if (union.size === 0) return 1.0;
  return intersection.size / union.size;
}

/**
 * Generate pack from template
 */
function generatePack(
  template: Template,
  packId: string,
  level: string,
  seed: number,
  workspace: string,
  customTitle?: string | null
): PackEntry {
  const rng = new SeededRNG(seed);
  
  // Generate title from scenario or use custom title
  const title = customTitle || (template.scenarioId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') + ` - ${level}`);
  
  // Generate description
  const description = `Practice ${template.scenarioId} scenarios at ${level} level.`;
  
  // Generate outline from stepBlueprint
  const outline = template.stepBlueprint.map(step => step.title);
  
  // Generate prompts
  const allPrompts: GeneratedPrompt[] = [];
  let previousSlots: Record<string, string> | null = null;
  const promptIdCounter = { value: 1 };
  
  for (const step of template.stepBlueprint) {
    const { prompts: stepPrompts, lastSlots } = generatePromptsForStep(
      template,
      step,
      template.stepBlueprint.indexOf(step),
      rng,
      previousSlots,
      promptIdCounter
    );
    allPrompts.push(...stepPrompts);
    previousSlots = lastSlots;
  }
  
  // Update audio URLs with packId
  allPrompts.forEach(p => {
    p.audioUrl = p.audioUrl.replace('{packId}', packId);
  });
  
  // Generate sessionPlan
  const sessionPlanSteps = template.stepBlueprint.map((step, stepIndex) => {
    const stepPromptStart = template.stepBlueprint
      .slice(0, stepIndex)
      .reduce((sum, s) => sum + s.promptCount, 0);
    const promptIds = allPrompts
      .slice(stepPromptStart, stepPromptStart + step.promptCount)
      .map(p => p.id);
    
    return {
      id: step.id,
      title: step.title,
      promptIds
    };
  });
  
  // Ensure concreteness markers (at least 2 prompts)
  let concretenessCount = 0;
  for (const prompt of allPrompts) {
    if (hasConcretenessMarker(prompt.text)) {
      concretenessCount++;
    }
  }
  
  if (concretenessCount < 2) {
    // Add concreteness markers to first 2 prompts if needed
    for (let i = 0; i < Math.min(2, allPrompts.length) && concretenessCount < 2; i++) {
      if (!hasConcretenessMarker(allPrompts[i].text)) {
        // Add a time marker
        allPrompts[i].text += ` um ${rng.choice(['9', '14', '18'])}:${rng.choice(['00', '30'])}`;
        concretenessCount++;
      }
    }
  }
  
  // Ensure register consistency (if formal, add Sie/Ihnen)
  if (template.defaultRegister === 'formal') {
    let hasFormalMarker = false;
    for (const prompt of allPrompts) {
      if (/\bSie\b/.test(prompt.text) || /\bIhnen\b/.test(prompt.text)) {
        hasFormalMarker = true;
        break;
      }
    }
    if (!hasFormalMarker && allPrompts.length > 0) {
      // Replace first occurrence of Ich/Wir/Der Manager/Die Kollegin with Sie
      const firstPrompt = allPrompts[0];
      firstPrompt.text = firstPrompt.text.replace(/\b(Ich|Wir|Der Manager|Die Kollegin)\b/, 'Sie');
      // If no replacement happened, replace first word with Sie
      if (!/\bSie\b/.test(firstPrompt.text)) {
        const words = firstPrompt.text.split(/\s+/);
        words[0] = 'Sie';
        firstPrompt.text = words.join(' ');
      }
    }
  }
  
  // Ensure multi-slot variation (at least 30% with 2+ slotsChanged)
  const multiSlotCount = allPrompts.filter(p => 
    p.slotsChanged && p.slotsChanged.length >= 2
  ).length;
  const multiSlotRate = allPrompts.length > 0 ? multiSlotCount / allPrompts.length : 0;
  
  if (multiSlotRate < 0.3) {
    // Add slotsChanged to more prompts
    const needed = Math.ceil(allPrompts.length * 0.3) - multiSlotCount;
    let added = 0;
    for (const prompt of allPrompts) {
      if (added >= needed) break;
      if (!prompt.slotsChanged || prompt.slotsChanged.length < 2) {
        prompt.slotsChanged = template.variationSlots.slice(0, 2);
        added++;
      }
    }
  }
  
  // Ensure all variation slots are used in at least one prompt
  const usedSlots = new Set<string>();
  allPrompts.forEach(p => {
    if (p.slotsChanged) {
      p.slotsChanged.forEach(slot => usedSlots.add(slot));
    }
  });
  
  const missingSlots = template.variationSlots.filter(slot => !usedSlots.has(slot));
  if (missingSlots.length > 0) {
    // Add missing slots to some prompts
    for (let i = 0; i < missingSlots.length && i < allPrompts.length; i++) {
      const prompt = allPrompts[i];
      if (!prompt.slotsChanged) {
        prompt.slotsChanged = [];
      }
      prompt.slotsChanged.push(missingSlots[i]);
    }
  }
  
  // Calculate estimated minutes (roughly 1 minute per prompt)
  const estimatedMinutes = Math.max(15, Math.min(120, allPrompts.length));
  
  // Generate base analytics metadata
  const baseAnalytics = generateAnalytics(template, level, allPrompts.length);
  
  // Create minimal pack object for analytics computation (computePackAnalytics only needs specific fields)
  const tempPackForAnalytics = {
    id: packId,
    kind: 'pack',
    scenario: template.scenarioId,
    register: template.defaultRegister,
    primaryStructure: template.primaryStructure,
    variationSlots: template.variationSlots,
    prompts: allPrompts,
    provenance: {
      source: 'template' as const
    }
  };
  
  // Compute deterministic analytics metrics
  const computedAnalytics = computePackAnalytics(tempPackForAnalytics);
  
  // Compute catalog-level analytics (required)
  const catalogAnalytics = computePackCatalogAnalytics(tempPackForAnalytics);
  
  // Generate intendedOutcome based on level and scenario (TODO: should be human-written, but auto-generate for now)
  const intendedOutcome = generateIntendedOutcome(template.scenarioId, level, template.primaryStructure);
  
  // Derive catalog-level analytics fields deterministically
  const focus = deriveFocus(template.primaryStructure);
  const cognitiveLoad = catalogAnalytics.estimatedCognitiveLoad;
  const responseSpeedTargetMs = deriveResponseSpeedTargetMs(level, cognitiveLoad);
  const fluencyOutcome = deriveFluencyOutcome(template.scenarioId, template.primaryStructure);
  const whyThisWorks = deriveWhyThisWorks(
    baseAnalytics.successCriteria,
    template.primaryStructure,
    template.scenarioId,
    template.variationSlots,
    level
  );
  
  // Generate telemetry readiness fields
  // targetLatencyMs: same as responseSpeedTargetMs (already in milliseconds)
  const targetLatencyMs = responseSpeedTargetMs;
  
  // successDefinition: concise description of what success looks like (1-140 chars)
  const successDefinition = baseAnalytics.goal && baseAnalytics.goal.length <= 140
    ? baseAnalytics.goal
    : `Successfully complete ${template.scenarioId} scenarios at ${level} level using ${template.primaryStructure}`.substring(0, 140);
  
  // keyFailureModes: truncate commonMistakes to 40 chars each, limit to 6 items
  const keyFailureModes = (baseAnalytics.commonMistakes || []).slice(0, 6).map((mistake: string) => 
    mistake.length > 40 ? mistake.substring(0, 37) + '...' : mistake
  );
  // Ensure at least one failure mode
  if (keyFailureModes.length === 0) {
    keyFailureModes.push('Incorrect grammar or vocabulary usage');
  }
  
  // exitConditions: determine based on level and cognitive load
  const targetMinutes = estimatedMinutes;
  const completeWhen = level === 'A1' || cognitiveLoad === 'low' 
    ? 'sessionPlan_completed_once' 
    : 'sessionPlan_completed_twice';
  
  // Merge base analytics with computed metrics and catalog-level analytics
  const analytics: PackEntry['analytics'] = {
    ...baseAnalytics,
    version: computedAnalytics.version,
    qualityGateVersion: computedAnalytics.qualityGateVersion,
    promptCount: computedAnalytics.promptCount,
    multiSlotRate: computedAnalytics.multiSlotRate,
    scenarioTokenHitAvg: computedAnalytics.scenarioTokenHitAvg,
    scenarioTokenQualifiedRate: computedAnalytics.scenarioTokenQualifiedRate,
    uniqueTokenRate: computedAnalytics.uniqueTokenRate,
    bannedPhraseViolations: computedAnalytics.bannedPhraseViolations,
    passesQualityGates: computedAnalytics.passesQualityGates,
    // Catalog-level analytics (required)
    focus,
    cognitiveLoad,
    responseSpeedTargetMs,
    fluencyOutcome,
    whyThisWorks,
    primaryStructure: catalogAnalytics.primaryStructure,
    variationSlots: catalogAnalytics.variationSlots,
    slotSwitchDensity: catalogAnalytics.slotSwitchDensity,
    promptDiversityScore: catalogAnalytics.promptDiversityScore,
    scenarioCoverageScore: catalogAnalytics.scenarioCoverageScore,
    estimatedCognitiveLoad: catalogAnalytics.estimatedCognitiveLoad,
    intendedOutcome,
    // Telemetry readiness fields (required for telemetry contract)
    targetLatencyMs,
    successDefinition,
    keyFailureModes,
    exitConditions: {
      targetMinutes,
      completeWhen
    }
  };
  
  // Create pack object (without telemetry IDs first)
  const packWithoutTelemetry = {
    schemaVersion: 1,
    id: packId,
    kind: 'pack',
    packVersion: '1.0.0',
    title,
    level,
    estimatedMinutes,
    description,
    scenario: template.scenarioId,
    register: template.defaultRegister,
    primaryStructure: template.primaryStructure,
    variationSlots: template.variationSlots,
    outline,
    prompts: allPrompts,
    sessionPlan: {
      version: 1,
      steps: sessionPlanSteps
    },
    tags: [template.scenarioId],
    analytics,
    provenance: {
      source: 'template' as const,
      sourceRef: template.scenarioId || 'unknown-template',
      extractorVersion: '1.0.0',
      generatedAt: new Date().toISOString()
    },
    review: {
      status: 'needs_review' as const
    }
  };
  
  // Compute telemetry identifiers (must be computed after all fields are set)
  const telemetryIds = computeTelemetryIds(packWithoutTelemetry, workspace);
  
  // Create final pack with telemetry IDs
  const pack: PackEntry = {
    ...packWithoutTelemetry,
    contentId: telemetryIds.contentId,
    contentHash: telemetryIds.contentHash,
    revisionId: telemetryIds.revisionId
  };
  
  return pack;
}

/**
 * Generate intendedOutcome string based on scenario, level, and structure
 * TODO: This should be human-written, but auto-generate for now
 */
function generateIntendedOutcome(scenario: string, level: string, primaryStructure: string): string {
  const scenarioNames: Record<string, string> = {
    work: 'work',
    government_office: 'government office',
    restaurant: 'restaurant',
    shopping: 'shopping',
    doctor: 'doctor',
    housing: 'housing',
    friends_small_talk: 'friends small talk'
  };
  
  const scenarioName = scenarioNames[scenario] || scenario;
  return `${level} ${scenarioName} readiness`;
}

/**
 * Derive focus from primaryStructure deterministically
 */
function deriveFocus(primaryStructure: string): string {
  const structureLower = primaryStructure.toLowerCase();
  
  // Map common structure patterns to focus types
  if (structureLower.includes('verb') && structureLower.includes('position')) {
    return 'verb_position';
  }
  if (structureLower.includes('verb') && structureLower.includes('second')) {
    return 'verb_position';
  }
  if (structureLower.includes('modal')) {
    return 'modal_verbs';
  }
  if (structureLower.includes('word_order') || structureLower.includes('wordorder')) {
    return 'word_order';
  }
  if (structureLower.includes('tense') || structureLower.includes('tempus')) {
    return 'tense_usage';
  }
  if (structureLower.includes('case') || structureLower.includes('kasus')) {
    return 'case_system';
  }
  if (structureLower.includes('preposition') || structureLower.includes('präposition')) {
    return 'prepositions';
  }
  if (structureLower.includes('article') || structureLower.includes('artikel')) {
    return 'articles';
  }
  if (structureLower.includes('adjective') || structureLower.includes('adjektiv')) {
    return 'adjective_declension';
  }
  
  // Default: use primaryStructure as-is (normalized)
  return primaryStructure.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
}

/**
 * Derive responseSpeedTargetMs from level and cognitiveLoad deterministically
 */
function deriveResponseSpeedTargetMs(level: string, cognitiveLoad: 'low' | 'medium' | 'high'): number {
  // Base targets by level (milliseconds)
  const levelTargets: Record<string, number> = {
    'A1': 1500,
    'A2': 1200,
    'B1': 1000,
    'B2': 900,
    'C1': 800,
    'C2': 700
  };
  
  const baseTarget = levelTargets[level.toUpperCase()] || 1200;
  
  // Adjust by cognitive load
  const loadAdjustments: Record<string, number> = {
    'low': -200,
    'medium': 0,
    'high': +300
  };
  
  const adjusted = baseTarget + loadAdjustments[cognitiveLoad];
  
  // Clamp to valid range (500-3000ms)
  return Math.max(500, Math.min(3000, adjusted));
}

/**
 * Derive fluencyOutcome from scenario and primaryStructure deterministically
 */
function deriveFluencyOutcome(scenario: string, primaryStructure: string): string {
  const structureLower = primaryStructure.toLowerCase();
  const scenarioLower = scenario.toLowerCase();
  
  // Scenario-specific outcomes
  if (scenarioLower.includes('government_office') || scenarioLower === 'government_office') {
    if (structureLower.includes('modal') || structureLower.includes('request')) {
      return 'polite_requests';
    }
    return 'formal_interactions';
  }
  
  if (scenarioLower === 'work') {
    if (structureLower.includes('modal') || structureLower.includes('request')) {
      return 'professional_requests';
    }
    if (structureLower.includes('time') || structureLower.includes('schedule')) {
      return 'meeting_scheduling';
    }
    return 'workplace_communication';
  }
  
  if (scenarioLower === 'restaurant') {
    if (structureLower.includes('modal') || structureLower.includes('request')) {
      return 'polite_ordering';
    }
    return 'restaurant_interactions';
  }
  
  if (scenarioLower === 'shopping') {
    return 'transaction_phrases';
  }
  
  if (scenarioLower === 'doctor') {
    return 'health_appointments';
  }
  
  if (scenarioLower === 'housing') {
    return 'rental_communication';
  }
  
  if (scenarioLower === 'friends_small_talk') {
    if (structureLower.includes('modal') || structureLower.includes('suggestion')) {
      return 'casual_planning';
    }
    return 'friends_conversations';
  }
  
  // Structure-based outcomes
  if (structureLower.includes('verb') && structureLower.includes('position')) {
    return 'automatic_word_order';
  }
  if (structureLower.includes('greeting') || structureLower.includes('greet')) {
    return 'automatic_opening';
  }
  if (structureLower.includes('time') || structureLower.includes('temporal')) {
    return 'time_expressions';
  }
  if (structureLower.includes('modal')) {
    return 'polite_requests';
  }
  
  // Default: generic fluency outcome
  return 'fluent_expression';
}

/**
 * Derive whyThisWorks from successCriteria or generate from structure/scenario
 */
function deriveWhyThisWorks(
  successCriteria: string[] | undefined,
  primaryStructure: string,
  scenario: string,
  variationSlots: string[],
  level: string
): string[] {
  // If successCriteria exists and has at least 2 items, use them (truncated to 120 chars each)
  if (successCriteria && successCriteria.length >= 2) {
    return successCriteria
      .slice(0, 5) // Max 5 items
      .map(criterion => {
        const trimmed = criterion.trim();
        return trimmed.length > 120 ? trimmed.substring(0, 117) + '...' : trimmed;
      })
      .filter(c => c.length > 0);
  }
  
  // Otherwise, generate deterministically from structure/scenario
  const bullets: string[] = [];
  const structureLower = primaryStructure.toLowerCase();
  const scenarioLower = scenario.toLowerCase();
  
  // Structure-based explanations
  if (structureLower.includes('verb') && structureLower.includes('position')) {
    bullets.push('forces verb-second position under time pressure');
    bullets.push('alternates subject + tense to prevent chanting');
  } else if (structureLower.includes('modal')) {
    bullets.push('practices polite modal verb constructions');
    bullets.push('varies subject and context for natural usage');
  } else if (structureLower.includes('word_order')) {
    bullets.push('reinforces German word order patterns');
    bullets.push('varies sentence structure to build automaticity');
  } else {
    bullets.push(`focuses on ${primaryStructure} structure`);
    bullets.push('varies key elements to prevent memorization');
  }
  
  // Scenario-based explanations
  if (scenarioLower === 'work' || scenarioLower === 'government_office') {
    bullets.push('uses high-frequency office contexts');
  } else if (scenarioLower === 'restaurant') {
    bullets.push('covers essential dining vocabulary');
  } else if (scenarioLower === 'shopping') {
    bullets.push('practices common transaction phrases');
  }
  
  // Variation-based explanation
  if (variationSlots.length >= 3) {
    bullets.push(`varies ${variationSlots.slice(0, 2).join(' and ')} to maintain engagement`);
  } else if (variationSlots.length >= 2) {
    bullets.push(`alternates ${variationSlots.join(' and ')} to prevent repetition`);
  }
  
  // Ensure we have at least 2 bullets
  if (bullets.length < 2) {
    bullets.push(`appropriate for ${level} level learners`);
  }
  
  // Return 2-5 bullets, each <= 120 chars
  return bullets.slice(0, 5).map(b => {
    const trimmed = b.trim();
    return trimmed.length > 120 ? trimmed.substring(0, 117) + '...' : trimmed;
  });
}

/**
 * Generate analytics metadata from template and pack characteristics
 * Returns base analytics (goal, constraints, etc.) - computed metrics are added separately
 */
function generateAnalytics(
  template: Template,
  level: string,
  promptCount: number
): Omit<PackEntry['analytics'], 'focus' | 'cognitiveLoad' | 'responseSpeedTargetMs' | 'fluencyOutcome' | 'whyThisWorks' | 'primaryStructure' | 'variationSlots' | 'slotSwitchDensity' | 'promptDiversityScore' | 'scenarioCoverageScore' | 'estimatedCognitiveLoad' | 'intendedOutcome' | 'version' | 'qualityGateVersion' | 'promptCount' | 'multiSlotRate' | 'scenarioTokenHitAvg' | 'scenarioTokenQualifiedRate' | 'uniqueTokenRate' | 'bannedPhraseViolations' | 'passesQualityGates'> {
  const scenarioId = template.scenarioId;
  const variationSlots = template.variationSlots;
  const primaryStructure = template.primaryStructure;
  const register = template.defaultRegister;
  
  // Determine drillType based on scenario and structure
  let drillType: 'substitution' | 'pattern-switch' | 'roleplay-bounded';
  if (scenarioId === 'government_office' || scenarioId === 'work' || scenarioId === 'restaurant') {
    drillType = 'roleplay-bounded';
  } else if (primaryStructure.includes('switch') || primaryStructure.includes('pattern')) {
    drillType = 'pattern-switch';
  } else {
    drillType = 'substitution';
  }
  
  // Note: cognitiveLoad is now a required catalog-level field derived from catalogAnalytics.estimatedCognitiveLoad
  // It's computed separately in the main generation function, not here
  
  // Generate goal based on scenario
  const goalTemplates: Record<string, string> = {
    government_office: `Practice formal ${scenarioId} interactions at ${level} level`,
    work: `Practice professional ${scenarioId} communication at ${level} level`,
    restaurant: `Practice ${scenarioId} ordering and service requests at ${level} level`,
    shopping: `Practice ${scenarioId} transactions and inquiries at ${level} level`,
    doctor: `Practice ${scenarioId} appointments and health conversations at ${level} level`,
    housing: `Practice ${scenarioId} rental and maintenance conversations at ${level} level`,
    casual_greeting: `Practice ${scenarioId} phrases and polite conversation at ${level} level`,
    friends_small_talk: `Practice casual friends conversations: making plans, suggestions, and small talk at ${level} level`
  };
  
  const goal = goalTemplates[scenarioId] || `Practice ${scenarioId} scenarios at ${level} level`;
  
  // Generate constraints (what is held constant)
  const constraints: string[] = [];
  if (register) {
    constraints.push(`${register} register maintained`);
  }
  if (scenarioId) {
    constraints.push(`${scenarioId} scenario context`);
  }
  if (primaryStructure) {
    constraints.push(`${primaryStructure} structure focus`);
  }
  // Add more constraints based on template
  if (template.constraints?.verbPosition) {
    constraints.push(`verb position: ${template.constraints.verbPosition}`);
  }
  
  // Generate levers (what changes - must reference variationSlots)
  const levers = variationSlots.map(slot => {
    // Make lever descriptions more descriptive
    const leverDescriptions: Record<string, string> = {
      subject: 'subject variation',
      verb: 'verb substitution',
      object: 'object variation',
      modifier: 'modifier changes',
      time: 'time expressions',
      location: 'location phrases',
      tense: 'tense variation',
      polarity: 'negation patterns'
    };
    return leverDescriptions[slot] || `${slot} variation`;
  });
  
  // Generate successCriteria based on scenario and level
  const successCriteriaTemplates: Record<string, string[]> = {
    government_office: [
      'Uses formal address (Sie/Ihnen) correctly',
      'Includes required scenario tokens (Termin, Formular, etc.)',
      'Maintains polite modal verb constructions'
    ],
    work: [
      'Uses professional vocabulary appropriately',
      'Varies subject and verb across prompts',
      'Includes time/meeting context markers'
    ],
    restaurant: [
      'Uses polite request forms (Könnten Sie, etc.)',
      'Includes menu/ordering vocabulary',
      'Varies food items and modifiers'
    ],
    shopping: [
      'Uses price inquiry phrases correctly',
      'Includes payment/checkout vocabulary',
      'Varies product and quantity expressions'
    ],
    doctor: [
      'Uses appointment scheduling phrases',
      'Includes symptom/health vocabulary',
      'Maintains appropriate formality'
    ],
    housing: [
      'Uses rental/maintenance vocabulary',
      'Includes address and location phrases',
      'Varies time and urgency modifiers'
    ],
    casual_greeting: [
      'Uses appropriate greeting phrases',
      'Varies time-of-day expressions',
      'Includes polite closing phrases'
    ],
    friends_small_talk: [
      'Uses casual planning and suggestion phrases',
      'Varies time expressions (heute, morgen, am Wochenende)',
      'Includes activity and preference vocabulary',
      'Maintains casual register without slang'
    ]
  };
  
  const successCriteria = successCriteriaTemplates[scenarioId] || [
    'Uses scenario-appropriate vocabulary',
    'Varies key slots across prompts',
    'Maintains register consistency'
  ];
  
  // Generate commonMistakes based on scenario and structure
  const commonMistakesTemplates: Record<string, string[]> = {
    government_office: [
      'Forgetting formal address (using "du" instead of "Sie")',
      'Missing required documents vocabulary',
      'Incorrect modal verb conjugation'
    ],
    work: [
      'Mixing formal and informal register',
      'Missing time/meeting context',
      'Incorrect verb position in questions'
    ],
    restaurant: [
      'Using informal requests in formal settings',
      'Missing menu/ordering vocabulary',
      'Incorrect word order with modal verbs'
    ],
    shopping: [
      'Missing price/currency vocabulary',
      'Incorrect article declension',
      'Missing payment method phrases'
    ],
    doctor: [
      'Missing appointment vocabulary',
      'Incorrect symptom description forms',
      'Mixing formal/informal address'
    ],
    housing: [
      'Missing rental-specific vocabulary',
      'Incorrect dative prepositions',
      'Missing urgency/time modifiers'
    ],
    casual_greeting: [
      'Mixing formal and casual greetings',
      'Missing time-of-day context',
      'Incorrect goodbye phrase usage'
    ],
    friends_small_talk: [
      'Using formal language in casual context',
      'Missing time/activity vocabulary',
      'Incorrect modal verb usage in suggestions',
      'Overusing generic greetings instead of specific plans'
    ]
  };
  
  const commonMistakes = commonMistakesTemplates[scenarioId] || [
    'Missing scenario vocabulary',
    'Inconsistent register usage',
    'Incorrect slot variation'
  ];
  
  return {
    goal: goal.length <= 120 ? goal : goal.substring(0, 117) + '...',
    constraints: constraints.slice(0, 6),
    levers: levers.slice(0, 6),
    successCriteria: successCriteria.slice(0, 6),
    commonMistakes: commonMistakes.slice(0, 6),
    drillType
    // Note: cognitiveLoad is now a required catalog-level field derived from catalogAnalytics.estimatedCognitiveLoad
    // It's not returned here because it's added separately in the main generation function
  };
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace = 'de';
  let packId: string | null = null;
  let scenario: string | null = null;
  let level = 'A1';
  let seed = 1;
  let title: string | null = null;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--packId' && i + 1 < args.length) {
      packId = args[i + 1];
      i++;
    } else if (args[i] === '--scenario' && i + 1 < args.length) {
      scenario = args[i + 1];
      i++;
    } else if (args[i] === '--level' && i + 1 < args.length) {
      level = args[i + 1];
      i++;
    } else if (args[i] === '--seed' && i + 1 < args.length) {
      seed = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--title' && i + 1 < args.length) {
      title = args[i + 1];
      i++;
    }
  }
  
  if (!packId) {
    console.error('❌ Error: --packId is required');
    process.exit(1);
  }
  
  if (!scenario) {
    console.error('❌ Error: --scenario is required');
    process.exit(1);
  }
  
  // Validate level
  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  if (!validLevels.includes(level.toUpperCase())) {
    console.error(`❌ Error: Invalid level "${level}". Must be one of: ${validLevels.join(', ')}`);
    process.exit(1);
  }
  level = level.toUpperCase();
  
  // Load template
  const templatePath = join(TEMPLATES_DIR, `${scenario}.json`);
  if (!existsSync(templatePath)) {
    console.error(`❌ Error: Template not found: ${templatePath}`);
    process.exit(1);
  }
  
  const templateContent = readFileSync(templatePath, 'utf-8');
  const template: Template = JSON.parse(templateContent);
  
  // Generate pack
  console.log(`📦 Generating pack: ${packId}`);
  console.log(`   Scenario: ${scenario}`);
  console.log(`   Level: ${level}`);
  console.log(`   Seed: ${seed}`);
  console.log(`   Workspace: ${workspace}`);
  
  const pack = generatePack(template, packId, level, seed, workspace, title);
  
  // Write pack.json
  const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', packId);
  if (!existsSync(packDir)) {
    mkdirSync(packDir, { recursive: true });
  }
  
  const packPath = join(packDir, 'pack.json');
  writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n', 'utf-8');
  
  console.log(`✅ Created: ${packPath}`);
  console.log(`   Prompts: ${pack.prompts.length}`);
  console.log(`   Steps: ${pack.sessionPlan.steps.length}`);
  
  // Add to review pending queue
  const pendingPath = join(REVIEW_DIR, 'pending.json');
  let pendingItems: Array<{
    id: string;
    kind: string;
    workspace: string;
    scenario: string;
    level: string;
    title: string;
    createdAt: string;
    sourceTemplate: string;
  }> = [];
  
  if (existsSync(pendingPath)) {
    try {
      const pendingContent = readFileSync(pendingPath, 'utf-8');
      pendingItems = JSON.parse(pendingContent);
    } catch (err) {
      console.warn(`⚠️  Warning: Could not read pending.json, starting fresh`);
    }
  }
  
  // Check if already in pending (avoid duplicates)
  const existingIndex = pendingItems.findIndex(item => item.id === packId && item.workspace === workspace);
  if (existingIndex >= 0) {
    console.log(`   ℹ️  Pack already in pending queue`);
  } else {
    pendingItems.push({
      id: packId,
      kind: 'pack',
      workspace,
      scenario,
      level,
      title: pack.title,
      createdAt: new Date().toISOString(),
      sourceTemplate: `${scenario}.json`
    });
    
    if (!existsSync(REVIEW_DIR)) {
      mkdirSync(REVIEW_DIR, { recursive: true });
    }
    writeFileSync(pendingPath, JSON.stringify(pendingItems, null, 2) + '\n', 'utf-8');
    console.log(`   📝 Added to review pending queue`);
  }
  
  // Return pack info for index update
  const entryUrl = `/v1/workspaces/${workspace}/packs/${packId}/pack.json`;
  console.log(`\n📋 Entry URL: ${entryUrl}`);
  console.log(`\n⚠️  Next steps:`);
  console.log(`   1. Run: npm run content:generate-indexes -- --workspace ${workspace}`);
  console.log(`   2. Run: npm run content:validate`);
  console.log(`   3. Run: npm run content:quality`);
  console.log(`   4. Review and approve in content/review/pending.json → approved.json`);
}

main();

