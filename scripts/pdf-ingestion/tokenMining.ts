#!/usr/bin/env tsx

/**
 * PDF Token Mining
 * 
 * Extracts candidate tokens/phrases from PDF windows for scenario dictionary updates.
 * Deterministic, offline, dev-time only.
 * 
 * Usage:
 *   tsx scripts/pdf-ingestion/tokenMining.ts \
 *     --workspace de \
 *     --pdf ./imports/deutschimblick.pdf \
 *     --pdfId deutschimblick \
 *     --scenario school \
 *     --mode search \
 *     --topN 80 \
 *     --ngrams 1,2,3
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { extractPdfTextTextFirst } from './extract.js';
import { normalizeText, normalizeSinglePage } from './normalize.js';
import { segmentText } from './segment.js';
import { detectFrontMatterPages } from './frontMatter.js';
import { findBestWindow } from './windowSearch.js';
import { discoverScenarios } from './scenarioDiscovery.js';
import { checkCandidateQuality, isDialogueLike } from './quality.js';
import { normalizeForMatching } from './textNormalize.js';
import { loadProfile, shouldSkipPage, isPreferredPage, shouldRejectCandidate, type PdfIngestionProfile } from './profileLoader.js';
import { loadPdfProfile, type PdfProfile } from './loadPdfProfile.js';
import { extractAndCache } from './extractAndCache.js';
import { countConcretenessMarkers } from './scenarioScore.js';
import type { PageText } from './extract.js';
import type { Candidate } from './segment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const REPORTS_DIR = join(PROJECT_ROOT, 'reports', 'token-mining');
const STOPWORDS_DIR = join(__dirname, 'stopwords');

// Scenario token dictionaries (reuse from batch processing)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: [
    'meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task',
    'besprechung', 'termin', 'büro', 'kollege', 'kollegin', 'projekt', 'aufgabe', 'arbeit', 'job', 'praktikum',
    'bewerbung', 'lebenslauf', 'vorstellungsgespräch', 'bewerbungsgespräch', 'chef', 'firma', 'abteilung', 'team',
    'kunde', 'kundin', 'schicht', 'dienst', 'vertrag', 'gehalt', 'rechnung', 'auftrag'
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
  school: [
    'school', 'university', 'student', 'teacher', 'class', 'homework', 'exam', 'grade', 'course', 'lecture',
    'schule', 'universität', 'uni', 'student', 'studentin', 'lehrer', 'lehrerin', 'klasse', 'hausaufgabe',
    'prüfung', 'note', 'kurs', 'vorlesung', 'studieren', 'lernen'
  ],
  travel: [
    'travel', 'trip', 'flight', 'hotel', 'ticket', 'passport', 'luggage', 'airport', 'train', 'station',
    'reise', 'reisen', 'flug', 'hotel', 'ticket', 'pass', 'koffer', 'flughafen', 'zug', 'bahnhof',
    'reise buchen', 'flug buchen', 'hotel reservieren'
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
  "lorem ipsum",
  "practice german",
  "learn german",
  "study german"
];

interface CliArgs {
  workspace: string;
  pdf?: string;
  profile?: string;
  pdfId?: string;
  scenario?: string;
  mode: 'search' | 'range';
  pageRange?: string;
  window?: string;
  windowSizePages: number;
  minScenarioHits: number;
  topN: number;
  minFreq: number;
  maxPhraseLen: number;
  ngrams: number[];
  language: 'de' | 'en';
  skipFrontMatter: boolean;
  useCache: boolean;
}

interface TokenCandidate {
  token: string;
  count: number;
  examples: string[];
  normalized: string;
  score: number;
  frequency: number;
  dialogueBonus: number;
  concretenessBonus: number;
  headingPenalty: number;
  phraseBonus: number;
}

interface TokenMiningReport {
  pdfId: string;
  pdfPath: string;
  scenario: string;
  timestamp: string;
  windowUsed: {
    startPage: number;
    endPage: number;
    qualifiedCandidates: number;
  };
  tokens: TokenCandidate[];
  suggestedStrongTokens: string[];
  topN: number;
}

interface TokenPatchSuggestion {
  scenario: string;
  addTokens: Array<{
    token: string;
    strength: 'strong' | 'medium' | 'weak';
    reason: string;
    score: number;
    frequency: number;
    examples: string[];
  }>;
}

interface TokenPatch {
  workspace: string;
  profileId: string;
  generatedAt: string;
  suggestions: TokenPatchSuggestion[];
}

/**
 * Load stopwords
 */
export function loadStopwords(language: 'de' | 'en'): Set<string> {
  const stopwordPath = join(STOPWORDS_DIR, `${language}.txt`);
  if (!existsSync(stopwordPath)) {
    return new Set();
  }
  
  const content = readFileSync(stopwordPath, 'utf-8');
  const words = content.split('\n')
    .map(line => line.trim().toLowerCase())
    .filter(line => line.length > 0);
  
  return new Set(words);
}

/**
 * Check if token should be excluded
 */
export function shouldExcludeToken(
  token: string,
  stopwords: Set<string>,
  existingTokens: string[],
  language: 'de' | 'en'
): boolean {
  const normalized = normalizeForMatching(token);
  const tokenLower = token.toLowerCase();
  
  // Exclude stopwords
  if (stopwords.has(normalized) || stopwords.has(tokenLower)) {
    return true;
  }
  
  // Exclude very short tokens (< 3 chars)
  if (normalized.length < 3) {
    return true;
  }
  
  // Exclude numeric-only tokens
  if (/^\d+$/.test(normalized)) {
    return true;
  }
  
  // Exclude banned phrases
  for (const phrase of DENYLIST_PHRASES) {
    if (tokenLower.includes(phrase.toLowerCase())) {
      return true;
    }
  }
  
  // Exclude if already in scenario dictionary
  const existingNormalized = existingTokens.map(t => normalizeForMatching(t));
  if (existingNormalized.includes(normalized)) {
    return true;
  }
  
  return false;
}

/**
 * Extract n-grams from text
 */
export function extractNGrams(text: string, n: number): string[] {
  const normalized = normalizeForMatching(text);
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  const ngrams: string[] = [];
  
  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(' ');
    if (ngram.length >= 3) { // Minimum length
      ngrams.push(ngram);
    }
  }
  
  return ngrams;
}

/**
 * Check if text has dialogue markers
 */
function hasDialogueMarkers(text: string): boolean {
  // Check for quotes
  if (/["'„"«]/.test(text)) return true;
  // Check for colons (dialogue indicators)
  if (/:\s*[A-ZÄÖÜ]/.test(text)) return true;
  // Check for question/exclamation marks
  if (/[?!]/.test(text)) return true;
  return false;
}

/**
 * Check if text is heading-like
 */
function isHeadingLike(text: string): boolean {
  const trimmed = text.trim();
  // Too short
  if (trimmed.length < 10) return false;
  // All caps (likely heading)
  if (trimmed === trimmed.toUpperCase() && trimmed.length < 50) return true;
  // Starts with number + period
  if (/^\d+\.\s/.test(trimmed)) return true;
  // Single line, no punctuation
  if (!/[.!?]/.test(trimmed) && trimmed.split(/\s+/).length <= 5) return true;
  return false;
}

/**
 * Score token candidate
 */
function scoreToken(
  token: string,
  frequency: number,
  candidateTexts: string[]
): {
  score: number;
  frequency: number;
  dialogueBonus: number;
  concretenessBonus: number;
  headingPenalty: number;
  phraseBonus: number;
} {
  // Frequency score (log scale)
  const freqScore = Math.log(frequency + 1) * 2;
  
  // Dialogue bonus
  let dialogueBonus = 0;
  for (const text of candidateTexts) {
    if (text.includes(token) && hasDialogueMarkers(text)) {
      dialogueBonus += 2;
      break; // Count once per token
    }
  }
  
  // Concreteness bonus
  let concretenessBonus = 0;
  for (const text of candidateTexts) {
    if (text.includes(token)) {
      const markers = countConcretenessMarkers(text);
      if (markers > 0) {
        concretenessBonus += 1.5;
        break; // Count once per token
      }
    }
  }
  
  // Heading penalty
  let headingPenalty = 0;
  for (const text of candidateTexts) {
    if (text.includes(token) && isHeadingLike(text)) {
      headingPenalty += 3;
      break; // Count once per token
    }
  }
  
  // Phrase bonus (multi-word phrases)
  const phraseBonus = token.split(/\s+/).length >= 2 ? 1 : 0;
  
  const totalScore = freqScore + dialogueBonus + concretenessBonus - headingPenalty + phraseBonus;
  
  return {
    score: Math.max(0, totalScore),
    frequency,
    dialogueBonus,
    concretenessBonus,
    headingPenalty,
    phraseBonus
  };
}

/**
 * Determine token strength
 */
function determineStrength(score: number): 'strong' | 'medium' | 'weak' {
  if (score >= 7.0) return 'strong';
  if (score >= 4.0) return 'medium';
  return 'weak';
}

/**
 * Determine reason for token suggestion
 */
function determineReason(
  dialogueBonus: number,
  concretenessBonus: number,
  phraseBonus: number,
  frequency: number
): string {
  if (dialogueBonus > 0 && frequency >= 5) return 'freq+dialogue';
  if (phraseBonus > 0) return 'phrase';
  if (concretenessBonus > 0) return 'concreteness';
  if (frequency >= 10) return 'freq';
  return 'freq';
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
    } else if (arg === '--pdfId' && next) {
      args.pdfId = next;
      i++;
    } else if (arg === '--scenario' && next) {
      args.scenario = next;
      i++;
    } else if (arg === '--mode' && next) {
      args.mode = next === 'range' ? 'range' : 'search';
      i++;
    } else if (arg === '--pageRange' && next) {
      args.pageRange = next;
      i++;
    } else if (arg === '--windowSizePages' && next) {
      args.windowSizePages = parseInt(next, 10);
      i++;
    } else if (arg === '--minScenarioHits' && next) {
      args.minScenarioHits = parseInt(next, 10);
      i++;
    } else if (arg === '--topN' && next) {
      args.topN = parseInt(next, 10);
      i++;
    } else if (arg === '--ngrams' && next) {
      args.ngrams = next.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
      i++;
    } else if (arg === '--language' && next) {
      args.language = next === 'en' ? 'en' : 'de';
      i++;
    } else if (arg === '--skipFrontMatter' && next) {
      args.skipFrontMatter = next === 'false' ? false : true;
      i++;
    } else if (arg === '--profile' && next) {
      args.profile = next;
      i++;
    } else if (arg === '--window' && next) {
      args.window = next;
      i++;
    } else if (arg === '--minFreq' && next) {
      args.minFreq = parseInt(next, 10);
      i++;
    } else if (arg === '--maxPhraseLen' && next) {
      args.maxPhraseLen = parseInt(next, 10);
      i++;
    } else if (arg === '--useCache' && next) {
      args.useCache = next === 'false' ? false : true;
      i++;
    }
  }
  
  // Validate required
  if (!args.workspace) throw new Error('Missing required: --workspace');
  if (!args.pdf && !args.profile) throw new Error('Missing required: --pdf or --profile');
  
  // Set defaults
  return {
    mode: args.mode || 'search',
    windowSizePages: args.windowSizePages || 25,
    minScenarioHits: args.minScenarioHits || 2,
    topN: args.topN || 50,
    minFreq: args.minFreq || 5,
    maxPhraseLen: args.maxPhraseLen || 3,
    ngrams: args.ngrams || Array.from({ length: args.maxPhraseLen || 3 }, (_, i) => i + 1),
    language: args.language || (args.workspace === 'en' ? 'en' : 'de'),
    skipFrontMatter: args.skipFrontMatter !== false,
    useCache: args.useCache !== false,
    ...args
  } as CliArgs;
}

/**
 * Main execution
 */
async function main() {
  try {
    const args = parseArgs();
    
    // Load PDF profile if provided
    let pdfProfile: PdfProfile | null = null;
    let pdfPath: string;
    let profileId: string;
    
    if (args.profile) {
      pdfProfile = loadPdfProfile(args.profile);
      pdfPath = pdfProfile.file;
      profileId = pdfProfile.id;
      args.language = pdfProfile.language;
      if (pdfProfile.search) {
        if (pdfProfile.search.windowSizePages !== undefined) {
          args.windowSizePages = pdfProfile.search.windowSizePages;
        }
        if (pdfProfile.search.minScenarioHits !== undefined) {
          args.minScenarioHits = pdfProfile.search.minScenarioHits;
        }
      }
      console.log(`📋 Loaded PDF profile: ${profileId}`);
    } else if (args.pdf) {
      pdfPath = args.pdf;
      profileId = args.pdfId || basename(args.pdf, '.pdf').replace(/[^a-zA-Z0-9]/g, '-');
      if (!existsSync(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }
    } else {
      throw new Error('Must provide either --profile or --pdf');
    }
    
    // Load ingestion profile if pdfId provided
    let ingestionProfile: PdfIngestionProfile | null = null;
    if (args.pdfId || profileId) {
      ingestionProfile = loadProfile(args.pdfId || profileId);
      if (ingestionProfile) {
        console.log(`📋 Loaded ingestion profile for PDF ID: ${profileId}`);
        if (ingestionProfile.windowSizePages !== undefined) {
          args.windowSizePages = ingestionProfile.windowSizePages;
        }
        if (ingestionProfile.minScenarioHits !== undefined) {
          args.minScenarioHits = ingestionProfile.minScenarioHits;
        }
        if (ingestionProfile.language) {
          args.language = ingestionProfile.language;
        }
      }
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const reportDir = join(REPORTS_DIR, profileId, timestamp);
    mkdirSync(reportDir, { recursive: true });
    
    console.log('🔍 PDF Token Mining');
    console.log(`   Profile ID: ${profileId}`);
    if (args.profile) {
      console.log(`   PDF: ${pdfPath}`);
    }
    console.log(`   Workspace: ${args.workspace}`);
    console.log(`   Top N: ${args.topN}`);
    console.log(`   Min Frequency: ${args.minFreq}`);
    console.log(`   Max Phrase Length: ${args.maxPhraseLen}`);
    if (args.scenario) {
      console.log(`   Scenario: ${args.scenario}`);
    } else {
      console.log(`   Scenario: auto (will discover)`);
    }
    console.log('');
    
    // Step 1: Extract PDF (use cache if available)
    console.log('📄 Step 1: Extracting text from PDF...');
    let extraction;
    let cacheKey: string | null = null;
    
    if (args.profile && args.useCache) {
      const cacheResult = await extractAndCache(pdfPath, profileId, true);
      extraction = cacheResult.extraction;
      cacheKey = cacheResult.cacheKey;
      if (cacheResult.fromCache) {
        console.log(`   ✓ Using cached extraction (key: ${cacheKey})`);
      } else {
        console.log(`   ✓ Extracted and cached (key: ${cacheKey})`);
      }
    } else {
      extraction = await extractPdfTextTextFirst(pdfPath, false);
      console.log(`   ✓ Extracted ${extraction.totalChars} characters from ${extraction.pageCount} pages`);
    }
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
      }
      console.log('');
    }
    
    // Apply ingestion profile skipPages
    if (ingestionProfile) {
      const pagesToSkip: number[] = [];
      for (let i = 0; i < pagesToProcess.length; i++) {
        const absolutePageIndex = i + frontMatterResult.skipUntilPageIndex;
        if (shouldSkipPage(absolutePageIndex, ingestionProfile)) {
          pagesToSkip.push(i);
        }
      }
      if (pagesToSkip.length > 0) {
        pagesToProcess = pagesToProcess.filter((_, i) => !pagesToSkip.includes(i));
        console.log(`📋 Applied ingestion profile: skipped ${pagesToSkip.length} page(s)`);
        console.log('');
      }
      
      // Apply preferPageRanges
      if (ingestionProfile.preferPageRanges && ingestionProfile.preferPageRanges.length > 0) {
        const preferredPages: number[] = [];
        for (let i = 0; i < pagesToProcess.length; i++) {
          const absolutePageIndex = i + frontMatterResult.skipUntilPageIndex;
          if (isPreferredPage(absolutePageIndex, ingestionProfile)) {
            preferredPages.push(i);
          }
        }
        if (preferredPages.length > 0 && preferredPages.length < pagesToProcess.length) {
          pagesToProcess = pagesToProcess.filter((_, i) => preferredPages.includes(i));
          console.log(`📋 Applied ingestion profile: using ${preferredPages.length} preferred page(s)`);
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
    const seed = `${pdfId}-${args.scenario}-${args.workspace}`;
    const segmentation = segmentText(combinedText, parseInt(seed.substring(0, 8).replace(/\D/g, '0') || '12345678', 16));
    
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
    
    // Step 5: Scenario Discovery or Window Selection
    let scenariosToMine: string[] = [];
    let bestWindows: Array<{ scenario: string; window: any; candidates: any[] }> = [];
    
    if (args.scenario) {
      scenariosToMine = [args.scenario];
    } else {
      // Discover scenarios
      console.log('🔍 Step 5: Discovering scenarios...');
      const scenarioDiscovery = discoverScenarios(
        pagesToProcess,
        candidatesWithPages.map(c => ({
          ...c,
          pageIndex: c.pageIndex - frontMatterResult.skipUntilPageIndex
        })),
        SCENARIO_TOKEN_DICTS,
        args.windowSizePages,
        args.minScenarioHits,
        args.language
      );
      
      if (scenarioDiscovery.rankings.length === 0) {
        throw new Error('No scenarios found in PDF');
      }
      
      // Mine for top 3 scenarios
      scenariosToMine = scenarioDiscovery.rankings.slice(0, 3).map((r: any) => r.scenario);
      console.log(`   ✓ Top scenarios: ${scenariosToMine.join(', ')}`);
      console.log('');
    }
    
    // Find best windows for each scenario
    console.log('🔍 Step 5: Finding best windows...');
    for (const scenario of scenariosToMine) {
      const requiredTokens = SCENARIO_TOKEN_DICTS[scenario] || [];
      const strongTokensForScenario = STRONG_TOKENS[scenario] || [];
      const anchors = (ingestionProfile && ingestionProfile.anchors && ingestionProfile.anchors.length > 0)
        ? ingestionProfile.anchors
        : (pdfProfile && pdfProfile.search && pdfProfile.search.anchors) || [];
      
      // Apply window range if provided
      let pagesForScenario = pagesToProcess;
      if (args.window) {
        const [start, end] = args.window.split('-').map(n => parseInt(n, 10));
        pagesForScenario = pagesToProcess.filter(p => 
          p.pageNumber >= start && p.pageNumber <= end
        );
      }
      
      const candidatesForSearch = candidatesWithPages
        .filter(c => {
          const absPage = c.pageIndex + frontMatterResult.skipUntilPageIndex;
          if (args.window) {
            const [start, end] = args.window.split('-').map(n => parseInt(n, 10));
            return absPage >= start && absPage <= end;
          }
          return true;
        })
        .map(c => ({
          ...c,
          pageIndex: c.pageIndex - frontMatterResult.skipUntilPageIndex
        }));
      
      const windowSearchResult = findBestWindow(
        pagesForScenario,
        candidatesForSearch,
        requiredTokens,
        anchors,
        args.windowSizePages,
        args.minScenarioHits,
        args.language,
        1,
        strongTokensForScenario
      );
      
      if (windowSearchResult.bestWindow) {
        const bestWindow = {
          ...windowSearchResult.bestWindow,
          startPage: windowSearchResult.bestWindow.startPage + frontMatterResult.skipUntilPageIndex,
          endPage: windowSearchResult.bestWindow.endPage + frontMatterResult.skipUntilPageIndex
        };
        
        bestWindows.push({
          scenario,
          window: bestWindow,
          candidates: windowSearchResult.bestWindow.candidates
        });
        
        console.log(`   ✓ ${scenario}: pages ${bestWindow.startPage}-${bestWindow.endPage} (${bestWindow.qualifiedCandidates} candidates)`);
      }
    }
    console.log('');
    
    if (bestWindows.length === 0) {
      throw new Error('No suitable windows found for any scenario');
    }
    
    // Step 6: Extract and score tokens for each scenario
    console.log('🔍 Step 6: Extracting and scoring tokens...');
    const stopwords = loadStopwords(args.language);
    const allTokensByScenario: Record<string, TokenCandidate[]> = {};
    const patchSuggestions: TokenPatchSuggestion[] = [];
    
    for (const { scenario, window, candidates } of bestWindows) {
      // Filter qualified candidates
      const requiredTokens = SCENARIO_TOKEN_DICTS[scenario] || [];
      const qualifiedCandidates = candidates
        .filter(c => {
          // Apply ingestion profile rejectSections
          if (ingestionProfile && shouldRejectCandidate(c.text, ingestionProfile)) {
            return false;
          }
          
          // Check dialogue-like
          if (!isDialogueLike(c)) {
            return false;
          }
          
          // Check quality
          const quality = checkCandidateQuality([c], scenario, requiredTokens);
          return quality.valid;
        });
      
      console.log(`   ${scenario}: ${qualifiedCandidates.length} qualified candidates`);
      
      // Extract tokens with scoring
      const existingTokens = SCENARIO_TOKEN_DICTS[scenario] || [];
      const tokenMap = new Map<string, { 
        count: number; 
        examples: Set<string>;
        candidateTexts: string[];
      }>();
      
      for (const candidate of qualifiedCandidates) {
        // Extract n-grams (up to maxPhraseLen)
        for (let n = 1; n <= args.maxPhraseLen; n++) {
          const ngrams = extractNGrams(candidate.text, n);
          for (const ngram of ngrams) {
            if (!shouldExcludeToken(ngram, stopwords, existingTokens, args.language)) {
              if (!tokenMap.has(ngram)) {
                tokenMap.set(ngram, { count: 0, examples: new Set(), candidateTexts: [] });
              }
              const entry = tokenMap.get(ngram)!;
              entry.count++;
              if (entry.examples.size < 3) {
                entry.examples.add(candidate.text.substring(0, 150));
              }
              entry.candidateTexts.push(candidate.text);
            }
          }
        }
      }
      
      // Score and rank tokens
      const tokens: TokenCandidate[] = Array.from(tokenMap.entries())
        .filter(([_, data]) => data.count >= args.minFreq)
        .map(([token, data]) => {
          const scoring = scoreToken(token, data.count, data.candidateTexts);
          return {
            token,
            count: data.count,
            frequency: data.count,
            examples: Array.from(data.examples),
            normalized: normalizeForMatching(token),
            ...scoring
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, args.topN);
      
      allTokensByScenario[scenario] = tokens;
      
      // Create patch suggestions
      const addTokens = tokens
        .filter(t => t.score >= 2.0) // Minimum score threshold
        .map(t => ({
          token: t.token,
          strength: determineStrength(t.score),
          reason: determineReason(t.dialogueBonus, t.concretenessBonus, t.phraseBonus, t.frequency),
          score: t.score,
          frequency: t.frequency,
          examples: t.examples.slice(0, 3)
        }));
      
      if (addTokens.length > 0) {
        patchSuggestions.push({
          scenario,
          addTokens
        });
      }
      
      console.log(`   ✓ ${scenario}: ${tokens.length} tokens (${addTokens.filter(t => t.strength === 'strong').length} strong)`);
    }
    console.log('');
    
    // Step 7: Generate reports and patch
    console.log('📊 Step 7: Generating reports and patch...');
    
    // Generate patch file
    const patch: TokenPatch = {
      workspace: args.workspace,
      profileId,
      generatedAt: new Date().toISOString(),
      suggestions: patchSuggestions
    };
    
    const patchPath = join(reportDir, 'suggested-dictionary.patch.json');
    writeFileSync(patchPath, JSON.stringify(patch, null, 2));
    console.log(`   ✓ Patch file: ${patchPath}`);
    
    // Generate tokens.json (one per scenario or combined)
    const tokensPath = join(reportDir, 'tokens.json');
    writeFileSync(tokensPath, JSON.stringify(allTokensByScenario, null, 2));
    console.log(`   ✓ Tokens JSON: ${tokensPath}`);
    
    // Generate tokens.md (human-readable)
    const tokensMdPath = join(reportDir, 'tokens.md');
    const tokensMd = generateTokensMarkdown(allTokensByScenario, bestWindows, profileId);
    writeFileSync(tokensMdPath, tokensMd);
    console.log(`   ✓ Tokens Markdown: ${tokensMdPath}`);
    console.log('');
    
    // Summary
    console.log('📊 Summary:');
    for (const { scenario, window } of bestWindows) {
      const tokens = allTokensByScenario[scenario] || [];
      const strongCount = patchSuggestions
        .find(s => s.scenario === scenario)
        ?.addTokens.filter(t => t.strength === 'strong').length || 0;
      console.log(`   ${scenario}:`);
      console.log(`     Window: pages ${window.startPage}-${window.endPage}`);
      console.log(`     Tokens: ${tokens.length} (${strongCount} strong)`);
      if (tokens.length > 0) {
        console.log(`     Top: ${tokens.slice(0, 5).map(t => t.token).join(', ')}`);
      }
    }
    console.log('');
    console.log('💡 Next steps:');
    console.log(`   1. Review patch: ${patchPath}`);
    console.log(`   2. Review tokens: ${tokensMdPath}`);
    console.log(`   3. Apply patch: tsx scripts/apply-token-patch.ts --file ${patchPath}`);
    console.log(`   4. Re-run batch generation to verify improvement`);
    console.log('');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Generate Tokens Markdown report
 */
function generateTokensMarkdown(
  tokensByScenario: Record<string, TokenCandidate[]>,
  bestWindows: Array<{ scenario: string; window: any }>,
  profileId: string
): string {
  const lines: string[] = [];
  
  lines.push('# Token Mining Report');
  lines.push('');
  lines.push(`**Profile ID**: ${profileId}`);
  lines.push(`**Generated**: ${new Date().toLocaleString()}`);
  lines.push('');
  
  for (const { scenario, window } of bestWindows) {
    const tokens = tokensByScenario[scenario] || [];
    if (tokens.length === 0) continue;
    
    lines.push(`## ${scenario}`);
    lines.push('');
    lines.push(`**Window**: pages ${window.startPage}-${window.endPage}`);
    lines.push(`**Qualified Candidates**: ${window.qualifiedCandidates}`);
    lines.push('');
    
    lines.push('### Top Tokens');
    lines.push('');
    lines.push('| Rank | Token | Score | Frequency | Strength | Examples |');
    lines.push('|------|-------|-------|-----------|----------|----------|');
    for (let i = 0; i < Math.min(tokens.length, 30); i++) {
      const token = tokens[i];
      const example = token.examples[0] ? `"${token.examples[0].substring(0, 60)}..."` : '';
      const strength = determineStrength(token.score);
      lines.push(`| ${i + 1} | ${token.token} | ${token.score.toFixed(1)} | ${token.frequency} | ${strength} | ${example} |`);
    }
    lines.push('');
  }
  
  lines.push('## Next Steps');
  lines.push('');
  lines.push('1. Review tokens above');
  lines.push('2. Review patch file: `suggested-dictionary.patch.json`');
  lines.push('3. Apply patch: `tsx scripts/apply-token-patch.ts --file <patch-path>`');
  lines.push('4. Re-run batch generation to verify improvement');
  lines.push('');
  
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

