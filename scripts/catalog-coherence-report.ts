#!/usr/bin/env tsx

/**
 * Catalog Coherence Report Generator
 * 
 * Generates deterministic coherence reports proving catalog quality + non-randomness at scale.
 * 
 * Usage:
 *   tsx scripts/catalog-coherence-report.ts --workspace de --manifest staging
 *   tsx scripts/catalog-coherence-report.ts --workspace all --manifest staging --outDir reports/catalog-coherence/2025-01-01
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const CONTENT_DIR = join(PROJECT_ROOT, 'content', 'v1');
const META_DIR = join(PROJECT_ROOT, 'content', 'meta');

// Scenario token dictionaries
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken', 'reservierung'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung', 'warenkorb'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination', 'termin', 'symptom', 'rezept', 'medizin', 'behandlung', 'diagnose', 'gesundheit', 'patient', 'klinik', 'untersuchung', 'arzt'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address', 'wohnung', 'miete', 'mietvertrag', 'vermieter', 'mieter', 'kaution', 'nebenkosten', 'möbel', 'nachbarschaft', 'adresse'],
  government_office: ['appointment', 'form', 'document', 'passport', 'registration', 'office', 'official', 'termin', 'formular', 'pass', 'anmeldung', 'unterlagen', 'amt', 'behörde'],
  school: ['school', 'university', 'student', 'teacher', 'class', 'homework', 'exam', 'grade', 'course', 'lecture', 'schule', 'universität', 'uni', 'student', 'studentin', 'lehrer', 'lehrerin', 'klasse', 'hausaufgabe', 'prüfung', 'note', 'kurs', 'vorlesung', 'studieren', 'lernen'],
  travel: ['travel', 'trip', 'flight', 'hotel', 'ticket', 'passport', 'luggage', 'airport', 'train', 'station', 'reise', 'reisen', 'flug', 'hotel', 'ticket', 'pass', 'koffer', 'flughafen', 'zug', 'bahnhof'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time', 'grüßen', 'hallo', 'auf wiedersehen', 'morgen', 'abend', 'tag', 'sehen', 'treffen', 'freund', 'zeit', 'tschüss'],
  intro_lesson: ['welcome', 'course', 'lesson', 'learn', 'language', 'english', 'start', 'begin', 'offer', 'introduction', 'willkommen', 'kurs', 'lernen', 'sprache', 'englisch', 'beginnen', 'anbieten', 'einführung']
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
  manifest: 'staging' | 'prod';
  baseUrl?: string;
  outDir?: string;
  failOnRisk: boolean;
}

interface SectionIndexItem {
  id: string;
  title: string;
  level: string;
  kind?: string;
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  durationMinutes?: number;
}

interface SectionIndex {
  version: string;
  kind: string;
  total: number;
  pageSize: number;
  items: SectionIndexItem[];
  nextPage: string | null;
}

interface EntryDocument {
  id: string;
  kind: string;
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
  provenance?: {
    source?: string;
    review?: {
      status?: string;
    };
  };
}

interface CoherenceMetrics {
  totals: {
    packs: number;
    exams: number;
    drills: number;
    total: number;
  };
  distribution: {
    scenario: Record<string, number>;
    register: Record<string, number>;
    level: Record<string, number>;
  };
  coverage: {
    primaryStructures: Record<string, number>;
    variationSlots: Record<string, number>;
  };
  promptMetrics: {
    promptsPerPack: {
      min: number;
      max: number;
      avg: number;
      distribution: Record<number, number>;
    };
    multiSlotVariationRate: number;
    scenarioTokenCoverageRate: number;
    avgTokenHitsPerPrompt: Record<string, number>;
  };
  reviewMetrics: {
    needsReview: number;
    approved: number;
    unknown: number;
  };
  violations: {
    bannedPhrases: Array<{ packId: string; promptId: string; phrase: string }>;
    duplicates: Array<{ packId1: string; packId2: string; reason: string }>;
  };
  risks: Array<{
    packId: string;
    reasons: string[];
    score: number;
  }>;
}

interface CoherenceReport {
  generatedAt: string;
  gitSha: string;
  manifest: string;
  workspaces: string[];
  metrics: CoherenceMetrics;
  perPackFlags: Record<string, {
    lowTokenDensity: boolean;
    outlineStepsMismatch: boolean;
    repeatedSkeletonPatterns: boolean;
    riskScore: number;
  }>;
}

/**
 * Get git SHA
 */
function getGitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: PROJECT_ROOT }).trim();
  } catch {
    return 'not-in-git';
  }
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
    } else if (arg === '--manifest' && next) {
      args.manifest = next === 'prod' ? 'prod' : 'staging';
      i++;
    } else if (arg === '--baseUrl' && next) {
      args.baseUrl = next;
      i++;
    } else if (arg === '--outDir' && next) {
      args.outDir = next;
      i++;
    } else if (arg === '--failOnRisk' && next) {
      args.failOnRisk = next === 'true';
      i++;
    }
  }
  
  return {
    workspace: args.workspace || 'all',
    manifest: args.manifest || 'staging',
    failOnRisk: args.failOnRisk || false,
    ...args
  };
}

/**
 * Load manifest
 */
function loadManifest(manifest: 'staging' | 'prod'): any {
  const manifestFile = manifest === 'prod' 
    ? join(META_DIR, 'manifest.json')
    : join(META_DIR, 'manifest.staging.json');
  
  if (!existsSync(manifestFile)) {
    throw new Error(`Manifest file not found: ${manifestFile}`);
  }
  
  return JSON.parse(readFileSync(manifestFile, 'utf-8'));
}

/**
 * Load catalog for workspace
 */
function loadCatalog(workspace: string): any {
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  if (!existsSync(catalogPath)) {
    return null;
  }
  return JSON.parse(readFileSync(catalogPath, 'utf-8'));
}

/**
 * Follow pagination chain and collect all items
 */
function collectAllItems(section: any, baseUrl?: string): SectionIndexItem[] {
  const items: SectionIndexItem[] = [];
  let currentPagePath: string | null = section.itemsUrl.replace(/^\/v1\//, '');
  const visitedPages = new Set<string>();
  
  while (currentPagePath) {
    if (visitedPages.has(currentPagePath)) {
      console.warn(`⚠️  Pagination loop detected at ${currentPagePath}`);
      break;
    }
    visitedPages.add(currentPagePath);
    
    const indexPath = join(CONTENT_DIR, currentPagePath);
    if (!existsSync(indexPath)) {
      if (baseUrl) {
        // Try fetching via baseUrl
        const url = `${baseUrl}${section.itemsUrl}`;
        try {
          // Would need fetch here, but for now just skip
          console.warn(`⚠️  Index not found locally: ${currentPagePath}`);
        } catch {
          break;
        }
      } else {
        break;
      }
    }
    
    const index: SectionIndex = JSON.parse(readFileSync(indexPath, 'utf-8'));
    items.push(...(index.items || []));
    
    currentPagePath = index.nextPage ? index.nextPage.replace(/^\/v1\//, '') : null;
  }
  
  return items;
}

/**
 * Load entry document
 */
function loadEntryDocument(entryUrl: string, baseUrl?: string): EntryDocument | null {
  const entryPath = join(CONTENT_DIR, entryUrl.replace(/^\/v1\//, ''));
  if (!existsSync(entryPath)) {
    if (baseUrl) {
      // Would fetch via baseUrl
      return null;
    }
    return null;
  }
  
  try {
    return JSON.parse(readFileSync(entryPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Normalize text for similarity comparison
 */
function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract skeleton from prompt text
 */
function extractSkeleton(text: string): string {
  return normalizeForSimilarity(text)
    .replace(/\b(ich|du|er|sie|es|wir|ihr|sie|i|you|he|she|it|we|they)\b/gi, 'PRONOUN')
    .replace(/\b\d+\b/g, 'NUMBER')
    .replace(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, 'DAY');
}

/**
 * Count scenario token hits in text
 */
function countTokenHits(text: string, scenario: string): number {
  const tokens = SCENARIO_TOKEN_DICTS[scenario] || [];
  const textLower = text.toLowerCase();
  let hits = 0;
  
  for (const token of tokens) {
    if (textLower.includes(token.toLowerCase())) {
      hits++;
    }
  }
  
  return hits;
}

/**
 * Check for banned phrases
 */
function checkBannedPhrases(text: string): string[] {
  const textLower = text.toLowerCase();
  const found: string[] = [];
  
  for (const phrase of DENYLIST_PHRASES) {
    if (textLower.includes(phrase.toLowerCase())) {
      found.push(phrase);
    }
  }
  
  return found;
}

/**
 * Compute coherence metrics
 */
function computeMetrics(
  entries: Array<{ item: SectionIndexItem; entry: EntryDocument }>
): CoherenceMetrics {
  const metrics: CoherenceMetrics = {
    totals: { packs: 0, exams: 0, drills: 0, total: 0 },
    distribution: { scenario: {}, register: {}, level: {} },
    coverage: { primaryStructures: {}, variationSlots: {} },
    promptMetrics: {
      promptsPerPack: { min: 0, max: 0, avg: 0, distribution: {} },
      multiSlotVariationRate: 0,
      scenarioTokenCoverageRate: 0,
      avgTokenHitsPerPrompt: {}
    },
    reviewMetrics: { needsReview: 0, approved: 0, unknown: 0 },
    violations: { bannedPhrases: [], duplicates: [] },
    risks: []
  };
  
  // Count totals
  for (const { entry } of entries) {
    if (entry.kind === 'pack') metrics.totals.packs++;
    else if (entry.kind === 'exam') metrics.totals.exams++;
    else if (entry.kind === 'drill') metrics.totals.drills++;
    metrics.totals.total++;
    
    // Distribution
    if (entry.scenario) {
      metrics.distribution.scenario[entry.scenario] = 
        (metrics.distribution.scenario[entry.scenario] || 0) + 1;
    }
    if (entry.register) {
      metrics.distribution.register[entry.register] = 
        (metrics.distribution.register[entry.register] || 0) + 1;
    }
    if (entry.level) {
      metrics.distribution.level[entry.level] = 
        (metrics.distribution.level[entry.level] || 0) + 1;
    }
    
    // Coverage
    if (entry.primaryStructure) {
      metrics.coverage.primaryStructures[entry.primaryStructure] = 
        (metrics.coverage.primaryStructures[entry.primaryStructure] || 0) + 1;
    }
    if (entry.variationSlots) {
      for (const slot of entry.variationSlots) {
        metrics.coverage.variationSlots[slot] = 
          (metrics.coverage.variationSlots[slot] || 0) + 1;
      }
    }
    
    // Review metrics
    const reviewStatus = entry.provenance?.review?.status || 'unknown';
    if (reviewStatus === 'needs_review') metrics.reviewMetrics.needsReview++;
    else if (reviewStatus === 'approved') metrics.reviewMetrics.approved++;
    else metrics.reviewMetrics.unknown++;
  }
  
  // Prompt metrics (packs only)
  const packs = entries.filter(e => e.entry.kind === 'pack' && e.entry.prompts);
  if (packs.length > 0) {
    const promptCounts: number[] = [];
    let multiSlotCount = 0;
    let tokenCoverageCount = 0;
    const tokenHitsByScenario: Record<string, number[]> = {};
    
    for (const { entry } of packs) {
      const prompts = entry.prompts || [];
      promptCounts.push(prompts.length);
      
      // Distribution
      metrics.promptMetrics.promptsPerPack.distribution[prompts.length] = 
        (metrics.promptMetrics.promptsPerPack.distribution[prompts.length] || 0) + 1;
      
      // Multi-slot variation
      for (const prompt of prompts) {
        if (prompt.slotsChanged && prompt.slotsChanged.length >= 2) {
          multiSlotCount++;
        }
        
        // Token coverage
        if (entry.scenario) {
          const hits = countTokenHits(prompt.text, entry.scenario);
          if (!tokenHitsByScenario[entry.scenario]) {
            tokenHitsByScenario[entry.scenario] = [];
          }
          tokenHitsByScenario[entry.scenario].push(hits);
          
          if (hits >= 2) {
            tokenCoverageCount++;
          }
        }
        
        // Banned phrases
        const banned = checkBannedPhrases(prompt.text);
        for (const phrase of banned) {
          metrics.violations.bannedPhrases.push({
            packId: entry.id,
            promptId: prompt.id || 'unknown',
            phrase
          });
        }
      }
    }
    
    // Prompt metrics
    if (promptCounts.length > 0) {
      metrics.promptMetrics.promptsPerPack.min = Math.min(...promptCounts);
      metrics.promptMetrics.promptsPerPack.max = Math.max(...promptCounts);
      metrics.promptMetrics.promptsPerPack.avg = 
        promptCounts.reduce((a, b) => a + b, 0) / promptCounts.length;
    }
    
    const totalPrompts = promptCounts.reduce((a, b) => a + b, 0);
    metrics.promptMetrics.multiSlotVariationRate = totalPrompts > 0 
      ? multiSlotCount / totalPrompts 
      : 0;
    metrics.promptMetrics.scenarioTokenCoverageRate = totalPrompts > 0
      ? tokenCoverageCount / totalPrompts
      : 0;
    
    // Average token hits per scenario
    for (const [scenario, hits] of Object.entries(tokenHitsByScenario)) {
      metrics.promptMetrics.avgTokenHitsPerPrompt[scenario] = 
        hits.reduce((a, b) => a + b, 0) / hits.length;
    }
  }
  
  // Duplicate detection (simple heuristic: same normalized text)
  const textMap = new Map<string, string>();
  for (const { entry } of entries) {
    if (entry.prompts) {
      for (const prompt of entry.prompts) {
        const normalized = normalizeForSimilarity(prompt.text);
        if (textMap.has(normalized)) {
          metrics.violations.duplicates.push({
            packId1: textMap.get(normalized)!,
            packId2: entry.id,
            reason: 'Duplicate prompt text'
          });
        } else {
          textMap.set(normalized, entry.id);
        }
      }
    }
  }
  
  // Risk flags
  for (const { item, entry } of entries) {
    if (entry.kind !== 'pack' || !entry.prompts) continue;
    
    const reasons: string[] = [];
    let riskScore = 0;
    
    // Low token density
    if (entry.scenario) {
      const avgHits = metrics.promptMetrics.avgTokenHitsPerPrompt[entry.scenario] || 0;
      const packHits = entry.prompts.map(p => countTokenHits(p.text, entry.scenario!));
      const packAvgHits = packHits.reduce((a, b) => a + b, 0) / packHits.length;
      
      if (packAvgHits < 2) {
        reasons.push(`Low token density (${packAvgHits.toFixed(1)} hits/prompt, threshold: 2)`);
        riskScore += 3;
      }
    }
    
    // Repeated skeleton patterns
    const skeletons = entry.prompts.map(p => extractSkeleton(p.text));
    const uniqueSkeletons = new Set(skeletons);
    if (uniqueSkeletons.size < skeletons.length * 0.7) {
      reasons.push('Repeated skeleton patterns detected');
      riskScore += 2;
    }
    
    if (reasons.length > 0) {
      metrics.risks.push({
        packId: entry.id,
        reasons,
        score: riskScore
      });
    }
  }
  
  // Sort risks by score
  metrics.risks.sort((a, b) => b.score - a.score);
  
  return metrics;
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(report: CoherenceReport): string {
  const lines: string[] = [];
  
  lines.push('# Catalog Coherence Report');
  lines.push('');
  lines.push(`**Generated**: ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push(`**Git SHA**: ${report.gitSha.substring(0, 8)}`);
  lines.push(`**Manifest**: ${report.manifest}`);
  lines.push(`**Workspaces**: ${report.workspaces.join(', ')}`);
  lines.push('');
  
  // Totals
  lines.push('## Totals');
  lines.push('');
  lines.push(`- **Packs**: ${report.metrics.totals.packs}`);
  lines.push(`- **Exams**: ${report.metrics.totals.exams}`);
  lines.push(`- **Drills**: ${report.metrics.totals.drills}`);
  lines.push(`- **Total**: ${report.metrics.totals.total}`);
  lines.push('');
  
  // Distribution
  lines.push('## Distribution');
  lines.push('');
  
  lines.push('### Scenario Distribution');
  lines.push('');
  lines.push('| Scenario | Count | Percentage |');
  lines.push('|----------|-------|------------|');
  const total = report.metrics.totals.total;
  for (const [scenario, count] of Object.entries(report.metrics.distribution.scenario).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    lines.push(`| ${scenario} | ${count} | ${pct}% |`);
  }
  lines.push('');
  
  lines.push('### Level Distribution');
  lines.push('');
  lines.push('| Level | Count | Percentage |');
  lines.push('|-------|-------|------------|');
  for (const [level, count] of Object.entries(report.metrics.distribution.level).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    lines.push(`| ${level} | ${count} | ${pct}% |`);
  }
  lines.push('');
  
  // Coverage
  lines.push('## Coverage');
  lines.push('');
  lines.push(`- **Primary Structures**: ${Object.keys(report.metrics.coverage.primaryStructures).length} unique`);
  lines.push(`- **Variation Slots**: ${Object.keys(report.metrics.coverage.variationSlots).length} unique`);
  lines.push('');
  
  // Prompt Metrics
  if (report.metrics.totals.packs > 0) {
    lines.push('## Prompt Metrics');
    lines.push('');
    lines.push(`- **Prompts per Pack**: ${report.metrics.promptMetrics.promptsPerPack.min}-${report.metrics.promptMetrics.promptsPerPack.max} (avg: ${report.metrics.promptMetrics.promptsPerPack.avg.toFixed(1)})`);
    lines.push(`- **Multi-Slot Variation Rate**: ${(report.metrics.promptMetrics.multiSlotVariationRate * 100).toFixed(1)}%`);
    lines.push(`- **Scenario Token Coverage Rate**: ${(report.metrics.promptMetrics.scenarioTokenCoverageRate * 100).toFixed(1)}%`);
    lines.push('');
    
    lines.push('### Average Token Hits per Prompt (by Scenario)');
    lines.push('');
    lines.push('| Scenario | Avg Hits |');
    lines.push('|----------|----------|');
    for (const [scenario, hits] of Object.entries(report.metrics.promptMetrics.avgTokenHitsPerPrompt).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${scenario} | ${hits.toFixed(2)} |`);
    }
    lines.push('');
  }
  
  // Review Metrics
  lines.push('## Review Status');
  lines.push('');
  lines.push(`- **Approved**: ${report.metrics.reviewMetrics.approved}`);
  lines.push(`- **Needs Review**: ${report.metrics.reviewMetrics.needsReview}`);
  lines.push(`- **Unknown**: ${report.metrics.reviewMetrics.unknown}`);
  lines.push('');
  
  // Violations
  lines.push('## Violations');
  lines.push('');
  lines.push(`- **Banned Phrases**: ${report.metrics.violations.bannedPhrases.length}`);
  lines.push(`- **Duplicates**: ${report.metrics.violations.duplicates.length}`);
  lines.push('');
  
  if (report.metrics.violations.bannedPhrases.length > 0) {
    lines.push('### Banned Phrases');
    lines.push('');
    for (const violation of report.metrics.violations.bannedPhrases.slice(0, 10)) {
      lines.push(`- ${violation.packId}/${violation.promptId}: "${violation.phrase}"`);
    }
    lines.push('');
  }
  
  // Top Risks
  lines.push('## Top 10 Risks');
  lines.push('');
  if (report.metrics.risks.length === 0) {
    lines.push('✅ No risks detected');
  } else {
    lines.push('| Pack ID | Risk Score | Reasons |');
    lines.push('|---------|------------|---------|');
    for (const risk of report.metrics.risks.slice(0, 10)) {
      lines.push(`| ${risk.packId} | ${risk.score} | ${risk.reasons.join('; ')} |`);
    }
  }
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    const args = parseArgs();
    
    console.log('📊 Generating Catalog Coherence Report');
    console.log(`   Workspace: ${args.workspace}`);
    console.log(`   Manifest: ${args.manifest}`);
    console.log('');
    
    // Load manifest
    const manifest = loadManifest(args.manifest);
    const workspaces = args.workspace === 'all' 
      ? Object.keys(manifest.workspaces || {})
      : [args.workspace];
    
    // Collect all entries
    const allEntries: Array<{ item: SectionIndexItem; entry: EntryDocument }> = [];
    
    for (const workspace of workspaces) {
      console.log(`📁 Processing workspace: ${workspace}`);
      const catalog = loadCatalog(workspace);
      if (!catalog) {
        console.warn(`⚠️  Catalog not found for workspace: ${workspace}`);
        continue;
      }
      
      for (const section of catalog.sections || []) {
        console.log(`   Section: ${section.id} (${section.kind})`);
        const items = collectAllItems(section, args.baseUrl);
        console.log(`     Found ${items.length} items`);
        
        for (const item of items) {
          const entry = loadEntryDocument(item.entryUrl, args.baseUrl);
          if (entry) {
            allEntries.push({ item, entry });
          }
        }
      }
    }
    
    console.log('');
    console.log(`✅ Collected ${allEntries.length} entries`);
    console.log('');
    
    // Compute metrics
    console.log('📊 Computing metrics...');
    const metrics = computeMetrics(allEntries);
    
    // Generate per-pack flags
    const perPackFlags: Record<string, any> = {};
    for (const { entry } of allEntries) {
      if (entry.kind === 'pack') {
        const risk = metrics.risks.find(r => r.packId === entry.id);
        perPackFlags[entry.id] = {
          lowTokenDensity: risk?.reasons.some(r => r.includes('Low token density')) || false,
          outlineStepsMismatch: false, // Would need to check outline/steps
          repeatedSkeletonPatterns: risk?.reasons.some(r => r.includes('skeleton')) || false,
          riskScore: risk?.score || 0
        };
      }
    }
    
    // Generate report
    const report: CoherenceReport = {
      generatedAt: new Date().toISOString(),
      gitSha: getGitSha(),
      manifest: args.manifest,
      workspaces,
      metrics,
      perPackFlags
    };
    
    // Write reports
    const outDir = args.outDir || join(PROJECT_ROOT, 'reports', 'catalog-coherence', new Date().toISOString().split('T')[0]);
    mkdirSync(outDir, { recursive: true });
    
    const jsonPath = join(outDir, 'coherence.json');
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`✅ JSON report: ${jsonPath}`);
    
    const mdPath = join(outDir, 'coherence.md');
    const md = generateMarkdownReport(report);
    writeFileSync(mdPath, md);
    console.log(`✅ Markdown report: ${mdPath}`);
    
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Total entries: ${metrics.totals.total}`);
    console.log(`   Packs: ${metrics.totals.packs}`);
    console.log(`   Violations: ${metrics.violations.bannedPhrases.length} banned phrases, ${metrics.violations.duplicates.length} duplicates`);
    console.log(`   Risks: ${metrics.risks.length} packs flagged`);
    console.log('');
    
    // Fail on risk if requested
    if (args.failOnRisk && metrics.risks.length > 0) {
      const highRiskCount = metrics.risks.filter(r => r.score >= 3).length;
      if (highRiskCount > 0) {
        console.error(`❌ Found ${highRiskCount} high-risk packs (score >= 3)`);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

