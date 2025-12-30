#!/usr/bin/env tsx

/**
 * Content Expansion Sprint Harness
 * 
 * Analyzes all pack.json files under content/v1/** and generates a report
 * with per-pack metrics to prove content can scale without becoming generic.
 * 
 * Hard fails if:
 * - bannedPhraseHits > 0
 * - percentMultiSlotVariation < 30%
 * - duplicateSentenceCount > 0
 * 
 * Usage:
 *   npm run content:validate (includes this report)
 *   tsx scripts/content-expansion-report.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Allow overriding content directory for testing
const CONTENT_DIR = process.env.CONTENT_DIR || join(__dirname, '..', 'content', 'v1');
const META_DIR = process.env.META_DIR || join(__dirname, '..', 'content', 'meta');
const REPORT_PATH = process.env.REPORT_PATH || join(__dirname, '..', 'content-expansion-report.json');

// Quality Gates v1: Generic template denylist (from validate-content.ts)
const DENYLIST_PHRASES = [
  "in today's lesson",
  "let's practice",
  "this sentence",
  "i like to",
  "the quick brown fox",
  "lorem ipsum"
];

// Scenario token dictionaries (from validate-content.ts)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time'],
  government_office: ['appointment', 'form', 'document', 'application', 'permit', 'registration', 'passport', 'visa', 'residence', 'office', 'termin', 'formular', 'dokument', 'antrag', 'genehmigung', 'anmeldung', 'pass', 'visum', 'aufenthalt', 'amt']
};

interface PackEntry {
  id: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  prompts?: Array<{
    id: string;
    text: string;
    slotsChanged?: string[];
  }>;
}

interface PackMetrics {
  packId: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  promptCount: number;
  variationSlots: string[];
  percentMultiSlotVariation: number;
  averageScenarioTokenDensity: number;
  bannedPhraseHits: number;
  duplicateSentenceCount: number;
}

interface ExpansionReport {
  timestamp: string;
  totalPacks: number;
  packs: PackMetrics[];
  summary: {
    totalBannedPhraseHits: number;
    packsWithBannedPhrases: number;
    packsBelowMultiSlotThreshold: number;
    packsWithDuplicates: number;
    averageMultiSlotPercentage: number;
    averageScenarioTokenDensity: number;
  };
  failures: string[];
  passed: boolean;
}

/**
 * Normalize sentence for duplicate detection
 */
function normalizeSentence(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find all pack.json files recursively
 */
function findPackFiles(dir: string, fileList: string[] = []): string[] {
  if (!existsSync(dir)) {
    return fileList;
  }
  
  const files = readdirSync(dir);
  files.forEach(file => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      findPackFiles(filePath, fileList);
    } else if (file === 'pack.json') {
      fileList.push(filePath);
    }
  });
  return fileList;
}

/**
 * Count scenario tokens in text
 */
function countScenarioTokens(text: string, scenario: string): number {
  const scenarioTokens = SCENARIO_TOKEN_DICTS[scenario] || [];
  if (scenarioTokens.length === 0) return 0;
  
  const textLower = text.toLowerCase();
  const foundTokens = new Set<string>();
  
  scenarioTokens.forEach(token => {
    if (textLower.includes(token.toLowerCase())) {
      foundTokens.add(token);
    }
  });
  
  return foundTokens.size;
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
 * Analyze a single pack and compute metrics
 */
function analyzePack(packPath: string): PackMetrics | null {
  try {
    const content = readFileSync(packPath, 'utf-8');
    const pack: PackEntry = JSON.parse(content);
    
    // Skip if not a pack
    if (pack.kind !== 'pack') {
      return null;
    }
    
    const prompts = pack.prompts || [];
    const promptCount = prompts.length;
    
    // Compute variation slots
    const variationSlots = pack.variationSlots || [];
    
    // Compute multi-slot variation percentage
    let multiSlotCount = 0;
    prompts.forEach(prompt => {
      const slotsChanged = prompt.slotsChanged || [];
      if (slotsChanged.length >= 2) {
        multiSlotCount++;
      }
    });
    const percentMultiSlotVariation = promptCount > 0 ? (multiSlotCount / promptCount) * 100 : 0;
    
    // Compute average scenario token density
    const scenario = pack.scenario || 'unknown';
    let totalTokens = 0;
    prompts.forEach(prompt => {
      totalTokens += countScenarioTokens(prompt.text, scenario);
    });
    const averageScenarioTokenDensity = promptCount > 0 ? totalTokens / promptCount : 0;
    
    // Count banned phrase hits
    let bannedPhraseHits = 0;
    prompts.forEach(prompt => {
      if (containsBannedPhrases(prompt.text)) {
        bannedPhraseHits++;
      }
    });
    
    // Count duplicate sentences (within pack)
    const sentenceMap = new Map<string, number>();
    prompts.forEach(prompt => {
      const normalized = normalizeSentence(prompt.text);
      sentenceMap.set(normalized, (sentenceMap.get(normalized) || 0) + 1);
    });
    let duplicateSentenceCount = 0;
    sentenceMap.forEach((count, sentence) => {
      if (count > 1) {
        duplicateSentenceCount += count - 1; // Count duplicates (not originals)
      }
    });
    
    return {
      packId: pack.id,
      scenario: pack.scenario || 'unknown',
      register: pack.register || 'unknown',
      primaryStructure: pack.primaryStructure || 'unknown',
      promptCount,
      variationSlots,
      percentMultiSlotVariation,
      averageScenarioTokenDensity,
      bannedPhraseHits,
      duplicateSentenceCount
    };
  } catch (err: any) {
    console.warn(`⚠️  Failed to analyze pack ${packPath}: ${err.message}`);
    return null;
  }
}

/**
 * Generate expansion report
 */
function generateReport(): ExpansionReport {
  console.log('📊 Generating content expansion report...\n');
  
  // Find all pack.json files
  const packFiles = findPackFiles(CONTENT_DIR);
  console.log(`   Found ${packFiles.length} pack file(s)\n`);
  
  // Analyze each pack
  const packMetrics: PackMetrics[] = [];
  packFiles.forEach(packPath => {
    const metrics = analyzePack(packPath);
    if (metrics) {
      packMetrics.push(metrics);
    }
  });
  
  // Compute summary statistics
  let totalBannedPhraseHits = 0;
  let packsWithBannedPhrases = 0;
  let packsBelowMultiSlotThreshold = 0;
  let packsWithDuplicates = 0;
  let totalMultiSlotPercentage = 0;
  let totalScenarioTokenDensity = 0;
  
  packMetrics.forEach(metrics => {
    totalBannedPhraseHits += metrics.bannedPhraseHits;
    if (metrics.bannedPhraseHits > 0) {
      packsWithBannedPhrases++;
    }
    if (metrics.percentMultiSlotVariation < 30) {
      packsBelowMultiSlotThreshold++;
    }
    if (metrics.duplicateSentenceCount > 0) {
      packsWithDuplicates++;
    }
    totalMultiSlotPercentage += metrics.percentMultiSlotVariation;
    totalScenarioTokenDensity += metrics.averageScenarioTokenDensity;
  });
  
  const averageMultiSlotPercentage = packMetrics.length > 0 ? totalMultiSlotPercentage / packMetrics.length : 0;
  const averageScenarioTokenDensity = packMetrics.length > 0 ? totalScenarioTokenDensity / packMetrics.length : 0;
  
  // Check for hard failures
  const failures: string[] = [];
  
  if (totalBannedPhraseHits > 0) {
    failures.push(`HARD FAIL: ${totalBannedPhraseHits} banned phrase hit(s) found across ${packsWithBannedPhrases} pack(s). All banned phrase hits must be 0.`);
  }
  
  packMetrics.forEach(metrics => {
    if (metrics.bannedPhraseHits > 0) {
      failures.push(`Pack "${metrics.packId}" has ${metrics.bannedPhraseHits} banned phrase hit(s)`);
    }
    if (metrics.percentMultiSlotVariation < 30) {
      failures.push(`Pack "${metrics.packId}" has ${metrics.percentMultiSlotVariation.toFixed(1)}% multi-slot variation (minimum: 30%)`);
    }
    if (metrics.duplicateSentenceCount > 0) {
      failures.push(`Pack "${metrics.packId}" has ${metrics.duplicateSentenceCount} duplicate sentence(s)`);
    }
  });
  
  const passed = failures.length === 0;
  
  return {
    timestamp: new Date().toISOString(),
    totalPacks: packMetrics.length,
    packs: packMetrics,
    summary: {
      totalBannedPhraseHits,
      packsWithBannedPhrases,
      packsBelowMultiSlotThreshold,
      packsWithDuplicates,
      averageMultiSlotPercentage,
      averageScenarioTokenDensity
    },
    failures,
    passed
  };
}

/**
 * Main function
 */
function main() {
  const report = generateReport();
  
  // Write JSON report
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`📄 Report saved to: ${relative(process.cwd(), REPORT_PATH)}\n`);
  
  // Print summary
  console.log('Summary:');
  console.log(`   Total packs: ${report.totalPacks}`);
  console.log(`   Average multi-slot variation: ${report.summary.averageMultiSlotPercentage.toFixed(1)}%`);
  console.log(`   Average scenario token density: ${report.summary.averageScenarioTokenDensity.toFixed(2)}`);
  console.log(`   Banned phrase hits: ${report.summary.totalBannedPhraseHits}`);
  console.log(`   Packs below multi-slot threshold: ${report.summary.packsBelowMultiSlotThreshold}`);
  console.log(`   Packs with duplicates: ${report.summary.packsWithDuplicates}\n`);
  
  // Print failures
  if (report.failures.length > 0) {
    console.error('❌ HARD FAILURES DETECTED:\n');
    report.failures.forEach(failure => {
      console.error(`   ${failure}`);
    });
    console.error('\n❌ Content expansion report FAILED. Fix issues before proceeding.\n');
    process.exit(1);
  } else {
    console.log('✅ All packs pass expansion harness thresholds!\n');
  }
}

main();

