#!/usr/bin/env tsx

/**
 * Backfill Catalog-Level Analytics
 * 
 * Adds required catalog-level analytics to existing Pack and Drill entries.
 * All metrics are computed deterministically from existing pack data.
 * 
 * Usage:
 *   tsx scripts/backfill-catalog-analytics.ts --workspace de
 *   tsx scripts/backfill-catalog-analytics.ts --workspace de --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computePackCatalogAnalytics, computeDrillCatalogAnalytics } from './content-quality/computeCatalogAnalytics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface PackEntry {
  id: string;
  kind: string;
  scenario?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  prompts?: Array<{
    id: string;
    text: string;
    slotsChanged?: string[];
    slots?: Record<string, string[]>;
  }>;
  analytics?: any;
}

interface DrillEntry {
  id: string;
  kind: string;
  level?: string;
  exercises?: Array<{
    id: string;
    prompt?: string;
    text?: string;
  }>;
  analytics?: any;
}

function parseArgs(): { workspace: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let workspace = '';
  let dryRun = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  
  if (!workspace) {
    console.error('Error: --workspace is required');
    console.error('Usage: tsx scripts/backfill-catalog-analytics.ts --workspace <workspace> [--dry-run]');
    process.exit(1);
  }
  
  return { workspace, dryRun };
}

function findPackFiles(workspace: string): string[] {
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  if (!existsSync(packsDir)) {
    return [];
  }
  
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  const packFiles: string[] = [];
  for (const packDir of packDirs) {
    const packFile = join(packsDir, packDir, 'pack.json');
    if (existsSync(packFile)) {
      packFiles.push(packFile);
    }
  }
  
  return packFiles;
}

function findDrillFiles(workspace: string): string[] {
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspace, 'drills');
  if (!existsSync(drillsDir)) {
    return [];
  }
  
  const drillDirs = readdirSync(drillsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  const drillFiles: string[] = [];
  for (const drillDir of drillDirs) {
    const drillFile = join(drillsDir, drillDir, 'drill.json');
    if (existsSync(drillFile)) {
      drillFiles.push(drillFile);
    }
  }
  
  return drillFiles;
}

function generateIntendedOutcome(
  kind: string,
  scenario?: string,
  level?: string,
  primaryStructure?: string
): string {
  if (kind === 'drill') {
    return `TODO: Replace with human-written ${level || 'A1'} drill outcome`;
  }
  
  const scenarioNames: Record<string, string> = {
    work: 'work',
    government_office: 'government office',
    restaurant: 'restaurant',
    shopping: 'shopping',
    doctor: 'doctor',
    housing: 'housing'
  };
  
  const scenarioName = scenario ? (scenarioNames[scenario] || scenario) : 'language';
  return `TODO: Replace with human-written ${level || 'A1'} ${scenarioName} readiness`;
}

function backfillPackAnalytics(packFile: string, dryRun: boolean): boolean {
  try {
    const content = readFileSync(packFile, 'utf-8');
    const pack: PackEntry = JSON.parse(content);
    
    // Check if catalog-level analytics already exist
    if (pack.analytics?.primaryStructure && 
        pack.analytics?.variationSlots && 
        typeof pack.analytics?.slotSwitchDensity === 'number' &&
        typeof pack.analytics?.promptDiversityScore === 'number' &&
        typeof pack.analytics?.scenarioCoverageScore === 'number' &&
        pack.analytics?.estimatedCognitiveLoad &&
        pack.analytics?.intendedOutcome) {
      console.log(`   ⏭️  Already has catalog analytics: ${pack.id}`);
      return false;
    }
    
    // Compute catalog analytics
    const catalogAnalytics = computePackCatalogAnalytics(pack);
    
    // Generate intendedOutcome (with TODO marker)
    const intendedOutcome = generateIntendedOutcome(
      pack.kind,
      pack.scenario,
      (pack as any).level,
      pack.primaryStructure
    );
    
    // Merge with existing analytics
    const updatedAnalytics = {
      ...pack.analytics,
      ...catalogAnalytics,
      intendedOutcome
    };
    
    if (dryRun) {
      console.log(`   📝 Would update: ${pack.id}`);
      console.log(`      Analytics:`, JSON.stringify(updatedAnalytics, null, 2));
      return true;
    }
    
    // Write updated pack
    const updatedPack = {
      ...pack,
      analytics: updatedAnalytics
    };
    
    writeFileSync(packFile, JSON.stringify(updatedPack, null, 2) + '\n', 'utf-8');
    console.log(`   ✅ Updated: ${pack.id}`);
    return true;
  } catch (err: any) {
    console.error(`   ❌ Error processing ${packFile}: ${err.message}`);
    return false;
  }
}

function backfillDrillAnalytics(drillFile: string, dryRun: boolean): boolean {
  try {
    const content = readFileSync(drillFile, 'utf-8');
    const drill: DrillEntry = JSON.parse(content);
    
    // Check if catalog-level analytics already exist
    if (drill.analytics?.primaryStructure && 
        drill.analytics?.variationSlots && 
        typeof drill.analytics?.slotSwitchDensity === 'number' &&
        typeof drill.analytics?.promptDiversityScore === 'number' &&
        typeof drill.analytics?.scenarioCoverageScore === 'number' &&
        drill.analytics?.estimatedCognitiveLoad &&
        drill.analytics?.intendedOutcome) {
      console.log(`   ⏭️  Already has catalog analytics: ${drill.id}`);
      return false;
    }
    
    // Compute catalog analytics
    const catalogAnalytics = computeDrillCatalogAnalytics(drill);
    
    // Generate intendedOutcome (with TODO marker)
    const intendedOutcome = generateIntendedOutcome(
      drill.kind,
      undefined,
      drill.level,
      undefined
    );
    
    // Merge with existing analytics
    const updatedAnalytics = {
      ...drill.analytics,
      ...catalogAnalytics,
      intendedOutcome
    };
    
    if (dryRun) {
      console.log(`   📝 Would update: ${drill.id}`);
      console.log(`      Analytics:`, JSON.stringify(updatedAnalytics, null, 2));
      return true;
    }
    
    // Write updated drill
    const updatedDrill = {
      ...drill,
      analytics: updatedAnalytics
    };
    
    writeFileSync(drillFile, JSON.stringify(updatedDrill, null, 2) + '\n', 'utf-8');
    console.log(`   ✅ Updated: ${drill.id}`);
    return true;
  } catch (err: any) {
    console.error(`   ❌ Error processing ${drillFile}: ${err.message}`);
    return false;
  }
}

function main() {
  const { workspace, dryRun } = parseArgs();
  
  console.log(`\n${dryRun ? '🔍 DRY RUN' : '🚀 BACKFILLING'} Catalog-Level Analytics`);
  console.log(`Workspace: ${workspace}\n`);
  
  const packFiles = findPackFiles(workspace);
  const drillFiles = findDrillFiles(workspace);
  
  console.log(`Found ${packFiles.length} pack(s) and ${drillFiles.length} drill(s)\n`);
  
  let updatedPacks = 0;
  let updatedDrills = 0;
  
  // Process packs
  if (packFiles.length > 0) {
    console.log('📦 Processing packs...');
    for (const packFile of packFiles) {
      if (backfillPackAnalytics(packFile, dryRun)) {
        updatedPacks++;
      }
    }
    console.log('');
  }
  
  // Process drills
  if (drillFiles.length > 0) {
    console.log('🔧 Processing drills...');
    for (const drillFile of drillFiles) {
      if (backfillDrillAnalytics(drillFile, dryRun)) {
        updatedDrills++;
      }
    }
    console.log('');
  }
  
  console.log(`\n✅ Summary:`);
  console.log(`   Updated packs: ${updatedPacks}`);
  console.log(`   Updated drills: ${updatedDrills}`);
  console.log(`   Total: ${updatedPacks + updatedDrills}`);
  
  if (dryRun) {
    console.log(`\n⚠️  This was a dry run. Use without --dry-run to apply changes.`);
  } else {
    console.log(`\n⚠️  Next steps:`);
    console.log(`   1. Review intendedOutcome fields (replace TODO markers)`);
    console.log(`   2. Run: npm run content:validate`);
    console.log(`   3. Commit changes`);
  }
}

main();

