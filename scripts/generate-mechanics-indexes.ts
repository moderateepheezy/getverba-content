#!/usr/bin/env tsx

/**
 * Generate Mechanics Indexes for Drills v4
 * 
 * Generates:
 * - /v1/workspaces/{ws}/mechanics/index.json (mechanics index)
 * - /v1/workspaces/{ws}/mechanics/{mechanicId}/index.json (per-mechanic drill indexes)
 * 
 * Usage:
 *   tsx scripts/generate-mechanics-indexes.ts [--workspace <ws>]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v4', 'mechanics');

interface MechanicGroup {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  itemsUrl: string;
  order: number;
  levelRange?: string[];
  tags?: string[];
  // i18n fields (optional)
  title_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
}

interface MechanicsIndex {
  version: string;
  kind: string;
  total: number;
  mechanics: MechanicGroup[];
}

interface MechanicDrillIndexItem {
  id: string;
  kind: string;
  entryUrl: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  level: string;
  estimatedMinutes: number;
  loopType: string;
  difficultyTier: number;
  orderInGroup: number;
  tags?: string[];
  // i18n fields (optional)
  title_i18n?: Record<string, string>;
  shortTitle_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
}

interface MechanicDrillIndex {
  version: string;
  kind: string;
  mechanicId: string;
  title: string;
  total: number;
  pageSize: number;
  page: number;
  items: MechanicDrillIndexItem[];
  nextPage: string | null;
}

interface DrillEntry {
  id: string;
  kind: string;
  drillVersion?: string;
  level: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  estimatedMinutes: number;
  mechanicId: string;
  mechanicLabel: string;
  loopType: string;
  difficultyTier: number;
  tags?: string[];
  entryUrl?: string; // Computed
  title_i18n?: Record<string, string>;
  shortTitle_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
}

/**
 * Load mechanic template
 */
function loadTemplate(mechanicId: string): any {
  const templatePath = join(TEMPLATES_DIR, `${mechanicId}.json`);
  if (!existsSync(templatePath)) {
    return null;
  }
  return JSON.parse(readFileSync(templatePath, 'utf-8'));
}

/**
 * Read drill entry
 */
function readDrillEntry(drillPath: string, workspaceId: string): DrillEntry | null {
  try {
    const content = readFileSync(drillPath, 'utf-8');
    const entry: any = JSON.parse(content);

    // Only process v4 drills
    if (entry.drillVersion !== 'v4') {
      return null;
    }

    // Compute entryUrl
    const entryUrl = `/v1/workspaces/${workspaceId}/drills/${entry.id}/drill.json`;

    return {
      id: entry.id,
      kind: entry.kind,
      drillVersion: entry.drillVersion,
      level: entry.level,
      title: entry.title,
      shortTitle: entry.shortTitle,
      subtitle: entry.subtitle,
      estimatedMinutes: entry.estimatedMinutes,
      mechanicId: entry.mechanicId,
      mechanicLabel: entry.mechanicLabel,
      loopType: entry.loopType,
      difficultyTier: entry.difficultyTier,
      tags: entry.tags,
      entryUrl,
      title_i18n: entry.title_i18n,
      shortTitle_i18n: entry.shortTitle_i18n
        ? Object.fromEntries(
          Object.entries(entry.shortTitle_i18n).map(([lang, val]) => [
            lang,
            (typeof val === 'string' && val.length > 28) ? val.substring(0, 25) + '...' : val
          ])
        ) as Record<string, string>
        : undefined,
      subtitle_i18n: entry.subtitle_i18n
    };
  } catch (error: any) {
    console.warn(`⚠️  Failed to read ${drillPath}: ${error.message}`);
    return null;
  }
}

/**
 * Scan drills directory for v4 drills
 */
function scanDrills(workspaceId: string): Map<string, DrillEntry[]> {
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'drills');
  const drillsByMechanic = new Map<string, DrillEntry[]>();

  if (!existsSync(drillsDir)) {
    return drillsByMechanic;
  }

  const entries = readdirSync(drillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const drillPath = join(drillsDir, entry.name, 'drill.json');
    if (!existsSync(drillPath)) continue;

    const drill = readDrillEntry(drillPath, workspaceId);
    if (!drill) continue;

    const mechanicId = drill.mechanicId;
    if (!drillsByMechanic.has(mechanicId)) {
      drillsByMechanic.set(mechanicId, []);
    }
    drillsByMechanic.get(mechanicId)!.push(drill);
  }

  return drillsByMechanic;
}

/**
 * Generate mechanics index
 */
function generateMechanicsIndex(
  workspaceId: string,
  drillsByMechanic: Map<string, DrillEntry[]>
): MechanicsIndex {
  const mechanics: MechanicGroup[] = [];
  const templates = readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  let order = 1;
  for (const mechanicId of templates.sort()) {
    const template = loadTemplate(mechanicId);
    if (!template) continue;

    const drills = drillsByMechanic.get(mechanicId) || [];
    if (drills.length === 0) continue; // Skip mechanics with no drills

    // Determine level range from drills
    const levels = new Set(drills.map(d => d.level));
    const levelRange = Array.from(levels).sort();

    // Get description from template (fallback to truncated description if description_i18n not available)
    const description = template.description_i18n?.en || template.description || '';
    
    mechanics.push({
      id: mechanicId,
      title: template.mechanicLabel,
      subtitle: template.description.substring(0, 60),
      description: description,
      itemsUrl: `/v1/workspaces/${workspaceId}/mechanics/${mechanicId}/index.json`,
      order: order++,
      levelRange,
      tags: template.canonicalPatterns.slice(0, 3), // Use first 3 patterns as tags
      // Include i18n fields if available
      title_i18n: template.title_i18n,
      subtitle_i18n: template.subtitle_i18n,
      description_i18n: template.description_i18n
    });
  }

  return {
    version: 'v1',
    kind: 'mechanics_index',
    total: mechanics.length,
    mechanics
  };
}

/**
 * Generate per-mechanic drill index
 */
function generateMechanicDrillIndex(
  workspaceId: string,
  mechanicId: string,
  drills: DrillEntry[],
  pageSize: number = 20
): MechanicDrillIndex {
  // Sort drills: by level, then tier, then loopType
  const sorted = [...drills].sort((a, b) => {
    const levelOrder: Record<string, number> = { 'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6 };
    const levelCmp = (levelOrder[a.level] || 999) - (levelOrder[b.level] || 999);
    if (levelCmp !== 0) return levelCmp;

    const tierCmp = a.difficultyTier - b.difficultyTier;
    if (tierCmp !== 0) return tierCmp;

    return a.loopType.localeCompare(b.loopType);
  });

  // Assign orderInGroup
  const items: MechanicDrillIndexItem[] = sorted.map((drill, idx) => ({
    id: drill.id,
    kind: drill.kind,
    entryUrl: drill.entryUrl!,
    title: drill.title,
    shortTitle: drill.shortTitle,
    subtitle: drill.subtitle,
    level: drill.level,
    estimatedMinutes: drill.estimatedMinutes,
    loopType: drill.loopType,
    difficultyTier: drill.difficultyTier,
    orderInGroup: idx + 1,
    tags: drill.tags,
    title_i18n: drill.title_i18n,
    shortTitle_i18n: drill.shortTitle_i18n,
    subtitle_i18n: drill.subtitle_i18n
  }));

  // Get mechanic label
  const template = loadTemplate(mechanicId);
  const title = template ? template.mechanicLabel : mechanicId;

  // Paginate items
  const total = items.length;
  const pages: MechanicDrillIndexItem[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }

  // Return first page (pagination will be handled in generateMechanicsIndexes)
  return {
    version: 'v1',
    kind: 'mechanic_drills',
    mechanicId,
    title,
    total,
    pageSize,
    page: 1,
    items: pages[0] || [],
    nextPage: pages.length > 1 ? `/v1/workspaces/${workspaceId}/mechanics/${mechanicId}/pages/2.json` : null
  };
}

/**
 * Generate all mechanics indexes for a workspace
 */
function generateMechanicsIndexes(workspaceId: string): void {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  const mechanicsDir = join(workspaceDir, 'mechanics');

  // Scan drills
  const drillsByMechanic = scanDrills(workspaceId);

  // Generate mechanics index
  const mechanicsIndex = generateMechanicsIndex(workspaceId, drillsByMechanic);

  // Create mechanics directory
  if (!existsSync(mechanicsDir)) {
    mkdirSync(mechanicsDir, { recursive: true });
  }

  // Write mechanics index
  const mechanicsIndexPath = join(mechanicsDir, 'index.json');
  writeFileSync(mechanicsIndexPath, JSON.stringify(mechanicsIndex, null, 2) + '\n', 'utf-8');
  console.log(`✅ Generated ${workspaceId}/mechanics/index.json (${mechanicsIndex.total} mechanics)`);

  // Generate per-mechanic indexes with pagination
  for (const [mechanicId, drills] of drillsByMechanic.entries()) {
    const mechanicSubDir = join(mechanicsDir, mechanicId);
    if (!existsSync(mechanicSubDir)) {
      mkdirSync(mechanicSubDir, { recursive: true });
    }

    // Get page size (default 20)
    const pageSize = 20;

    // Sort and paginate
    const sorted = [...drills].sort((a, b) => {
      const levelOrder: Record<string, number> = { 'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6 };
      const levelCmp = (levelOrder[a.level] || 999) - (levelOrder[b.level] || 999);
      if (levelCmp !== 0) return levelCmp;
      const tierCmp = a.difficultyTier - b.difficultyTier;
      if (tierCmp !== 0) return tierCmp;
      return a.loopType.localeCompare(b.loopType);
    });

    const total = sorted.length;
    const pages: DrillEntry[][] = [];
    for (let i = 0; i < sorted.length; i += pageSize) {
      pages.push(sorted.slice(i, i + pageSize));
    }

    // Get mechanic label
    const template = loadTemplate(mechanicId);
    const title = template ? template.mechanicLabel : mechanicId;

    // Create pages directory if needed
    const pagesDir = join(mechanicSubDir, 'pages');
    if (pages.length > 1 && !existsSync(pagesDir)) {
      mkdirSync(pagesDir, { recursive: true });
    }

    // Write each page
    for (let pageNum = 0; pageNum < pages.length; pageNum++) {
      const pageItems = pages[pageNum];
      const pageNumber = pageNum + 1;
      const isLastPage = pageNum === pages.length - 1;

      const items: MechanicDrillIndexItem[] = pageItems.map((drill, idx) => ({
        id: drill.id,
        kind: drill.kind,
        entryUrl: drill.entryUrl!,
        title: drill.title,
        shortTitle: drill.shortTitle,
        subtitle: drill.subtitle,
        level: drill.level,
        estimatedMinutes: drill.estimatedMinutes,
        loopType: drill.loopType,
        difficultyTier: drill.difficultyTier,
        orderInGroup: pageNum * pageSize + idx + 1,
        tags: drill.tags,
        title_i18n: drill.title_i18n,
        shortTitle_i18n: drill.shortTitle_i18n
          ? Object.fromEntries(
            Object.entries(drill.shortTitle_i18n).map(([lang, val]) => [
              lang,
              (typeof val === 'string' && val.length > 28) ? val.substring(0, 25) + '...' : val
            ])
          ) as Record<string, string>
          : undefined,
        subtitle_i18n: drill.subtitle_i18n
      }));

      const index: MechanicDrillIndex = {
        version: 'v1',
        kind: 'mechanic_drills',
        mechanicId,
        title,
        total,
        pageSize,
        page: pageNumber,
        items,
        nextPage: isLastPage ? null : `/v1/workspaces/${workspaceId}/mechanics/${mechanicId}/pages/${pageNumber + 1}.json`
      };

      let filePath: string;
      if (pageNum === 0) {
        filePath = join(mechanicSubDir, 'index.json');
      } else {
        filePath = join(pagesDir, `${pageNumber}.json`);
      }

      writeFileSync(filePath, JSON.stringify(index, null, 2) + '\n', 'utf-8');

      const relativePath = pageNum === 0
        ? `${workspaceId}/mechanics/${mechanicId}/index.json`
        : `${workspaceId}/mechanics/${mechanicId}/pages/${pageNumber}.json`;
      console.log(`✅ Generated ${relativePath} (${pageItems.length} drills, page ${pageNumber})`);
    }
  }
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

  const workspacesDir = join(CONTENT_DIR, 'workspaces');

  if (!existsSync(workspacesDir)) {
    console.error('❌ Error: content/v1/workspaces directory not found');
    process.exit(1);
  }

  const workspaces = targetWorkspace
    ? [targetWorkspace]
    : readdirSync(workspacesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

  if (workspaces.length === 0) {
    console.error('❌ Error: No workspaces found');
    process.exit(1);
  }

  console.log(`📦 Generating mechanics indexes for ${workspaces.length} workspace(s)...\n`);

  for (const workspaceId of workspaces) {
    generateMechanicsIndexes(workspaceId);
  }

  console.log('\n✅ Mechanics index generation complete!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateMechanicsIndexes };

