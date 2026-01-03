#!/usr/bin/env tsx

/**
 * Generate Shaped Drills Index (BE Shaping Spec v4)
 * 
 * Generates `/v1/workspaces/{ws}/drills/index.json` with DrillGroups containing nested DrillTiers.
 * 
 * This implements the BE shaping spec from DRILLS_V4_BE_SHAPING.md.
 * 
 * Usage:
 *   tsx scripts/generate-drills-shaped.ts [--workspace <ws>]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v4', 'mechanics');

interface DrillEntry {
  id: string;
  kind: string;
  drillVersion?: string;
  level: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  mechanicId: string;
  mechanicLabel: string;
  loopType: string;
  difficultyTier: number;
  entryUrl?: string;
}

interface DrillTier {
  id: string;
  tier: number;
  level: string;
  durationMinutes: number;
  status: string;
  entryUrl: string;
}

interface DrillGroup {
  id: string;
  kind: string;
  mechanic: string;
  title: string;
  subtitle?: string;
  description: string;
  estimatedDuration: string;
  order: number;
  tiers: DrillTier[];
  title_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
}

interface ShapedDrillsResponse {
  drillGroups: DrillGroup[];
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
 * Read drill entry from file
 */
function readDrillEntry(drillPath: string, workspaceId: string): DrillEntry | null {
  try {
    const drillJson = JSON.parse(readFileSync(drillPath, 'utf-8'));
    
    // Only process v4 drills
    if (drillJson.drillVersion !== 'v4') {
      return null;
    }

    // Build entryUrl
    const drillId = drillJson.id;
    const entryUrl = `/v1/workspaces/${workspaceId}/drills/${drillId}/drill.json`;

    return {
      id: drillId,
      kind: drillJson.kind,
      drillVersion: drillJson.drillVersion,
      level: drillJson.level,
      title: drillJson.title,
      subtitle: drillJson.subtitle || '',
      estimatedMinutes: drillJson.estimatedMinutes,
      mechanicId: drillJson.mechanicId,
      mechanicLabel: drillJson.mechanicLabel,
      loopType: drillJson.loopType,
      difficultyTier: drillJson.difficultyTier,
      entryUrl
    };
  } catch (error: any) {
    console.warn(`⚠️  Failed to read drill at ${drillPath}: ${error.message}`);
    return null;
  }
}

/**
 * Scan all drills for a workspace
 */
function scanDrills(workspaceId: string): Map<string, DrillEntry[]> {
  const drillsByMechanic = new Map<string, DrillEntry[]>();
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'drills');
  
  if (!existsSync(drillsDir)) {
    return drillsByMechanic;
  }

  const drillDirs = readdirSync(drillsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const drillDir of drillDirs) {
    const drillPath = join(drillsDir, drillDir, 'drill.json');
    if (!existsSync(drillPath)) continue;

    const drill = readDrillEntry(drillPath, workspaceId);
    if (!drill) continue;

    if (!drillsByMechanic.has(drill.mechanicId)) {
      drillsByMechanic.set(drill.mechanicId, []);
    }
    drillsByMechanic.get(drill.mechanicId)!.push(drill);
  }

  return drillsByMechanic;
}

/**
 * Compute estimated duration range for a group
 */
function computeEstimatedDuration(tiers: DrillTier[]): string {
  if (tiers.length === 0) return '3–5 min';
  
  const durations = tiers.map(t => t.durationMinutes);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  
  if (min === max) {
    return `${min} min`;
  }
  return `${min}–${max} min`;
}

/**
 * Generate shaped drills index
 */
function generateShapedDrills(workspaceId: string): ShapedDrillsResponse {
  const drillsByMechanic = scanDrills(workspaceId);
  const templates = readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  const drillGroups: DrillGroup[] = [];
  let order = 1;

  for (const mechanicId of templates.sort()) {
    const template = loadTemplate(mechanicId);
    if (!template) continue;

    const drills = drillsByMechanic.get(mechanicId) || [];
    if (drills.length === 0) continue; // Skip mechanics with no drills

    // Group drills by tier (within each level)
    // For each tier, pick one representative drill (prefer pattern_switch, then first available)
    const tiersByLevelAndTier = new Map<string, DrillEntry>();
    
    for (const drill of drills) {
      const key = `${drill.level}_tier${drill.difficultyTier}`;
      if (!tiersByLevelAndTier.has(key)) {
        tiersByLevelAndTier.set(key, drill);
      } else {
        // Prefer pattern_switch, then keep first
        const existing = tiersByLevelAndTier.get(key)!;
        if (drill.loopType === 'pattern_switch' && existing.loopType !== 'pattern_switch') {
          tiersByLevelAndTier.set(key, drill);
        }
      }
    }

    // Build DrillTiers from grouped drills
    const tiers: DrillTier[] = Array.from(tiersByLevelAndTier.values())
      .sort((a, b) => {
        // Sort by level first, then tier
        const levelOrder: Record<string, number> = { 'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6 };
        const levelCmp = (levelOrder[a.level] || 999) - (levelOrder[b.level] || 999);
        if (levelCmp !== 0) return levelCmp;
        return a.difficultyTier - b.difficultyTier;
      })
      .map(drill => ({
        id: `${mechanicId}_${drill.level.toLowerCase()}_t${drill.difficultyTier}`,
        tier: drill.difficultyTier,
        level: drill.level,
        durationMinutes: drill.estimatedMinutes,
        status: 'available',
        entryUrl: drill.entryUrl!
      }));

    if (tiers.length === 0) continue;

    // Get description from template
    const description = template.description_i18n?.en || template.description || '';
    const subtitle = template.description ? template.description.substring(0, 60) : undefined;

    drillGroups.push({
      id: mechanicId,
      kind: 'drill_group',
      mechanic: mechanicId,
      title: template.mechanicLabel,
      subtitle: subtitle,
      description: description,
      estimatedDuration: computeEstimatedDuration(tiers),
      order: order++,
      tiers: tiers,
      title_i18n: template.title_i18n,
      subtitle_i18n: template.subtitle_i18n,
      description_i18n: template.description_i18n
    });
  }

  return {
    drillGroups
  };
}

/**
 * Generate shaped drills index for a workspace
 */
function generateShapedDrillsIndex(workspaceId: string): void {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  if (!existsSync(workspaceDir)) {
    console.error(`❌ Workspace directory not found: ${workspaceDir}`);
    process.exit(1);
  }

  const drillsDir = join(workspaceDir, 'drills');
  if (!existsSync(drillsDir)) {
    mkdirSync(drillsDir, { recursive: true });
  }

  console.log(`📦 Generating shaped drills index for workspace: ${workspaceId}...`);

  const shapedDrills = generateShapedDrills(workspaceId);
  const outputPath = join(drillsDir, 'index.json');
  
  writeFileSync(outputPath, JSON.stringify(shapedDrills, null, 2) + '\n', 'utf-8');
  console.log(`✅ Generated ${workspaceId}/drills/index.json (${shapedDrills.drillGroups.length} drill groups)`);
}

// Main execution
const args = process.argv.slice(2);
const workspaceIndex = args.indexOf('--workspace');
const workspaceId = workspaceIndex >= 0 && args[workspaceIndex + 1] 
  ? args[workspaceIndex + 1]
  : 'de';

generateShapedDrillsIndex(workspaceId);

