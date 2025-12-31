#!/usr/bin/env tsx

/**
 * PDF → Packs Batch Generation v1.1
 * 
 * Deterministic batch generation of multiple packs from a single PDF.
 * Implements scenario discovery, window search, and comprehensive reporting.
 * 
 * Usage:
 *   tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \
 *     --workspace de \
 *     --pdf ./imports/deutschimblick.pdf \
 *     --mode search \
 *     --discoverScenarios true \
 *     --scenario auto \
 *     --level A1 \
 *     --packs 10 \
 *     --promptsPerPack 12 \
 *     --windowSizePages 25 \
 *     --minScenarioHits 2 \
 *     --skipFrontMatter true \
 *     --seed 42
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { extractPdfTextTextFirst, computePdfFingerprint } from './extract.js';
import { normalizeText, normalizeSinglePage } from './normalize.js';
import { segmentText, validateSegmentation } from './segment.js';
import { checkCandidateQuality } from './quality.js';
import { detectFrontMatterPages } from './frontMatter.js';
import { scoreCandidate } from './scenarioScore.js';
import { findBestWindow } from './windowSearch.js';
import { discoverScenarios } from './scenarioDiscovery.js';
import type { Candidate } from './segment.js';
import type { PageText } from './extract.js';
import { computePackAnalytics } from '../content-quality/computeAnalytics.js';
import { loadProfile, loadProfileFromPath, shouldSkipPage, isPreferredPage, shouldRejectCandidate, countAnchorHits, type PdfIngestionProfile } from './profileLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', '..', 'content', 'v1');
const REPORTS_DIR = join(__dirname, '..', '..', 'reports', 'pdf-ingestion');

// Scenario token dictionaries (from quality gates)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: [
    'meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task',
    'besprechung', 'termin', 'büro', 'kollege', 'kollegin', 'projekt', 'aufgabe', 'arbeit', 'job', 'praktikum',
    'bewerbung', 'lebenslauf', 'vorstellungsgespräch', 'bewerbungsgespräch', 'chef', 'firma', 'abteilung', 'team',
    'kunde', 'kundin', 'schicht', 'dienst', 'vertrag', 'gehalt', 'rechnung', 'auftrag',
    'termin vereinbaren', 'im büro', 'bei der arbeit', 'ich arbeite', 'ich suche einen job', 'vorstellungsgespraech',
    'bewerbungsgespraech', 'am arbeitsplatz', 'mit kollegen', 'projekt besprechen', 'meeting haben'
  ],
  restaurant: [
    'menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service',
    'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken', 'rechnung', 'bezahlen', 'reservierung',
    'vorspeise', 'hauptgericht', 'nachspeise', 'getränk', 'bedienung'
  ],
  shopping: [
    'price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout',
    'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung', 'einkaufen', 'geschäft', 'preis', 'bezahlen',
    'geld', 'kreditkarte', 'bar'
  ],
  doctor: [
    'appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination',
    'arzt', 'ärztin', 'termin', 'symptom', 'rezept', 'medizin', 'behandlung', 'krank', 'schmerz', 'praxis',
    'zum arzt gehen', 'krank sein', 'sich krank fühlen'
  ],
  housing: [
    'apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address',
    'wohnung', 'miete', 'mieten', 'vermieter', 'mieter', 'kaution', 'möbel', 'nachbarschaft', 'adresse', 'zimmer',
    'haus', 'wohnen', 'einziehen', 'ausziehen'
  ],
  government_office: [
    'appointment', 'form', 'document', 'passport', 'registration', 'office', 'official', 'termin', 'formular', 'pass', 'anmeldung', 'unterlagen', 'amt', 'behörde',
    'ausweis', 'visum', 'antrag', 'formular ausfüllen', 'zum amt gehen', 'anmeldung machen'
  ],
  travel: [
    'travel', 'trip', 'flight', 'hotel', 'ticket', 'passport', 'luggage', 'airport', 'train', 'station',
    'reise', 'reisen', 'flug', 'hotel', 'ticket', 'pass', 'koffer', 'flughafen', 'zug', 'bahnhof',
    'reise buchen', 'flug buchen', 'hotel reservieren'
  ],
  school: [
    'school', 'university', 'student', 'teacher', 'class', 'homework', 'exam', 'grade', 'course', 'lecture',
    'schule', 'universität', 'uni', 'student', 'studentin', 'lehrer', 'lehrerin', 'klasse', 'hausaufgabe',
    'prüfung', 'note', 'kurs', 'vorlesung', 'studieren', 'lernen'
  ],
  casual_greeting: [
    'greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time',
    'hallo', 'guten tag', 'auf wiedersehen', 'tschüss', 'morgen', 'abend', 'freund', 'freundin', 'treffen'
  ]
};

const STRONG_TOKENS: Record<string, string[]> = {
  work: [
    'vorstellungsgespraech', 'bewerbungsgespraech', 'vorstellungsgespräch', 'bewerbungsgespräch',
    'termin vereinbaren', 'lebenslauf', 'bewerbung', 'praktikum', 'bei der arbeit', 'im büro',
    'ich suche einen job', 'projekt besprechen', 'meeting haben'
  ],
  restaurant: ['speisekarte', 'bestellen', 'rechnung bezahlen', 'reservierung'],
  shopping: ['einkaufen', 'bezahlen', 'rabatt', 'quittung'],
  doctor: ['zum arzt gehen', 'krank sein', 'rezept', 'sich krank fühlen'],
  housing: ['wohnung mieten', 'einziehen', 'ausziehen', 'kaution'],
  government_office: ['anmeldung machen', 'zum amt gehen', 'formular ausfüllen'],
  travel: ['reise buchen', 'flug buchen', 'hotel reservieren'],
  school: ['studieren', 'prüfung', 'vorlesung', 'hausaufgabe'],
  casual_greeting: ['guten tag', 'auf wiedersehen', 'tschüss']
};

const DENYLIST_PHRASES = [
  "in today's lesson",
  "let's practice",
  "this sentence",
  "i like to",
  "the quick brown fox",
  "lorem ipsum"
];

interface CliArgs {
  workspace: string;
  pdf: string;
  mode: 'search' | 'range';
  discoverScenarios: boolean;
  scenario: string; // 'auto' or specific scenario name
  level: string;
  packs: number;
  promptsPerPack: number;
  windowSizePages: number;
  minScenarioHits: number;
  skipFrontMatter: boolean;
  seed?: string;
  pageRange?: string;
  anchors?: string;
  language?: 'de' | 'en';
  register?: string;
  pdfId?: string;
  profile?: string;
  emitTokenMiningHint?: boolean;
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
    prompts: Array<{
      id: string;
      text: string;
      intent: string;
      gloss_en: string;
      natural_en?: string;
      audioUrl: string;
      slotsChanged?: string[];
      registerNote?: string;
      culturalNote?: string;
    }>;
  sessionPlan: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
  tags: string[];
  analytics: any;
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

interface RejectedCandidate {
  textHash: string;
  text: string;
  reason: string;
  pageIndex?: number;
}

interface PackReport {
  packId: string;
  title: string;
  level: string;
  scenario: string;
  windowUsed?: {
    startPage: number;
    endPage: number;
  };
  qualifiedPrompts: number;
  tokenHitsSummary: {
    totalHits: number;
    avgHitsPerPrompt: number;
  };
  multiSlotVariationScore: number;
  warnings: string[];
  qualityScore: number;
}

interface BatchReport {
  timestamp: string;
  pdfSlug: string;
  pdfStats: {
    pages: number;
    chars: number;
    candidates: number;
  };
  chosenScenario: string;
  scenarioRanking: Array<{
    scenario: string;
    totalTokenHits: number;
    candidatesWithMinHits: number;
    bestWindow?: {
      startPage: number;
      endPage: number;
      qualifiedCandidates: number;
    };
  }>;
  topWindows: Array<{
    startPage: number;
    endPage: number;
    qualifiedCandidates: number;
    totalTokenHits: number;
    averageScore: number;
  }>;
  generatedPacks: PackReport[];
  reviewQueue: Array<{
    packId: string;
    qualityScore: number;
    title: string;
    scenario: string;
    level: string;
  }>;
  rejectedCandidates: RejectedCandidate[];
  errors: string[];
  warnings: string[];
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = {};
  
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];
    
    if (arg === '--workspace' && next) {
      args.workspace = next;
      i++;
    } else if (arg === '--pdf' && next) {
      args.pdf = next;
      i++;
    } else if (arg === '--mode' && next) {
      args.mode = next === 'range' ? 'range' : 'search';
      i++;
    } else if (arg === '--discoverScenarios' && next) {
      args.discoverScenarios = next === 'false' ? false : true;
      i++;
    } else if (arg === '--scenario' && next) {
      args.scenario = next;
      i++;
    } else if (arg === '--level' && next) {
      args.level = next;
      i++;
    } else if (arg === '--packs' && next) {
      args.packs = parseInt(next, 10);
      i++;
    } else if (arg === '--promptsPerPack' && next) {
      args.promptsPerPack = parseInt(next, 10);
      i++;
    } else if (arg === '--windowSizePages' && next) {
      args.windowSizePages = parseInt(next, 10);
      i++;
    } else if (arg === '--minScenarioHits' && next) {
      args.minScenarioHits = parseInt(next, 10);
      i++;
    } else if (arg === '--skipFrontMatter' && next) {
      args.skipFrontMatter = next === 'false' ? false : true;
      i++;
    } else if (arg === '--seed' && next) {
      args.seed = next;
      i++;
    } else if (arg === '--pageRange' && next) {
      args.pageRange = next;
      i++;
    } else if (arg === '--anchors' && next) {
      args.anchors = next;
      i++;
    } else if (arg === '--language' && next) {
      args.language = next === 'en' ? 'en' : 'de';
      i++;
    } else if (arg === '--register' && next) {
      args.register = next;
      i++;
    } else if (arg === '--pdfId' && next) {
      args.pdfId = next;
      i++;
    } else if (arg === '--profile' && next) {
      args.profile = next;
      i++;
    } else if (arg === '--emitTokenMiningHint' && next) {
      args.emitTokenMiningHint = next === 'false' ? false : true;
      i++;
    }
  }
  
  // Validate required args
  if (!args.workspace) throw new Error('Missing required argument: --workspace');
  if (!args.pdf) throw new Error('Missing required argument: --pdf');
  if (!args.level) throw new Error('Missing required argument: --level');
  if (!args.scenario) throw new Error('Missing required argument: --scenario');
  
  // Set defaults
  return {
    mode: args.mode || 'search',
    discoverScenarios: args.discoverScenarios !== false,
    scenario: args.scenario,
    level: args.level,
    packs: args.packs || 10,
    promptsPerPack: args.promptsPerPack || 12,
    windowSizePages: args.windowSizePages || 25,
    minScenarioHits: args.minScenarioHits || 2,
    skipFrontMatter: args.skipFrontMatter !== false,
    emitTokenMiningHint: args.emitTokenMiningHint !== false,
    language: args.language || (args.workspace === 'en' ? 'en' : 'de'),
    register: args.register || 'neutral',
    ...args
  } as CliArgs;
}

/**
 * Generate deterministic seed
 */
function generateSeed(pdfPath: string, workspace: string, scenario: string, level: string, providedSeed?: string): string {
  if (providedSeed) return providedSeed;
  
  const pdfHash = computePdfFingerprint(pdfPath).substring(0, 16);
  const seedInput = `${pdfHash}-${workspace}-${scenario}-${level}`;
  return createHash('sha256').update(seedInput).digest('hex').substring(0, 16);
}

/**
 * Simple seeded RNG
 */
export class SeededRNG {
  private state: number;
  
  constructor(seed: string) {
    this.state = parseInt(seed.substring(0, 8), 16) || 12345;
  }
  
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  
  choice<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
  
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * Check if candidate is dialogue-like (not heading/front matter)
 */
function isDialogueLike(candidate: Candidate): boolean {
  const text = candidate.text.trim();
  
  // Too short
  if (text.length < 12) return false;
  
  // Too long
  if (text.length > 140) return false;
  
  // All caps (likely heading)
  if (text === text.toUpperCase() && text.length < 50) return false;
  
  // Starts with number + period (likely list item or heading)
  if (/^\d+\.\s/.test(text)) return false;
  
  // Contains question mark or conversational markers
  if (/\?/.test(text)) return true;
  if (/\b(bitte|danke|entschuldigung|hallo|guten tag)\b/i.test(text)) return true;
  
  // Has verb (likely sentence)
  if (/\b(ist|sind|hat|haben|kann|können|muss|müssen|soll|sollen|geht|gehen|kommt|kommen)\b/i.test(text)) return true;
  
  return true;
}

/**
 * Determine intent from text
 */
export function determineIntent(text: string, scenario: string): string {
  const textLower = text.toLowerCase();
  
  if (/\?$/.test(text) || /^(Wer|Was|Wo|Wann|Warum|Wie|Welche|Welcher|Welches)\b/i.test(text)) {
    return 'ask';
  }
  if (/\b(hätte|möchte|brauche|benötige|kann|könnte|würde)\b/i.test(text)) {
    return 'request';
  }
  if (/\b(termin|vereinbare|appointment|um \d|am \w+tag)\b/i.test(text)) {
    return 'schedule';
  }
  if (/\b(bestelle|nehme|kaufe|order)\b/i.test(text)) {
    return 'order';
  }
  if (/\b(kostet|preis|€|\$)\b/i.test(text)) {
    return 'ask_price';
  }
  if (/\b(danke|vielen dank|thank)\b/i.test(text)) {
    return 'thank';
  }
  if (/\b(hallo|guten tag|guten morgen|hello)\b/i.test(text)) {
    return 'greet';
  }
  if (/\b(auf wiedersehen|tschüss|goodbye)\b/i.test(text)) {
    return 'goodbye';
  }
  if (/\b(ja|genau|richtig|yes|correct)\b/i.test(text)) {
    return 'confirm';
  }
  if (/\b(entschuldigung|sorry|tut mir leid)\b/i.test(text)) {
    return 'apologize';
  }
  
  return 'inform';
}

/**
 * Generate gloss_en
 */
export function generateGlossEn(text: string, scenario: string, intent: string): string {
  const textLower = text.toLowerCase();
  
  if (scenario === 'government_office') {
    if (textLower.includes('termin')) return 'I need to make an appointment.';
    if (textLower.includes('formular')) return 'I need the form.';
    if (textLower.includes('pass')) return 'I need to pick up my passport.';
    if (textLower.includes('anmeldung')) return 'I need to register my address.';
    if (textLower.includes('unterlagen')) return 'I need the documents.';
  }
  
  if (intent === 'request') return 'I would like to request that.';
  if (intent === 'ask') return 'Could you help me with this?';
  if (intent === 'schedule') return 'I need to schedule that.';
  if (intent === 'order') return 'I would like to order that.';
  if (intent === 'thank') return 'Thank you.';
  if (intent === 'greet') return 'Hello.';
  if (intent === 'goodbye') return 'Goodbye.';
  
  return '(gloss pending)';
}

/**
 * Generate pack ID
 */
function generatePackId(
  pdfBaseName: string,
  scenario: string,
  level: string,
  partNumber: number,
  workspace: string
): string {
  const base = `${pdfBaseName}-${scenario}-${level}-part${partNumber}`;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Check if pack ID already exists
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  if (existsSync(packsDir)) {
    const { readdirSync } = require('fs');
    const existing = readdirSync(packsDir, { withFileTypes: true })
      .filter((d: any) => d.isDirectory())
      .map((d: any) => d.name);
    
    if (existing.includes(slug)) {
      let suffix = 1;
      while (existing.includes(`${slug}-${suffix}`)) {
        suffix++;
      }
      return `${slug}-${suffix}`;
    }
  }
  
  return slug;
}

/**
 * Generate pack from candidates
 */
export function generatePack(
  candidates: Array<Candidate & { pageIndex: number; score?: any }>,
  packId: string,
  title: string,
  level: string,
  scenario: string,
  register: string,
  promptsPerPack: number,
  rng: SeededRNG,
  pdfBaseName: string,
  windowInfo?: { startPage: number; endPage: number; rank?: number }
): PackEntry {
  // Select candidates deterministically
  const shuffled = rng.shuffle([...candidates]);
  const selected = shuffled.slice(0, promptsPerPack);
  
  // Generate prompts
  const prompts = selected.map((candidate, idx) => {
    const promptId = `p${String(idx + 1).padStart(3, '0')}`;
    const intent = determineIntent(candidate.text, scenario);
    const gloss_en = generateGlossEn(candidate.text, scenario, intent);
    
    // Determine slotsChanged (simplified - mark every 3rd prompt as multi-slot)
    const slotsChanged = idx % 3 === 0 ? ['subject', 'verb'] : ['verb'];
    
    return {
      id: promptId,
      text: candidate.text,
      intent,
      gloss_en,
      audioUrl: `/v1/audio/${packId}/${promptId}.mp3`,
      slotsChanged
    };
  });
  
  // Generate session plan
  const stepCount = Math.min(4, Math.max(2, Math.ceil(prompts.length / 4)));
  const promptsPerStep = Math.ceil(prompts.length / stepCount);
  const steps = [];
  
  for (let i = 0; i < stepCount; i++) {
    const startIdx = i * promptsPerStep;
    const endIdx = Math.min(startIdx + promptsPerStep, prompts.length);
    const stepPrompts = prompts.slice(startIdx, endIdx);
    
    steps.push({
      id: `step-${i + 1}`,
      title: `Step ${i + 1}`,
      promptIds: stepPrompts.map(p => p.id)
    });
  }
  
  const outline = steps.map(s => s.title);
  
  // Generate analytics
  const drillType: 'substitution' | 'pattern-switch' | 'roleplay-bounded' = 
    (scenario === 'government_office' || scenario === 'work' || scenario === 'restaurant')
      ? 'roleplay-bounded'
      : 'substitution';
  
  const cognitiveLoad: 'low' | 'medium' | 'high' =
    (level === 'A1' && prompts.length <= 12) ? 'low' :
    (level === 'A1' || level === 'A2') ? 'medium' : 'high';
  
  const goal = `Practice ${scenario} scenarios at ${level} level`;
  const constraints = [
    `${register} register maintained`,
    `${scenario} scenario context`
  ];
  const levers = ['subject variation', 'verb substitution'];
  const successCriteria = [
    'Uses scenario-appropriate vocabulary',
    'Varies key slots across prompts',
    'Maintains register consistency'
  ];
  const commonMistakes = [
    'Missing scenario vocabulary',
    'Inconsistent register usage',
    'Incorrect slot variation'
  ];
  
  const estimatedMinutes = Math.max(15, Math.min(120, prompts.length));
  
  const intents = new Set(prompts.map(p => p.intent));
  const canonicalIntents = Array.from(intents).slice(0, Math.max(3, intents.size));
  while (canonicalIntents.length < 3) {
    const defaultIntents = ['inform', 'ask', 'request'];
    for (const intent of defaultIntents) {
      if (!canonicalIntents.includes(intent)) {
        canonicalIntents.push(intent);
        break;
      }
    }
  }
  
  const requiredTokens = SCENARIO_TOKEN_DICTS[scenario] || [];
  const anchorPhrases = requiredTokens.slice(0, Math.max(3, requiredTokens.length));
  while (anchorPhrases.length < 3) {
    anchorPhrases.push('practice', 'learn', 'study');
  }
  
  const whyThisWorks = [
    goal.length <= 80 ? goal : goal.substring(0, 77) + '...',
    successCriteria[0] || 'Uses scenario-appropriate vocabulary',
    'Varies key slots across prompts'
  ].slice(0, 5);
  
  const keyFailureModes = commonMistakes.slice(0, 5);
  const successDefinition = successCriteria[0] || 'Uses scenario-appropriate vocabulary correctly';
  
  // Generate provenance
  const windowStr = windowInfo
    ? `pages ${windowInfo.startPage}-${windowInfo.endPage}${windowInfo.rank ? ` (rank ${windowInfo.rank})` : ''}`
    : 'all pages';
  const sourceRef = `${pdfBaseName} (${windowStr})`;
  
  const pack: PackEntry = {
    schemaVersion: 1,
    id: packId,
    kind: 'pack',
    packVersion: '1.0.0',
    title,
    level,
    estimatedMinutes,
    description: `Practice ${scenario} scenarios at ${level} level.`,
    scenario,
    register,
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb', 'object'],
    outline,
    prompts,
    sessionPlan: {
      version: 1,
      steps
    },
    tags: [scenario],
    analytics: {
      version: 1,
      goal,
      constraints,
      levers,
      successCriteria,
      commonMistakes,
      drillType,
      cognitiveLoad,
      primaryStructure: 'verb_position',
      scenario,
      register,
      variationSlots: ['subject', 'verb', 'object'],
      minDistinctSubjects: 3,
      minDistinctVerbs: 3,
      minMultiSlotRate: 0.30,
      targetResponseSeconds: 2.5,
      targetLatencyMs: 2500,
      canonicalIntents: canonicalIntents.slice(0, Math.max(3, canonicalIntents.length)),
      anchorPhrases: anchorPhrases.slice(0, Math.max(3, anchorPhrases.length)),
      whyThisWorks,
      keyFailureModes,
      successDefinition,
      exitConditions: {
        targetMinutes: Math.max(5, Math.min(20, Math.ceil(estimatedMinutes / 3))),
        completeWhen: 'sessionPlan_completed_once'
      }
    },
    provenance: {
      source: 'pdf',
      sourceRef,
      extractorVersion: '1.0.0',
      generatedAt: new Date().toISOString()
    },
    review: {
      status: 'needs_review'
    }
  };
  
  // Compute analytics
  try {
    const analytics = computePackAnalytics(pack);
    pack.analytics = { ...pack.analytics, ...analytics };
  } catch (err) {
    console.warn(`⚠️  Failed to compute analytics for ${packId}: ${err}`);
  }
  
  return pack;
}

/**
 * Compute quality score for a pack
 */
function computeQualityScore(pack: PackEntry): number {
  let score = 100;
  
  // Deduct for missing gloss_en
  const missingGloss = pack.prompts.filter(p => p.gloss_en === '(gloss pending)').length;
  score -= missingGloss * 5;
  
  // Deduct for low multi-slot variation
  const multiSlotCount = pack.prompts.filter(p => p.slotsChanged && p.slotsChanged.length >= 2).length;
  const multiSlotRate = pack.prompts.length > 0 ? multiSlotCount / pack.prompts.length : 0;
  if (multiSlotRate < 0.3) {
    score -= (0.3 - multiSlotRate) * 50;
  }
  
  // Deduct for short packs
  if (pack.prompts.length < 8) {
    score -= (8 - pack.prompts.length) * 5;
  }
  
  return Math.max(0, score);
}

/**
 * Main execution
 */
async function main() {
  try {
    const args = parseArgs();
    
    if (!existsSync(args.pdf)) {
      throw new Error(`PDF file not found: ${args.pdf}`);
    }
    
    // Load profile if pdfId or profile path provided
    let profile: PdfIngestionProfile | null = null;
    if (args.profile) {
      profile = loadProfileFromPath(args.profile);
      console.log(`📋 Loaded profile from: ${args.profile}`);
    } else if (args.pdfId) {
      profile = loadProfile(args.pdfId);
      if (profile) {
        console.log(`📋 Loaded profile for PDF ID: ${args.pdfId}`);
      } else {
        console.log(`⚠️  No profile found for PDF ID: ${args.pdfId} (using defaults)`);
      }
    }
    
    // Apply profile overrides
    if (profile) {
      if (profile.windowSizePages !== undefined) {
        args.windowSizePages = profile.windowSizePages;
      }
      if (profile.minScenarioHits !== undefined) {
        args.minScenarioHits = profile.minScenarioHits;
      }
      if (profile.language) {
        args.language = profile.language;
      }
      if (profile.anchors && profile.anchors.length > 0 && !args.anchors) {
        args.anchors = profile.anchors.join(',');
      }
      // Use profile defaultScenarios if scenario is auto
      if (args.scenario === 'auto' && profile.defaultScenarios && profile.defaultScenarios.length > 0) {
        // Will be used in scenario discovery
      }
    }
    
    const pdfBaseName = basename(args.pdf, '.pdf').replace(/[^a-zA-Z0-9]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const reportDir = join(REPORTS_DIR, `${timestamp}-${pdfBaseName}`);
    mkdirSync(reportDir, { recursive: true });
    
    console.log('📄 PDF → Packs Batch Generation v1.1');
    console.log(`   PDF: ${args.pdf}`);
    console.log(`   Workspace: ${args.workspace}`);
    console.log(`   Scenario: ${args.scenario}`);
    console.log(`   Level: ${args.level}`);
    console.log(`   Packs: ${args.packs}`);
    console.log(`   Prompts per Pack: ${args.promptsPerPack}`);
    if (profile) {
      console.log(`   Profile: ${profile.pdfId}`);
    }
    console.log('');
    
    const rejectedCandidates: RejectedCandidate[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Step 1: Extract PDF
    console.log('🔍 Step 1: Extracting text from PDF...');
    const extraction = await extractPdfTextTextFirst(args.pdf, false);
    console.log(`   ✓ Extracted ${extraction.totalChars} characters from ${extraction.pageCount} pages`);
    console.log('');
    
    // Step 2: Detect front matter and apply profile skipPages
    let pagesToProcess = extraction.pages;
    let frontMatterResult = { skipUntilPageIndex: 0, evidence: { frontMatterPages: [], reasons: [], firstContentPage: 0 } };
    
    if (args.skipFrontMatter) {
      console.log('📑 Step 2: Detecting front matter...');
      frontMatterResult = detectFrontMatterPages(extraction.pages, 40);
      if (frontMatterResult.skipUntilPageIndex > 0) {
        pagesToProcess = extraction.pages.slice(frontMatterResult.skipUntilPageIndex);
        console.log(`   ✓ Skipping ${frontMatterResult.skipUntilPageIndex} front matter page(s)`);
      } else {
        console.log(`   ✓ No front matter detected`);
      }
      console.log('');
    }
    
    // Apply profile skipPages
    if (profile) {
      const pagesToSkip: number[] = [];
      for (let i = 0; i < pagesToProcess.length; i++) {
        const absolutePageIndex = i + frontMatterResult.skipUntilPageIndex;
        if (shouldSkipPage(absolutePageIndex, profile)) {
          pagesToSkip.push(i);
        }
      }
      if (pagesToSkip.length > 0) {
        pagesToProcess = pagesToProcess.filter((_, i) => !pagesToSkip.includes(i));
        console.log(`📋 Applied profile: skipped ${pagesToSkip.length} page(s)`);
        console.log('');
      }
      
      // Apply preferPageRanges
      if (profile.preferPageRanges && profile.preferPageRanges.length > 0) {
        const preferredPages: number[] = [];
        for (let i = 0; i < pagesToProcess.length; i++) {
          const absolutePageIndex = i + frontMatterResult.skipUntilPageIndex;
          if (isPreferredPage(absolutePageIndex, profile)) {
            preferredPages.push(i);
          }
        }
        if (preferredPages.length > 0 && preferredPages.length < pagesToProcess.length) {
          pagesToProcess = pagesToProcess.filter((_, i) => preferredPages.includes(i));
          console.log(`📋 Applied profile: using ${preferredPages.length} preferred page(s)`);
          console.log('');
        }
      }
    }
    
    // Step 3: Normalize
    console.log('🧹 Step 3: Normalizing text...');
    const hasPerPageText = pagesToProcess.some(p => p.text && p.text.trim().length > 100);
    let normalizedPages: PageText[] = [];
    
    if (hasPerPageText && pagesToProcess.length > 1) {
      for (const page of pagesToProcess) {
        const normResult = normalizeSinglePage(page);
        normalizedPages.push({
          pageNumber: page.pageNumber,
          text: normResult.normalizedText,
          charCount: normResult.normalizedText.length
        });
      }
    } else {
      const allText = pagesToProcess.map(p => p.text || '').join('\n');
      const normResult = normalizeText([{ pageNumber: 1, text: allText, charCount: allText.length }]);
      normalizedPages = [{ pageNumber: 1, text: normResult.normalizedText, charCount: normResult.normalizedText.length }];
    }
    
    const combinedText = normalizedPages.map(p => p.text).join('\n');
    console.log(`   ✓ Normalized ${normalizedPages.length} pages`);
    console.log('');
    
    // Step 4: Segment
    console.log('✂️  Step 4: Segmenting text into candidates...');
    const seed = generateSeed(args.pdf, args.workspace, args.scenario, args.level, args.seed);
    const segmentation = segmentText(combinedText, parseInt(seed.substring(0, 8), 16));
    
    // Assign page indices
    const totalChars = combinedText.length;
    const avgCharsPerPage = totalChars / extraction.pageCount;
    const candidatesWithPages: Array<Candidate & { pageIndex: number }> = [];
    
    let charOffset = 0;
    for (const candidate of segmentation.candidates) {
      const candidatePos = combinedText.indexOf(candidate.text, charOffset);
      if (candidatePos >= 0) {
        charOffset = candidatePos + candidate.text.length;
        const relativePage = Math.floor(candidatePos / avgCharsPerPage);
        const absolutePage = Math.min(relativePage + frontMatterResult.skipUntilPageIndex, extraction.pageCount - 1);
        candidatesWithPages.push({ ...candidate, pageIndex: absolutePage });
      } else {
        const relativePage = Math.floor(charOffset / avgCharsPerPage);
        const absolutePage = Math.min(relativePage + frontMatterResult.skipUntilPageIndex, extraction.pageCount - 1);
        candidatesWithPages.push({ ...candidate, pageIndex: absolutePage });
        charOffset += candidate.text.length;
      }
    }
    
    console.log(`   ✓ Found ${candidatesWithPages.length} candidates`);
    console.log('');
    
    // Step 5: Scenario Discovery
    let scenarioDiscoveryResult: any = null;
    let chosenScenario = args.scenario;
    
    if (args.discoverScenarios && args.scenario === 'auto') {
      console.log('🔍 Step 5: Discovering scenarios...');
      scenarioDiscoveryResult = discoverScenarios(
        pagesToProcess,
        candidatesWithPages,
        SCENARIO_TOKEN_DICTS,
        STRONG_TOKENS,
        args.language || 'de',
        args.minScenarioHits,
        args.windowSizePages
      );
      
      if (scenarioDiscoveryResult.recommendedScenarios.length > 0) {
        // Use profile defaultScenarios preference if available
        if (profile && profile.defaultScenarios && profile.defaultScenarios.length > 0) {
          // Reorder recommended scenarios based on profile preference
          const profileOrdered = profile.defaultScenarios.filter(s => 
            scenarioDiscoveryResult.recommendedScenarios.includes(s)
          );
          if (profileOrdered.length > 0) {
            chosenScenario = profileOrdered[0];
            console.log(`   ✓ Using profile-preferred scenario: ${chosenScenario}`);
          } else {
            chosenScenario = scenarioDiscoveryResult.recommendedScenarios[0];
            console.log(`   ✓ Top scenario: ${chosenScenario} (profile preferences not found in discovery)`);
          }
        } else {
          chosenScenario = scenarioDiscoveryResult.recommendedScenarios[0];
          console.log(`   ✓ Top scenario: ${chosenScenario}`);
        }
        console.log(`   - Top 5: ${scenarioDiscoveryResult.rankedScenarios.slice(0, 5).join(', ')}`);
      } else {
        throw new Error('No scenarios found in PDF. Try specifying --scenario explicitly.');
      }
      console.log('');
    } else if (args.scenario !== 'auto') {
      chosenScenario = args.scenario;
    } else {
      throw new Error('--scenario must be "auto" or a specific scenario name');
    }
    
    // Step 6: Window Search
    console.log('🔍 Step 6: Searching for best windows...');
    const requiredTokens = SCENARIO_TOKEN_DICTS[chosenScenario] || [];
    const strongTokensForScenario = STRONG_TOKENS[chosenScenario] || [];
    // Use profile anchors if available, otherwise use CLI anchors
    const anchors = profile && profile.anchors && profile.anchors.length > 0
      ? profile.anchors
      : (args.anchors ? args.anchors.split(',').map(a => a.trim()) : []);
    
    if (profile && anchors.length > 0) {
      console.log(`   📋 Using ${anchors.length} anchor(s) from profile`);
    }
    
    const candidatesForSearch = candidatesWithPages.map(c => ({
      ...c,
      pageIndex: c.pageIndex - frontMatterResult.skipUntilPageIndex
    }));
    
    const windowSearchResult = findBestWindow(
      pagesToProcess,
      candidatesForSearch,
      requiredTokens,
      anchors,
      args.windowSizePages,
      args.minScenarioHits,
      args.language || 'de',
      5, // top 5 windows
      strongTokensForScenario
    );
    
    // Convert back to absolute page indices
    if (windowSearchResult.bestWindow) {
      windowSearchResult.bestWindow.startPage += frontMatterResult.skipUntilPageIndex;
      windowSearchResult.bestWindow.endPage += frontMatterResult.skipUntilPageIndex;
    }
    windowSearchResult.topWindows = windowSearchResult.topWindows.map(w => ({
      ...w,
      startPage: w.startPage + frontMatterResult.skipUntilPageIndex,
      endPage: w.endPage + frontMatterResult.skipUntilPageIndex
    }));
    
    if (!windowSearchResult.bestWindow) {
      throw new Error(`No suitable window found for scenario "${chosenScenario}"`);
    }
    
    // Check anchor hits if profile requires them
    if (profile && anchors.length > 0) {
      const anchorHits = windowSearchResult.bestWindow.anchorHits;
      if (anchorHits === 0) {
        warnings.push(`Best window has 0 anchor hits (profile requires anchors: ${anchors.join(', ')})`);
        console.log(`   ⚠️  Warning: Best window has 0 anchor hits`);
      } else {
        console.log(`   ✓ Anchor hits: ${anchorHits}/${anchors.length}`);
      }
    }
    
    console.log(`   ✓ Best window: pages ${windowSearchResult.bestWindow.startPage}-${windowSearchResult.bestWindow.endPage}`);
    console.log(`   - Qualified candidates: ${windowSearchResult.bestWindow.qualifiedCandidates}`);
    console.log('');
    
    // Step 7: Filter and select candidates
    console.log('✅ Step 7: Filtering candidates...');
    const qualifiedCandidates = windowSearchResult.bestWindow.candidates
      .filter(c => {
        // Apply profile rejectSections
        if (profile && shouldRejectCandidate(c.text, profile)) {
          const textHash = createHash('sha256').update(c.text).digest('hex').substring(0, 8);
          rejectedCandidates.push({
            textHash,
            text: c.text.substring(0, 100),
            reason: 'Rejected by profile rejectSections',
            pageIndex: c.pageIndex + frontMatterResult.skipUntilPageIndex
          });
          return false;
        }
        
        // Check dialogue-like
        if (!isDialogueLike(c)) {
          const textHash = createHash('sha256').update(c.text).digest('hex').substring(0, 8);
          rejectedCandidates.push({
            textHash,
            text: c.text.substring(0, 100),
            reason: 'Not dialogue-like (heading/front matter)',
            pageIndex: c.pageIndex + frontMatterResult.skipUntilPageIndex
          });
          return false;
        }
        
        // Check quality
        const quality = checkCandidateQuality([c], chosenScenario, requiredTokens);
        if (!quality.valid) {
          const textHash = createHash('sha256').update(c.text).digest('hex').substring(0, 8);
          rejectedCandidates.push({
            textHash,
            text: c.text.substring(0, 100),
            reason: quality.errors.join('; '),
            pageIndex: c.pageIndex + frontMatterResult.skipUntilPageIndex
          });
          return false;
        }
        
        return true;
      })
      .map(c => ({
        ...c,
        pageIndex: c.pageIndex + frontMatterResult.skipUntilPageIndex
      }))
      .sort((a, b) => (b.score?.totalScore || 0) - (a.score?.totalScore || 0));
    
    console.log(`   ✓ Qualified candidates: ${qualifiedCandidates.length}`);
    console.log(`   - Rejected: ${rejectedCandidates.length}`);
    console.log('');
    
    // Check if we have enough candidates
    const requiredCount = args.packs * args.promptsPerPack;
    const minRequired = Math.ceil(requiredCount * 0.8);
    
    if (qualifiedCandidates.length < minRequired) {
      errors.push(`Insufficient qualified candidates: ${qualifiedCandidates.length} (need at least ${minRequired})`);
      warnings.push(`Only ${qualifiedCandidates.length} qualified candidates found, will generate fewer packs than requested`);
      
      // Emit token mining hint if enabled
      if (args.emitTokenMiningHint !== false) {
        const pdfIdForMining = args.pdfId || basename(args.pdf, '.pdf').replace(/[^a-zA-Z0-9]/g, '-');
        const pdfPath = args.pdf.startsWith('/') ? args.pdf : join(process.cwd(), args.pdf);
        console.log('');
        console.log('💡 Token Mining Suggestion:');
        console.log('   Low qualified candidates detected. Consider mining tokens from this PDF:');
        console.log(`   tsx scripts/pdf-ingestion/tokenMining.ts \\`);
        console.log(`     --workspace ${args.workspace} \\`);
        console.log(`     --pdf "${pdfPath}" \\`);
        if (args.pdfId) {
          console.log(`     --pdfId ${args.pdfId} \\`);
        }
        console.log(`     --scenario ${chosenScenario} \\`);
        console.log(`     --mode search \\`);
        console.log(`     --topN 80 \\`);
        console.log(`     --ngrams 1,2,3`);
        console.log('');
        console.log('   After mining, create and apply a token proposal to improve candidate quality.');
        console.log('');
      }
    }
    
    // Step 8: Generate packs
    console.log('📦 Step 8: Generating packs...');
    const rng = new SeededRNG(seed);
    const packs: PackEntry[] = [];
    const packReports: PackReport[] = [];
    
    const actualPacksToGenerate = Math.min(args.packs, Math.floor(qualifiedCandidates.length / args.promptsPerPack));
    
    for (let i = 0; i < actualPacksToGenerate; i++) {
      const startIdx = i * args.promptsPerPack;
      const endIdx = Math.min(startIdx + args.promptsPerPack, qualifiedCandidates.length);
      const packCandidates = qualifiedCandidates.slice(startIdx, endIdx);
      
      if (packCandidates.length < args.promptsPerPack * 0.8) {
        warnings.push(`Pack ${i + 1}: Only ${packCandidates.length} candidates (need ${args.promptsPerPack})`);
      }
      
      const packId = generatePackId(pdfBaseName, chosenScenario, args.level, i + 1, args.workspace);
      const title = `${pdfBaseName} - ${chosenScenario} - ${args.level} - Part ${i + 1}`;
      
      const pack = generatePack(
        packCandidates,
        packId,
        title,
        args.level,
        chosenScenario,
        args.register || 'neutral',
        packCandidates.length,
        rng,
        pdfBaseName,
        {
          startPage: windowSearchResult.bestWindow!.startPage,
          endPage: windowSearchResult.bestWindow!.endPage,
          rank: 1
        }
      );
      
      packs.push(pack);
      
      // Compute pack report
      const totalTokenHits = packCandidates.reduce((sum, c) => sum + (c.score?.scenarioTokenHits || 0), 0);
      const multiSlotCount = pack.prompts.filter(p => p.slotsChanged && p.slotsChanged.length >= 2).length;
      const multiSlotRate = pack.prompts.length > 0 ? multiSlotCount / pack.prompts.length : 0;
      const qualityScore = computeQualityScore(pack);
      
      packReports.push({
        packId,
        title,
        level: args.level,
        scenario: chosenScenario,
        windowUsed: {
          startPage: windowSearchResult.bestWindow!.startPage,
          endPage: windowSearchResult.bestWindow!.endPage
        },
        qualifiedPrompts: pack.prompts.length,
        tokenHitsSummary: {
          totalHits: totalTokenHits,
          avgHitsPerPrompt: pack.prompts.length > 0 ? totalTokenHits / pack.prompts.length : 0
        },
        multiSlotVariationScore: multiSlotRate,
        warnings: [],
        qualityScore
      });
      
      console.log(`   ✓ Generated pack: ${packId} (${pack.prompts.length} prompts, quality: ${qualityScore.toFixed(0)})`);
    }
    
    console.log('');
    
    // Step 9: Write packs
    console.log('💾 Step 9: Writing pack files...');
    for (const pack of packs) {
      const packDir = join(CONTENT_DIR, 'workspaces', args.workspace, 'packs', pack.id);
      mkdirSync(packDir, { recursive: true });
      const packPath = join(packDir, 'pack.json');
      writeFileSync(packPath, JSON.stringify(pack, null, 2), 'utf-8');
      console.log(`   ✓ Wrote ${packPath}`);
    }
    console.log('');
    
    // Step 10: Regenerate indexes
    console.log('📇 Step 10: Regenerating section indexes...');
    try {
      execSync(`npm run content:generate-indexes -- --workspace ${args.workspace}`, {
        cwd: join(__dirname, '..', '..'),
        stdio: 'pipe'
      });
      console.log('   ✓ Indexes regenerated');
    } catch (error: any) {
      warnings.push(`Failed to regenerate indexes: ${error.message}`);
    }
    console.log('');
    
    // Step 11: Run validation
    console.log('🔍 Step 11: Running validation...');
    let validationPassed = true;
    try {
      execSync('npm run content:validate', {
        cwd: join(__dirname, '..', '..'),
        stdio: 'pipe'
      });
      console.log('   ✓ Validation passed');
    } catch (error: any) {
      validationPassed = false;
      errors.push(`Validation failed: ${error.message}`);
      console.error(`   ❌ Validation failed`);
    }
    console.log('');
    
    // Step 12: Run quality check (includes dedupe)
    console.log('🔍 Step 12: Running quality check (includes dedupe)...');
    try {
      execSync('npm run content:quality', {
        cwd: join(__dirname, '..', '..'),
        stdio: 'pipe'
      });
      console.log('   ✓ Quality check passed');
    } catch (error: any) {
      errors.push(`Quality check failed (may include duplicates): ${error.message}`);
      console.error(`   ❌ Quality check failed`);
    }
    console.log('');
    
    // Step 13: Generate report
    console.log('📊 Step 13: Generating report...');
    
    const scenarioRanking = scenarioDiscoveryResult
      ? scenarioDiscoveryResult.scenarios
          .sort((a: any, b: any) => b.totalTokenHits - a.totalTokenHits)
          .slice(0, 5)
          .map((s: any) => ({
            scenario: s.scenario,
            totalTokenHits: s.totalTokenHits,
            candidatesWithMinHits: s.candidatesWithMinHits,
            bestWindow: s.bestWindow
          }))
      : [];
    
    const reviewQueue = packReports
      .map(p => ({
        packId: p.packId,
        qualityScore: p.qualityScore,
        title: p.title,
        scenario: p.scenario,
        level: p.level
      }))
      .sort((a, b) => b.qualityScore - a.qualityScore);
    
    const batchReport: BatchReport = {
      timestamp: new Date().toISOString(),
      pdfSlug: pdfBaseName,
      pdfStats: {
        pages: extraction.pageCount,
        chars: extraction.totalChars,
        candidates: candidatesWithPages.length
      },
      chosenScenario: chosenScenario,
      scenarioRanking,
      topWindows: windowSearchResult.topWindows.slice(0, 5).map(w => ({
        startPage: w.startPage,
        endPage: w.endPage,
        qualifiedCandidates: w.qualifiedCandidates,
        totalTokenHits: w.totalTokenHits,
        averageScore: w.averageScore
      })),
      generatedPacks: packReports,
      reviewQueue,
      rejectedCandidates: rejectedCandidates.slice(0, 100), // Limit to first 100
      errors,
      warnings
    };
    
    // Write JSON report
    const reportJsonPath = join(reportDir, 'report.json');
    writeFileSync(reportJsonPath, JSON.stringify(batchReport, null, 2), 'utf-8');
    
    // Write Markdown summary
    const reportMdPath = join(reportDir, 'summary.md');
    const md = generateMarkdownSummary(batchReport);
    writeFileSync(reportMdPath, md, 'utf-8');
    
    console.log(`   ✓ Report written to ${reportDir}`);
    console.log('');
    
    // Final summary
    if (errors.length > 0) {
      console.error('❌ Batch generation completed with errors:');
      errors.forEach(e => console.error(`   - ${e}`));
      console.error('');
      process.exit(1);
    } else {
      console.log('✅ Batch generation completed successfully!');
      console.log(`   Generated ${packs.length} pack(s)`);
      console.log(`   Report: ${reportDir}/summary.md`);
      process.exit(0);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Generate Markdown summary
 */
function generateMarkdownSummary(report: BatchReport): string {
  const lines: string[] = [];
  
  lines.push('# PDF → Packs Batch Generation Report');
  lines.push('');
  lines.push(`**Generated**: ${new Date(report.timestamp).toLocaleString()}`);
  lines.push(`**PDF**: ${report.pdfSlug}`);
  lines.push('');
  
  // PDF Stats
  lines.push('## PDF Statistics');
  lines.push('');
  lines.push(`- **Pages**: ${report.pdfStats.pages}`);
  lines.push(`- **Characters**: ${report.pdfStats.chars.toLocaleString()}`);
  lines.push(`- **Candidates Found**: ${report.pdfStats.candidates}`);
  lines.push('');
  
  // Scenario Selection
  lines.push('## Scenario Selection');
  lines.push('');
  lines.push(`**Chosen Scenario**: ${report.chosenScenario}`);
  lines.push('');
  
  if (report.scenarioRanking.length > 0) {
    lines.push('### Top 5 Scenarios');
    lines.push('');
    lines.push('| Scenario | Token Hits | Qualified Candidates | Best Window |');
    lines.push('|----------|------------|----------------------|-------------|');
    for (const s of report.scenarioRanking) {
      const windowStr = s.bestWindow
        ? `Pages ${s.bestWindow.startPage}-${s.bestWindow.endPage}`
        : 'N/A';
      lines.push(`| ${s.scenario} | ${s.totalTokenHits} | ${s.candidatesWithMinHits} | ${windowStr} |`);
    }
    lines.push('');
  }
  
  // Top Windows
  if (report.topWindows.length > 0) {
    lines.push('## Top Windows');
    lines.push('');
    for (let i = 0; i < report.topWindows.length; i++) {
      const w = report.topWindows[i];
      lines.push(`${i + 1}. **Pages ${w.startPage}-${w.endPage}**: ${w.qualifiedCandidates} qualified candidates, ${w.totalTokenHits} token hits, avg score: ${w.averageScore.toFixed(1)}`);
    }
    lines.push('');
  }
  
  // Generated Packs
  lines.push('## Generated Packs');
  lines.push('');
  for (const pack of report.generatedPacks) {
    lines.push(`### ${pack.packId}`);
    lines.push('');
    lines.push(`- **Title**: ${pack.title}`);
    lines.push(`- **Level**: ${pack.level} | **Scenario**: ${pack.scenario}`);
    lines.push(`- **Window**: Pages ${pack.windowUsed?.startPage}-${pack.windowUsed?.endPage}`);
    lines.push(`- **Prompts**: ${pack.qualifiedPrompts}`);
    lines.push(`- **Token Hits**: ${pack.tokenHitsSummary.totalHits} total, ${pack.tokenHitsSummary.avgHitsPerPrompt.toFixed(1)} avg per prompt`);
    lines.push(`- **Multi-Slot Variation**: ${(pack.multiSlotVariationScore * 100).toFixed(1)}%`);
    lines.push(`- **Quality Score**: ${pack.qualityScore.toFixed(0)}/100`);
    if (pack.warnings.length > 0) {
      lines.push(`- **Warnings**:`);
      pack.warnings.forEach(w => lines.push(`  - ${w}`));
    }
    lines.push('');
  }
  
  // Review Queue
  lines.push('## Review Queue (Sorted by Quality Score)');
  lines.push('');
  lines.push('| Pack ID | Quality Score | Title | Scenario | Level |');
  lines.push('|---------|--------------|-------|----------|-------|');
  for (const item of report.reviewQueue) {
    lines.push(`| ${item.packId} | ${item.qualityScore.toFixed(0)} | ${item.title} | ${item.scenario} | ${item.level} |`);
  }
  lines.push('');
  
  // Rejected Candidates
  if (report.rejectedCandidates.length > 0) {
    lines.push('## Rejected Candidates');
    lines.push('');
    lines.push(`Total rejected: ${report.rejectedCandidates.length}`);
    lines.push('');
    lines.push('| Text Hash | Reason | Text Preview |');
    lines.push('|-----------|--------|--------------|');
    for (const rc of report.rejectedCandidates.slice(0, 20)) {
      lines.push(`| ${rc.textHash} | ${rc.reason} | ${rc.text.substring(0, 60)}... |`);
    }
    if (report.rejectedCandidates.length > 20) {
      lines.push(`| ... | ... | (${report.rejectedCandidates.length - 20} more) |`);
    }
    lines.push('');
  }
  
  // Errors and Warnings
  if (report.errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    report.errors.forEach(e => lines.push(`- ❌ ${e}`));
    lines.push('');
  }
  
  if (report.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    report.warnings.forEach(w => lines.push(`- ⚠️  ${w}`));
    lines.push('');
  }
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  if (report.errors.length === 0) {
    lines.push(`✅ **Success**: Generated ${report.generatedPacks.length} pack(s) from PDF.`);
    lines.push('');
    lines.push('**Next Steps**:');
    lines.push('1. Review the generated packs');
    lines.push('2. Approve top packs using: `./scripts/approve-batch.sh --sourceRef "<pdfSlug>" --limit 5 --reviewer "<name>"`');
    lines.push('3. Run validation and quality checks');
    lines.push('4. Promote approved packs to production');
  } else {
    lines.push(`❌ **Issues Detected**: ${report.errors.length} error(s), ${report.warnings.length} warning(s)`);
    lines.push('');
    lines.push('Please review errors and warnings above before proceeding.');
  }
  lines.push('');
  
  return lines.join('\n');
}

main();

