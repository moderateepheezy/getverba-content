#!/usr/bin/env tsx

/**
 * Deterministic Section Index Generation
 * 
 * Generates paginated section indexes from canonical entry documents on disk.
 * Replaces manual index editing with automated generation.
 * 
 * Usage:
 *   npm run content:generate-indexes [--workspace <ws>]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

// Section configuration: sectionId -> kind -> content folder
const SECTION_CONFIG: Record<string, { kind: string; folders: string[] }> = {
  context: {
    kind: 'context',
    folders: ['packs']
  },
  mechanics: {
    kind: 'drills',
    folders: ['drills']
  },
  exams: {
    kind: 'exams',
    folders: ['exams']
  }
};

interface SectionIndexItem {
  id: string;
  kind: string;
  title: string;
  level: string;
  durationMinutes: number;
  entryUrl: string;
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
  title: string;
  level: string;
  estimatedMinutes?: number;
}

/**
 * Level comparison for deterministic sorting
 * A1 < A2 < B1 < B2 < C1 < C2
 */
function compareLevels(a: string, b: string): number {
  const levelOrder: Record<string, number> = {
    'A1': 1,
    'A2': 2,
    'B1': 3,
    'B2': 4,
    'C1': 5,
    'C2': 6
  };
  
  const aOrder = levelOrder[a.toUpperCase()] || 999;
  const bOrder = levelOrder[b.toUpperCase()] || 999;
  
  return aOrder - bOrder;
}

/**
 * Deterministic sort: level (primary), title (secondary), id (tertiary)
 */
function sortItems(items: SectionIndexItem[]): SectionIndexItem[] {
  return [...items].sort((a, b) => {
    // Primary: level
    const levelCmp = compareLevels(a.level, b.level);
    if (levelCmp !== 0) return levelCmp;
    
    // Secondary: title (localeCompare for stable sort)
    const titleCmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (titleCmp !== 0) return titleCmp;
    
    // Tertiary: id (stable tie-break)
    return a.id.localeCompare(b.id);
  });
}

/**
 * Read entry document and extract index item data
 */
function readEntryDocument(
  entryPath: string,
  workspaceId: string,
  entryType: 'pack' | 'drill' | 'exam'
): SectionIndexItem | null {
  try {
    const content = readFileSync(entryPath, 'utf-8');
    const entry: EntryDocument = JSON.parse(content);
    
    // Validate required fields
    if (!entry.id || !entry.kind || !entry.title || !entry.level) {
      console.warn(`⚠️  Skipping ${entryPath}: missing required fields`);
      return null;
    }
    
    // Determine entry URL pattern
    let entryUrl: string;
    if (entryType === 'pack') {
      entryUrl = `/v1/workspaces/${workspaceId}/packs/${entry.id}/pack.json`;
    } else if (entryType === 'exam') {
      entryUrl = `/v1/workspaces/${workspaceId}/exams/${entry.id}/exam.json`;
    } else {
      entryUrl = `/v1/workspaces/${workspaceId}/drills/${entry.id}/drill.json`;
    }
    
    // Extract durationMinutes from estimatedMinutes
    const durationMinutes = entry.estimatedMinutes || 15; // fallback
    
    return {
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      level: entry.level,
      durationMinutes,
      entryUrl
    };
  } catch (error: any) {
    console.warn(`⚠️  Failed to read ${entryPath}: ${error.message}`);
    return null;
  }
}

/**
 * Scan directory for entry files
 */
function scanEntryDirectory(
  dirPath: string,
  entryType: 'pack' | 'drill' | 'exam',
  workspaceId: string
): SectionIndexItem[] {
  const items: SectionIndexItem[] = [];
  
  if (!existsSync(dirPath)) {
    return items;
  }
  
  const entries = readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const entryFileName = entryType === 'pack' ? 'pack.json' : 
                         entryType === 'exam' ? 'exam.json' : 'drill.json';
    const entryPath = join(dirPath, entry.name, entryFileName);
    
    if (existsSync(entryPath)) {
      const item = readEntryDocument(entryPath, workspaceId, entryType);
      if (item) {
        items.push(item);
      }
    }
  }
  
  return items;
}

/**
 * Read existing index to get pageSize (if present)
 */
function getPageSizeFromExistingIndex(indexPath: string): number | null {
  if (!existsSync(indexPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index: SectionIndex = JSON.parse(content);
    return index.pageSize || null;
  } catch {
    return null;
  }
}

/**
 * Generate paginated index files
 */
function generateIndex(
  workspaceId: string,
  sectionId: string,
  config: { kind: string; folders: string[] },
  defaultPageSize: number = 20
): void {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  const sectionDir = join(workspaceDir, sectionId);
  
  // Check if section directory exists
  if (!existsSync(sectionDir)) {
    console.log(`⏭️  Skipping ${workspaceId}/${sectionId}: section directory not found`);
    return;
  }
  
  // Get pageSize from existing index if present
  const existingIndexPath = join(sectionDir, 'index.json');
  const pageSize = getPageSizeFromExistingIndex(existingIndexPath) || defaultPageSize;
  
  // Collect all items from configured folders
  const allItems: SectionIndexItem[] = [];
  
  for (const folder of config.folders) {
    const folderPath = join(workspaceDir, folder);
    let entryType: 'pack' | 'drill' | 'exam';
    
    if (folder === 'packs') {
      entryType = 'pack';
    } else if (folder === 'exams') {
      entryType = 'exam';
    } else {
      entryType = 'drill';
    }
    
    const items = scanEntryDirectory(folderPath, entryType, workspaceId);
    allItems.push(...items);
  }
  
  if (allItems.length === 0) {
    console.log(`⏭️  Skipping ${workspaceId}/${sectionId}: no entries found`);
    return;
  }
  
  // Sort deterministically
  const sortedItems = sortItems(allItems);
  
  // Paginate
  const total = sortedItems.length;
  const pages: SectionIndexItem[][] = [];
  
  for (let i = 0; i < sortedItems.length; i += pageSize) {
    pages.push(sortedItems.slice(i, i + pageSize));
  }
  
  // Remove old pagination files (index.page2.json, index.page3.json, etc.)
  if (existsSync(sectionDir)) {
    const files = readdirSync(sectionDir);
    for (const file of files) {
      if (file.match(/^index\.page\d+\.json$/)) {
        const filePath = join(sectionDir, file);
        rmSync(filePath);
      }
    }
  }
  
  // Write paginated index files
  for (let pageNum = 0; pageNum < pages.length; pageNum++) {
    const pageItems = pages[pageNum];
    const isLastPage = pageNum === pages.length - 1;
    
    const index: SectionIndex = {
      version: 'v1',
      kind: config.kind,
      total,
      pageSize,
      items: pageItems,
      nextPage: isLastPage ? null : `/v1/workspaces/${workspaceId}/${sectionId}/index.page${pageNum + 2}.json`
    };
    
    let fileName: string;
    if (pageNum === 0) {
      fileName = 'index.json';
    } else {
      fileName = `index.page${pageNum + 1}.json`;
    }
    
    const filePath = join(sectionDir, fileName);
    const jsonContent = JSON.stringify(index, null, 2);
    
    writeFileSync(filePath, jsonContent + '\n', 'utf-8');
    
    console.log(`✅ Generated ${workspaceId}/${sectionId}/${fileName} (${pageItems.length} items)`);
  }
  
  console.log(`   Total: ${total} items across ${pages.length} page(s)`);
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
  
  console.log(`📦 Generating indexes for ${workspaces.length} workspace(s)...\n`);
  
  // Generate indexes for each workspace and section
  for (const workspaceId of workspaces) {
    const workspacePath = join(workspacesDir, workspaceId);
    
    if (!existsSync(workspacePath)) {
      console.warn(`⚠️  Workspace ${workspaceId} not found, skipping`);
      continue;
    }
    
    console.log(`\n📁 Workspace: ${workspaceId}`);
    
    for (const [sectionId, config] of Object.entries(SECTION_CONFIG)) {
      generateIndex(workspaceId, sectionId, config);
    }
  }
  
  console.log('\n✅ Index generation complete!');
}

// Run if executed directly
main();

export { generateIndex, sortItems, compareLevels };

