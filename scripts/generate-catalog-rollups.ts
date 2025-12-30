#!/usr/bin/env tsx

/**
 * Catalog Rollup Generator
 * 
 * Generates analytics rollups for catalog sections based on section index chains.
 * 
 * Usage:
 *   npm run content:generate-catalog-rollups [--workspace <ws>]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface SectionIndex {
  version: string;
  kind: string;
  total: number;
  pageSize: number;
  items: SectionIndexItem[];
  nextPage: string | null;
}

interface SectionIndexItem {
  id: string;
  kind: string;
  level: string;
  scenario?: string;
  primaryStructure?: string;
  analyticsSummary?: {
    primaryStructure: string;
    variationSlots: string[];
    drillType: string;
    cognitiveLoad: string;
    goal: string;
    whyThisWorks: string[];
  };
}

interface Catalog {
  version: string;
  schemaVersion: number;
  workspace: string;
  languageCode: string;
  languageName: string;
  sections: Array<{
    id: string;
    kind: string;
    title: string;
    itemsUrl: string;
    analyticsRollup?: {
      scenarios: Record<string, number>;
      levels: Record<string, number>;
      primaryStructures: Record<string, number>;
    };
  }>;
}

interface AnalyticsRollup {
  scenarios: Record<string, number>;
  levels: Record<string, number>;
  primaryStructures: Record<string, number>;
}

/**
 * Load all items from pagination chain
 */
function loadAllItemsFromSection(
  workspaceId: string,
  sectionId: string,
  firstPageUrl: string
): SectionIndexItem[] {
  const allItems: SectionIndexItem[] = [];
  let currentUrl: string | null = firstPageUrl;
  const visitedPages = new Set<string>();
  
  while (currentUrl) {
    // Loop detection
    if (visitedPages.has(currentUrl)) {
      console.warn(`⚠️  Circular reference detected in ${workspaceId}/${sectionId} at ${currentUrl}`);
      break;
    }
    visitedPages.add(currentUrl);
    
    // Resolve path
    const relativePath = currentUrl.replace(/^\/v1\//, '');
    const indexPath = join(CONTENT_DIR, relativePath);
    
    if (!existsSync(indexPath)) {
      console.warn(`⚠️  Index file not found: ${indexPath}`);
      break;
    }
    
    try {
      const content = readFileSync(indexPath, 'utf-8');
      const index: SectionIndex = JSON.parse(content);
      
      // Add items from this page
      allItems.push(...index.items);
      
      // Move to next page
      currentUrl = index.nextPage || null;
    } catch (error: any) {
      console.warn(`⚠️  Failed to read ${indexPath}: ${error.message}`);
      break;
    }
  }
  
  return allItems;
}

/**
 * Compute analytics rollup for a section
 */
function computeRollup(items: SectionIndexItem[]): AnalyticsRollup {
  const scenarios: Record<string, number> = {};
  const levels: Record<string, number> = {};
  const primaryStructures: Record<string, number> = {};
  
  for (const item of items) {
    // Count levels
    if (item.level) {
      levels[item.level] = (levels[item.level] || 0) + 1;
    }
    
    // Count scenarios (from item.scenario or analyticsSummary)
    const scenario = item.scenario || (item.analyticsSummary ? 'unknown' : null);
    if (scenario) {
      scenarios[scenario] = (scenarios[scenario] || 0) + 1;
    }
    
    // Count primaryStructures (from item.primaryStructure or analyticsSummary)
    const primaryStructure = item.primaryStructure || item.analyticsSummary?.primaryStructure;
    if (primaryStructure) {
      primaryStructures[primaryStructure] = (primaryStructures[primaryStructure] || 0) + 1;
    }
  }
  
  return {
    scenarios,
    levels,
    primaryStructures
  };
}

/**
 * Generate rollups for a workspace
 */
function generateRollups(workspaceId: string): void {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  const catalogPath = join(workspaceDir, 'catalog.json');
  
  if (!existsSync(catalogPath)) {
    console.error(`❌ Catalog not found: ${catalogPath}`);
    return;
  }
  
  const catalog: Catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  const sections = catalog.sections || [];
  
  // Compute rollups for each section
  for (const section of sections) {
    const sectionId = section.id;
    const itemsUrl = section.itemsUrl;
    
    if (!itemsUrl) {
      console.warn(`⚠️  Section ${sectionId} has no itemsUrl, skipping`);
      continue;
    }
    
    // Load all items from pagination chain
    const allItems = loadAllItemsFromSection(workspaceId, sectionId, itemsUrl);
    
    // Compute rollup
    const rollup = computeRollup(allItems);
    
    // Update section with rollup
    section.analyticsRollup = rollup;
    
    console.log(`✅ Section ${sectionId}: ${allItems.length} items`);
    console.log(`   Scenarios: ${Object.keys(rollup.scenarios).length} unique`);
    console.log(`   Levels: ${Object.keys(rollup.levels).length} unique`);
    console.log(`   Primary Structures: ${Object.keys(rollup.primaryStructures).length} unique`);
  }
  
  // Write updated catalog
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');
  console.log(`\n✅ Updated catalog: ${catalogPath}`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  // Parse workspace argument
  let targetWorkspace: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--workspace' || args[i] === '-w') && i + 1 < args.length) {
      targetWorkspace = args[i + 1];
      break;
    }
  }
  
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  
  if (!existsSync(workspacesDir)) {
    console.error('❌ Error: content/v1/workspaces directory not found');
    process.exit(1);
  }
  
  // Get list of workspaces
  const workspaces = targetWorkspace 
    ? [targetWorkspace]
    : readdirSync(workspacesDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
  
  if (workspaces.length === 0) {
    console.error('❌ Error: No workspaces found');
    process.exit(1);
  }
  
  console.log(`📦 Generating catalog rollups for ${workspaces.length} workspace(s)...\n`);
  
  // Generate rollups for each workspace
  for (const workspaceId of workspaces) {
    const workspacePath = join(workspacesDir, workspaceId);
    
    if (!existsSync(workspacePath)) {
      console.warn(`⚠️  Workspace ${workspaceId} not found, skipping`);
      continue;
    }
    
    console.log(`\n📁 Workspace: ${workspaceId}`);
    generateRollups(workspaceId);
  }
  
  console.log('\n✅ Catalog rollup generation complete!');
}

// Run if executed directly
main();

