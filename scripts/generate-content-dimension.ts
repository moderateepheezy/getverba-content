#!/usr/bin/env tsx

/**
 * Content Dimension Generator
 * 
 * Generates a lookup table of all content items (packs/exams/drills) for telemetry validation.
 * This table is used to validate that events reference valid content IDs.
 * 
 * Usage:
 *   npm run telemetry:dimension -- --workspace de
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const EXPORTS_DIR = join(__dirname, '..', 'exports', 'analytics');

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
  title: string;
  level: string;
  durationMinutes?: number;
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  analyticsSummary?: {
    primaryStructure: string;
    variationSlots: string[];
    drillType: string;
    cognitiveLoad: string;
    goal: string;
    whyThisWorks: string[];
  };
}

interface PackEntry {
  id: string;
  kind: string;
  title: string;
  level: string;
  estimatedMinutes: number;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  prompts?: Array<{ id: string }>;
  sessionPlan?: {
    steps: Array<{ id: string; promptIds: string[] }>;
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
  }>;
}

interface ContentDimensionRow {
  workspace: string;
  kind: string;
  contentId: string;
  entryUrl: string;
  title: string;
  level: string;
  scenario: string | null;
  register: string | null;
  primaryStructure: string | null;
  variationSlots: string[] | null;
  promptCount: number;
  stepCount: number;
  estimatedMinutes: number;
}

/**
 * Get git SHA for versioning
 */
function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Load all items from pagination chain
 */
function loadAllItemsFromSection(firstPageUrl: string): SectionIndexItem[] {
  const allItems: SectionIndexItem[] = [];
  let currentUrl: string | null = firstPageUrl;
  const visitedPages = new Set<string>();
  
  while (currentUrl) {
    if (visitedPages.has(currentUrl)) {
      throw new Error(`Circular reference detected at ${currentUrl}`);
    }
    visitedPages.add(currentUrl);
    
    const relativePath = currentUrl.replace(/^\/v1\//, '');
    const indexPath = join(CONTENT_DIR, relativePath);
    
    if (!existsSync(indexPath)) {
      throw new Error(`Index file not found: ${indexPath}`);
    }
    
    const content = readFileSync(indexPath, 'utf-8');
    const index: SectionIndex = JSON.parse(content);
    
    allItems.push(...index.items);
    currentUrl = index.nextPage || null;
  }
  
  return allItems;
}

/**
 * Load entry document
 */
function loadEntry(entryUrl: string): PackEntry | null {
  const relativePath = entryUrl.replace(/^\/v1\//, '');
  const entryPath = join(CONTENT_DIR, relativePath);
  
  if (!existsSync(entryPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(entryPath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    console.warn(`⚠️  Failed to load entry ${entryUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Generate content dimension for a workspace
 */
function generateContentDimension(workspace: string): ContentDimensionRow[] {
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  
  if (!existsSync(catalogPath)) {
    throw new Error(`Catalog not found: ${catalogPath}`);
  }
  
  const catalog: Catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  const dimension: ContentDimensionRow[] = [];
  
  // Process each section
  for (const section of catalog.sections) {
    if (!section.itemsUrl) {
      continue;
    }
    
    // Load all items from pagination chain
    const items = loadAllItemsFromSection(section.itemsUrl);
    
    // Process each item
    for (const item of items) {
      // Load entry document to get full metadata
      const entry = loadEntry(item.entryUrl);
      
      if (!entry) {
        console.warn(`⚠️  Skipping ${item.id}: entry not found at ${item.entryUrl}`);
        continue;
      }
      
      // Build dimension row
      const row: ContentDimensionRow = {
        workspace,
        kind: item.kind || entry.kind,
        contentId: item.id,
        entryUrl: item.entryUrl,
        title: item.title || entry.title,
        level: item.level || entry.level,
        scenario: item.scenario || entry.scenario || null,
        register: item.register || entry.register || null,
        primaryStructure: item.primaryStructure || entry.primaryStructure || item.analyticsSummary?.primaryStructure || null,
        variationSlots: item.variationSlots || entry.variationSlots || item.analyticsSummary?.variationSlots || null,
        promptCount: entry.prompts?.length || 0,
        stepCount: entry.sessionPlan?.steps?.length || 0,
        estimatedMinutes: entry.estimatedMinutes || item.durationMinutes || 15
      };
      
      dimension.push(row);
    }
  }
  
  // Sort by workspace, kind, contentId for deterministic output
  dimension.sort((a, b) => {
    if (a.workspace !== b.workspace) return a.workspace.localeCompare(b.workspace);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.contentId.localeCompare(b.contentId);
  });
  
  return dimension;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf('--workspace');
  const workspace = workspaceIndex >= 0 && args[workspaceIndex + 1] 
    ? args[workspaceIndex + 1] 
    : null;
  
  if (!workspace) {
    console.error('❌ Error: --workspace argument required');
    console.error('Usage: npm run telemetry:dimension -- --workspace de');
    process.exit(1);
  }
  
  console.log(`📊 Generating content dimension for workspace: ${workspace}`);
  
  try {
    const dimension = generateContentDimension(workspace);
    const gitSha = getGitSha();
    
    // Ensure exports directory exists
    if (!existsSync(EXPORTS_DIR)) {
      require('fs').mkdirSync(EXPORTS_DIR, { recursive: true });
    }
    
    const outputPath = join(EXPORTS_DIR, `content-dimension.${gitSha}.json`);
    
    const output = {
      version: 'v1',
      generatedAt: new Date().toISOString(),
      gitSha,
      workspace,
      totalItems: dimension.length,
      items: dimension
    };
    
    writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    
    console.log(`✅ Generated content dimension: ${outputPath}`);
    console.log(`   Total items: ${dimension.length}`);
    console.log(`   Git SHA: ${gitSha}`);
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

