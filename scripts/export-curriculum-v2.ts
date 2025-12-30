#!/usr/bin/env tsx

/**
 * Curriculum Export v2 Generator
 * 
 * Generates deterministic curriculum bundles from workspace content.
 * 
 * Usage:
 *   npm run content:export-curriculum [--workspace <ws>]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  CurriculumExportV2,
  CurriculumBundleV2,
  CurriculumModuleV2,
  CurriculumItemRefV2,
  BundleConfigV2
} from './exports/curriculumExportTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');
const EXPORTS_DIR = join(__dirname, '..', 'exports');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v1', 'curriculum');

// Configuration constants
const MIN_PACKS_PER_BUNDLE = 3;
const MIN_PRIMARY_STRUCTURES_PER_BUNDLE = 2;
const MIN_BUNDLE_MINUTES = 15;
const MAX_BUNDLE_MINUTES = 180;

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
  analyticsSummary?: {
    primaryStructure: string;
    scenario: string;
    register: string;
    variationSlots: string[];
    goal: string;
    whyThisWorks: string[];
  };
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
  analytics?: {
    goal?: string;
    successCriteria?: string[];
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

interface ItemWithMetadata {
  id: string;
  kind: 'pack' | 'drill' | 'exam';
  title: string;
  level: string;
  entryUrl: string;
  minutes: number;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  analyticsSummary?: SectionIndexItem['analyticsSummary'];
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
      console.warn(`⚠️  Index file not found: ${indexPath}, skipping`);
      break;
    }
    
    const content = readFileSync(indexPath, 'utf-8');
    const index: SectionIndex = JSON.parse(content);
    
    allItems.push(...index.items);
    currentUrl = index.nextPage || null;
  }
  
  return allItems;
}

/**
 * Load entry document (pack, drill, or exam)
 */
function loadEntryDocument(entryUrl: string): EntryDocument | null {
  try {
    const relativePath = entryUrl.replace(/^\/v1\//, '');
    const entryPath = join(CONTENT_DIR, relativePath);
    
    if (!existsSync(entryPath)) {
      return null;
    }
    
    const content = readFileSync(entryPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    console.warn(`⚠️  Failed to load entry ${entryUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Get git SHA from release.json or git
 */
function getGitSha(): string {
  try {
    const releasePath = join(META_DIR, 'release.json');
    if (existsSync(releasePath)) {
      const release = JSON.parse(readFileSync(releasePath, 'utf-8'));
      if (release.gitSha) {
        return release.gitSha;
      }
    }
  } catch {
    // Fall through to git command
  }
  
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8', stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Generate stable bundle ID
 */
function generateBundleId(scenario: string | undefined, level: string, register: string | undefined): string {
  const parts: string[] = [];
  
  if (scenario && scenario !== 'TODO: Add scenario (e.g., work, restaurant, shopping, doctor, housing)') {
    const scenarioSlug = scenario.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (scenarioSlug) {
      parts.push(scenarioSlug);
    }
  }
  
  parts.push(level.toLowerCase());
  
  if (register && register !== 'neutral') {
    parts.push(register.toLowerCase());
  }
  
  parts.push('core');
  
  return parts.join('_');
}

/**
 * Generate stable module ID
 */
function generateModuleId(bundleId: string, moduleIndex: number, kind: string): string {
  return `${bundleId}_module_${moduleIndex}_${kind}`;
}

/**
 * Compare levels for sorting
 */
function compareLevels(a: string, b: string): number {
  const levelOrder: Record<string, number> = {
    'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6
  };
  const aOrder = levelOrder[a.toUpperCase()] || 999;
  const bOrder = levelOrder[b.toUpperCase()] || 999;
  return aOrder - bOrder;
}

/**
 * Sort items: kind (packs → drills → exams), then primaryStructure, then title
 */
function sortItems(items: ItemWithMetadata[]): ItemWithMetadata[] {
  const kindOrder: Record<string, number> = { pack: 1, drill: 2, exam: 3 };
  
  return [...items].sort((a, b) => {
    // Primary: kind
    const kindCmp = (kindOrder[a.kind] || 999) - (kindOrder[b.kind] || 999);
    if (kindCmp !== 0) return kindCmp;
    
    // Secondary: primaryStructure
    const structA = a.primaryStructure || '';
    const structB = b.primaryStructure || '';
    const structCmp = structA.localeCompare(structB);
    if (structCmp !== 0) return structCmp;
    
    // Tertiary: title
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

/**
 * Load bundle config if exists
 */
function loadBundleConfig(workspace: string): BundleConfigV2 | null {
  const configPath = join(TEMPLATES_DIR, `bundles.${workspace}.json`);
  if (!existsSync(configPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    console.warn(`⚠️  Failed to load bundle config: ${error.message}`);
    return null;
  }
}

/**
 * Collect all items from workspace
 */
function collectAllItems(workspace: string): ItemWithMetadata[] {
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  if (!existsSync(catalogPath)) {
    throw new Error(`Catalog not found: ${catalogPath}`);
  }
  
  const catalog: Catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  const allItems: ItemWithMetadata[] = [];
  
  for (const section of catalog.sections) {
    if (!section.itemsUrl) continue;
    
    const indexItems = loadAllItemsFromSection(section.itemsUrl);
    
    for (const indexItem of indexItems) {
      // Load entry document to get full metadata
      const entry = loadEntryDocument(indexItem.entryUrl);
      
      if (!entry) {
        console.warn(`⚠️  Skipping ${indexItem.id}: entry document not found`);
        continue;
      }
      
      // Determine kind
      let kind: 'pack' | 'drill' | 'exam';
      if (indexItem.kind === 'pack' || indexItem.kind === 'context') {
        kind = 'pack';
      } else if (indexItem.kind === 'exam' || indexItem.kind === 'exams') {
        kind = 'exam';
      } else {
        kind = 'drill';
      }
      
      const item: ItemWithMetadata = {
        id: entry.id,
        kind,
        title: entry.title,
        level: entry.level,
        entryUrl: indexItem.entryUrl,
        minutes: entry.estimatedMinutes || indexItem.durationMinutes || 15,
        scenario: entry.scenario || indexItem.scenario,
        register: entry.register || indexItem.register,
        primaryStructure: entry.primaryStructure || indexItem.primaryStructure,
        analyticsSummary: indexItem.analyticsSummary
      };
      
      allItems.push(item);
    }
  }
  
  return allItems;
}

/**
 * Group items into bundles
 */
function groupIntoBundles(items: ItemWithMetadata[]): Map<string, ItemWithMetadata[]> {
  const bundles = new Map<string, ItemWithMetadata[]>();
  
  for (const item of items) {
    // Skip items without valid scenario or level
    if (!item.scenario || item.scenario.includes('TODO') || !item.level) {
      continue;
    }
    
    const bundleKey = `${item.scenario}::${item.level}::${item.register || 'neutral'}`;
    
    if (!bundles.has(bundleKey)) {
      bundles.set(bundleKey, []);
    }
    
    bundles.get(bundleKey)!.push(item);
  }
  
  return bundles;
}

/**
 * Create modules from items
 */
function createModules(items: ItemWithMetadata[], bundleId: string): CurriculumModuleV2[] {
  const sorted = sortItems(items);
  const modules: CurriculumModuleV2[] = [];
  
  // Group by kind
  const packs: ItemWithMetadata[] = [];
  const drills: ItemWithMetadata[] = [];
  const exams: ItemWithMetadata[] = [];
  
  for (const item of sorted) {
    if (item.kind === 'pack') packs.push(item);
    else if (item.kind === 'drill') drills.push(item);
    else if (item.kind === 'exam') exams.push(item);
  }
  
  let moduleIndex = 0;
  
  // Create module for packs
  if (packs.length > 0) {
    modules.push({
      id: generateModuleId(bundleId, moduleIndex++, 'packs'),
      title: 'Context & Learning',
      items: packs.map(item => ({
        kind: 'pack' as const,
        id: item.id,
        entryUrl: item.entryUrl,
        minutes: item.minutes
      }))
    });
  }
  
  // Create module for drills
  if (drills.length > 0) {
    modules.push({
      id: generateModuleId(bundleId, moduleIndex++, 'drills'),
      title: 'Practice & Mechanics',
      items: drills.map(item => ({
        kind: 'drill' as const,
        id: item.id,
        entryUrl: item.entryUrl,
        minutes: item.minutes
      }))
    });
  }
  
  // Create module for exams
  if (exams.length > 0) {
    modules.push({
      id: generateModuleId(bundleId, moduleIndex++, 'exams'),
      title: 'Assessment',
      items: exams.map(item => ({
        kind: 'exam' as const,
        id: item.id,
        entryUrl: item.entryUrl,
        minutes: item.minutes
      }))
    });
  }
  
  return modules;
}

/**
 * Generate outcomes from items
 */
function generateOutcomes(items: ItemWithMetadata[]): string[] {
  const outcomes = new Set<string>();
  
  // Collect goals from analytics summaries
  for (const item of items) {
    if (item.analyticsSummary?.goal) {
      const goal = item.analyticsSummary.goal;
      if (goal.length <= 120 && !goal.includes('TODO')) {
        outcomes.add(goal);
      }
    }
  }
  
  // If we have whyThisWorks, use those too (first 2-3)
  for (const item of items) {
    if (item.analyticsSummary?.whyThisWorks) {
      for (const bullet of item.analyticsSummary.whyThisWorks.slice(0, 2)) {
        if (bullet && !bullet.includes('TODO') && bullet.length <= 80) {
          outcomes.add(bullet);
        }
      }
    }
  }
  
  const result = Array.from(outcomes).slice(0, 8);
  
  // Ensure at least 3 outcomes
  if (result.length < 3) {
    result.push('Practice real-world scenarios');
    result.push('Build confidence through repetition');
    result.push('Master key grammatical structures');
  }
  
  return result.slice(0, 8);
}

/**
 * Apply bundle config overrides
 */
function applyBundleConfig(
  bundles: CurriculumBundleV2[],
  config: BundleConfigV2
): CurriculumBundleV2[] {
  if (!config.bundles) return bundles;
  
  const configMap = new Map(config.bundles.map(b => [b.id, b]));
  
  return bundles.map(bundle => {
    const configBundle = configMap.get(bundle.id);
    if (!configBundle) return bundle;
    
    const updated: CurriculumBundleV2 = { ...bundle };
    
    if (configBundle.title) {
      updated.title = configBundle.title;
    }
    
    if (configBundle.outcomes) {
      updated.outcomes = configBundle.outcomes;
    }
    
    if (configBundle.modules) {
      const moduleConfigMap = new Map(
        configBundle.modules.map(m => [m.id, m])
      );
      
      updated.modules = bundle.modules.map(module => {
        const moduleConfig = moduleConfigMap.get(module.id);
        if (!moduleConfig) return module;
        
        const updatedModule: CurriculumModuleV2 = { ...module };
        
        if (moduleConfig.title) {
          updatedModule.title = moduleConfig.title;
        }
        
        if (moduleConfig.itemOrder) {
          // Reorder items according to config
          const itemMap = new Map(module.items.map(item => [item.id, item]));
          const orderedItems: CurriculumItemRefV2[] = [];
          const seenIds = new Set<string>();
          
          for (const id of moduleConfig.itemOrder) {
            const item = itemMap.get(id);
            if (item) {
              orderedItems.push(item);
              seenIds.add(id);
            }
          }
          
          // Add remaining items not in order
          for (const item of module.items) {
            if (!seenIds.has(item.id)) {
              orderedItems.push(item);
            }
          }
          
          updatedModule.items = orderedItems;
        }
        
        if (moduleConfig.excludeItems) {
          const excludeSet = new Set(moduleConfig.excludeItems);
          updatedModule.items = module.items.filter(item => !excludeSet.has(item.id));
        }
        
        return updatedModule;
      });
    }
    
    return updated;
  });
}

/**
 * Generate curriculum export
 */
function generateExport(workspace: string): CurriculumExportV2 {
  console.log(`📦 Generating curriculum export for workspace: ${workspace}`);
  
  // Collect all items
  const allItems = collectAllItems(workspace);
  console.log(`   Found ${allItems.length} items`);
  
  // Group into bundles
  const bundleGroups = groupIntoBundles(allItems);
  console.log(`   Grouped into ${bundleGroups.size} bundles`);
  
  // Create bundles
  const bundles: CurriculumBundleV2[] = [];
  
  for (const [bundleKey, items] of bundleGroups.entries()) {
    const [scenario, level, register] = bundleKey.split('::');
    
    // Filter to packs only for counting
    const packs = items.filter(i => i.kind === 'pack');
    
    // Skip if doesn't meet minimum requirements
    if (packs.length < MIN_PACKS_PER_BUNDLE) {
      console.warn(`⚠️  Skipping bundle ${bundleKey}: only ${packs.length} packs (min ${MIN_PACKS_PER_BUNDLE})`);
      continue;
    }
    
    // Collect primary structures
    const primaryStructures = new Set<string>();
    for (const item of items) {
      if (item.primaryStructure && !item.primaryStructure.includes('TODO')) {
        primaryStructures.add(item.primaryStructure);
      }
    }
    
    if (primaryStructures.size < MIN_PRIMARY_STRUCTURES_PER_BUNDLE) {
      console.warn(`⚠️  Skipping bundle ${bundleKey}: only ${primaryStructures.size} primary structures (min ${MIN_PRIMARY_STRUCTURES_PER_BUNDLE})`);
      continue;
    }
    
    // Calculate total minutes
    const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0);
    
    if (totalMinutes < MIN_BUNDLE_MINUTES || totalMinutes > MAX_BUNDLE_MINUTES) {
      console.warn(`⚠️  Skipping bundle ${bundleKey}: ${totalMinutes} minutes (must be ${MIN_BUNDLE_MINUTES}-${MAX_BUNDLE_MINUTES})`);
      continue;
    }
    
    // Generate bundle
    const bundleId = generateBundleId(scenario, level, register);
    const modules = createModules(items, bundleId);
    const outcomes = generateOutcomes(items);
    
    const bundle: CurriculumBundleV2 = {
      id: bundleId,
      title: `${scenario.charAt(0).toUpperCase() + scenario.slice(1)} ${level} Course`,
      level: level as any,
      scenario,
      register: register !== 'neutral' ? (register as any) : undefined,
      outcomes,
      primaryStructures: Array.from(primaryStructures),
      estimatedMinutes: totalMinutes,
      modules
    };
    
    bundles.push(bundle);
  }
  
  // Sort bundles by level, then scenario
  bundles.sort((a, b) => {
    const levelCmp = compareLevels(a.level, b.level);
    if (levelCmp !== 0) return levelCmp;
    return (a.scenario || '').localeCompare(b.scenario || '');
  });
  
  // Load and apply bundle config
  const config = loadBundleConfig(workspace);
  if (config) {
    console.log(`   Applying bundle config overrides`);
    const updatedBundles = applyBundleConfig(bundles, config);
    
    // Validate config doesn't introduce unknown IDs
    const allItemIds = new Set<string>();
    for (const bundle of bundles) {
      for (const module of bundle.modules) {
        for (const item of module.items) {
          allItemIds.add(item.id);
        }
      }
    }
    
    // Check config references
    if (config.bundles) {
      for (const configBundle of config.bundles) {
        if (configBundle.modules) {
          for (const moduleConfig of configBundle.modules) {
            if (moduleConfig.itemOrder) {
              for (const id of moduleConfig.itemOrder) {
                if (!allItemIds.has(id)) {
                  throw new Error(`Bundle config references unknown item ID: ${id}`);
                }
              }
            }
            if (moduleConfig.excludeItems) {
              for (const id of moduleConfig.excludeItems) {
                if (!allItemIds.has(id)) {
                  throw new Error(`Bundle config references unknown item ID: ${id}`);
                }
              }
            }
          }
        }
      }
    }
    
    bundles.length = 0;
    bundles.push(...updatedBundles);
  }
  
  // Get workspace metadata
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  const catalog: Catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  
  const export_: CurriculumExportV2 = {
    version: 2,
    exportedAt: new Date().toISOString(),
    gitSha: getGitSha(),
    workspace,
    title: `GetVerba ${catalog.languageName} Curriculum`,
    description: `Deterministic curriculum bundles for ${catalog.languageName} (${workspace})`,
    bundles
  };
  
  return export_;
}

/**
 * Generate CSV export
 */
function generateCsv(export_: CurriculumExportV2): string {
  const rows: string[] = [];
  
  // Header
  rows.push([
    'bundle_id', 'bundle_title', 'level', 'scenario', 'register',
    'module_id', 'module_title',
    'item_kind', 'item_id', 'entryUrl', 'minutes',
    'primaryStructures', 'outcomes'
  ].join(','));
  
  // Data rows
  for (const bundle of export_.bundles) {
    const primaryStructuresStr = bundle.primaryStructures.join('|');
    const outcomesStr = bundle.outcomes.join('|');
    
    for (const module of bundle.modules) {
      for (const item of module.items) {
        const row = [
          bundle.id,
          `"${bundle.title.replace(/"/g, '""')}"`,
          bundle.level,
          bundle.scenario || '',
          bundle.register || '',
          module.id,
          `"${module.title.replace(/"/g, '""')}"`,
          item.kind,
          item.id,
          item.entryUrl,
          (item.minutes || 0).toString(),
          `"${primaryStructuresStr.replace(/"/g, '""')}"`,
          `"${outcomesStr.replace(/"/g, '""')}"`
        ];
        rows.push(row.join(','));
      }
    }
  }
  
  return rows.join('\n') + '\n';
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace: string | null = null;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--workspace' || args[i] === '-w') && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    }
  }
  
  if (!workspace) {
    // Try to get from manifest
    try {
      const manifestPath = join(META_DIR, 'manifest.json');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        workspace = manifest.activeWorkspace;
      }
    } catch {
      // Fall through
    }
    
    if (!workspace) {
      console.error('Usage: export-curriculum-v2.ts --workspace <ws>');
      console.error('Example: npm run content:export-curriculum -- --workspace de');
      process.exit(1);
    }
  }
  
  // Generate export
  const export_ = generateExport(workspace);
  
  // Ensure exports directory exists
  mkdirSync(EXPORTS_DIR, { recursive: true });
  
  // Write JSON
  const jsonPath = join(EXPORTS_DIR, `curriculum.v2.${workspace}.json`);
  writeFileSync(jsonPath, JSON.stringify(export_, null, 2), 'utf-8');
  console.log(`\n✅ Generated JSON: ${jsonPath}`);
  console.log(`   ${export_.bundles.length} bundles`);
  
  // Write CSV
  const csvPath = join(EXPORTS_DIR, `curriculum.v2.${workspace}.csv`);
  const csv = generateCsv(export_);
  writeFileSync(csvPath, csv, 'utf-8');
  console.log(`✅ Generated CSV: ${csvPath}`);
  
  console.log(`\n✅ Curriculum export complete!`);
}

main();

