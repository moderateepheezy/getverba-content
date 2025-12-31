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

interface AnalyticsSummary {
  primaryStructure: string;
  scenario: string;
  register: string;
  variationSlots: string[];
  targetResponseSeconds?: number;
  drillType: string;
  cognitiveLoad: string;
  goal: string;
  whyThisWorks: string[];
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
  signals?: {
    multiSlot: 'low' | 'med' | 'high';
    difficultyHint: 'foundation' | 'standard' | 'stretch';
  };
  tags?: string[];
  // Telemetry identifiers (required)
  contentId: string;
  revisionId: string;
  // Catalog-level analytics fields (optional, for pack items)
  focus?: string;
  cognitiveLoad?: 'low' | 'medium' | 'high';
  fluencyOutcome?: string;
  // Analytics summary (required for kind="pack")
  analyticsSummary?: AnalyticsSummary;
  // Legacy analytics fields (deprecated, use analyticsSummary)
  drillType?: string;
  whyThisWorks?: string;
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
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  tags?: string[];
  // Telemetry identifiers (required)
  contentId?: string;
  contentHash?: string;
  revisionId?: string;
  analytics?: {
    version?: number;
    goal: string;
    successCriteria: string[];
    drillType: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    targetResponseSeconds?: number;
    primaryStructure?: string;
    scenario?: string;
    register?: string;
    variationSlots?: string[];
    minDistinctSubjects?: number;
    minDistinctVerbs?: number;
    minMultiSlotRate?: number;
    canonicalIntents?: string[];
    anchorPhrases?: string[];
    // Catalog-level analytics (required for generated packs)
    focus?: string;
    responseSpeedTargetMs?: number;
    fluencyOutcome?: string;
    whyThisWorks?: string[];
  };
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
    
    // Validate telemetry identifiers are present
    if (!entry.contentId || typeof entry.contentId !== 'string') {
      console.warn(`⚠️  Entry ${entry.id} missing contentId, cannot generate index item`);
      return null;
    }
    if (!entry.revisionId || typeof entry.revisionId !== 'string') {
      console.warn(`⚠️  Entry ${entry.id} missing revisionId, cannot generate index item`);
      return null;
    }
    
    // Enrich with pack metadata (scenario, register, primaryStructure, tags)
    const item: SectionIndexItem = {
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      level: entry.level,
      durationMinutes,
      entryUrl,
      contentId: entry.contentId,
      revisionId: entry.revisionId
    };
    
    // Add optional metadata fields if present in pack
    if (entry.scenario) {
      item.scenario = entry.scenario;
    }
    if (entry.register) {
      item.register = entry.register;
    }
    if (entry.primaryStructure) {
      item.primaryStructure = entry.primaryStructure;
    }
    if (entry.tags && Array.isArray(entry.tags)) {
      item.tags = entry.tags;
    }
    
    // Add catalog-level analytics fields if present (for pack items)
    if (entryType === 'pack' && entry.analytics && typeof entry.analytics === 'object') {
      if (entry.analytics.focus && typeof entry.analytics.focus === 'string') {
        item.focus = entry.analytics.focus;
      }
      if (entry.analytics.cognitiveLoad && typeof entry.analytics.cognitiveLoad === 'string') {
        item.cognitiveLoad = entry.analytics.cognitiveLoad as 'low' | 'medium' | 'high';
      }
      if (entry.analytics.fluencyOutcome && typeof entry.analytics.fluencyOutcome === 'string') {
        item.fluencyOutcome = entry.analytics.fluencyOutcome;
      }
    }
    
    // Add analytics summary for pack items (required)
    if (entryType === 'pack' && entry.analytics && typeof entry.analytics === 'object') {
      if (!entry.primaryStructure) {
        console.warn(`⚠️  Pack ${entry.id} missing primaryStructure, cannot generate analyticsSummary`);
      } else if (!Array.isArray(entry.variationSlots) || entry.variationSlots.length === 0) {
        console.warn(`⚠️  Pack ${entry.id} missing variationSlots, cannot generate analyticsSummary`);
      } else if (!entry.analytics.drillType || !entry.analytics.cognitiveLoad || !entry.analytics.goal) {
        console.warn(`⚠️  Pack ${entry.id} missing required analytics fields, cannot generate analyticsSummary`);
      } else {
        // Generate whyThisWorks array from successCriteria (2-4 bullets, each <= 80 chars)
        const whyThisWorks: string[] = [];
        if (Array.isArray(entry.analytics.successCriteria)) {
          for (const criterion of entry.analytics.successCriteria) {
            if (typeof criterion === 'string' && criterion.trim().length > 0) {
              const trimmed = criterion.trim();
              // Truncate to 80 chars
              const bullet = trimmed.length > 80 ? trimmed.substring(0, 77) + '...' : trimmed;
              whyThisWorks.push(bullet);
              // Stop at 4 bullets
              if (whyThisWorks.length >= 4) break;
            }
          }
        }
        
        // Ensure we have at least 2 bullets (use goal if needed)
        if (whyThisWorks.length < 2 && entry.analytics.goal) {
          const goalBullet = entry.analytics.goal.length > 80 
            ? entry.analytics.goal.substring(0, 77) + '...' 
            : entry.analytics.goal;
          if (whyThisWorks.length === 0 || whyThisWorks[0] !== goalBullet) {
            whyThisWorks.unshift(goalBullet);
          }
        }
        
        // Ensure goal is <= 120 chars
        const goal = entry.analytics.goal.length > 120
          ? entry.analytics.goal.substring(0, 117) + '...'
          : entry.analytics.goal;
        
        item.analyticsSummary = {
          primaryStructure: entry.primaryStructure,
          scenario: entry.scenario || '',
          register: entry.register || '',
          variationSlots: entry.variationSlots,
          targetResponseSeconds: entry.analytics.targetResponseSeconds,
          drillType: entry.analytics.drillType,
          cognitiveLoad: entry.analytics.cognitiveLoad,
          goal: goal,
          whyThisWorks: whyThisWorks.length >= 2 ? whyThisWorks : [goal, 'See pack entry for details']
        };
        
        // Compute signals from analytics metrics
        if (entry.analytics.multiSlotRate !== undefined && typeof entry.analytics.multiSlotRate === 'number') {
          const multiSlotRate = entry.analytics.multiSlotRate;
          let multiSlot: 'low' | 'med' | 'high';
          if (multiSlotRate < 0.3) {
            multiSlot = 'low';
          } else if (multiSlotRate < 0.6) {
            multiSlot = 'med';
          } else {
            multiSlot = 'high';
          }
          
          // Determine difficultyHint based on level and primaryStructure
          let difficultyHint: 'foundation' | 'standard' | 'stretch';
          const level = entry.level || 'A1';
          const isA1 = level === 'A1';
          const isA2 = level === 'A2';
          const isB1Plus = ['B1', 'B2', 'C1', 'C2'].includes(level);
          
          // Foundation: A1 with simple structures
          if (isA1 && (entry.primaryStructure.includes('greeting') || entry.primaryStructure.includes('basic'))) {
            difficultyHint = 'foundation';
          }
          // Stretch: B1+ or complex structures
          else if (isB1Plus || entry.primaryStructure.includes('complex') || entry.primaryStructure.includes('advanced')) {
            difficultyHint = 'stretch';
          }
          // Standard: everything else
          else {
            difficultyHint = 'standard';
          }
          
          item.signals = {
            multiSlot,
            difficultyHint
          };
        }
      }
    }
    
    // Legacy analytics fields (for backwards compatibility, deprecated)
    if (entry.analytics && typeof entry.analytics === 'object') {
      if (entry.analytics.drillType) {
        item.drillType = entry.analytics.drillType;
      }
      if (entry.analytics.cognitiveLoad) {
        item.cognitiveLoad = entry.analytics.cognitiveLoad;
      }
      // Generate whyThisWorks from goal + first successCriteria (legacy format)
      if (entry.analytics.goal && typeof entry.analytics.goal === 'string') {
        const goal = entry.analytics.goal;
        const firstCriterion = Array.isArray(entry.analytics.successCriteria) && entry.analytics.successCriteria.length > 0
          ? entry.analytics.successCriteria[0]
          : null;
        
        if (firstCriterion) {
          item.whyThisWorks = `${goal} ${firstCriterion}`;
        } else {
          item.whyThisWorks = goal;
        }
        
        // Truncate to reasonable length (max 200 chars for index)
        if (item.whyThisWorks.length > 200) {
          item.whyThisWorks = item.whyThisWorks.substring(0, 197) + '...';
        }
      }
    }
    
    return item;
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
    // Create empty index file (catalog may reference it)
    const emptyIndex: SectionIndex = {
      version: 'v1',
      kind: config.kind,
      total: 0,
      pageSize: pageSize,
      items: [],
      nextPage: null
    };
    
    writeFileSync(existingIndexPath, JSON.stringify(emptyIndex, null, 2), 'utf-8');
    console.log(`📝 Created empty index: ${workspaceId}/${sectionId} (no entries found)`);
    
    // Remove any paginated index files (shouldn't exist for empty sections)
    let pageNum = 2;
    while (true) {
      const pagePath = join(sectionDir, `index.page${pageNum}.json`);
      if (existsSync(pagePath)) {
        rmSync(pagePath, { force: true });
        pageNum++;
      } else {
        break;
      }
    }
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

