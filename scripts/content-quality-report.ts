#!/usr/bin/env tsx

/**
 * Content Quality Regression Harness
 * 
 * Analyzes all content in a workspace and fails validation if quality distribution degrades.
 * This is read-only analysis - it does NOT modify content.
 * 
 * Usage:
 *   npm run content:quality-report [--workspace <ws>]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const REPORTS_DIR = join(__dirname, '..', 'reports');

// Scenario token dictionaries (from validate-content.ts)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken', 'reservierung'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung', 'warenkorb'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination', 'termin', 'symptom', 'rezept', 'medizin', 'behandlung', 'diagnose', 'gesundheit', 'patient', 'klinik', 'untersuchung', 'arzt'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address', 'wohnung', 'miete', 'mietvertrag', 'vermieter', 'mieter', 'kaution', 'nebenkosten', 'möbel', 'nachbarschaft', 'adresse'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time', 'grüßen', 'hallo', 'auf wiedersehen', 'morgen', 'abend', 'tag', 'sehen', 'treffen', 'freund', 'zeit', 'tschüss']
};

interface PackEntry {
  id: string;
  kind: string;
  title: string;
  level: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  prompts?: Array<{
    id: string;
    text: string;
    slotsChanged?: string[];
    slots?: Record<string, any>;
  }>;
}

interface QualityReport {
  workspace: string;
  timestamp: string;
  packs: {
    total: number;
    byScenario: Record<string, number>;
    byPrimaryStructure: Record<string, number>;
    byLevel: Record<string, number>;
  };
  metrics: {
    scenarioCoverage: {
      distribution: Record<string, number>;
      failures: string[];
      warnings: string[];
    };
    primaryStructureDiversity: {
      distribution: Record<string, number>;
      failures: string[];
    };
    variationSlotDepth: {
      workspaceAverage: number;
      multiSlotPercentage: number;
      packFailures: Array<{ packId: string; percentage: number }>;
      failures: string[];
    };
    sentenceReuse: {
      duplicateSentences: Array<{ sentence: string; packs: string[] }>;
      skeletonRepeats: Array<{ packId: string; skeleton: string; count: number }>;
      failures: string[];
    };
    contextTokenDensity: {
      workspaceAverage: number;
      packFailures: Array<{ packId: string; average: number }>;
      failures: string[];
    };
    cefrBalance: {
      distribution: Record<string, number>;
      warnings: string[];
    };
  };
  hasFailures: boolean;
  hasWarnings: boolean;
}

/**
 * Normalize sentence for fingerprinting
 */
function normalizeSentence(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract sentence skeleton (normalized without specific values)
 */
function extractSkeleton(text: string): string {
  // Remove numbers, times, dates, amounts
  return normalizeSentence(text)
    .replace(/\d+/g, 'N')
    .replace(/\b(am|um|bis|für|mit|von|zu|in|an|auf)\s+\w+/g, 'PREP')
    .replace(/\b\d+€/g, 'AMOUNT')
    .replace(/\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, 'DAY');
}

/**
 * Load all packs from a workspace
 */
function loadAllPacks(workspace: string): PackEntry[] {
  const packs: PackEntry[] = [];
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  
  if (!existsSync(catalogPath)) {
    return packs;
  }
  
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  
  // Find context section
  const contextSection = catalog.sections?.find((s: any) => s.id === 'context');
  if (!contextSection?.itemsUrl) {
    return packs;
  }
  
  // Follow pagination chain
  let currentPagePath: string | null = contextSection.itemsUrl.replace(/^\/v1\//, '');
  const visitedPages = new Set<string>();
  
  while (currentPagePath) {
    if (visitedPages.has(currentPagePath)) {
      console.error(`⚠️  Pagination loop detected at ${currentPagePath}`);
      break;
    }
    visitedPages.add(currentPagePath);
    
    const indexPath = join(CONTENT_DIR, currentPagePath);
    if (!existsSync(indexPath)) {
      break;
    }
    
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    
    // Load each pack entry
    for (const item of index.items || []) {
      if (item.kind === 'pack' && item.entryUrl) {
        const entryPath = join(CONTENT_DIR, item.entryUrl.replace(/^\/v1\//, ''));
        if (existsSync(entryPath)) {
          try {
            const entry = JSON.parse(readFileSync(entryPath, 'utf-8'));
            packs.push(entry);
          } catch (err: any) {
            console.warn(`⚠️  Failed to load pack ${item.id}: ${err.message}`);
          }
        }
      }
    }
    
    // Move to next page
    currentPagePath = index.nextPage ? index.nextPage.replace(/^\/v1\//, '') : null;
  }
  
  return packs;
}

/**
 * Compute scenario coverage metrics
 */
function computeScenarioCoverage(packs: PackEntry[]): {
  distribution: Record<string, number>;
  failures: string[];
  warnings: string[];
} {
  const distribution: Record<string, number> = {};
  const failures: string[] = [];
  const warnings: string[] = [];
  
  packs.forEach(pack => {
    const scenario = pack.scenario || 'unknown';
    distribution[scenario] = (distribution[scenario] || 0) + 1;
  });
  
  const total = packs.length;
  
  // Fail if any scenario > 40%
  Object.entries(distribution).forEach(([scenario, count]) => {
    const percentage = (count / total) * 100;
    if (percentage > 40) {
      failures.push(`Scenario "${scenario}" is ${percentage.toFixed(1)}% of packs (max: 40%)`);
    }
  });
  
  // Fail if any declared scenario has < 2 packs, but only if we have enough total packs
  // (with very few packs, it's expected that scenarios won't have 2+ each)
  const totalPacks = packs.length;
  const minPacksForStrictCheck = 6; // Only enforce 2-per-scenario if we have 6+ packs
  
  Object.entries(distribution).forEach(([scenario, count]) => {
    if (count < 2 && totalPacks >= minPacksForStrictCheck) {
      failures.push(`Scenario "${scenario}" has only ${count} pack(s) (minimum: 2)`);
    } else if (count < 2 && totalPacks < minPacksForStrictCheck) {
      // For small pack counts, make it a warning instead
      warnings.push(`Scenario "${scenario}" has only ${count} pack(s) (minimum: 2, but only ${totalPacks} total packs)`);
    }
  });
  
  return { distribution, failures, warnings };
}

/**
 * Compute primary structure diversity
 */
function computePrimaryStructureDiversity(packs: PackEntry[]): {
  distribution: Record<string, number>;
  failures: string[];
} {
  const distribution: Record<string, number> = {};
  const failures: string[] = [];
  
  packs.forEach(pack => {
    const structure = pack.primaryStructure || 'unknown';
    distribution[structure] = (distribution[structure] || 0) + 1;
  });
  
  const total = packs.length;
  
  // Fail if any structure > 35%
  Object.entries(distribution).forEach(([structure, count]) => {
    const percentage = (count / total) * 100;
    if (percentage > 35) {
      failures.push(`Primary structure "${structure}" is ${percentage.toFixed(1)}% of packs (max: 35%)`);
    }
  });
  
  return { distribution, failures };
}

/**
 * Compute variation slot depth
 */
function computeVariationSlotDepth(packs: PackEntry[]): {
  workspaceAverage: number;
  multiSlotPercentage: number;
  packFailures: Array<{ packId: string; percentage: number }>;
  failures: string[];
} {
  let totalSlotsChanged = 0;
  let totalPrompts = 0;
  let multiSlotPrompts = 0;
  const packFailures: Array<{ packId: string; percentage: number }> = [];
  
  packs.forEach(pack => {
    if (!pack.prompts || pack.prompts.length === 0) return;
    
    let packSlotsChanged = 0;
    let packMultiSlot = 0;
    
    pack.prompts.forEach(prompt => {
      const slotsChanged = prompt.slotsChanged || [];
      const slotCount = slotsChanged.length;
      
      packSlotsChanged += slotCount;
      totalSlotsChanged += slotCount;
      totalPrompts++;
      
      if (slotCount >= 2) {
        packMultiSlot++;
        multiSlotPrompts++;
      }
    });
    
    const packMultiSlotPercentage = (packMultiSlot / pack.prompts.length) * 100;
    if (packMultiSlotPercentage < 30) {
      packFailures.push({
        packId: pack.id,
        percentage: packMultiSlotPercentage
      });
    }
  });
  
  const workspaceAverage = totalPrompts > 0 ? totalSlotsChanged / totalPrompts : 0;
  const multiSlotPercentage = totalPrompts > 0 ? (multiSlotPrompts / totalPrompts) * 100 : 0;
  
  const failures: string[] = [];
  
  if (workspaceAverage < 1.6) {
    failures.push(`Workspace average slots changed is ${workspaceAverage.toFixed(2)} (minimum: 1.6)`);
  }
  
  packFailures.forEach(f => {
    failures.push(`Pack "${f.packId}" has ${f.percentage.toFixed(1)}% multi-slot prompts (minimum: 30%)`);
  });
  
  return {
    workspaceAverage,
    multiSlotPercentage,
    packFailures,
    failures
  };
}

/**
 * Detect sentence reuse
 */
function detectSentenceReuse(packs: PackEntry[]): {
  duplicateSentences: Array<{ sentence: string; packs: string[] }>;
  skeletonRepeats: Array<{ packId: string; skeleton: string; count: number }>;
  failures: string[];
} {
  const sentenceMap = new Map<string, string[]>(); // normalized -> pack IDs
  const duplicateSentences: Array<{ sentence: string; packs: string[] }> = [];
  const skeletonRepeats: Array<{ packId: string; skeleton: string; count: number }> = [];
  const failures: string[] = [];
  
  // Track sentence reuse across packs
  packs.forEach(pack => {
    if (!pack.prompts) return;
    
    pack.prompts.forEach(prompt => {
      const normalized = normalizeSentence(prompt.text);
      if (!sentenceMap.has(normalized)) {
        sentenceMap.set(normalized, []);
      }
      sentenceMap.get(normalized)!.push(pack.id);
    });
  });
  
  // Find duplicates across packs
  sentenceMap.forEach((packIds, sentence) => {
    const uniquePacks = [...new Set(packIds)];
    if (uniquePacks.length > 1) {
      duplicateSentences.push({
        sentence,
        packs: uniquePacks
      });
      failures.push(`Sentence "${sentence.substring(0, 50)}..." appears in ${uniquePacks.length} pack(s): ${uniquePacks.join(', ')}`);
    }
  });
  
  // Track skeleton repeats within packs
  packs.forEach(pack => {
    if (!pack.prompts) return;
    
    const skeletonCounts = new Map<string, number>();
    
    pack.prompts.forEach(prompt => {
      const skeleton = extractSkeleton(prompt.text);
      skeletonCounts.set(skeleton, (skeletonCounts.get(skeleton) || 0) + 1);
    });
    
    skeletonCounts.forEach((count, skeleton) => {
      if (count > 3) {
        skeletonRepeats.push({
          packId: pack.id,
          skeleton,
          count
        });
        failures.push(`Pack "${pack.id}" repeats skeleton "${skeleton.substring(0, 50)}..." ${count} times (max: 3)`);
      }
    });
  });
  
  return { duplicateSentences, skeletonRepeats, failures };
}

/**
 * Compute context token density
 */
function computeContextTokenDensity(packs: PackEntry[]): {
  workspaceAverage: number;
  packFailures: Array<{ packId: string; average: number }>;
  failures: string[];
} {
  let totalTokens = 0;
  let totalPrompts = 0;
  const packFailures: Array<{ packId: string; average: number }> = [];
  
  packs.forEach(pack => {
    if (!pack.prompts || pack.prompts.length === 0 || !pack.scenario) return;
    
    const scenarioTokens = SCENARIO_TOKEN_DICTS[pack.scenario] || [];
    if (scenarioTokens.length === 0) return;
    
    let packTokens = 0;
    
    pack.prompts.forEach(prompt => {
      const textLower = prompt.text.toLowerCase();
      let promptTokens = 0;
      
      scenarioTokens.forEach(token => {
        if (textLower.includes(token.toLowerCase())) {
          promptTokens++;
        }
      });
      
      packTokens += promptTokens;
      totalTokens += promptTokens;
      totalPrompts++;
    });
    
    const packAverage = pack.prompts.length > 0 ? packTokens / pack.prompts.length : 0;
    if (packAverage < 2.0) {
      packFailures.push({
        packId: pack.id,
        average: packAverage
      });
    }
  });
  
  const workspaceAverage = totalPrompts > 0 ? totalTokens / totalPrompts : 0;
  
  const failures: string[] = [];
  
  if (workspaceAverage < 2.3) {
    failures.push(`Workspace average context token density is ${workspaceAverage.toFixed(2)} (minimum: 2.3)`);
  }
  
  packFailures.forEach(f => {
    failures.push(`Pack "${f.packId}" has average ${f.average.toFixed(2)} context tokens per prompt (minimum: 2.0)`);
  });
  
  return {
    workspaceAverage,
    packFailures,
    failures
  };
}

/**
 * Compute CEFR balance
 */
function computeCefrBalance(packs: PackEntry[]): {
  distribution: Record<string, number>;
  warnings: string[];
} {
  const distribution: Record<string, number> = {};
  const warnings: string[] = [];
  
  packs.forEach(pack => {
    const level = pack.level || 'unknown';
    distribution[level] = (distribution[level] || 0) + 1;
  });
  
  const total = packs.length;
  
  // Warn if any level > 50%
  Object.entries(distribution).forEach(([level, count]) => {
    const percentage = (count / total) * 100;
    if (percentage > 50) {
      warnings.push(`Level "${level}" is ${percentage.toFixed(1)}% of packs (consider balancing)`);
    }
  });
  
  return { distribution, warnings };
}

/**
 * Generate quality report for a workspace
 */
function generateReport(workspace: string): QualityReport {
  const packs = loadAllPacks(workspace);
  
  // Compute metrics
  const scenarioCoverage = computeScenarioCoverage(packs);
  const primaryStructureDiversity = computePrimaryStructureDiversity(packs);
  const variationSlotDepth = computeVariationSlotDepth(packs);
  const sentenceReuse = detectSentenceReuse(packs);
  const contextTokenDensity = computeContextTokenDensity(packs);
  const cefrBalance = computeCefrBalance(packs);
  
  // Aggregate distributions
  const byScenario: Record<string, number> = {};
  const byPrimaryStructure: Record<string, number> = {};
  const byLevel: Record<string, number> = {};
  
  packs.forEach(pack => {
    const scenario = pack.scenario || 'unknown';
    const structure = pack.primaryStructure || 'unknown';
    const level = pack.level || 'unknown';
    
    byScenario[scenario] = (byScenario[scenario] || 0) + 1;
    byPrimaryStructure[structure] = (byPrimaryStructure[structure] || 0) + 1;
    byLevel[level] = (byLevel[level] || 0) + 1;
  });
  
  // Only count scenario coverage as failure if we have enough packs to reasonably expect 2 per scenario
  const scenarioCoverageFailures = packs.length >= 6 ? scenarioCoverage.failures : [];
  
  const hasFailures = 
    scenarioCoverageFailures.length > 0 ||
    primaryStructureDiversity.failures.length > 0 ||
    variationSlotDepth.failures.length > 0 ||
    sentenceReuse.failures.length > 0 ||
    contextTokenDensity.failures.length > 0;
  
  const hasWarnings = cefrBalance.warnings.length > 0;
  
  return {
    workspace,
    timestamp: new Date().toISOString(),
    packs: {
      total: packs.length,
      byScenario,
      byPrimaryStructure,
      byLevel
    },
    metrics: {
      scenarioCoverage,
      primaryStructureDiversity,
      variationSlotDepth,
      sentenceReuse,
      contextTokenDensity,
      cefrBalance
    },
    hasFailures,
    hasWarnings
  };
}

/**
 * Format human-readable report
 */
function formatHumanReport(report: QualityReport): string {
  const lines: string[] = [];
  
  lines.push(`## Content Quality Report – Workspace: ${report.workspace}`);
  lines.push('');
  lines.push(`Packs: ${report.packs.total}`);
  
  // Scenario distribution
  const scenarioEntries = Object.entries(report.packs.byScenario)
    .sort((a, b) => b[1] - a[1]);
  const scenarioStr = scenarioEntries
    .map(([scenario, count]) => `${scenario} (${count})`)
    .join(', ');
  lines.push(`Scenarios: ${scenarioStr}`);
  
  // Check for scenario failures
  if (report.metrics.scenarioCoverage.failures.length > 0) {
    report.metrics.scenarioCoverage.failures.forEach(f => {
      lines.push(`❌ Risk: ${f}`);
    });
  }
  
  lines.push('');
  
  // Variation slot depth
  lines.push(`Average slots changed: ${report.metrics.variationSlotDepth.workspaceAverage.toFixed(2)}`);
  lines.push(`Multi-slot prompts: ${report.metrics.variationSlotDepth.multiSlotPercentage.toFixed(0)}%`);
  
  if (report.metrics.variationSlotDepth.failures.length > 0) {
    report.metrics.variationSlotDepth.failures.forEach(f => {
      lines.push(`❌ Fail: ${f}`);
    });
  }
  
  lines.push('');
  
  // Sentence reuse
  if (report.metrics.sentenceReuse.failures.length > 0) {
    report.metrics.sentenceReuse.failures.forEach(f => {
      lines.push(`❌ Fail: ${f}`);
    });
  } else {
    lines.push('Sentence reuse: none detected ✅');
  }
  
  lines.push('');
  
  // Context token density
  if (report.metrics.contextTokenDensity.failures.length > 0) {
    report.metrics.contextTokenDensity.failures.forEach(f => {
      lines.push(`❌ Fail: ${f}`);
    });
  } else {
    lines.push(`Context density avg: ${report.metrics.contextTokenDensity.workspaceAverage.toFixed(1)} ✅`);
  }
  
  lines.push('');
  
  // Primary structure diversity
  if (report.metrics.primaryStructureDiversity.failures.length > 0) {
    report.metrics.primaryStructureDiversity.failures.forEach(f => {
      lines.push(`❌ Fail: ${f}`);
    });
  }
  
  lines.push('');
  
  // CEFR balance warnings
  if (report.metrics.cefrBalance.warnings.length > 0) {
    report.metrics.cefrBalance.warnings.forEach(w => {
      lines.push(`⚠️  Warning: ${w}`);
    });
  }
  
  return lines.join('\n');
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const workspaceArg = args.find(arg => arg.startsWith('--workspace='));
  const workspace = workspaceArg ? workspaceArg.split('=')[1] : 'de';
  
  console.log(`📊 Generating content quality report for workspace: ${workspace}\n`);
  
  const report = generateReport(workspace);
  
  // Print human-readable report
  const humanReport = formatHumanReport(report);
  console.log(humanReport);
  
  // Save JSON report
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  const jsonPath = join(REPORTS_DIR, `content-quality-report.${workspace}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`\n📄 JSON report saved to: ${jsonPath}`);
  
  // Exit with error code if failures detected
  if (report.hasFailures) {
    console.error('\n❌ Quality regression detected. Build should fail.');
    process.exit(1);
  }
  
  if (report.hasWarnings) {
    console.warn('\n⚠️  Quality warnings detected (non-blocking).');
  }
}

main();

