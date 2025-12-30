#!/usr/bin/env tsx

/**
 * Curriculum Export Generator
 * 
 * Generates export artifacts (JSON + CSV) from content catalog and section indexes.
 * Follows pagination chains to collect all items.
 * 
 * Usage:
 *   npm run content:generate-exports [--workspace <ws>]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
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
  title: string;
  level: string;
  durationMinutes: number;
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  tags?: string[];
  drillType?: string;
  cognitiveLoad?: string;
  whyThisWorks?: string;
}

interface EntryDocument {
  id: string;
  kind: string;
  title: string;
  level: string;
  estimatedMinutes?: number;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  analytics?: {
    goal: string;
    successCriteria: string[];
    drillType: string;
    cognitiveLoad: string;
  };
  sessionPlan?: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
  outline?: string[];
}

interface ExportRow {
  workspace: string;
  sectionId: string;
  packId: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  level: string;
  estimatedMinutes: number;
  variationSlots: string;
  drillType: string;
  cognitiveLoad: string;
  goal: string;
  whyThisWorks: string;
  page: number;
  position: number;
}

/**
 * Follow pagination chain and collect all items
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
 * Load entry document from entryUrl
 */
function loadEntryDocument(entryUrl: string): EntryDocument | null {
  try {
    const relativePath = entryUrl.replace(/^\/v1\//, '');
    const entryPath = join(CONTENT_DIR, relativePath);
    
    if (!existsSync(entryPath)) {
      console.warn(`⚠️  Entry file not found: ${entryPath}`);
      return null;
    }
    
    const content = readFileSync(entryPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    console.warn(`⚠️  Failed to read entry ${entryUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Generate whyThisWorks summary from analytics
 */
function generateWhyThisWorks(entry: EntryDocument, indexItem: SectionIndexItem): string {
  // Prefer index item's whyThisWorks if available
  if (indexItem.whyThisWorks) {
    return indexItem.whyThisWorks;
  }
  
  // Fallback: generate from analytics
  if (entry.analytics) {
    const goal = entry.analytics.goal || '';
    const firstCriterion = Array.isArray(entry.analytics.successCriteria) && entry.analytics.successCriteria.length > 0
      ? entry.analytics.successCriteria[0]
      : '';
    
    if (goal && firstCriterion) {
      return `${goal} ${firstCriterion}`;
    } else if (goal) {
      return goal;
    }
  }
  
  return '';
}

/**
 * Determine page and position from pagination chain
 */
function getPageAndPosition(
  workspaceId: string,
  sectionId: string,
  itemId: string,
  firstPageUrl: string
): { page: number; position: number } {
  let currentUrl: string | null = firstPageUrl;
  let page = 1;
  let position = 0;
  
  while (currentUrl) {
    const relativePath = currentUrl.replace(/^\/v1\//, '');
    const indexPath = join(CONTENT_DIR, relativePath);
    
    if (!existsSync(indexPath)) {
      break;
    }
    
    try {
      const content = readFileSync(indexPath, 'utf-8');
      const index: SectionIndex = JSON.parse(content);
      
      // Check if item is in this page
      const itemIndex = index.items.findIndex(item => item.id === itemId);
      if (itemIndex >= 0) {
        position = itemIndex + 1;
        return { page, position };
      }
      
      // Move to next page
      position += index.items.length;
      currentUrl = index.nextPage || null;
      page++;
    } catch {
      break;
    }
  }
  
  return { page: 1, position: 0 };
}

/**
 * Generate exports for a workspace
 */
function generateExports(workspaceId: string): void {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  const catalogPath = join(workspaceDir, 'catalog.json');
  
  if (!existsSync(catalogPath)) {
    console.error(`❌ Catalog not found: ${catalogPath}`);
    return;
  }
  
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  const sections = catalog.sections || [];
  
  const exportRows: ExportRow[] = [];
  
  // Process each section
  for (const section of sections) {
    const sectionId = section.id;
    const itemsUrl = section.itemsUrl;
    
    if (!itemsUrl) {
      console.warn(`⚠️  Section ${sectionId} has no itemsUrl, skipping`);
      continue;
    }
    
    // Load all items from pagination chain
    const allItems = loadAllItemsFromSection(workspaceId, sectionId, itemsUrl);
    
    console.log(`📦 Section ${sectionId}: ${allItems.length} item(s)`);
    
    // Process each item
    for (const indexItem of allItems) {
      const entry = loadEntryDocument(indexItem.entryUrl);
      
      if (!entry) {
        console.warn(`⚠️  Skipping ${indexItem.id}: entry not found`);
        continue;
      }
      
      // Get page and position
      const { page, position } = getPageAndPosition(workspaceId, sectionId, indexItem.id, itemsUrl);
      
      // Generate export row
      const row: ExportRow = {
        workspace: workspaceId,
        sectionId: sectionId,
        packId: entry.id,
        scenario: entry.scenario || indexItem.scenario || '',
        register: entry.register || indexItem.register || '',
        primaryStructure: entry.primaryStructure || indexItem.primaryStructure || '',
        level: entry.level || indexItem.level || '',
        estimatedMinutes: entry.estimatedMinutes || indexItem.durationMinutes || 15,
        variationSlots: Array.isArray(entry.variationSlots) ? entry.variationSlots.join('; ') : '',
        drillType: entry.analytics?.drillType || indexItem.drillType || '',
        cognitiveLoad: entry.analytics?.cognitiveLoad || indexItem.cognitiveLoad || '',
        goal: entry.analytics?.goal || '',
        whyThisWorks: generateWhyThisWorks(entry, indexItem),
        page: page,
        position: position
      };
      
      exportRows.push(row);
    }
  }
  
  // Sort by section, then page, then position
  exportRows.sort((a, b) => {
    const sectionCmp = a.sectionId.localeCompare(b.sectionId);
    if (sectionCmp !== 0) return sectionCmp;
    
    const pageCmp = a.page - b.page;
    if (pageCmp !== 0) return pageCmp;
    
    return a.position - b.position;
  });
  
  // Create exports directory
  const exportsDir = join(workspaceDir, 'exports');
  if (!existsSync(exportsDir)) {
    mkdirSync(exportsDir, { recursive: true });
  }
  
  // Generate JSON export
  const jsonPath = join(exportsDir, 'catalog_export.json');
  const jsonExport = {
    version: 'v1',
    generatedAt: new Date().toISOString(),
    workspace: workspaceId,
    total: exportRows.length,
    items: exportRows
  };
  
  writeFileSync(jsonPath, JSON.stringify(jsonExport, null, 2) + '\n', 'utf-8');
  console.log(`✅ Generated JSON export: ${jsonPath} (${exportRows.length} rows)`);
  
  // Generate CSV export
  const csvPath = join(exportsDir, 'catalog_export.csv');
  const headers = [
    'workspace',
    'sectionId',
    'packId',
    'scenario',
    'register',
    'primaryStructure',
    'level',
    'estimatedMinutes',
    'variationSlots',
    'drillType',
    'cognitiveLoad',
    'goal',
    'whyThisWorks',
    'page',
    'position'
  ];
  
  const csvRows = [
    headers.join(','),
    ...exportRows.map(row => {
      return [
        row.workspace,
        row.sectionId,
        row.packId,
        escapeCsvField(row.scenario),
        escapeCsvField(row.register),
        escapeCsvField(row.primaryStructure),
        row.level,
        row.estimatedMinutes.toString(),
        escapeCsvField(row.variationSlots),
        escapeCsvField(row.drillType),
        escapeCsvField(row.cognitiveLoad),
        escapeCsvField(row.goal),
        escapeCsvField(row.whyThisWorks),
        row.page.toString(),
        row.position.toString()
      ].join(',');
    })
  ];
  
  writeFileSync(csvPath, csvRows.join('\n') + '\n', 'utf-8');
  console.log(`✅ Generated CSV export: ${csvPath} (${exportRows.length} rows)`);
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCsvField(field: string): string {
  if (!field) return '';
  
  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  
  return field;
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
  
  console.log(`📦 Generating exports for ${workspaces.length} workspace(s)...\n`);
  
  // Generate exports for each workspace
  for (const workspaceId of workspaces) {
    const workspacePath = join(workspacesDir, workspaceId);
    
    if (!existsSync(workspacePath)) {
      console.warn(`⚠️  Workspace ${workspaceId} not found, skipping`);
      continue;
    }
    
    console.log(`\n📁 Workspace: ${workspaceId}`);
    generateExports(workspaceId);
  }
  
  console.log('\n✅ Export generation complete!');
}

// Run if executed directly
main();

