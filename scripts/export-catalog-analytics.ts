#!/usr/bin/env tsx

/**
 * Catalog Analytics Export
 * 
 * Generates deterministic exports proving coherence at catalog scale.
 * Outputs JSON and CSV summaries of analytics metadata across all packs.
 * 
 * Usage:
 *   npm run content:export-analytics [--workspace <ws>]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const EXPORTS_DIR = join(__dirname, '..', 'exports');

interface PackAnalytics {
  workspace: string;
  packId: string;
  title: string;
  level: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  targetResponseSeconds?: number;
  minDistinctSubjects?: number;
  minDistinctVerbs?: number;
  minMultiSlotRate?: number;
  canonicalIntents?: string[];
  anchorPhrases?: string[];
  promptCount: number;
  stepCount: number;
  estimatedMinutes: number;
  // Computed metrics
  multiSlotRate?: number;
  scenarioTokenHitAvg?: number;
  scenarioTokenQualifiedRate?: number;
  uniqueTokenRate?: number;
  bannedPhraseViolations?: number;
  passesQualityGates?: boolean;
  reviewStatus?: string;
}

interface CatalogAnalytics {
  version: string;
  generatedAt: string;
  gitSha: string;
  summary: {
    totalPacks: number;
    byScenario: Record<string, number>;
    byLevel: Record<string, number>;
    byRegister: Record<string, number>;
    byPrimaryStructure: Record<string, number>;
    variationSlotsDistribution: Record<string, number>;
    topAnchorPhrases: Array<{ phrase: string; frequency: number }>;
  };
  coverageMatrix: {
    scenario: string;
    level: string;
    register: string;
    count: number;
  }[];
  packs: PackAnalytics[];
  warnings: {
    missingOptionalTags: string[];
  };
}

/**
 * Get git SHA (short)
 */
function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Load all items from a section index (following pagination)
 */
function loadAllItemsFromSection(workspaceId: string, sectionId: string): any[] {
  const items: any[] = [];
  const indexPath = join(CONTENT_DIR, 'workspaces', workspaceId, sectionId, 'index.json');
  
  if (!existsSync(indexPath)) {
    return items;
  }
  
  let currentPath: string | null = indexPath;
  const visited = new Set<string>();
  
  while (currentPath) {
    if (visited.has(currentPath)) {
      console.warn(`⚠️  Circular reference detected in ${currentPath}`);
      break;
    }
    visited.add(currentPath);
    
    const resolvedPath = currentPath.replace(/^\/v1\//, '').replace(/^content\/v1\//, '');
    const fullPath = join(CONTENT_DIR, resolvedPath.replace(/^workspaces\//, 'workspaces/'));
    
    if (!existsSync(fullPath)) {
      break;
    }
    
    try {
      const content = readFileSync(fullPath, 'utf-8');
      const index = JSON.parse(content);
      
      if (Array.isArray(index.items)) {
        items.push(...index.items);
      }
      
      if (index.nextPage && typeof index.nextPage === 'string') {
        currentPath = index.nextPage;
      } else {
        currentPath = null;
      }
    } catch (error: any) {
      console.warn(`⚠️  Failed to read ${fullPath}: ${error.message}`);
      break;
    }
  }
  
  return items;
}

/**
 * Load pack entry document
 */
function loadPackEntry(entryUrl: string): any | null {
  const resolvedPath = entryUrl.replace(/^\/v1\//, '').replace(/^content\/v1\//, '');
  const fullPath = join(CONTENT_DIR, resolvedPath);
  
  if (!existsSync(fullPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    console.warn(`⚠️  Failed to read ${fullPath}: ${error.message}`);
    return null;
  }
}

/**
 * Extract analytics from pack
 */
function extractPackAnalytics(workspaceId: string, item: any, pack: any): PackAnalytics | null {
  if (!pack.analytics || typeof pack.analytics !== 'object') {
    return null;
  }
  
  const analytics = pack.analytics;
  
  return {
    workspace: workspaceId,
    packId: pack.id || item.id,
    title: pack.title || item.title,
    level: pack.level || item.level,
    scenario: analytics.scenario || pack.scenario || item.scenario || '',
    register: analytics.register || pack.register || item.register || '',
    primaryStructure: analytics.primaryStructure || pack.primaryStructure || item.primaryStructure || '',
    variationSlots: analytics.variationSlots || pack.variationSlots || item.variationSlots || [],
    targetResponseSeconds: analytics.targetResponseSeconds,
    minDistinctSubjects: analytics.minDistinctSubjects,
    minDistinctVerbs: analytics.minDistinctVerbs,
    minMultiSlotRate: analytics.minMultiSlotRate,
    canonicalIntents: analytics.canonicalIntents,
    anchorPhrases: analytics.anchorPhrases,
    promptCount: Array.isArray(pack.prompts) ? pack.prompts.length : 0,
    stepCount: pack.sessionPlan && Array.isArray(pack.sessionPlan.steps) ? pack.sessionPlan.steps.length : 0,
    estimatedMinutes: pack.estimatedMinutes || item.durationMinutes || 15,
    // Computed metrics
    multiSlotRate: analytics.multiSlotRate,
    scenarioTokenHitAvg: analytics.scenarioTokenHitAvg,
    scenarioTokenQualifiedRate: analytics.scenarioTokenQualifiedRate,
    uniqueTokenRate: analytics.uniqueTokenRate,
    bannedPhraseViolations: analytics.bannedPhraseViolations,
    passesQualityGates: analytics.passesQualityGates,
    reviewStatus: pack.review?.status || 'unknown'
  };
}

/**
 * Generate catalog analytics
 */
function generateCatalogAnalytics(workspaceId: string | null): CatalogAnalytics {
  const workspaces = workspaceId ? [workspaceId] : ['de', 'en'];
  const allPacks: PackAnalytics[] = [];
  const missingTags: string[] = [];
  
  for (const ws of workspaces) {
    const catalogPath = join(CONTENT_DIR, 'workspaces', ws, 'catalog.json');
    if (!existsSync(catalogPath)) {
      continue;
    }
    
    try {
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
      
      if (!Array.isArray(catalog.sections)) {
        continue;
      }
      
      for (const section of catalog.sections) {
        const items = loadAllItemsFromSection(ws, section.id);
        
        for (const item of items) {
          if (item.kind !== 'pack') {
            continue;
          }
          
          const pack = loadPackEntry(item.entryUrl);
          if (!pack) {
            continue;
          }
          
          const analytics = extractPackAnalytics(ws, item, pack);
          if (analytics) {
            allPacks.push(analytics);
            
            // Check for missing optional tags
            if (!analytics.targetResponseSeconds || !analytics.minDistinctSubjects || !analytics.minDistinctVerbs) {
              missingTags.push(`${ws}/${analytics.packId}`);
            }
          }
        }
      }
    } catch (error: any) {
      console.warn(`⚠️  Failed to process workspace ${ws}: ${error.message}`);
    }
  }
  
  // Compute summary statistics
  const byScenario: Record<string, number> = {};
  const byLevel: Record<string, number> = {};
  const byRegister: Record<string, number> = {};
  const byPrimaryStructure: Record<string, number> = {};
  const variationSlotsCount: Record<string, number> = {};
  const anchorPhraseFreq: Record<string, number> = {};
  
  for (const pack of allPacks) {
    byScenario[pack.scenario] = (byScenario[pack.scenario] || 0) + 1;
    byLevel[pack.level] = (byLevel[pack.level] || 0) + 1;
    byRegister[pack.register] = (byRegister[pack.register] || 0) + 1;
    byPrimaryStructure[pack.primaryStructure] = (byPrimaryStructure[pack.primaryStructure] || 0) + 1;
    
    for (const slot of pack.variationSlots) {
      variationSlotsCount[slot] = (variationSlotsCount[slot] || 0) + 1;
    }
    
    if (pack.anchorPhrases) {
      for (const phrase of pack.anchorPhrases) {
        anchorPhraseFreq[phrase] = (anchorPhraseFreq[phrase] || 0) + 1;
      }
    }
  }
  
  // Top anchor phrases
  const topAnchorPhrases = Object.entries(anchorPhraseFreq)
    .map(([phrase, frequency]) => ({ phrase, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);
  
  // Coverage matrix
  const coverageMatrix: Record<string, number> = {};
  for (const pack of allPacks) {
    const key = `${pack.scenario}|${pack.level}|${pack.register}`;
    coverageMatrix[key] = (coverageMatrix[key] || 0) + 1;
  }
  
  const matrix = Object.entries(coverageMatrix).map(([key, count]) => {
    const [scenario, level, register] = key.split('|');
    return { scenario, level, register, count };
  }).sort((a, b) => {
    if (a.scenario !== b.scenario) return a.scenario.localeCompare(b.scenario);
    if (a.level !== b.level) return a.level.localeCompare(b.level);
    return a.register.localeCompare(b.register);
  });
  
  return {
    version: 'v1',
    generatedAt: new Date().toISOString(),
    gitSha: getGitSha(),
    summary: {
      totalPacks: allPacks.length,
      byScenario,
      byLevel,
      byRegister,
      byPrimaryStructure,
      variationSlotsDistribution: variationSlotsCount,
      topAnchorPhrases
    },
    coverageMatrix: matrix,
    packs: allPacks.sort((a, b) => {
      if (a.workspace !== b.workspace) return a.workspace.localeCompare(b.workspace);
      if (a.scenario !== b.scenario) return a.scenario.localeCompare(b.scenario);
      if (a.level !== b.level) return a.level.localeCompare(b.level);
      return a.packId.localeCompare(b.packId);
    }),
    warnings: {
      missingOptionalTags: missingTags
    }
  };
}

/**
 * Generate CSV export
 */
function generateCsv(analytics: CatalogAnalytics): string {
  const rows: string[] = [];
  
  // Header
  rows.push([
    'workspace',
    'packId',
    'title',
    'level',
    'scenario',
    'register',
    'primaryStructure',
    'variationSlots',
    'targetResponseSeconds',
    'minDistinctSubjects',
    'minDistinctVerbs',
    'minMultiSlotRate',
    'canonicalIntents',
    'anchorPhrases',
    'promptCount',
    'stepCount',
    'estimatedMinutes',
    'multiSlotRate',
    'scenarioTokenHitAvg',
    'scenarioTokenQualifiedRate',
    'uniqueTokenRate',
    'bannedPhraseViolations',
    'passesQualityGates',
    'reviewStatus'
  ].join(','));
  
  // Data rows
  for (const pack of analytics.packs) {
    const escape = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    rows.push([
      escape(pack.workspace),
      escape(pack.packId),
      escape(pack.title),
      escape(pack.level),
      escape(pack.scenario),
      escape(pack.register),
      escape(pack.primaryStructure),
      escape(pack.variationSlots.join('|')),
      escape(pack.targetResponseSeconds),
      escape(pack.minDistinctSubjects),
      escape(pack.minDistinctVerbs),
      escape(pack.minMultiSlotRate),
      escape(pack.canonicalIntents?.join('|')),
      escape(pack.anchorPhrases?.join('|')),
      escape(pack.promptCount),
      escape(pack.stepCount),
      escape(pack.estimatedMinutes),
      escape(pack.multiSlotRate),
      escape(pack.scenarioTokenHitAvg),
      escape(pack.scenarioTokenQualifiedRate),
      escape(pack.uniqueTokenRate),
      escape(pack.bannedPhraseViolations),
      escape(pack.passesQualityGates),
      escape(pack.reviewStatus)
    ].join(','));
  }
  
  return rows.join('\n');
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let targetWorkspace: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--workspace' || args[i] === '-w') && i + 1 < args.length) {
      targetWorkspace = args[i + 1];
      break;
    }
  }
  
  console.log('📊 Generating catalog analytics export...\n');
  
  const analytics = generateCatalogAnalytics(targetWorkspace);
  
  // Ensure exports directory exists
  if (!existsSync(EXPORTS_DIR)) {
    require('fs').mkdirSync(EXPORTS_DIR, { recursive: true });
  }
  
  // Write JSON
  const jsonPath = join(EXPORTS_DIR, 'catalog-analytics.v1.json');
  writeFileSync(jsonPath, JSON.stringify(analytics, null, 2), 'utf-8');
  console.log(`✅ Generated: ${jsonPath}`);
  
  // Write CSV
  const csvPath = join(EXPORTS_DIR, 'catalog-analytics.v1.csv');
  writeFileSync(csvPath, generateCsv(analytics), 'utf-8');
  console.log(`✅ Generated: ${csvPath}`);
  
  // Print summary
  console.log(`\n📈 Summary:`);
  console.log(`   Total packs: ${analytics.summary.totalPacks}`);
  console.log(`   Scenarios: ${Object.keys(analytics.summary.byScenario).length}`);
  console.log(`   Primary structures: ${Object.keys(analytics.summary.byPrimaryStructure).length}`);
  console.log(`   Missing optional tags: ${analytics.warnings.missingOptionalTags.length}`);
  
  if (analytics.warnings.missingOptionalTags.length > 0) {
    console.log(`\n⚠️  Packs missing optional tags (first 10):`);
    for (const packId of analytics.warnings.missingOptionalTags.slice(0, 10)) {
      console.log(`   - ${packId}`);
    }
  }
  
  console.log('\n✅ Catalog analytics export complete!');
}

main();

