/**
 * Bundle Planner
 * 
 * Implements deterministic planning logic for curriculum bundles.
 * Same inputs produce identical outputs (non-random proof).
 */

import type {
  BundleSelectionCriteria,
  BundleItem,
  SectionIndexItem,
  EntryDocument
} from './exportTypes.js';

/**
 * Scenario order (stable ordering from template list)
 */
const SCENARIO_ORDER: Record<string, number> = {
  work: 1,
  restaurant: 2,
  shopping: 3,
  doctor: 4,
  housing: 5,
  government_office: 6,
  casual_greeting: 7,
};

/**
 * Register order (formal → neutral → casual)
 */
const REGISTER_ORDER: Record<string, number> = {
  formal: 1,
  neutral: 2,
  casual: 3,
  informal: 3, // alias
};

/**
 * Level order (A1 → C2)
 */
const LEVEL_ORDER: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

/**
 * Compare levels for sorting
 */
function compareLevels(a: string, b: string): number {
  const aOrder = LEVEL_ORDER[a.toUpperCase()] || 999;
  const bOrder = LEVEL_ORDER[b.toUpperCase()] || 999;
  return aOrder - bOrder;
}

/**
 * Compare scenarios for sorting
 */
function compareScenarios(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const aOrder = SCENARIO_ORDER[a.toLowerCase()] || 999;
  const bOrder = SCENARIO_ORDER[b.toLowerCase()] || 999;
  return aOrder - bOrder;
}

/**
 * Compare registers for sorting
 */
function compareRegisters(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const aOrder = REGISTER_ORDER[a.toLowerCase()] || 999;
  const bOrder = REGISTER_ORDER[b.toLowerCase()] || 999;
  return aOrder - bOrder;
}

/**
 * Deterministic ordering rule:
 * 1. scenario (stable order from template list)
 * 2. level (A1→C2)
 * 3. register (formal→neutral→casual)
 * 4. primaryStructure (alphabetical)
 * 5. id (alphabetical)
 */
export function sortItemsDeterministically(items: BundleItem[]): BundleItem[] {
  return [...items].sort((a, b) => {
    // 1. scenario
    const scenarioCmp = compareScenarios(a.scenario, b.scenario);
    if (scenarioCmp !== 0) return scenarioCmp;
    
    // 2. level
    const levelCmp = compareLevels(a.level, b.level);
    if (levelCmp !== 0) return levelCmp;
    
    // 3. register
    const registerCmp = compareRegisters(a.register, b.register);
    if (registerCmp !== 0) return registerCmp;
    
    // 4. primaryStructure (alphabetical)
    const structA = a.primaryStructure || '';
    const structB = b.primaryStructure || '';
    const structCmp = structA.localeCompare(structB);
    if (structCmp !== 0) return structCmp;
    
    // 5. id (alphabetical)
    return a.id.localeCompare(b.id);
  });
}

/**
 * Group items into modules based on scenario, level, and primaryStructure.
 * Keeps bounded scope per module.
 */
export function groupIntoModules(
  items: BundleItem[],
  maxItemsPerModule: number = 8
): Array<{ id: string; title: string; items: BundleItem[] }> {
  const sorted = sortItemsDeterministically(items);
  const modules: Array<{ id: string; title: string; items: BundleItem[] }> = [];
  
  let currentModule: { id: string; title: string; items: BundleItem[] } | null = null;
  let moduleIndex = 1;
  
  for (const item of sorted) {
    // Start new module if needed
    if (!currentModule || currentModule.items.length >= maxItemsPerModule) {
      // Generate module title from first item
      const titleParts: string[] = [];
      if (item.scenario) {
        titleParts.push(item.scenario.charAt(0).toUpperCase() + item.scenario.slice(1).replace(/_/g, ' '));
      }
      if (item.primaryStructure) {
        titleParts.push(item.primaryStructure.replace(/_/g, ' '));
      }
      if (titleParts.length === 0) {
        titleParts.push('Learning Content');
      }
      
      currentModule = {
        id: `m${moduleIndex}`,
        title: titleParts.join(' — '),
        items: []
      };
      modules.push(currentModule);
      moduleIndex++;
    }
    
    currentModule.items.push(item);
  }
  
  return modules;
}

/**
 * Filter items based on selection criteria
 */
export function filterItems(
  items: BundleItem[],
  criteria: BundleSelectionCriteria
): BundleItem[] {
  let filtered = [...items];
  
  // Filter by levels
  if (criteria.levels && criteria.levels.length > 0) {
    filtered = filtered.filter(item => 
      criteria.levels!.includes(item.level.toUpperCase())
    );
  }
  
  // Filter by scenarios
  if (criteria.scenarios && criteria.scenarios.length > 0) {
    filtered = filtered.filter(item => 
      item.scenario && criteria.scenarios!.includes(item.scenario.toLowerCase())
    );
  }
  
  // Filter by tags
  if (criteria.tags && criteria.tags.length > 0) {
    filtered = filtered.filter(item => {
      if (!item.tags || item.tags.length === 0) return false;
      return criteria.tags!.some(tag => 
        item.tags!.some(itemTag => 
          itemTag.toLowerCase() === tag.toLowerCase()
        )
      );
    });
  }
  
  // Apply max caps
  const packs = filtered.filter(i => i.kind === 'pack');
  const drills = filtered.filter(i => i.kind === 'drill');
  const exams = filtered.filter(i => i.kind === 'exam');
  
  if (criteria.maxPacks && packs.length > criteria.maxPacks) {
    const sortedPacks = sortItemsDeterministically(packs);
    filtered = filtered.filter(i => 
      i.kind !== 'pack' || sortedPacks.slice(0, criteria.maxPacks).some(p => p.id === i.id)
    );
  }
  
  if (criteria.maxDrills && drills.length > criteria.maxDrills) {
    const sortedDrills = sortItemsDeterministically(drills);
    filtered = filtered.filter(i => 
      i.kind !== 'drill' || sortedDrills.slice(0, criteria.maxDrills).some(d => d.id === i.id)
    );
  }
  
  if (criteria.maxExams && exams.length > criteria.maxExams) {
    const sortedExams = sortItemsDeterministically(exams);
    filtered = filtered.filter(i => 
      i.kind !== 'exam' || sortedExams.slice(0, criteria.maxExams).some(e => e.id === i.id)
    );
  }
  
  return filtered;
}

/**
 * Apply explicit ID filters (include only specified IDs)
 */
export function applyExplicitIds(
  items: BundleItem[],
  criteria: BundleSelectionCriteria
): BundleItem[] {
  const explicitPackIds = criteria.explicitPackIds || [];
  const explicitDrillIds = criteria.explicitDrillIds || [];
  const explicitExamIds = criteria.explicitExamIds || [];
  
  // If any explicit IDs are specified, use only those
  if (explicitPackIds.length > 0 || explicitDrillIds.length > 0 || explicitExamIds.length > 0) {
    const explicitIds = new Set([
      ...explicitPackIds,
      ...explicitDrillIds,
      ...explicitExamIds
    ]);
    
    return items.filter(item => explicitIds.has(item.id));
  }
  
  return items;
}

/**
 * Plan bundle: filter, sort, and group items into modules
 */
export function planBundle(
  allItems: BundleItem[],
  criteria: BundleSelectionCriteria
): Array<{ id: string; title: string; items: BundleItem[] }> {
  // Apply explicit IDs first (if specified)
  let selected = applyExplicitIds(allItems, criteria);
  
  // Then apply filters
  selected = filterItems(selected, criteria);
  
  // Sort deterministically
  const sorted = sortItemsDeterministically(selected);
  
  // Group into modules
  const modules = groupIntoModules(sorted);
  
  return modules;
}

