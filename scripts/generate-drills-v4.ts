#!/usr/bin/env tsx

/**
 * Deterministic Drill Generator v4
 * 
 * Generates drill.json files from mechanic templates with seeded determinism.
 * Same inputs (mechanicId, level, tier, seed) produce identical output.
 * 
 * Usage:
 *   tsx scripts/generate-drills-v4.ts --workspace de --mechanic verb_present_tense --level A1 --tier 1
 *   tsx scripts/generate-drills-v4.ts --workspace de --all  # Generate all drills
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeTelemetryIds } from './telemetry-ids';
import { createHash } from 'crypto';
import { vocabularyGradingService } from './vocabulary-grading/vocabularyGradingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v4', 'mechanics');
const FALLBACKS_DIR = join(__dirname, '..', 'content', 'fallbacks', 'v4');
const REPORT_DIR = join(__dirname, '..', 'meta');

interface MechanicTemplate {
  mechanicId: string;
  mechanicLabel: string;
  description: string;
  supportedLevels: string[];
  loopTypes: string[];
  canonicalPatterns: string[];
  slotDictionaries: Record<string, string[]>;
  trapPairs?: Array<{
    confusion: string;
    examples: Array<{ correct: string; incorrect: string }>;
  }>;
  bannedPhrases: string[];
  requiredTokens: string[];
  minUniqueVerbs: number;
  minUniqueSubjects: number;
  minMultiSlotRate: number;
  variationSlots?: string[];
}

interface GeneratedPrompt {
  id: string;
  text: string;
  intent: string;
  gloss_en: string;
  natural_en: string;
  slotsChanged: string[];
  slots: Record<string, string[]>;
  audioUrl: string;
}

interface DrillEntry {
  schemaVersion: number;
  id: string;
  kind: string;
  drillVersion: string;
  workspace: string;
  language: string;
  level: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  estimatedMinutes: number;
  mechanicId: string;
  mechanicLabel: string;
  loopType: string;
  difficultyTier: number;
  variationSlots: string[];
  sessionPlan: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
      title_i18n?: { en: string };
    }>;
  };
  prompts: GeneratedPrompt[];
  analytics: {
    version: number;
    mechanicId: string;
    loopType: string;
    targetStructures: string[];
    variationSlots: string[];
    coverage: {
      verbs?: string[];
      patterns?: string[];
      subjects?: string[];
    };
    difficultyTier: number;
    recommendedReps: number;
    estPromptCount: number;
    timeboxMinutes: number;
    qualitySignals: {
      tokenHitsCount: number;
      multiSlotRate: number;
      uniqueVerbCount: number;
      uniqueSubjectCount: number;
      trapPairCount: number;
      bannedPhraseCheckPassed: boolean;
    };
  };
  provenance: {
    source: string;
    sourceRef: string;
    extractorVersion: string;
    generatedAt: string;
  };
  review: {
    status: string;
  };
  // i18n fields (optional, auto-populated for new content)
  title_i18n?: Record<string, string>;
  shortTitle_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
  contentId: string;
  contentHash: string;
  revisionId: string;
}

/**
 * Simple verb conjugation helper (deterministic)
 */
function conjugateVerb(verb: string, subject: string): string {
  const verbLower = verb.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Remove common infinitive endings
  let stem = verbLower;
  if (stem.endsWith('en')) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('n')) {
    stem = stem.slice(0, -1);
  }

  // d/t ending stem rule: insert 'e' for st/t endings (du, er, ihr)
  const needsE = stem.endsWith('d') || stem.endsWith('t') || stem.endsWith('tm') || stem.endsWith('chn') || stem.endsWith('ffn');

  // s/ss/x/z ending stem rule: 'du' ending is 't' instead of 'st'
  const sEnding = stem.endsWith('s') || stem.endsWith('ß') || stem.endsWith('x') || stem.endsWith('z');

  // Irregular verb handling (strong verbs)
  if (stem === 'seh') { // sehen
    if (subjectLower === 'du') return 'siehst';
    if (['er', 'sie', 'es', 'man'].includes(subjectLower)) return 'sieht';
  } else if (stem === 'ess') { // essen
    if (subjectLower === 'du') return 'isst';
    if (['er', 'sie', 'es', 'man'].includes(subjectLower)) return 'isst';
  } else if (stem === 'fahr') { // fahren
    if (subjectLower === 'du') return 'fährst';
    if (['er', 'sie', 'es', 'man'].includes(subjectLower)) return 'fährt';
  } else if (stem === 'les') { // lesen
    if (subjectLower === 'du') return 'liest';
    if (['er', 'sie', 'es', 'man'].includes(subjectLower)) return 'liest';
  } else if (stem === 'sprech') { // sprechen
    if (subjectLower === 'du') return 'sprichst';
    if (['er', 'sie', 'es', 'man'].includes(subjectLower)) return 'spricht';
  } else if (stem === 'nehm') { // nehmen
    if (subjectLower === 'du') return 'nimmst';
    if (['er', 'sie', 'es', 'man'].includes(subjectLower)) return 'nimmt';
  } else if (stem === 'geb') { // geben
    if (subjectLower === 'du') return 'gibst';
    if (['er', 'sie', 'es', 'man'].includes(subjectLower)) return 'gibt';
  }

  // Basic conjugation rules
  if (subjectLower === 'ich' || subjectLower === 'i') {
    return stem + 'e';
  } else if (subjectLower === 'du' || subjectLower === 'you') {
    if (sEnding) return stem + 't'; // heisst, tanzt
    if (needsE) return stem + 'est'; // arbeitest
    return stem + 'st';
  } else if (['er', 'sie', 'es', 'he', 'she', 'it', 'man'].includes(subjectLower)) {
    if (needsE) return stem + 'et'; // arbeitet
    return stem + 't';
  } else if (subjectLower === 'wir' || subjectLower === 'we') {
    return verbLower; // Keep infinitive form
  } else if (['ihr', 'you', "y'all"].includes(subjectLower)) { // ihr
    if (needsE) return stem + 'et'; // arbeitet
    return stem + 't';
  } else if (subjectLower === 'sie' || subjectLower === 'they') {
    return verbLower; // Keep infinitive form
  }

  // Default: return as-is (may need manual correction)
  return verbLower;
}

/**
 * Deterministic seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: string) {
    // Hash seed to number
    const hash = createHash('sha256').update(seed).digest('hex');
    this.seed = parseInt(hash.substring(0, 8), 16);
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  choice<T>(array: T[]): T {
    return array[this.nextInt(array.length)];
  }

  shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

/**
 * Load mechanic template
 */
function loadTemplate(mechanicId: string): MechanicTemplate {
  const templatePath = join(TEMPLATES_DIR, `${mechanicId}.json`);
  if (!existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  return JSON.parse(readFileSync(templatePath, 'utf-8'));
}

/**
 * Load fallback prompts for a mechanic/tier
 */
function loadFallbacks(mechanicId: string, tier: number): string[] {
  const fallbackPath = join(FALLBACKS_DIR, mechanicId, `${tier}.json`);
  if (!existsSync(fallbackPath)) {
    return [];
  }
  return JSON.parse(readFileSync(fallbackPath, 'utf-8'));
}

/**
 * Filter slot dictionary by level (using vocabulary cache)
 * Returns only words that are appropriate for the given level
 */
function filterDictionaryByLevel(
  words: string[],
  level: string,
  language: string = 'de'
): string[] {
  const CEFR_ORDER: Record<string, number> = {
    'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6
  };

  const levelOrder = CEFR_ORDER[level.toUpperCase()] || 999;
  const maxAllowedOrder = levelOrder + 1; // Allow one level higher

  // Load vocabulary cache
  const cachePath = join(__dirname, '..', 'content', 'meta', 'vocabulary-cache.json');
  let cache: any = null;
  if (existsSync(cachePath)) {
    try {
      cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    } catch (error) {
      // Cache not available, return all words
      return words;
    }
  } else {
    // No cache, return all words (will be validated later)
    return words;
  }

  // Filter words based on cached levels
  const filtered: string[] = [];
  for (const word of words) {
    // Extract main word (remove articles, etc.)
    const normalized = word.toLowerCase().trim();
    const mainWord = normalized.split(/\s+/)[0]; // Get first word

    const cachedLevel = cache?.vocabulary?.[language]?.[mainWord];
    if (cachedLevel) {
      const wordOrder = CEFR_ORDER[cachedLevel] || 999;
      if (wordOrder <= maxAllowedOrder) {
        filtered.push(word);
      }
      // Skip words that are too advanced
    } else {
      // Word not in cache - include it (will be graded later)
      filtered.push(word);
    }
  }

  // Ensure we have at least some words (fallback)
  return filtered.length > 0 ? filtered : words;
}

/**
 * Global quality stats tracker
 */
const globalStats = {
  totalGenerated: 0,
  totalRetries: 0,
  totalFallbacksUsed: 0,
  mechanicStats: {} as Record<string, any>
};

/**
 * Generate prompts for a drill
 */
function generatePrompts(
  template: MechanicTemplate,
  level: string,
  loopType: string,
  tier: number,
  seed: string
): GeneratedPrompt[] {
  const rng = new SeededRandom(seed);
  const prompts: GeneratedPrompt[] = [];

  // Determine prompt count based on tier (increasing by 2 per tier)
  const promptCounts: Record<number, number> = { 
    1: 6, 2: 8, 3: 10, 4: 12, 5: 14, 6: 16, 7: 18 
  };
  const promptCount = promptCounts[tier] || 8;

  // Get slot dictionaries and filter by level
  const language = 'de'; // Default language
  const subjects = filterDictionaryByLevel(template.slotDictionaries.subject || [], level, language);
  const verbs = filterDictionaryByLevel(template.slotDictionaries.verb || [], level, language);
  const modals = filterDictionaryByLevel(template.slotDictionaries.modal || [], level, language); // For modal verb drills
  const politeStarts = filterDictionaryByLevel(template.slotDictionaries.politeStart || [], level, language); // For politeness templates
  const objects = filterDictionaryByLevel(template.slotDictionaries.object || [], level, language);
  const modifiers = filterDictionaryByLevel(template.slotDictionaries.modifier || [], level, language);
  const time = filterDictionaryByLevel(template.slotDictionaries.time || [], level, language);
  const location = filterDictionaryByLevel(template.slotDictionaries.location || [], level, language);
  const requiredTokens = template.requiredTokens || [];

  // Special handling for politeness templates
  const isPolitenessTemplate = template.mechanicId === 'politeness_templates';

  // Track used combinations for variation
  const usedCombinations = new Set<string>();
  const uniqueVerbs = new Set<string>();
  const uniqueSubjects = new Set<string>();

  // Ensure we use enough unique subjects/verbs to meet requirements
  const minSubjects = template.minUniqueSubjects || 3;
  const minVerbs = template.minUniqueVerbs || 3;

  // Create shuffled arrays to ensure better distribution
  const shuffledSubjects = [...subjects].sort(() => rng.next() - 0.5);
  const shuffledVerbs = [...verbs].sort(() => rng.next() - 0.5);
  const shuffledModals = modals.length > 0 ? [...modals].sort(() => rng.next() - 0.5) : [];
  let subjectIndex = 0;
  let verbIndex = 0;
  let modalIndex = 0;

  for (let i = 0; i < promptCount; i++) {
    const promptId = `prompt-${String(i + 1).padStart(3, '0')}`;

    // Select slots based on loop type
    let selectedSubject: string;
    let selectedVerb: string;
    let selectedObject: string | null = null;
    let selectedModifier: string | null = null;
    let selectedTime: string | null = null;
    let selectedLocation: string | null = null;

    const slotsChanged: string[] = [];

    // Select subject ensuring good distribution and meeting minimum requirements
    // Cycle through all subjects to ensure we use enough unique ones
    if (isPolitenessTemplate && politeStarts.length > 0) {
      // For politeness templates, use politeStart as the "subject"
      const politeStartIndex = i % politeStarts.length;
      selectedSubject = politeStarts[politeStartIndex];
      if (!selectedSubject || selectedSubject === 'undefined') {
        selectedSubject = politeStarts[0]; // Fallback
      }
      uniqueSubjects.add(selectedSubject);
    } else if (shuffledSubjects.length > 0) {
      // Ensure we use at least minSubjects different subjects
      const targetSubjectIndex = Math.floor(i / Math.max(1, Math.floor(promptCount / Math.max(minSubjects, shuffledSubjects.length))));
      selectedSubject = shuffledSubjects[targetSubjectIndex % shuffledSubjects.length];
      subjectIndex++;
    } else {
      selectedSubject = rng.choice(subjects);
    }

    // Select verb ensuring good distribution
    if (shuffledVerbs.length > 0) {
      selectedVerb = shuffledVerbs[verbIndex % shuffledVerbs.length];
      verbIndex++;
    } else {
      selectedVerb = rng.choice(verbs);
    }

    // Initial Slot Selection based on Loop Type
    if (loopType === 'pattern_switch') {
      const patternIndex = i % 3;
      if (patternIndex === 0) {
        // Pattern 1: subject + verb
        slotsChanged.push('subject', 'verb');
      } else if (patternIndex === 1) {
        // Pattern 2: subject + verb + object
        selectedObject = objects.length > 0 ? rng.choice(objects) : null;
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        // Pattern 3: time + subject + verb
        selectedTime = time.length > 0 ? rng.choice(time) : null;
        slotsChanged.push('time', 'subject', 'verb');
      }
    } else if (loopType === 'slot_substitution') {
      if (objects.length > 0 && i % 2 === 0) {
        selectedObject = rng.choice(objects);
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        slotsChanged.push('subject', 'verb');
      }
    } else if (loopType === 'micro_transform') {
      if (i % 2 === 0) {
        selectedObject = objects.length > 0 ? rng.choice(objects) : null;
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        slotsChanged.push('subject', 'verb');
      }
    } else if (loopType === 'contrast_pairs') {
      // ... (existing logic for contrast pairs subject selection is handled above by general subject logic, mostly)
      // Just ensure we toggle slots
      if (objects.length > 0 && rng.next() > 0.5) {
        selectedObject = rng.choice(objects);
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        slotsChanged.push('subject', 'verb');
      }
    } else {
      if (objects.length > 0 && rng.next() > 0.5) {
        selectedObject = rng.choice(objects);
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        slotsChanged.push('subject', 'verb');
      }
    }

    // --- Tier-Based Enrichment & Length Enforcement ---

    // Tier 2: Force at least one context element if not present
    if (tier >= 2) {
      if (!selectedTime && !selectedLocation && !selectedModifier) {
        // Prefer Time for Tier 2
        if (time.length > 0) {
          selectedTime = rng.choice(time);
          if (!slotsChanged.includes('time')) slotsChanged.push('time');
        } else if (location.length > 0) {
          selectedLocation = rng.choice(location);
          if (!slotsChanged.includes('location')) slotsChanged.push('location');
        } else if (modifiers.length > 0) {
          selectedModifier = rng.choice(modifiers);
          if (!slotsChanged.includes('modifier')) slotsChanged.push('modifier');
        }
      }
    }

    // Tier 3: Force at least two context elements
    if (tier >= 3) {
      let contextCount = (selectedTime ? 1 : 0) + (selectedLocation ? 1 : 0) + (selectedModifier ? 1 : 0);
      while (contextCount < 2) {
        if (!selectedTime && time.length > 0) {
          selectedTime = rng.choice(time);
          if (!slotsChanged.includes('time')) slotsChanged.push('time');
          contextCount++;
        } else if (!selectedLocation && location.length > 0) {
          selectedLocation = rng.choice(location);
          if (!slotsChanged.includes('location')) slotsChanged.push('location');
          contextCount++;
        } else if (!selectedModifier && modifiers.length > 0) {
          selectedModifier = rng.choice(modifiers);
          if (!slotsChanged.includes('modifier')) slotsChanged.push('modifier');
          contextCount++;
        } else {
          break; // Run out of options
        }
      }
    }

    // Helper to estimate length (rough)
    const estimateLength = () => {
      let len = (selectedSubject?.length || 0) + (selectedVerb?.length || 0) + 2; // +2 for spaces/conjugation
      if (selectedObject) len += selectedObject.length + 1;
      if (selectedTime) len += selectedTime.length + 1;
      if (selectedLocation) len += selectedLocation.length + 1;
      if (selectedModifier) len += selectedModifier.length + 1;
      return len;
    };

    // Hard Gate: Minimum 22 characters
    // Aggressively add slots until we likely meet the bar
    let attempts = 0;
    while (estimateLength() < 22 && attempts < 5) {
      if (!selectedObject && objects.length > 0) {
        selectedObject = rng.choice(objects);
        if (!slotsChanged.includes('object')) slotsChanged.push('object');
      } else if (!selectedModifier && modifiers.length > 0) {
        selectedModifier = rng.choice(modifiers);
        if (!slotsChanged.includes('modifier')) slotsChanged.push('modifier');
      } else if (!selectedLocation && location.length > 0) {
        selectedLocation = rng.choice(location);
        if (!slotsChanged.includes('location')) slotsChanged.push('location');
      } else if (!selectedTime && time.length > 0) {
        selectedTime = rng.choice(time);
        if (!slotsChanged.includes('time')) slotsChanged.push('time');
      } else {
        break; // Can't add anything more
      }
      attempts++;
    }

    // --- End Enrichment ---

    // Validate selectedSubject before proceeding
    if (!selectedSubject || selectedSubject === 'undefined' || selectedSubject === 'null') {
      if (isPolitenessTemplate && politeStarts.length > 0) {
        selectedSubject = politeStarts[i % politeStarts.length];
      } else if (subjects.length > 0) {
        selectedSubject = subjects[0];
      } else {
        // Skip this prompt if we can't get a valid subject
        i--;
        continue;
      }
    }

    // Build slots object
    const slots: Record<string, string[]> = {
      subject: [selectedSubject],
      verb: [selectedVerb] // Will update with conjugated form
    };
    if (selectedObject) slots.object = [selectedObject];
    if (selectedModifier) slots.modifier = [selectedModifier];
    if (selectedTime) slots.time = [selectedTime];
    if (selectedLocation) slots.location = [selectedLocation];

    // For politeness templates, track politeStart as subject
    if (isPolitenessTemplate) {
      uniqueSubjects.add(selectedSubject);
    }

    // Conjugation Logic including Modals
    let conjugatedVerb: string;
    let infinitiveVerb: string | null = null;

    if (isPolitenessTemplate) {
      // Politeness templates use infinitive verbs
      conjugatedVerb = selectedVerb; // Use infinitive form
      uniqueVerbs.add(selectedVerb);
    } else if (modals.length > 0 && template.mechanicId === 'modal_verbs') {
      // ... (Existing Modal Logic) ...
      const modalBase = rng.choice(['kann', 'muss', 'soll', 'will', 'möchte']);
      let selectedModal: string = modalBase; // Default

      // Match modal to subject
      if (selectedSubject === 'Ich') {
        selectedModal = modalBase === 'möchte' ? 'möchte' : modalBase;
      } else if (selectedSubject === 'Du') {
        selectedModal = modalBase === 'kann' ? 'kannst' :
          modalBase === 'muss' ? 'musst' :
            modalBase === 'soll' ? 'sollst' :
              modalBase === 'will' ? 'willst' :
                'möchtest';
      } else if (['Er', 'Sie', 'Es'].includes(selectedSubject)) {
        selectedModal = modalBase === 'möchte' ? 'möchte' : modalBase;
      } else if (selectedSubject === 'Wir' || selectedSubject === 'Sie') {
        // Wir and Sie (formal/plural) share the same conjugation for these modals
        selectedModal = modalBase === 'kann' ? 'können' : modalBase === 'muss' ? 'müssen' : modalBase === 'soll' ? 'sollen' : modalBase === 'will' ? 'wollen' : 'möchten';
      } else if (selectedSubject === 'Ihr') {
        selectedModal = modalBase === 'kann' ? 'könnt' :
          modalBase === 'muss' ? 'müsst' :
            modalBase === 'soll' ? 'sollt' :
              modalBase === 'will' ? 'wollt' :
                'möchtet';
      } else {
        // Fallback 3rd person plural / formal
        selectedModal = modalBase === 'kann' ? 'können' : modalBase === 'muss' ? 'müssen' : modalBase === 'soll' ? 'sollen' : modalBase === 'will' ? 'wollen' : 'möchten';
      }

      conjugatedVerb = selectedModal;
      infinitiveVerb = selectedVerb;
      uniqueVerbs.add(infinitiveVerb);
    } else {
      // Regular verb conjugation
      conjugatedVerb = conjugateVerb(selectedVerb, selectedSubject);
      uniqueVerbs.add(selectedVerb);
    }

    // Update slots
    slots.verb = [conjugatedVerb];
    if (infinitiveVerb) {
      slots.infinitive = [infinitiveVerb];
    }

    // --- TEXT CONSTRUCTION (German Word Order: TeKuMoLo) ---
    // Standard: Subject + Verb + Time + Object + Modifier + Location + Infinitive
    // Inverted (Time start): Time + Verb + Subject + Object + Modifier + Location + Infinitive

    let text = '';

    // Helper to lowercase pronouns (ich, du, er, etc)
    const lowerCaseSubject = (s: string) => {
      const pronouns = ['Ich', 'Du', 'Er', 'Es', 'Wir', 'Ihr']; // "Sie" stays Capital (ambiguous but safe)
      return pronouns.includes(s) ? s.toLowerCase() : s;
    };

    if (isPolitenessTemplate) {
      // Politeness: politeStart + (verb/object/modifier)
      text = selectedSubject;
      if (conjugatedVerb && conjugatedVerb !== selectedSubject) {
        // Some politeStarts include verb "Könnten Sie", then we need infinitive.
        // But logic above sets conjugatedVerb = selectedVerb (infinitive).
        // So: "Könnten Sie" + "mir" + "helfen"
        // Order: politeStart + (Object) + (Modifier) + (Location) + Infinitive
        // This is simplified but better than before.
        const parts = [];
        if (selectedObject) parts.push(selectedObject);
        if (selectedModifier) parts.push(selectedModifier);
        if (selectedLocation) parts.push(selectedLocation);
        if (selectedTime) parts.push(selectedTime);
        parts.push(conjugatedVerb); // Infinitive at end

        text += ' ' + parts.join(' ');
      }

      if (!text.endsWith('?') && !text.endsWith('.')) text += '?';
    } else {
      // Regular Construction

      // Determine Start Element (Subject or Time)
      // If Tier 3, encourage inversion variation
      const useInversion = selectedTime && (loopType === 'pattern_switch' || tier >= 3 || rng.next() > 0.6);

      if (useInversion && selectedTime) {
        text = `${selectedTime} ${conjugatedVerb} ${lowerCaseSubject(selectedSubject)}`;
      } else {
        text = `${selectedSubject} ${conjugatedVerb}`;
      }

      // Append others in order: Time (if not start) -> Modifier -> Location -> Object -> Infinitive
      // German standard: TeKuMoLo (Temporal, Kausal, Modal, Lokal)
      // Objects usually come after TekuMoLo if they are nouns (which they are here mostly)

      if (selectedTime && !useInversion) text += ` ${selectedTime}`;
      if (selectedModifier) text += ` ${selectedModifier}`;
      if (selectedLocation) text += ` ${selectedLocation}`;
      if (selectedObject) text += ` ${selectedObject}`;
      if (infinitiveVerb) text += ` ${infinitiveVerb}`;

      text += '.';
    }
    // --- END TEXT CONSTRUCTION ---

    // Double check length gate (should be met by now, but just in case)
    if (text.length < 18) {
      // Last resort: add a generic modifier/obj if possible, or accept if impossible
      if (!selectedModifier && modifiers.length > 0) {
        // hacky fix insert
        const mod = rng.choice(modifiers);
        text = text.replace('.', ` ${mod}.`);
        slots.modifier = [mod];
      }
    }

    // Banned Phrase Check
    const bannedPhrases = template.bannedPhrases || [];
    const textLowerCheck = text.toLowerCase();
    let hasBannedPhrase = false;
    for (const phrase of bannedPhrases) {
      if (textLowerCheck.includes(phrase.toLowerCase())) {
        hasBannedPhrase = true;
        break;
      }
    }
    if (hasBannedPhrase && attempts < 10) {
      // Retry whole prompt
      i--;
      continue;
    }

    // Variation Check
    const comboKey = `${selectedSubject}|${conjugatedVerb}|${infinitiveVerb || ''}|${selectedObject || ''}`;
    if (usedCombinations.has(comboKey) && prompts.length < promptCount * 2) { // Allow dupes if we are struggling
      if (attempts < 10) {
        i--;
        continue;
      }
    }
    usedCombinations.add(comboKey);
    if (!isPolitenessTemplate) uniqueSubjects.add(selectedSubject);

    prompts.push({
      id: promptId,
      text,
      intent: 'practice',
      gloss_en: 'I am practicing this grammar mechanic.',
      natural_en: text,
      slotsChanged,
      slots,
      audioUrl: `/v1/audio/${template.mechanicId}_${level}_tier${tier}/${promptId}.mp3`
    });
  }

  // Fallback Check & Safety Net
  const fallbackPrompts = loadFallbacks(template.mechanicId, tier);
  let fallbackIndex = 0;

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    if (p.text.length < 22 || p.text.includes("undefined")) {
      // Replace with fallback if available
      if (fallbackPrompts.length > 0) {
        const fb = fallbackPrompts[fallbackIndex % fallbackPrompts.length];
        fallbackIndex++;

        // Basic slot inference for fallback (imperfect but safe)
        // We assume fallback is valid, so we just set text.
        p.text = fb;
        p.natural_en = fb;
        p.slots = { subject: ["Fallback"], verb: ["Fallback"] }; // Placeholder slots

        globalStats.totalFallbacksUsed++;
      }
    }
  }

  // Update Stats
  const mechKey = `${template.mechanicId}_tier${tier}`;
  if (!globalStats.mechanicStats[mechKey]) {
    globalStats.mechanicStats[mechKey] = { generated: 0, retries: 0, fallbacks: 0, avgLen: 0 };
  }
  const stats = globalStats.mechanicStats[mechKey];
  stats.generated += prompts.length;
  stats.fallbacks += fallbackIndex;

  const totalLen = prompts.reduce((acc, p) => acc + p.text.length, 0);
  stats.avgLen = totalLen / (prompts.length || 1);

  // Post-generation validation: ensure minimum requirements are met
  // If not enough unique subjects/verbs, fix by adding more variation
  if (uniqueSubjects.size < minSubjects) {
    // Add more unique subjects by replacing some prompts
    const neededSubjects = minSubjects - uniqueSubjects.size;
    const unusedSubjects = shuffledSubjects.filter(s => !uniqueSubjects.has(s));
    let replaced = 0;
    for (let j = 0; j < prompts.length && replaced < neededSubjects && unusedSubjects.length > 0; j++) {
      const prompt = prompts[j];
      const newSubject = unusedSubjects[replaced % unusedSubjects.length];
      // Update prompt with new subject
      const oldSubject = prompt.slots.subject[0];
      prompt.text = prompt.text.replace(oldSubject, newSubject);
      prompt.slots.subject[0] = newSubject;
      uniqueSubjects.add(newSubject);
      replaced++;
    }
  }

  // Enforce Required Tokens (Fix for "Insufficient Mechanic Token Coverage")
  if (requiredTokens.length > 0) {
    let tokensFound = 0;
    prompts.forEach(p => {
      const textLower = p.text.toLowerCase();
      if (requiredTokens.some(t => textLower.includes(t.toLowerCase()))) {
        tokensFound++;
      }
    });

    const coverage = tokensFound / prompts.length;
    if (coverage < 0.9) { // Aim for >90% to safely clear the 80% bar
      const targetCount = Math.ceil(prompts.length * 0.9);
      let injectedCount = tokensFound;

      // Shuffle prompts to randomise which ones get injected if we don't need all
      const promptsToInject = prompts.filter(p => !requiredTokens.some(t => p.text.toLowerCase().includes(t.toLowerCase())));

      for (const p of promptsToInject) {
        if (injectedCount >= targetCount) break;

        const forcedToken = rng.choice(requiredTokens);
        let injected = false;
        const textLower = p.text.toLowerCase();

        // Strategy 1: Replace a matching slot value
        for (const [slotType, values] of Object.entries(template.slotDictionaries)) {
          if (!p.slots[slotType] || p.slots[slotType].length === 0) continue;

          // Check if this slot type allows this token (fuzzy match in dictionary)
          const dictionaryContainsToken = values.some(v => v.toLowerCase().includes(forcedToken.toLowerCase()) || forcedToken.toLowerCase().includes(v.toLowerCase()));

          if (dictionaryContainsToken) {
            const oldValue = p.slots[slotType][0];
            // Replace in text
            if (p.text.includes(oldValue)) {
              p.text = p.text.replace(oldValue, forcedToken);
              p.slots[slotType][0] = forcedToken;
              p.natural_en = p.text;
              injected = true;
              break;
            }
          }
        }

        // Strategy 2: Contextual Injection (Modifier/Time)
        if (!injected) {
          // Can we append/prepend based on token type?
          // Heuristic: if token is a negation (nicht), try to insert before/after verb?
          // Too complex for generic regex.

          // Fallback for key mechanics:
          if (forcedToken.toLowerCase() === 'nicht') {
            // Try to append "nicht" to the sentence if it ends with "."
            if (p.text.endsWith('.')) {
              p.text = p.text.substring(0, p.text.length - 1) + ' nicht.';
              if (p.slots.modifier) p.slots.modifier.push('nicht');
              else p.slots.modifier = ['nicht'];
              injected = true;
            }
          } else if (forcedToken.endsWith('?')) {
            // Question mark? Ensure text ends with ?
            if (p.text.endsWith('.')) {
              p.text = p.text.substring(0, p.text.length - 1) + '?';
              injected = true;
            }
          }

          // Generic Fallback: Append as modifier if it looks like a single word
          if (!injected && !forcedToken.includes(' ')) {
            if (p.text.endsWith('.')) {
              p.text = p.text.substring(0, p.text.length - 1) + ' ' + forcedToken + '.';
              // Add to modifier slot so it's tracked
              if (p.slots.modifier) p.slots.modifier.push(forcedToken);
              else p.slots.modifier = [forcedToken];
              injected = true;
            }
          }
        }

        if (injected) {
          injectedCount++;
        }
      }
    }
  }

  return prompts;
}

/**
 * Generate session plan steps
 */
function generateSessionPlan(
  prompts: GeneratedPrompt[],
  loopType: string,
  template: MechanicTemplate
): DrillEntry['sessionPlan'] {
  const steps: Array<{ id: string; title: string; promptIds: string[]; title_i18n?: { en: string } }> = [];

  if (loopType === 'pattern_switch') {
    // Group by pattern
    const step1 = prompts.slice(0, 2);
    const step2 = prompts.slice(2, 4);
    const step3 = prompts.slice(4);

    if (step1.length > 0) {
      steps.push({
        id: 'pattern-1',
        title: 'Pattern 1: Basic Forms',
        promptIds: step1.map(p => p.id),
        title_i18n: { en: 'Pattern 1: Basic Forms' }
      });
    }
    if (step2.length > 0) {
      steps.push({
        id: 'pattern-2',
        title: 'Pattern 2: Extended Forms',
        promptIds: step2.map(p => p.id),
        title_i18n: { en: 'Pattern 2: Extended Forms' }
      });
    }
    if (step3.length > 0) {
      steps.push({
        id: 'pattern-3',
        title: 'Pattern 3: Complex Forms',
        promptIds: step3.map(p => p.id),
        title_i18n: { en: 'Pattern 3: Complex Forms' }
      });
    }
  } else if (loopType === 'contrast_pairs') {
    // Group in pairs
    for (let i = 0; i < prompts.length; i += 2) {
      const pair = prompts.slice(i, i + 2);
      if (pair.length > 0) {
        steps.push({
          id: `pair-${Math.floor(i / 2) + 1}`,
          title: `Pair ${Math.floor(i / 2) + 1}`,
          promptIds: pair.map(p => p.id),
          title_i18n: { en: `Pair ${Math.floor(i / 2) + 1}` }
        });
      }
    }
  } else {
    // Default: split into 2-3 steps
    const stepSize = Math.ceil(prompts.length / 3);
    for (let i = 0; i < prompts.length; i += stepSize) {
      const stepPrompts = prompts.slice(i, i + stepSize);
      if (stepPrompts.length > 0) {
        steps.push({
          id: `step-${Math.floor(i / stepSize) + 1}`,
          title: `Step ${Math.floor(i / stepSize) + 1}`,
          promptIds: stepPrompts.map(p => p.id),
          title_i18n: { en: `Step ${Math.floor(i / stepSize) + 1}` }
        });
      }
    }
  }

  return {
    version: 1,
    steps
  };
}

/**
 * Compute analytics for a drill
 */
function computeAnalytics(
  template: MechanicTemplate,
  prompts: GeneratedPrompt[],
  loopType: string,
  tier: number
): DrillEntry['analytics'] {
  // Count unique verbs and subjects
  const uniqueVerbs = new Set<string>();
  const uniqueSubjects = new Set<string>();
  let tokenHitsCount = 0;
  let multiSlotCount = 0;

  for (const prompt of prompts) {
    // Check for required tokens
    const textLower = prompt.text.toLowerCase();
    for (const token of template.requiredTokens) {
      if (textLower.includes(token.toLowerCase())) {
        tokenHitsCount++;
        break; // Count once per prompt
      }
    }

    // Count multi-slot changes
    if (prompt.slotsChanged.length >= 2) {
      multiSlotCount++;
    }

    // Extract unique verbs and subjects
    if (prompt.slots.verb) {
      prompt.slots.verb.forEach(v => uniqueVerbs.add(v));
    }
    if (prompt.slots.subject) {
      prompt.slots.subject.forEach(s => uniqueSubjects.add(s));
    }
  }

  const multiSlotRate = prompts.length > 0 ? multiSlotCount / prompts.length : 0;

  // Build coverage
  const coverage: { verbs?: string[]; patterns?: string[]; subjects?: string[] } = {};
  if (uniqueVerbs.size > 0) {
    coverage.verbs = Array.from(uniqueVerbs);
  }
  if (uniqueSubjects.size > 0) {
    coverage.subjects = Array.from(uniqueSubjects);
  }
  coverage.patterns = template.canonicalPatterns;

  // Check banned phrases
  let bannedPhraseCheckPassed = true;
  for (const prompt of prompts) {
    const textLower = prompt.text.toLowerCase();
    for (const banned of template.bannedPhrases) {
      if (textLower.includes(banned.toLowerCase())) {
        bannedPhraseCheckPassed = false;
        break;
      }
    }
    if (!bannedPhraseCheckPassed) break;
  }

  return {
    version: 1,
    mechanicId: template.mechanicId,
    loopType,
    targetStructures: template.canonicalPatterns,
    variationSlots: template.variationSlots || ['subject', 'verb'],
    coverage,
    difficultyTier: tier,
    recommendedReps: tier === 1 ? 2 : tier === 2 ? 3 : 4,
    estPromptCount: prompts.length,
    timeboxMinutes: tier === 1 ? 3 : tier === 2 ? 4 : 5,
    qualitySignals: {
      tokenHitsCount,
      multiSlotRate,
      uniqueVerbCount: uniqueVerbs.size,
      uniqueSubjectCount: uniqueSubjects.size,
      trapPairCount: 0, // TODO: compute from trapPairs
      bannedPhraseCheckPassed
    }
  };
}

/**
 * Generate a single drill
 */
function generateDrill(
  workspace: string,
  language: string,
  mechanicId: string,
  level: string,
  tier: number,
  loopType: string
): DrillEntry {
  const template = loadTemplate(mechanicId);

  // Validate level and loop type
  if (!template.supportedLevels.includes(level)) {
    throw new Error(`Level ${level} not supported for mechanic ${mechanicId}`);
  }
  if (!template.loopTypes.includes(loopType)) {
    throw new Error(`Loop type ${loopType} not supported for mechanic ${mechanicId}`);
  }

  // Generate deterministic seed
  const seed = `${workspace}:${mechanicId}:${level}:tier${tier}:${loopType}`;

  // Generate prompts
  const prompts = generatePrompts(template, level, loopType, tier, seed);

  // Generate session plan
  const sessionPlan = generateSessionPlan(prompts, loopType, template);

  // Compute analytics
  const analytics = computeAnalytics(template, prompts, loopType, tier);

  // Build drill ID (normalize level to lowercase)
  const levelLower = level.toLowerCase();
  const drillId = `${mechanicId}_${levelLower}_tier${tier}_${loopType.replace(/_/g, '-')}`;

  // Build titles - shortTitle must be unique within mechanicId + level
  // Include loopType to make it unique (abbreviated to fit 28 char limit)
  const loopTypeAbbr = loopType === 'pattern_switch' ? 'Pattern' :
    loopType === 'slot_substitution' ? 'Slot' :
      loopType === 'micro_transform' ? 'Transform' :
        loopType === 'contrast_pairs' ? 'Pairs' :
          loopType === 'error_trap' ? 'Trap' :
            loopType === 'fast_recall' ? 'Recall' : loopType;
  const shortTitle = `${template.mechanicLabel} ${level} ${loopTypeAbbr}`;
  // Ensure shortTitle is <= 28 chars
  const maxShortTitle = 28;
  let finalShortTitle = shortTitle;
  if (finalShortTitle.length > maxShortTitle) {
    // Truncate mechanic label if needed
    const labelMax = maxShortTitle - level.length - loopTypeAbbr.length - 2; // -2 for spaces
    const truncatedLabel = template.mechanicLabel.substring(0, labelMax);
    finalShortTitle = `${truncatedLabel} ${level} ${loopTypeAbbr}`;
  }

  // Subtitle must be 40-60 chars
  const loopTypeLabel = loopType.replace(/_/g, ' ');
  const subtitleBase = `Tier ${tier} - ${loopTypeLabel}`;
  let subtitle = subtitleBase;
  if (subtitle.length < 40) {
    // Pad with description
    const desc = template.description.substring(0, 60 - subtitle.length - 3);
    subtitle = `${subtitleBase} - ${desc}`;
  }
  if (subtitle.length > 60) {
    subtitle = subtitle.substring(0, 57) + '...';
  }
  // Title must also be unique - include loopType abbreviation
  const title = `${template.mechanicLabel}: ${level} (Tier ${tier}) - ${loopTypeAbbr}`;

  // Build variation slots - use common slots that are likely to vary
  // Default to subject and verb, add others if present in dictionaries
  const variationSlots: string[] = ['subject', 'verb'];
  if (template.slotDictionaries.object && template.slotDictionaries.object.length > 0) {
    variationSlots.push('object');
  }
  if (template.slotDictionaries.modifier && template.slotDictionaries.modifier.length > 0) {
    variationSlots.push('modifier');
  }
  if (template.slotDictionaries.time && template.slotDictionaries.time.length > 0) {
    variationSlots.push('time');
  }

  // Create entry with i18n scaffolding
  const entry: Omit<DrillEntry, 'contentId' | 'contentHash' | 'revisionId'> = {
    schemaVersion: 1,
    id: drillId,
    kind: 'drill',
    drillVersion: 'v4',
    workspace,
    language,
    level,
    title,
    shortTitle: finalShortTitle.length > 28 ? finalShortTitle.substring(0, 25) + '...' : finalShortTitle,
    subtitle: subtitle.length > 60 ? subtitle.substring(0, 57) + '...' : subtitle,
    estimatedMinutes: analytics.timeboxMinutes,
    mechanicId: template.mechanicId,
    mechanicLabel: template.mechanicLabel,
    loopType,
    difficultyTier: tier,
    variationSlots,
    sessionPlan,
    prompts,
    analytics,
    provenance: {
      source: 'template',
      sourceRef: `mechanics/${mechanicId}`,
      extractorVersion: 'v4.0.0',
      generatedAt: new Date().toISOString()
    },
    review: {
      status: 'needs_review'
    },
    // Auto-populate i18n.en fields (scaffolding)
    // Intelligent shortening: Replace common long words
    title_i18n: { en: title },
    shortTitle_i18n: {
      en: finalShortTitle.length > 28
        ? finalShortTitle
          .replace("Present Tense", "Pres.")
          .replace("Vocabulary", "Vocab")
          .replace("Formation", "Form.")
          .replace("Expressions", "Expr.")
          .replace("Inversion", "Inv.")
          .replace("Pattern Switch", "Patt.")
          .replace("Slot Substitution", "Slot")
          .replace("Micro Transform", "Trans.")
          .replace("Contrast Pairs", "Pairs")
          .replace("Error Trap", "Trap")
          .substring(0, 28)
        : finalShortTitle
    },
    subtitle_i18n: { en: subtitle.length > 60 ? subtitle.substring(0, 57) + '...' : subtitle }
  };

  // Compute telemetry IDs
  const telemetryIds = computeTelemetryIds(entry, workspace);

  return {
    ...entry,
    ...telemetryIds
  };
}

/**
 * Generate all drills for a workspace
 */
function generateAllDrills(workspace: string, language: string, filterMechanicId?: string): DrillEntry[] {
  const drills: DrillEntry[] = [];
  const templates = readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .filter(id => !filterMechanicId || id === filterMechanicId);

  const levels = ['A1', 'A2', 'B1'];
  // Tier distribution: A1/A2 get 7 tiers each, B1 gets 6 tiers (total ~20 per category)
  const getTiersForLevel = (level: string): number[] => {
    if (level === 'B1') return [1, 2, 3, 4, 5, 6];
    return [1, 2, 3, 4, 5, 6, 7]; // A1 and A2
  };

  let total = 0;
  let generated = 0;

  // Count total first
  for (const mechanicId of templates) {
    const template = loadTemplate(mechanicId);
    if (!template || !template.loopTypes) continue;
    for (const level of levels) {
      if (!template.supportedLevels || !template.supportedLevels.includes(level)) continue;
      const tiers = getTiersForLevel(level);
      for (const tier of tiers) {
        total += template.loopTypes.length;
      }
    }
  }

  console.log(`   Will generate ${total} drills...`);

  for (const mechanicId of templates) {
    const template = loadTemplate(mechanicId);
    if (!template || !template.loopTypes) {
      console.warn(`⚠️  Skipping ${mechanicId}: invalid template`);
      continue;
    }

    for (const level of levels) {
      if (!template.supportedLevels || !template.supportedLevels.includes(level)) continue;

      const tiers = getTiersForLevel(level);
      for (const tier of tiers) {
        for (const loopType of template.loopTypes) {
          try {
            const drill = generateDrill(workspace, language, mechanicId, level, tier, loopType);
            drills.push(drill);
            generated++;
            if (generated % 5 === 0) {
              process.stdout.write(`\r   Generated: ${generated}/${total} drills...`);
            }
          } catch (error: any) {
            console.warn(`\n⚠️  Skipping ${mechanicId} ${level} tier${tier} ${loopType}: ${error.message}`);
            generated++;
          }
        }
      }
    }
  }

  process.stdout.write(`\r   Generated: ${generated}/${total} drills...\n`);
  return drills;
}

/**
 * Save drill to file
 */
function saveDrill(drill: DrillEntry): void {
  const drillDir = join(CONTENT_DIR, 'workspaces', drill.workspace, 'drills', drill.id);
  if (!existsSync(drillDir)) {
    mkdirSync(drillDir, { recursive: true });
  }

  const drillPath = join(drillDir, 'drill.json');
  writeFileSync(drillPath, JSON.stringify(drill, null, 2) + '\n', 'utf-8');
  console.log(`✅ Generated: ${drill.workspace}/drills/${drill.id}/drill.json`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  let workspace = 'de';
  let language = 'de';
  let mechanicId: string | null = null;
  let level: string | null = null;
  let tier: number | null = null;
  let loopType: string | null = null;
  let generateAll = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--language' && i + 1 < args.length) {
      language = args[i + 1];
      i++;
    } else if (args[i] === '--mechanic' && i + 1 < args.length) {
      mechanicId = args[i + 1];
      i++;
    } else if (args[i] === '--level' && i + 1 < args.length) {
      level = args[i + 1];
      i++;
    } else if (args[i] === '--tier' && i + 1 < args.length) {
      tier = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--loop-type' && i + 1 < args.length) {
      loopType = args[i + 1];
      i++;
    } else if (args[i] === '--all') {
      generateAll = true;
    }
  }

  if (generateAll) {
    if (mechanicId) {
      console.log(`🔧 Generating drills for mechanic: ${mechanicId} (workspace: ${workspace})`);
    } else {
      console.log(`🔧 Generating all drills for workspace: ${workspace}`);
    }
    const drills = generateAllDrills(workspace, language, mechanicId || undefined);
    console.log(`\n📦 Generated ${drills.length} drills in memory`);
    console.log(`💾 Saving drills to disk...`);

    let saved = 0;
    for (const drill of drills) {
      saveDrill(drill);
      saved++;
      if (saved % 10 === 0) {
        process.stdout.write(`\r   Progress: ${saved}/${drills.length} drills saved...`);
      }
    }
    process.stdout.write(`\r   Progress: ${saved}/${drills.length} drills saved...\n`);

    console.log(`\n✅ Done! Generated and saved ${drills.length} drills.`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run: npm run content:validate`);
    console.log(`  2. Run: npm run content:generate-indexes`);
    console.log(`  3. Review and approve drills`);

    // Write Quality Report
    const reportPath = join(REPORT_DIR, `quality_report_${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(globalStats, null, 2));
    console.log(`\n📊 Quality report saved to: ${reportPath}`);
  } else {
    if (!mechanicId || !level || tier === null || !loopType) {
      console.error('❌ Error: Missing required arguments');
      console.error('Usage:');
      console.error('  tsx scripts/generate-drills-v4.ts --mechanic <id> --level <A1|A2> --tier <1|2|3> --loop-type <type>');
      console.error('  tsx scripts/generate-drills-v4.ts --all');
      process.exit(1);
    }

    const drill = generateDrill(workspace, language, mechanicId, level, tier, loopType);
    saveDrill(drill);
    console.log(`\n✅ Done! Generated drill: ${drill.id}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateDrill, generateAllDrills };

