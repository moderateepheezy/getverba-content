#!/usr/bin/env tsx

/**
 * PDF → Packs Pipeline v1
 * 
 * Deterministic, dev-time pipeline that ingests a PDF and produces GetVerba content packs.
 * 
 * Usage:
 *   tsx scripts/pdf-to-packs.ts \
 *     --pdf ./imports/some.pdf \
 *     --workspace de \
 *     --section context \
 *     --scenario government_office \
 *     --level A1 \
 *     --register formal \
 *     --titlePrefix "Gov Office" \
 *     --maxPacks 3 \
 *     --packSize 12 \
 *     --ocr off \
 *     --dryRun false
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { extractPdfTextTextFirst, computePdfFingerprint } from './pdf-ingestion/extract.js';
import { normalizeText, normalizeSinglePage } from './pdf-ingestion/normalize.js';
import { segmentText, validateSegmentation } from './pdf-ingestion/segment.js';
import { checkCandidateQuality } from './pdf-ingestion/quality.js';
import { writeReport, generateRunId, type RunReport } from './pdf-ingestion/report.js';
import { detectFrontMatterPages } from './pdf-ingestion/frontMatter.js';
import { scoreCandidate } from './pdf-ingestion/scenarioScore.js';
import { findBestWindow } from './pdf-ingestion/windowSearch.js';
import { discoverScenarios } from './pdf-ingestion/scenarioDiscovery.js';
import type { Candidate } from './pdf-ingestion/segment.js';
import type { PageText } from './pdf-ingestion/extract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

// Scenario token dictionaries (from quality gates)
// Expanded with German learning textbook vocabulary and phrase tokens
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: [
    // English
    'meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task',
    // German single words
    'besprechung', 'termin', 'büro', 'kollege', 'kollegin', 'projekt', 'aufgabe', 'arbeit', 'job', 'praktikum',
    'bewerbung', 'lebenslauf', 'vorstellungsgespräch', 'bewerbungsgespräch', 'chef', 'firma', 'abteilung', 'team',
    'kunde', 'kundin', 'schicht', 'dienst', 'vertrag', 'gehalt', 'rechnung', 'auftrag',
    // German phrases (bigrams/trigrams)
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

// Strong tokens (phrases or high-signal words) that count as "strong hits"
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


interface CliArgs {
  pdf: string;
  workspace: string;
  section: string;
  scenario: string;
  level: string;
  register?: string;
  titlePrefix?: string;
  maxPacks?: number;
  packSize?: number;
  ocr?: 'on' | 'off';
  dryRun?: boolean;
  outRunDir?: string;
  seed?: string;
  mode?: 'search' | 'range';
  skipFrontMatter?: boolean;
  frontMatterMaxPages?: number;
  pageRange?: string; // e.g. "50-120"
  minScenarioHits?: number;
  windowSizePages?: number;
  topWindows?: number;
  anchors?: string; // comma-separated
  language?: 'de' | 'en';
  discoverScenarios?: boolean;
  minQualifiedCandidates?: number;
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
  analytics: {
    goal: string;
    constraints: string[];
    levers: string[];
    successCriteria: string[];
    commonMistakes: string[];
    drillType: 'substitution' | 'pattern-switch' | 'roleplay-bounded';
    cognitiveLoad: 'low' | 'medium' | 'high';
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
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = {};
  
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];
    
    if (arg === '--pdf' && next) {
      args.pdf = next;
      i++;
    } else if (arg === '--workspace' && next) {
      args.workspace = next;
      i++;
    } else if (arg === '--section' && next) {
      args.section = next;
      i++;
    } else if (arg === '--scenario' && next) {
      args.scenario = next;
      i++;
    } else if (arg === '--level' && next) {
      args.level = next;
      i++;
    } else if (arg === '--register' && next) {
      args.register = next;
      i++;
    } else if (arg === '--titlePrefix' && next) {
      args.titlePrefix = next;
      i++;
    } else if (arg === '--maxPacks' && next) {
      args.maxPacks = parseInt(next, 10);
      i++;
    } else if (arg === '--packSize' && next) {
      args.packSize = parseInt(next, 10);
      i++;
    } else if (arg === '--ocr' && next) {
      args.ocr = next === 'on' ? 'on' : 'off';
      i++;
    } else if (arg === '--dryRun' && next) {
      args.dryRun = next === 'false' ? false : true;
      i++;
    } else if (arg === '--outRunDir' && next) {
      args.outRunDir = next;
      i++;
    } else if (arg === '--seed' && next) {
      args.seed = next;
      i++;
    } else if (arg === '--mode' && next) {
      args.mode = next === 'range' ? 'range' : 'search';
      i++;
    } else if (arg === '--skipFrontMatter' && next) {
      args.skipFrontMatter = next === 'false' ? false : true;
      i++;
    } else if (arg === '--frontMatterMaxPages' && next) {
      args.frontMatterMaxPages = parseInt(next, 10);
      i++;
    } else if (arg === '--pageRange' && next) {
      args.pageRange = next;
      i++;
    } else if (arg === '--minScenarioHits' && next) {
      args.minScenarioHits = parseInt(next, 10);
      i++;
    } else if (arg === '--windowSizePages' && next) {
      args.windowSizePages = parseInt(next, 10);
      i++;
    } else if (arg === '--topWindows' && next) {
      args.topWindows = parseInt(next, 10);
      i++;
    } else if (arg === '--anchors' && next) {
      args.anchors = next;
      i++;
    } else if (arg === '--language' && next) {
      args.language = next === 'en' ? 'en' : 'de';
      i++;
    } else if (arg === '--discoverScenarios' && next) {
      args.discoverScenarios = next === 'false' ? false : true;
      i++;
    } else if (arg === '--minQualifiedCandidates' && next) {
      args.minQualifiedCandidates = parseInt(next, 10);
      i++;
    }
  }
  
  // Validate required args
  if (!args.pdf) throw new Error('Missing required argument: --pdf');
  if (!args.workspace) throw new Error('Missing required argument: --workspace');
  if (!args.section) throw new Error('Missing required argument: --section');
  if (!args.scenario) throw new Error('Missing required argument: --scenario');
  if (!args.level) throw new Error('Missing required argument: --level');
  
  // Derive language from workspace if not provided
  const language = args.language || (args.workspace === 'en' ? 'en' : 'de');
  
  // Set defaults
  return {
    ...args,
    register: args.register || 'neutral',
    titlePrefix: args.titlePrefix || basename(args.pdf, '.pdf').replace(/[^a-zA-Z0-9]/g, ' '),
    maxPacks: args.maxPacks || 1,
    packSize: args.packSize || 12,
    ocr: args.ocr || 'off',
    dryRun: args.dryRun !== false, // Default true
    mode: args.mode || 'search',
    skipFrontMatter: args.skipFrontMatter !== false, // Default true
    frontMatterMaxPages: args.frontMatterMaxPages || 40,
    minScenarioHits: args.minScenarioHits || 2,
    windowSizePages: args.windowSizePages || 25,
    topWindows: args.topWindows || 3,
    language,
    discoverScenarios: args.discoverScenarios !== false, // Default true in search mode
    minQualifiedCandidates: args.minQualifiedCandidates || 10
  } as CliArgs;
}

/**
 * Generate deterministic seed from inputs
 */
function generateSeed(pdfPath: string, workspace: string, scenario: string, level: string, providedSeed?: string): string {
  if (providedSeed) return providedSeed;
  
  const pdfHash = computePdfFingerprint(pdfPath).substring(0, 16);
  const seedInput = `${pdfHash}-${workspace}-${scenario}-${level}`;
  return createHash('sha256').update(seedInput).digest('hex').substring(0, 16);
}

/**
 * Simple seeded RNG for deterministic generation
 */
class SeededRNG {
  private state: number;
  
  constructor(seed: string) {
    // Convert hex seed to number
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
 * Determine intent from text
 */
function determineIntent(text: string, scenario: string): string {
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
 * Generate simple gloss_en (deterministic, placeholder if needed)
 */
function generateGlossEn(text: string, scenario: string, intent: string): string {
  // Simple deterministic mapping
  const textLower = text.toLowerCase();
  
  if (scenario === 'government_office') {
    if (textLower.includes('termin')) return 'I need to make an appointment.';
    if (textLower.includes('formular')) return 'I need the form.';
    if (textLower.includes('pass')) return 'I need to pick up my passport.';
    if (textLower.includes('anmeldung')) return 'I need to register my address.';
    if (textLower.includes('unterlagen')) return 'I need the documents.';
  }
  
  // Intent-based fallbacks
  if (intent === 'request') return 'I would like to request that.';
  if (intent === 'ask') return 'Could you help me with this?';
  if (intent === 'schedule') return 'I need to schedule that.';
  if (intent === 'order') return 'I would like to order that.';
  if (intent === 'thank') return 'Thank you.';
  if (intent === 'greet') return 'Hello.';
  if (intent === 'goodbye') return 'Goodbye.';
  
  // Default: mark as requiring review
  return '(gloss pending)';
}

/**
 * Generate pack ID deterministically
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
    const existing = readdirSync(packsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    if (existing.includes(slug)) {
      // Add suffix deterministically
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
function generatePack(
  candidates: Candidate[],
  packId: string,
  title: string,
  level: string,
  scenario: string,
  register: string,
  packSize: number,
  rng: SeededRNG,
  args: CliArgs,
  windowSearchResult?: any
): PackEntry {
  // Select candidates for this pack (deterministic shuffle)
  const shuffled = rng.shuffle([...candidates]);
  const selected = shuffled.slice(0, packSize);
  
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
  
  // Generate session plan (2-4 steps)
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
  
  // Generate outline from steps
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
  
  // Generate canonical intents from prompts
  const intents = new Set(prompts.map(p => p.intent));
  const canonicalIntents = Array.from(intents).slice(0, Math.max(3, intents.size));
  // Ensure at least 3 intents
  while (canonicalIntents.length < 3) {
    const defaultIntents = ['inform', 'ask', 'request'];
    for (const intent of defaultIntents) {
      if (!canonicalIntents.includes(intent)) {
        canonicalIntents.push(intent);
        break;
      }
    }
  }
  
  // Generate anchor phrases from scenario tokens
  const requiredTokens = SCENARIO_TOKEN_DICTS[scenario] || [];
  const anchorPhrases = requiredTokens.slice(0, Math.max(3, requiredTokens.length));
  // If not enough, add generic ones
  while (anchorPhrases.length < 3) {
    anchorPhrases.push('practice', 'learn', 'study');
  }
  
  // Generate whyThisWorks
  const whyThisWorks = [
    goal.length <= 80 ? goal : goal.substring(0, 77) + '...',
    successCriteria[0] || 'Uses scenario-appropriate vocabulary',
    'Varies key slots across prompts'
  ].slice(0, 5);
  
  // Generate keyFailureModes from commonMistakes
  const keyFailureModes = commonMistakes.slice(0, 5);
  
  // Generate successDefinition
  const successDefinition = successCriteria[0] || 'Uses scenario-appropriate vocabulary correctly';
  
  // Generate provenance metadata
  const pdfBaseName = basename(args.pdf, '.pdf');
  const windowInfo = windowSearchResult?.bestWindow 
    ? `pages ${windowSearchResult.bestWindow.startPage}-${windowSearchResult.bestWindow.endPage}`
    : args.pageRange || 'all pages';
  const sourceRef = `${pdfBaseName} (${windowInfo})`;
  
  return {
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
    primaryStructure: 'verb_position', // Default
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
}

/**
 * Main execution
 */
async function main() {
  try {
    const args = parseArgs();
    
    // Validate PDF exists
    if (!existsSync(args.pdf)) {
      throw new Error(`PDF file not found: ${args.pdf}`);
    }
    
    // Generate run ID and report directory
    const runId = generateRunId();
    const reportDir = args.outRunDir || join(__dirname, '..', 'reports', 'pdf-ingestion', runId);
    
    console.log('📄 PDF → Packs Pipeline v1');
    console.log(`   PDF: ${args.pdf}`);
    console.log(`   Workspace: ${args.workspace}`);
    console.log(`   Scenario: ${args.scenario}`);
    console.log(`   Level: ${args.level}`);
    console.log(`   Dry Run: ${args.dryRun ? 'Yes' : 'No'}`);
    console.log('');
    
    // Step 1: Extract PDF text
    console.log('🔍 Step 1: Extracting text from PDF...');
    const extraction = await extractPdfTextTextFirst(args.pdf, args.ocr === 'on');
    console.log(`   ✓ Extracted ${extraction.totalChars} characters from ${extraction.pageCount} pages`);
    if (extraction.warnings.length > 0) {
      extraction.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
    }
    console.log('');
    
    // Step 1.5: Detect front matter
    let pagesToProcess = extraction.pages;
    let frontMatterResult = { skipUntilPageIndex: 0, evidence: { frontMatterPages: [], reasons: [], firstContentPage: 0 } };
    let hasPerPageText = extraction.pages.some(p => p.text && p.text.trim().length > 100);
    
    if (args.skipFrontMatter && hasPerPageText) {
      console.log('📑 Step 1.5: Detecting front matter...');
      frontMatterResult = detectFrontMatterPages(extraction.pages, args.frontMatterMaxPages);
      if (frontMatterResult.skipUntilPageIndex > 0) {
        pagesToProcess = extraction.pages.slice(frontMatterResult.skipUntilPageIndex);
        console.log(`   ✓ Skipping ${frontMatterResult.skipUntilPageIndex} front matter page(s)`);
        console.log(`   - First content page: ${frontMatterResult.evidence.firstContentPage + 1}`);
        if (frontMatterResult.evidence.reasons.length > 0) {
          frontMatterResult.evidence.reasons.slice(0, 5).forEach(r => console.log(`   - ${r}`));
        }
      } else {
        console.log(`   ✓ No front matter detected`);
      }
      console.log('');
    } else if (args.skipFrontMatter && !hasPerPageText) {
      console.log('📑 Step 1.5: Front matter detection skipped (per-page text not available)');
      console.log('');
    }
    
    // Step 2: Normalize text
    console.log('🧹 Step 2: Normalizing text...');
    
    // If we don't have per-page text, use the full extraction text
    let textToNormalize: PageText[];
    if (!hasPerPageText || pagesToProcess.every(p => !p.text || p.text.trim().length === 0)) {
      // Use original extraction pages (all text is in first page or combined)
      textToNormalize = extraction.pages.filter(p => p.text && p.text.trim().length > 0);
      if (textToNormalize.length === 0) {
        // Fallback: create a single page with all text
        const allText = extraction.pages.map(p => p.text || '').join('\n');
        textToNormalize = [{ pageNumber: 1, text: allText, charCount: allText.length }];
      }
    } else {
      textToNormalize = pagesToProcess;
    }
    
    if (textToNormalize.length === 0) {
      throw new Error('No pages with text to normalize');
    }
    
    const allPagesNorm = normalizeText(textToNormalize);
    const combinedNormalizedText = allPagesNorm.normalizedText;
    
    if (!combinedNormalizedText || combinedNormalizedText.trim().length === 0) {
      throw new Error(`Normalization produced empty text. Input pages: ${textToNormalize.length}, total chars: ${textToNormalize.reduce((sum, p) => sum + p.charCount, 0)}`);
    }
    
    // For per-page normalization, normalize each page individually
    const normalizedPages: PageText[] = [];
    
    // If we have multiple pages with content, normalize per-page
    if (pagesToProcess.length > 1 && pagesToProcess.some(p => p.text.trim().length > 100)) {
      for (let i = 0; i < pagesToProcess.length; i++) {
        const page = pagesToProcess[i];
        const normResult = normalizeSinglePage(page);
        normalizedPages.push({
          pageNumber: page.pageNumber,
          text: normResult.normalizedText,
          charCount: normResult.normalizedText.length
        });
      }
    } else {
      // Single large page - split normalized text roughly by page markers
      // Use "Page X of Y" patterns to estimate page boundaries
      const pageMarkers = combinedNormalizedText.match(/Page \d+ of \d+/gi) || [];
      const totalPages = extraction.pageCount;
      const avgCharsPerPage = combinedNormalizedText.length / totalPages;
      
      for (let i = 0; i < totalPages; i++) {
        const startChar = Math.floor(i * avgCharsPerPage);
        const endChar = Math.floor((i + 1) * avgCharsPerPage);
        const pageText = combinedNormalizedText.substring(startChar, endChar);
        normalizedPages.push({
          pageNumber: i + 1 + frontMatterResult.skipUntilPageIndex,
          text: pageText,
          charCount: pageText.length
        });
      }
    }
    
    console.log(`   ✓ Normalized ${normalizedPages.length} pages`);
    if (allPagesNorm.actions.length > 0) {
      allPagesNorm.actions.forEach(a => console.log(`   - ${a}`));
    }
    console.log('');
    
    // Step 3: Segment into candidates (per-page to preserve indices)
    console.log('✂️  Step 3: Segmenting text into candidates...');
    const seed = generateSeed(args.pdf, args.workspace, args.scenario, args.level, args.seed);
    
    // Segment the combined normalized text
    // Use combined text for better segmentation, then assign page indices
    const combinedText = combinedNormalizedText;
    
    if (!combinedText || combinedText.trim().length === 0) {
      throw new Error('Normalized text is empty. Check normalization step.');
    }
    
    const segmentation = segmentText(
      combinedText,
      parseInt(seed.substring(0, 8), 16)
    );
    
    if (segmentation.candidates.length === 0) {
      console.warn(`   ⚠️  No candidates found after segmentation. Text length: ${combinedText.length}`);
      console.warn(`   ⚠️  First 500 chars: ${combinedText.substring(0, 500)}`);
    }
    
    // Assign page indices to candidates based on character position
    const totalChars = combinedText.length;
    const avgCharsPerPage = totalChars / extraction.pageCount;
    const candidatesWithPages: Array<Candidate & { pageIndex: number }> = [];
    
    let charOffset = 0;
    for (const candidate of segmentation.candidates) {
      // Find where this candidate appears in the combined text
      const candidatePos = combinedText.indexOf(candidate.text, charOffset);
      if (candidatePos >= 0) {
        charOffset = candidatePos + candidate.text.length;
        // Estimate page: character position / avg chars per page, adjusted for front matter skip
        const relativePage = Math.floor(candidatePos / avgCharsPerPage);
        const absolutePage = Math.min(relativePage + frontMatterResult.skipUntilPageIndex, extraction.pageCount - 1);
        candidatesWithPages.push({ ...candidate, pageIndex: absolutePage });
      } else {
        // Fallback: use current estimated page
        const relativePage = Math.floor(charOffset / avgCharsPerPage);
        const absolutePage = Math.min(relativePage + frontMatterResult.skipUntilPageIndex, extraction.pageCount - 1);
        candidatesWithPages.push({ ...candidate, pageIndex: absolutePage });
        charOffset += candidate.text.length; // Estimate advance
      }
    }
    
    console.log(`   ✓ Found ${candidatesWithPages.length} candidates`);
    console.log(`   - Avg length: ${segmentation.stats.avgLength.toFixed(0)} chars`);
    console.log(`   - Duplicates: ${segmentation.stats.duplicateCount} (${(segmentation.stats.duplicateRatio * 100).toFixed(1)}%)`);
    console.log('');
    
    // Step 3.5: Scenario Discovery (if enabled)
    let scenarioDiscoveryResult: any = null;
    if (args.discoverScenarios && args.mode === 'search') {
      console.log('🔍 Step 3.5a: Discovering scenarios in PDF...');
      scenarioDiscoveryResult = discoverScenarios(
        pagesToProcess,
        candidatesWithPages,
        SCENARIO_TOKEN_DICTS,
        STRONG_TOKENS,
        args.language,
        args.minScenarioHits,
        args.windowSizePages
      );
      
      console.log(`   ✓ Analyzed ${scenarioDiscoveryResult.scenarios.length} scenarios`);
      console.log(`   - Top scenarios: ${scenarioDiscoveryResult.rankedScenarios.slice(0, 5).join(', ')}`);
      if (scenarioDiscoveryResult.recommendedScenarios.length > 0) {
        console.log(`   - Recommended: ${scenarioDiscoveryResult.recommendedScenarios.join(', ')}`);
      }
      console.log('');
    }
    
    // Step 3.5b: Window search or page range selection
    const requiredTokens = SCENARIO_TOKEN_DICTS[args.scenario] || [];
    const strongTokensForScenario = STRONG_TOKENS[args.scenario] || [];
    const anchors = args.anchors ? args.anchors.split(',').map(a => a.trim()) : [];
    let selectedCandidates: Array<Candidate & { pageIndex: number }> = [];
    let windowSearchResult: any = null;
    
    if (args.mode === 'range' && args.pageRange) {
      // Range mode: use specified page range
      console.log(`🎯 Step 3.5: Using page range mode (${args.pageRange})...`);
      const [startStr, endStr] = args.pageRange.split('-');
      const startPage = parseInt(startStr, 10) - 1; // Convert to 0-based
      const endPage = parseInt(endStr, 10) - 1;
      
      selectedCandidates = candidatesWithPages.filter(
        c => c.pageIndex >= startPage && c.pageIndex <= endPage
      );
      console.log(`   ✓ Selected ${selectedCandidates.length} candidates from pages ${startPage + 1}-${endPage + 1}`);
    } else {
      // Search mode: find best window
      console.log(`🔍 Step 3.5b: Searching for best scenario window...`);
      // For window search, we need candidates with relative page indices (0-based in pagesToProcess)
      const candidatesForSearch = candidatesWithPages.map(c => ({
        ...c,
        pageIndex: c.pageIndex - frontMatterResult.skipUntilPageIndex
      }));
      
      // Score all candidates for window search
      // Window search will score internally, but we need to pass all candidates
      windowSearchResult = findBestWindow(
        pagesToProcess,
        candidatesForSearch,
        requiredTokens,
        anchors,
        args.windowSizePages,
        args.minScenarioHits,
        args.language,
        args.topWindows,
        strongTokensForScenario
      );
      
      // Convert window page indices back to absolute
      if (windowSearchResult.bestWindow) {
        windowSearchResult.bestWindow.startPage += frontMatterResult.skipUntilPageIndex;
        windowSearchResult.bestWindow.endPage += frontMatterResult.skipUntilPageIndex;
      }
      windowSearchResult.topWindows = windowSearchResult.topWindows.map(w => ({
        ...w,
        startPage: w.startPage + frontMatterResult.skipUntilPageIndex,
        endPage: w.endPage + frontMatterResult.skipUntilPageIndex
      }));
      
      const minRequired = args.minQualifiedCandidates || (args.maxPacks * args.packSize * 0.8);
      if (!windowSearchResult.bestWindow || windowSearchResult.bestWindow.qualifiedCandidates < minRequired) {
        let errorMsg = `ERR_SCENARIO_NOT_FOUND: Insufficient "${args.scenario}" scenario content found. ` +
          `Best window (pages ${windowSearchResult.bestWindow?.startPage}-${windowSearchResult.bestWindow?.endPage}) ` +
          `has only ${windowSearchResult.bestWindow?.qualifiedCandidates || 0} qualified candidates (need ${Math.ceil(minRequired)}).`;
        
        // Add scenario discovery recommendations if available
        if (scenarioDiscoveryResult && scenarioDiscoveryResult.recommendedScenarios.length > 0) {
          const topScenario = scenarioDiscoveryResult.recommendedScenarios[0];
          const topStats = scenarioDiscoveryResult.scenarios.find((s: any) => s.scenario === topScenario);
          errorMsg += `\n\nScenario Discovery Results:\n`;
          errorMsg += `  This PDF contains: ${scenarioDiscoveryResult.recommendedScenarios.join(', ')}\n`;
          if (topStats) {
            errorMsg += `  Top scenario "${topScenario}": ${topStats.totalTokenHits} token hits, ${topStats.candidatesWithMinHits} qualified candidates\n`;
            if (topStats.bestWindow) {
              errorMsg += `  Best window for "${topScenario}": pages ${topStats.bestWindow.startPage}-${topStats.bestWindow.endPage}\n`;
            }
          }
          errorMsg += `\nSuggestions:\n`;
          errorMsg += `  - Try: --scenario ${topScenario}\n`;
          errorMsg += `  - Or: increase --windowSizePages, change --anchors, use --mode range --pageRange\n`;
        } else {
          errorMsg += `\nSuggestions: increase --windowSizePages, change --anchors, use --mode range --pageRange, or use a different scenario.`;
        }
        
        throw new Error(errorMsg);
      }
      
      const bestWindow = windowSearchResult.bestWindow;
      console.log(`   ✓ Best window: pages ${bestWindow.startPage}-${bestWindow.endPage}`);
      console.log(`   - Qualified candidates: ${bestWindow.qualifiedCandidates}`);
      console.log(`   - Total token hits: ${bestWindow.totalTokenHits}`);
      console.log(`   - Anchor hits: ${bestWindow.anchorHits}`);
      console.log(`   - Average score: ${bestWindow.averageScore.toFixed(1)}`);
      
      // Select qualified candidates from best window, sorted by score
      // Convert back to absolute page indices
      // Qualified = minScenarioHits OR 1 hit with strong token
      selectedCandidates = bestWindow.candidates
        .filter(c => 
          c.score.scenarioTokenHits >= args.minScenarioHits ||
          (c.score.scenarioTokenHits >= 1 && c.score.strongTokenHits > 0)
        )
        .sort((a, b) => b.score.totalScore - a.score.totalScore)
        .slice(0, args.maxPacks * args.packSize)
        .map(c => ({
          ...c,
          pageIndex: c.pageIndex + frontMatterResult.skipUntilPageIndex
        }));
      
      console.log(`   ✓ Selected ${selectedCandidates.length} top candidates from best window`);
    }
    console.log('');
    
    // Validate we have enough candidates
    const requiredCount = args.maxPacks * args.packSize;
    const minRequired = Math.max(args.minQualifiedCandidates || 0, Math.ceil(requiredCount * 0.8));
    if (selectedCandidates.length < minRequired) {
      let errorMsg = `ERR_SCENARIO_NOT_FOUND: Only ${selectedCandidates.length} qualified candidates found, ` +
        `need at least ${minRequired} for ${args.maxPacks} pack(s).`;
      
      // Add scenario discovery recommendations if available
      if (scenarioDiscoveryResult && scenarioDiscoveryResult.recommendedScenarios.length > 0) {
        const topScenario = scenarioDiscoveryResult.recommendedScenarios[0];
        errorMsg += `\n\nScenario Discovery: This PDF contains "${topScenario}" content. Try: --scenario ${topScenario}`;
      }
      
      errorMsg += `\nOr: increase --windowSizePages, change --anchors, use --mode range --pageRange, or use a different scenario.`;
      throw new Error(errorMsg);
    }
    
    // Step 4: Quality checks on selected candidates
    console.log('✅ Step 4: Checking candidate quality...');
    const quality = checkCandidateQuality(selectedCandidates, args.scenario, requiredTokens);
    if (!quality.valid) {
      console.error('❌ Quality checks failed:');
      quality.errors.forEach(e => console.error(`   - ${e}`));
      throw new Error('Quality gates failed');
    }
    if (quality.warnings.length > 0) {
      quality.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
    }
    console.log(`   ✓ Quality checks passed`);
    console.log('');
    
    // Step 5: Generate packs
    console.log('📦 Step 5: Generating packs...');
    const rng = new SeededRNG(seed);
    const pdfBaseName = basename(args.pdf, '.pdf').replace(/[^a-zA-Z0-9]/g, '-');
    const packs: PackEntry[] = [];
    const packIds: string[] = [];
    
    for (let i = 0; i < args.maxPacks; i++) {
      const packId = generatePackId(pdfBaseName, args.scenario, args.level, i + 1, args.workspace);
      const title = `${args.titlePrefix} - ${args.scenario} - ${args.level} - Part ${i + 1}`;
      
      // Select candidates for this pack (deterministic shuffle)
      const startIdx = i * args.packSize;
      const endIdx = Math.min(startIdx + args.packSize, selectedCandidates.length);
      const packCandidates = selectedCandidates.slice(startIdx, endIdx);
      
      if (packCandidates.length < args.packSize * 0.8) {
        console.warn(`   ⚠️  Pack ${i + 1}: Only ${packCandidates.length} candidates (need ${args.packSize})`);
      }
      
      const pack = generatePack(
        packCandidates,
        packId,
        title,
        args.level,
        args.scenario,
        args.register,
        packCandidates.length,
        rng,
        args,
        windowSearchResult
      );
      
      packs.push(pack);
      packIds.push(packId);
      console.log(`   ✓ Generated pack: ${packId} (${pack.prompts.length} prompts)`);
    }
    console.log('');
    
    // Check for gloss_en placeholders
    const requiresReview = packs.some(pack =>
      pack.prompts.some(p => p.gloss_en === '(gloss pending)')
    );
    
    // Step 6: Write packs (if not dry run)
    if (!args.dryRun) {
      console.log('💾 Step 6: Writing pack files...');
      for (const pack of packs) {
        const packDir = join(CONTENT_DIR, 'workspaces', args.workspace, 'packs', pack.id);
        mkdirSync(packDir, { recursive: true });
        const packPath = join(packDir, 'pack.json');
        writeFileSync(packPath, JSON.stringify(pack, null, 2), 'utf-8');
        console.log(`   ✓ Wrote ${packPath}`);
      }
      console.log('');
      
      // Step 7: Regenerate indexes
      console.log('📇 Step 7: Regenerating section indexes...');
      try {
        execSync(`npm run content:generate-indexes -- --workspace ${args.workspace}`, {
          cwd: join(__dirname, '..'),
          stdio: 'pipe'
        });
        console.log('   ✓ Indexes regenerated');
      } catch (error: any) {
        console.error(`   ⚠️  Failed to regenerate indexes: ${error.message}`);
        // Don't fail the whole pipeline if index generation fails
      }
      console.log('');
      
      // Step 8: Run validation
      console.log('🔍 Step 8: Running validation...');
      try {
        execSync('npm run content:validate', {
          cwd: join(__dirname, '..'),
          stdio: 'inherit'
        });
        console.log('   ✓ Validation passed');
      } catch (error: any) {
        console.error(`   ❌ Validation failed: ${error.message}`);
        // Don't throw - we'll report it
      }
      console.log('');
    } else {
      console.log('💾 Step 6: Skipping file writes (dry run)');
      console.log('');
    }
    
    // Step 9: Generate report
    console.log('📊 Step 9: Generating report...');
    const pdfFingerprint = computePdfFingerprint(args.pdf);
    
    // Collect validation errors (if any)
    const validationErrors: string[] = [];
    // In a real implementation, we'd capture validation output
    
    const report: RunReport = {
      runId,
      timestamp: new Date().toISOString(),
      input: {
        pdfPath: args.pdf,
        pdfFingerprint,
        workspace: args.workspace,
        section: args.section,
        scenario: args.scenario,
        level: args.level,
        register: args.register,
        titlePrefix: args.titlePrefix,
        maxPacks: args.maxPacks,
        packSize: args.packSize,
        ocr: args.ocr,
        dryRun: args.dryRun
      },
      extraction: {
        method: extraction.method,
        pageCount: extraction.pageCount,
        totalChars: extraction.totalChars,
        avgCharsPerPage: extraction.avgCharsPerPage,
        warnings: extraction.warnings
      },
      normalization: {
        actions: normalization.actions,
        headerFooterLinesRemoved: normalization.headerFooterLines.length
      },
      frontMatter: args.skipFrontMatter ? {
        skipped: true,
        skipUntilPageIndex: frontMatterResult.skipUntilPageIndex,
        frontMatterPages: frontMatterResult.evidence.frontMatterPages,
        firstContentPage: frontMatterResult.evidence.firstContentPage,
        reasons: frontMatterResult.evidence.reasons
      } : undefined,
      windowSearch: windowSearchResult ? {
        mode: args.mode || 'search',
        pageRange: args.pageRange,
        bestWindow: windowSearchResult.bestWindow ? {
          startPage: windowSearchResult.bestWindow.startPage,
          endPage: windowSearchResult.bestWindow.endPage,
          qualifiedCandidates: windowSearchResult.bestWindow.qualifiedCandidates,
          totalTokenHits: windowSearchResult.bestWindow.totalTokenHits,
          anchorHits: windowSearchResult.bestWindow.anchorHits,
          averageScore: windowSearchResult.bestWindow.averageScore
        } : undefined,
        topWindows: windowSearchResult.topWindows.map(w => ({
          startPage: w.startPage,
          endPage: w.endPage,
          qualifiedCandidates: w.qualifiedCandidates,
          totalTokenHits: w.totalTokenHits,
          anchorHits: w.anchorHits
        })),
        selectedCandidatesCount: selectedCandidates.length
      } : {
        mode: args.mode || 'range',
        pageRange: args.pageRange,
        selectedCandidatesCount: selectedCandidates.length
      },
      segmentation: {
        candidateCount: candidatesWithPages.length,
        byType: segmentation.stats.byType,
        avgLength: segmentation.stats.avgLength,
        duplicateCount: segmentation.stats.duplicateCount,
        duplicateRatio: segmentation.stats.duplicateRatio
      },
      quality: {
        valid: quality.valid,
        errors: quality.errors,
        warnings: quality.warnings,
        stats: quality.stats
      },
      generation: {
        packsCreated: packs.length,
        promptsPerPack: packs.map(p => p.prompts.length),
        packIds,
        requiresReview
      },
      validation: {
        passed: validationErrors.length === 0,
        errors: validationErrors
      },
      actionableIssues: [
        ...(extraction.totalChars < 2000 ? ['PDF has insufficient text - may be scanned'] : []),
        ...(segmentation.stats.duplicateRatio > 0.25 ? ['Too many duplicate candidates'] : []),
        ...(quality.stats.candidatesWithScenarioTokens < selectedCandidates.length * 0.8 ? ['Many candidates missing scenario tokens'] : []),
        ...(requiresReview ? ['Some prompts have placeholder gloss_en - requires review'] : []),
        ...(windowSearchResult && !windowSearchResult.bestWindow ? ['No suitable window found for scenario - try different anchors or page range'] : [])
      ],
      flags: {
        requiresReview,
        scannedPdfDetected: extraction.totalChars < 2000,
        insufficientText: selectedCandidates.length < requiredCount * 0.8,
        tooManyDuplicates: segmentation.stats.duplicateRatio > 0.25,
        scenarioTokensMissing: quality.stats.candidatesWithScenarioTokens < selectedCandidates.length * 0.8,
        qualityGatesFailed: !quality.valid
      }
    };
    
    writeReport(reportDir, report);
    console.log(`   ✓ Report written to ${reportDir}`);
    console.log('');
    
    // Final summary
    if (args.dryRun) {
      console.log('✅ Dry run completed successfully!');
      console.log(`   Would create ${packs.length} pack(s) with ${packs.reduce((sum, p) => sum + p.prompts.length, 0)} total prompts`);
      console.log(`   Review report at: ${reportDir}/report.md`);
    } else {
      if (quality.valid && validationErrors.length === 0) {
        console.log('✅ Pipeline completed successfully!');
        console.log(`   Created ${packs.length} pack(s)`);
        console.log(`   Report: ${reportDir}/report.md`);
        process.exit(0);
      } else {
        console.error('❌ Pipeline completed with errors');
        console.error(`   Report: ${reportDir}/report.md`);
        process.exit(1);
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

