#!/usr/bin/env tsx

/**
 * Run Profile Batch
 * 
 * Deterministic batch generation from PDF profile.
 * Uses cached extraction and emits run artifacts.
 * 
 * Usage:
 *   tsx scripts/pdf-ingestion/runProfileBatch.ts \
 *     --profile deutschimblick \
 *     --packs 10 \
 *     --promptsPerPack 12 \
 *     --scenario auto \
 *     --level A1
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { loadPdfProfile, type PdfProfile } from './loadPdfProfile.js';
import { extractAndCache } from './extractAndCache.js';
import { normalizeText, normalizeSinglePage } from './normalize.js';
import { segmentText } from './segment.js';
import { detectFrontMatterPages } from './frontMatter.js';
import { findBestWindow } from './windowSearch.js';
import { discoverScenarios } from './scenarioDiscovery.js';
import { checkCandidateQuality, isDialogueLike } from './quality.js';
import { loadProfile, shouldSkipPage, isPreferredPage, shouldRejectCandidate, type PdfIngestionProfile } from './profileLoader.js';
// Import types and utilities from pdf-to-packs-batch
import { generatePack, determineIntent, generateGlossEn, SeededRNG, type PackEntry } from './pdf-to-packs-batch.js';
import { computePackAnalytics } from './content-quality/computeAnalytics.js';
import type { PageText } from './extract.js';
import type { Candidate } from './segment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const CONTENT_DIR = join(PROJECT_ROOT, 'content', 'v1');
const REPORTS_DIR = join(PROJECT_ROOT, 'reports', 'pdf-runs');

// Scenario token dictionaries (reuse from batch processing)
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

interface CliArgs {
  profile: string;
  packs: number;
  promptsPerPack: number;
  scenario?: string;
  level?: string;
  useCache?: boolean;
  register?: string;
  emitTokenMining?: boolean;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = {};
  
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];
    
    if (arg === '--profile' && next) {
      args.profile = next;
      i++;
    } else if (arg === '--packs' && next) {
      args.packs = parseInt(next, 10);
      i++;
    } else if (arg === '--promptsPerPack' && next) {
      args.promptsPerPack = parseInt(next, 10);
      i++;
    } else if (arg === '--scenario' && next) {
      args.scenario = next;
      i++;
    } else if (arg === '--level' && next) {
      args.level = next;
      i++;
    } else if (arg === '--useCache' && next) {
      args.useCache = next === 'false' ? false : true;
      i++;
    } else if (arg === '--register' && next) {
      args.register = next;
      i++;
    } else if (arg === '--emitTokenMining' && next) {
      args.emitTokenMining = next === 'false' ? false : true;
      i++;
    }
  }
  
  if (!args.profile) throw new Error('Missing required: --profile');
  if (!args.packs) throw new Error('Missing required: --packs');
  if (!args.promptsPerPack) throw new Error('Missing required: --promptsPerPack');
  
  return {
    packs: args.packs,
    promptsPerPack: args.promptsPerPack,
    emitTokenMining: args.emitTokenMining !== false, // Default true
    useCache: args.useCache !== false,
    register: args.register || 'neutral',
    ...args
  } as CliArgs;
}

/**
 * Main execution
 */
async function main() {
  try {
    const args = parseArgs();
    
    // Load PDF profile
    console.log('📋 Loading PDF profile...');
    const profile = loadPdfProfile(args.profile);
    console.log(`   ✓ Profile: ${profile.id}`);
    console.log(`   ✓ File: ${profile.file}`);
    console.log(`   ✓ Workspace: ${profile.workspace}`);
    console.log(`   ✓ Language: ${profile.language}`);
    console.log('');
    
    if (!existsSync(profile.file)) {
      throw new Error(`PDF file not found: ${profile.file}`);
    }
    
    // Ensure extraction cache exists
    console.log('📄 Ensuring extraction cache...');
    const { extraction, cacheKey, cachePath, fromCache } = await extractAndCache(
      profile.file,
      profile.id,
      args.useCache
    );
    
    if (fromCache) {
      console.log(`   ✓ Using cached extraction (key: ${cacheKey})`);
    } else {
      console.log(`   ✓ Extracted and cached (key: ${cacheKey})`);
    }
    console.log('');
    
    // Use profile defaults
    const scenario = args.scenario || profile.defaultScenario || 'auto';
    const level = args.level || profile.defaultLevel || 'A1';
    const searchSettings = profile.search || {};
    const skipFrontMatter = searchSettings.skipFrontMatter !== false;
    const windowSizePages = searchSettings.windowSizePages || 25;
    const minScenarioHits = searchSettings.minScenarioHits || 2;
    const anchors = searchSettings.anchors || [];
    
    // Load ingestion profile if available (for skipPages, etc.)
    let ingestionProfile: PdfIngestionProfile | null = null;
    try {
      ingestionProfile = loadProfile(profile.id);
      if (ingestionProfile) {
        console.log(`📋 Loaded ingestion profile for ${profile.id}`);
      }
    } catch {
      // No ingestion profile, that's fine
    }
    
    // Create run directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const runDir = join(REPORTS_DIR, profile.id, timestamp);
    mkdirSync(runDir, { recursive: true });
    
    console.log('🔄 Running batch generation...');
    console.log(`   Scenario: ${scenario}`);
    console.log(`   Level: ${level}`);
    console.log(`   Packs: ${args.packs}`);
    console.log(`   Prompts per pack: ${args.promptsPerPack}`);
    console.log('');
    
    // Step 1: Normalize
    console.log('🧹 Step 1: Normalizing text...');
    const hasPerPageText = extraction.pages.some(p => p.text && p.text.trim().length > 100);
    let normalizedPages: PageText[] = [];
    
    if (hasPerPageText && extraction.pages.length > 1) {
      for (const page of extraction.pages) {
        const normResult = normalizeSinglePage(page);
        normalizedPages.push({
          pageNumber: page.pageNumber,
          text: normResult.normalizedText,
          charCount: normResult.normalizedText.length
        });
      }
    } else {
      const allText = extraction.pages.map(p => p.text || '').join('\n');
      const normResult = normalizeText([{ pageNumber: 1, text: allText, charCount: allText.length }]);
      normalizedPages = [{ pageNumber: 1, text: normResult.normalizedText, charCount: normResult.normalizedText.length }];
    }
    
    const combinedText = normalizedPages.map(p => p.text).join('\n');
    console.log(`   ✓ Normalized ${normalizedPages.length} pages`);
    console.log('');
    
    // Step 2: Segment
    console.log('✂️  Step 2: Segmenting text into candidates...');
    const seed = `${profile.id}-${scenario}-${level}`;
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
        const absolutePage = Math.min(relativePage, extraction.pageCount - 1);
        candidatesWithPages.push({ ...candidate, pageIndex: absolutePage });
      } else {
        const relativePage = Math.floor(charOffset / avgCharsPerPage);
        const absolutePage = Math.min(relativePage, extraction.pageCount - 1);
        candidatesWithPages.push({ ...candidate, pageIndex: absolutePage });
        charOffset += candidate.text.length;
      }
    }
    
    console.log(`   ✓ Found ${candidatesWithPages.length} candidates`);
    console.log('');
    
    // Step 3: Detect front matter and apply ingestion profile skipPages
    let pagesToProcess = extraction.pages;
    let frontMatterResult = { skipUntilPageIndex: 0, evidence: { frontMatterPages: [], reasons: [], firstContentPage: 0 } };
    
    if (skipFrontMatter) {
      console.log('📑 Step 3: Detecting front matter...');
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
    
    // Step 4: Scenario Discovery
    let scenarioDiscoveryResult: any = null;
    let chosenScenario = scenario;
    
    if (scenario === 'auto') {
      console.log('🔍 Step 4: Discovering scenarios...');
      const requiredTokens = SCENARIO_TOKEN_DICTS;
      scenarioDiscoveryResult = discoverScenarios(
        pagesToProcess,
        candidatesWithPages.map(c => ({
          ...c,
          pageIndex: c.pageIndex - frontMatterResult.skipUntilPageIndex
        })),
        requiredTokens,
        windowSizePages,
        minScenarioHits,
        profile.language
      );
      
      if (scenarioDiscoveryResult.rankings.length === 0) {
        throw new Error('No scenarios found in PDF');
      }
      
      // Use profile defaultScenarios if available (from ingestion profile)
      if (ingestionProfile && ingestionProfile.defaultScenarios && ingestionProfile.defaultScenarios.length > 0) {
        const profilePreferred = scenarioDiscoveryResult.rankings.find((r: any) => 
          ingestionProfile!.defaultScenarios.includes(r.scenario)
        );
        if (profilePreferred) {
          chosenScenario = profilePreferred.scenario;
          console.log(`   ✓ Using profile-preferred scenario: ${chosenScenario}`);
        } else {
          chosenScenario = scenarioDiscoveryResult.rankings[0].scenario;
          console.log(`   ✓ Using top discovered scenario: ${chosenScenario}`);
        }
      } else {
        chosenScenario = scenarioDiscoveryResult.rankings[0].scenario;
        console.log(`   ✓ Top scenario: ${chosenScenario}`);
      }
      console.log('');
    }
    
    // Step 5: Window Search
    console.log('🔍 Step 5: Finding best window...');
    const requiredTokens = SCENARIO_TOKEN_DICTS[chosenScenario] || [];
    const strongTokensForScenario = STRONG_TOKENS[chosenScenario] || [];
    
    const candidatesForSearch = candidatesWithPages.map(c => ({
      ...c,
      pageIndex: c.pageIndex - frontMatterResult.skipUntilPageIndex
    }));
    
    const windowSearchResult = findBestWindow(
      pagesToProcess,
      candidatesForSearch,
      requiredTokens,
      anchors,
      windowSizePages,
      minScenarioHits,
      profile.language,
      1,
      strongTokensForScenario
    );
    
    if (!windowSearchResult.bestWindow) {
      throw new Error(`No suitable window found for scenario "${chosenScenario}"`);
    }
    
    // Convert back to absolute page indices
    const bestWindow = {
      ...windowSearchResult.bestWindow,
      startPage: windowSearchResult.bestWindow.startPage + frontMatterResult.skipUntilPageIndex,
      endPage: windowSearchResult.bestWindow.endPage + frontMatterResult.skipUntilPageIndex
    };
    
    console.log(`   ✓ Best window: pages ${bestWindow.startPage}-${bestWindow.endPage}`);
    console.log(`   - Qualified candidates: ${bestWindow.qualifiedCandidates}`);
    console.log('');
    
    // Step 6: Filter qualified candidates
    console.log('✅ Step 6: Filtering qualified candidates...');
    const qualifiedCandidates = bestWindow.candidates
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
        const quality = checkCandidateQuality([c], chosenScenario, requiredTokens);
        return quality.valid;
      });
    
    console.log(`   ✓ Found ${qualifiedCandidates.length} qualified candidates`);
    console.log('');
    
    // Check if we have enough candidates
    const minRequired = args.packs * args.promptsPerPack;
    if (qualifiedCandidates.length < minRequired) {
      const errorMsg = `Insufficient qualified candidates: ${qualifiedCandidates.length} (need at least ${minRequired})`;
      console.error(`❌ ${errorMsg}`);
      console.error('');
      // Emit token mining if enabled
      if (args.emitTokenMining !== false) {
        console.error('');
        console.error('🔍 Running token mining automatically...');
        try {
          execSync(
            `tsx scripts/pdf-ingestion/tokenMining.ts --profile ${profile.id} --workspace ${profile.workspace} --scenario ${chosenScenario} --topN 50 --minFreq 5 --maxPhraseLen 3`,
            { cwd: PROJECT_ROOT, stdio: 'inherit' }
          );
          console.error('');
          console.error('✅ Token mining completed. Review patch and re-run batch generation.');
        } catch (error: any) {
          console.error(`   ⚠️  Token mining failed: ${error.message}`);
        }
        console.error('');
      } else {
        console.error('💡 Token Mining Suggestion:');
        console.error(`   tsx scripts/pdf-ingestion/tokenMining.ts \\`);
        console.error(`     --profile ${profile.id} \\`);
        console.error(`     --workspace ${profile.workspace} \\`);
        console.error(`     --scenario ${chosenScenario} \\`);
        console.error(`     --topN 50 \\`);
        console.error(`     --minFreq 5 \\`);
        console.error(`     --maxPhraseLen 3`);
        console.error('');
      }
      process.exit(1);
    }
    
    // Step 7: Generate packs
    console.log('📦 Step 7: Generating packs...');
    const packs: PackEntry[] = [];
    const actualPacksToGenerate = Math.min(args.packs, Math.floor(qualifiedCandidates.length / args.promptsPerPack));
    
    // Create seeded RNG for deterministic generation
    const seed = `${profile.id}-${chosenScenario}-${level}`;
    const seedNum = parseInt(seed.substring(0, 8).replace(/\D/g, '0') || '12345678', 16);
    const rng = new SeededRNG(seedNum);
    
    const pdfBaseName = basename(profile.file, '.pdf').replace(/[^a-zA-Z0-9]/g, '-');
    
    for (let i = 0; i < actualPacksToGenerate; i++) {
      const startIdx = i * args.promptsPerPack;
      const endIdx = Math.min(startIdx + args.promptsPerPack, qualifiedCandidates.length);
      const packCandidates = qualifiedCandidates.slice(startIdx, endIdx);
      
      const packId = `${profile.id}_${chosenScenario}_${level}_${i + 1}`;
      const title = `${profile.id} - ${chosenScenario} - ${level} - Pack ${i + 1}`;
      
      const pack = generatePack(
        packCandidates,
        packId,
        title,
        level,
        chosenScenario,
        args.register || 'neutral',
        args.promptsPerPack,
        rng,
        pdfBaseName,
        { startPage: bestWindow.startPage, endPage: bestWindow.endPage, rank: 1 }
      );
      
      packs.push(pack);
      console.log(`   ✓ Generated pack: ${packId} (${pack.prompts.length} prompts)`);
    }
    console.log('');
    
    // Step 8: Write packs
    console.log('💾 Step 8: Writing pack files...');
    for (const pack of packs) {
      const packDir = join(CONTENT_DIR, 'workspaces', profile.workspace, 'packs', pack.id);
      mkdirSync(packDir, { recursive: true });
      const packPath = join(packDir, 'pack.json');
      writeFileSync(packPath, JSON.stringify(pack, null, 2), 'utf-8');
      console.log(`   ✓ Wrote ${packPath}`);
    }
    console.log('');
    
    // Step 9: Generate run artifacts
    console.log('📊 Step 9: Generating run artifacts...');
    const runArtifact = {
      profileId: profile.id,
      timestamp: new Date().toISOString(),
      cacheKey,
      fromCache,
      inputs: {
        profile: profile.id,
        scenario: chosenScenario,
        level,
        packs: args.packs,
        promptsPerPack: args.promptsPerPack,
        register: args.register || 'neutral'
      },
      chosenScenario,
      chosenWindow: {
        startPage: bestWindow.startPage,
        endPage: bestWindow.endPage,
        qualifiedCandidates: bestWindow.qualifiedCandidates
      },
      generatedPacks: packs.map(p => ({
        id: p.id,
        title: p.title,
        promptCount: p.prompts.length
      }))
    };
    
    const runJsonPath = join(runDir, 'run.json');
    writeFileSync(runJsonPath, JSON.stringify(runArtifact, null, 2), 'utf-8');
    console.log(`   ✓ Run artifact: ${runJsonPath}`);
    
    // Copy batch report if it exists (from pdf-to-packs-batch)
    // For now, we'll generate a simple markdown report
    const runMdPath = join(runDir, 'run.md');
    const md = generateRunReport(runArtifact, profile);
    writeFileSync(runMdPath, md, 'utf-8');
    console.log(`   ✓ Run report: ${runMdPath}`);
    console.log('');
    
    // Step 10: Regenerate indexes
    console.log('📇 Step 10: Regenerating section indexes...');
    try {
      execSync(`npm run content:generate-indexes -- --workspace ${profile.workspace}`, {
        cwd: PROJECT_ROOT,
        stdio: 'pipe'
      });
      console.log('   ✓ Indexes regenerated');
    } catch (error: any) {
      console.warn(`   ⚠️  Failed to regenerate indexes: ${error.message}`);
    }
    console.log('');
    
    console.log('✅ Batch generation complete!');
    console.log(`   Profile: ${profile.id}`);
    console.log(`   Scenario: ${chosenScenario}`);
    console.log(`   Level: ${level}`);
    console.log(`   Packs generated: ${packs.length}`);
    console.log(`   Run artifacts: ${runDir}`);
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
 * Generate Markdown run report
 */
function generateRunReport(runArtifact: any, profile: PdfProfile): string {
  const lines: string[] = [];
  
  lines.push('# PDF Batch Run Report');
  lines.push('');
  lines.push(`**Profile**: ${profile.id}`);
  lines.push(`**Timestamp**: ${new Date(runArtifact.timestamp).toLocaleString()}`);
  lines.push(`**Cache Key**: ${runArtifact.cacheKey}`);
  lines.push(`**From Cache**: ${runArtifact.fromCache ? 'Yes' : 'No'}`);
  lines.push('');
  
  lines.push('## Inputs');
  lines.push('');
  lines.push(`- **Scenario**: ${runArtifact.inputs.scenario}`);
  lines.push(`- **Level**: ${runArtifact.inputs.level}`);
  lines.push(`- **Packs**: ${runArtifact.inputs.packs}`);
  lines.push(`- **Prompts per Pack**: ${runArtifact.inputs.promptsPerPack}`);
  lines.push(`- **Register**: ${runArtifact.inputs.register}`);
  lines.push('');
  
  lines.push('## Results');
  lines.push('');
  lines.push(`- **Chosen Scenario**: ${runArtifact.chosenScenario}`);
  lines.push(`- **Window**: pages ${runArtifact.chosenWindow.startPage}-${runArtifact.chosenWindow.endPage}`);
  lines.push(`- **Qualified Candidates**: ${runArtifact.chosenWindow.qualifiedCandidates}`);
  lines.push(`- **Packs Generated**: ${runArtifact.generatedPacks.length}`);
  lines.push('');
  
  lines.push('## Generated Packs');
  lines.push('');
  for (const pack of runArtifact.generatedPacks) {
    lines.push(`- **${pack.id}**: ${pack.title} (${pack.promptCount} prompts)`);
  }
  lines.push('');
  
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

