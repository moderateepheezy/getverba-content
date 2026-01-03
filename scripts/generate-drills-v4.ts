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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v4', 'mechanics');

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
  
  // Basic conjugation rules
  if (subjectLower === 'ich' || subjectLower === 'i') {
    return stem + 'e';
  } else if (subjectLower === 'du' || subjectLower === 'you') {
    return stem + 'st';
  } else if (subjectLower === 'er' || subjectLower === 'sie' || subjectLower === 'es' || 
             subjectLower === 'he' || subjectLower === 'she' || subjectLower === 'it') {
    return stem + 't';
  } else if (subjectLower === 'wir' || subjectLower === 'we') {
    return verbLower; // Keep infinitive form
  } else if (subjectLower === 'ihr' || subjectLower === 'you' || subjectLower === 'y\'all') {
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
  
  // Determine prompt count based on tier
  const promptCounts = { 1: 6, 2: 8, 3: 10 };
  const promptCount = promptCounts[tier as keyof typeof promptCounts] || 8;
  
  // Get slot dictionaries
  const subjects = template.slotDictionaries.subject || [];
  const verbs = template.slotDictionaries.verb || [];
  const objects = template.slotDictionaries.object || [];
  const modifiers = template.slotDictionaries.modifier || [];
  const time = template.slotDictionaries.time || [];
  const location = template.slotDictionaries.location || [];
  
  // Track used combinations for variation
  const usedCombinations = new Set<string>();
  const uniqueVerbs = new Set<string>();
  const uniqueSubjects = new Set<string>();
  
  // Generate prompts based on loop type
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
    
    // Pattern switch: alternate between different patterns
    if (loopType === 'pattern_switch') {
      const patternIndex = i % 3;
      if (patternIndex === 0) {
        // Pattern 1: subject + verb
        selectedSubject = rng.choice(subjects);
        selectedVerb = rng.choice(verbs);
        slotsChanged.push('subject', 'verb');
      } else if (patternIndex === 1) {
        // Pattern 2: subject + verb + object
        selectedSubject = rng.choice(subjects);
        selectedVerb = rng.choice(verbs);
        selectedObject = rng.choice(objects);
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        // Pattern 3: time + subject + verb
        selectedTime = rng.choice(time);
        selectedSubject = rng.choice(subjects);
        selectedVerb = rng.choice(verbs);
        slotsChanged.push('time', 'subject', 'verb');
      }
    } else if (loopType === 'slot_substitution') {
      // Single template, swap slots
      selectedSubject = rng.choice(subjects);
      selectedVerb = rng.choice(verbs);
      if (objects.length > 0 && i % 2 === 0) {
        selectedObject = rng.choice(objects);
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        slotsChanged.push('subject', 'verb');
      }
    } else if (loopType === 'micro_transform') {
      // Transformations (statement to question, etc.)
      selectedSubject = rng.choice(subjects);
      selectedVerb = rng.choice(verbs);
      if (i % 2 === 0) {
        // Statement
        selectedObject = rng.choice(objects);
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        // Question
        slotsChanged.push('subject', 'verb');
      }
    } else if (loopType === 'contrast_pairs') {
      // Minimal pairs
      if (i % 2 === 0) {
        selectedSubject = rng.choice(subjects.slice(0, 3)); // First person
        selectedVerb = rng.choice(verbs);
        slotsChanged.push('subject', 'verb');
      } else {
        selectedSubject = rng.choice(subjects.slice(3, 6)); // Second person
        selectedVerb = rng.choice(verbs);
        slotsChanged.push('subject', 'verb');
      }
    } else {
      // Default: fast_recall or error_trap
      selectedSubject = rng.choice(subjects);
      selectedVerb = rng.choice(verbs);
      if (objects.length > 0 && rng.next() > 0.5) {
        selectedObject = rng.choice(objects);
        slotsChanged.push('subject', 'verb', 'object');
      } else {
        slotsChanged.push('subject', 'verb');
      }
    }
    
    // Build slots object first
    const slots: Record<string, string[]> = {
      subject: [selectedSubject],
      verb: [selectedVerb] // Will update with conjugated form
    };
    if (selectedObject) slots.object = [selectedObject];
    if (selectedModifier) slots.modifier = [selectedModifier];
    if (selectedTime) slots.time = [selectedTime];
    if (selectedLocation) slots.location = [selectedLocation];
    
    // Conjugate verb based on subject
    const conjugatedVerb = conjugateVerb(selectedVerb, selectedSubject);
    
    // Update slots to use conjugated verb
    slots.verb = [conjugatedVerb];
    
    // Build text (German word order: time -> subject -> verb -> object -> modifier -> location)
    let text = '';
    if (selectedTime) {
      text += `${selectedTime} `;
    }
    text += `${selectedSubject} ${conjugatedVerb}`;
    if (selectedObject) {
      text += ` ${selectedObject}`;
    }
    if (selectedModifier) {
      text += ` ${selectedModifier}`;
    }
    if (selectedLocation) {
      text += ` ${selectedLocation}`;
    }
    text += '.';
    
    // Ensure text is not empty and has at least a subject and verb
    if (!text.trim() || text.trim() === '.') {
      // Retry with minimal valid sentence
      text = `${selectedSubject} ${conjugatedVerb}.`;
    }
    
    // Ensure text meets minimum length (12 chars)
    if (text.length < 12) {
      // Add object or modifier to meet minimum
      if (!selectedObject && objects.length > 0) {
        const extraObject = rng.choice(objects);
        text = `${selectedSubject} ${conjugatedVerb} ${extraObject}.`;
        slots.object = [extraObject];
        if (!slotsChanged.includes('object')) {
          slotsChanged.push('object');
        }
      } else if (!selectedModifier && modifiers.length > 0) {
        const extraModifier = rng.choice(modifiers);
        text = `${selectedSubject} ${conjugatedVerb} ${extraModifier}.`;
        slots.modifier = [extraModifier];
        if (!slotsChanged.includes('modifier')) {
          slotsChanged.push('modifier');
        }
      }
    }
    
    // Ensure variation (avoid exact duplicates)
    const comboKey = `${selectedSubject}|${selectedVerb}|${selectedObject || ''}`;
    if (usedCombinations.has(comboKey) && prompts.length < promptCount) {
      // Retry with different selection
      i--;
      continue;
    }
    usedCombinations.add(comboKey);
    uniqueVerbs.add(selectedVerb);
    uniqueSubjects.add(selectedSubject);
    
    
    prompts.push({
      id: promptId,
      text,
      intent: 'practice',
      gloss_en: 'I am practicing this grammar mechanic.',
      natural_en: text, // Simplified for now
      slotsChanged,
      slots,
      audioUrl: `/v1/audio/${template.mechanicId}_${level}_tier${tier}/${promptId}.mp3`
    });
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
  
  // Build titles
  const shortTitle = `${template.mechanicLabel} ${level}`;
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
  const title = `${template.mechanicLabel}: ${level} (Tier ${tier})`;
  
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
    shortTitle: shortTitle.length > 28 ? shortTitle.substring(0, 25) + '...' : shortTitle,
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
    title_i18n: { en: title },
    shortTitle_i18n: { en: shortTitle.length > 28 ? shortTitle.substring(0, 25) + '...' : shortTitle },
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
function generateAllDrills(workspace: string, language: string): DrillEntry[] {
  const drills: DrillEntry[] = [];
  const templates = readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  
  const levels = ['A1', 'A2'];
  const tiers = [1, 2, 3];
  
  for (const mechanicId of templates) {
    const template = loadTemplate(mechanicId);
    
    for (const level of levels) {
      if (!template.supportedLevels.includes(level)) continue;
      
      for (const tier of tiers) {
        for (const loopType of template.loopTypes) {
          try {
            const drill = generateDrill(workspace, language, mechanicId, level, tier, loopType);
            drills.push(drill);
          } catch (error: any) {
            console.warn(`⚠️  Skipping ${mechanicId} ${level} tier${tier} ${loopType}: ${error.message}`);
          }
        }
      }
    }
  }
  
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
    console.log(`🔧 Generating all drills for workspace: ${workspace}`);
    const drills = generateAllDrills(workspace, language);
    console.log(`\n📦 Generated ${drills.length} drills`);
    
    for (const drill of drills) {
      saveDrill(drill);
    }
    
    console.log(`\n✅ Done! Generated ${drills.length} drills.`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run: npm run content:validate`);
    console.log(`  2. Run: npm run content:generate-indexes`);
    console.log(`  3. Review and approve drills`);
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

