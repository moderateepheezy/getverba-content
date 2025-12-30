#!/usr/bin/env tsx

/**
 * Validate Bundles
 * 
 * Validates all bundle definitions and checks that filters produce items.
 * 
 * Usage:
 *   tsx scripts/validate-bundles.ts
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUNDLES_DIR = join(__dirname, '..', 'content', 'meta', 'bundles');
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface BundleDefinition {
  version: number;
  id: string;
  workspace: string;
  title: string;
  description: string;
  filters: {
    scenario?: string;
    levels?: string[];
    register?: string;
    primaryStructure?: string;
  };
  includeKinds: string[];
  ordering: {
    by: string[];
    stable: boolean;
  };
}

interface SectionIndexItem {
  id: string;
  kind: string;
  title: string;
  level: string;
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
}

let errorCount = 0;

function addError(message: string): void {
  console.error(`❌ ${message}`);
  errorCount++;
}

function addWarning(message: string): void {
  console.warn(`⚠️  ${message}`);
}

/**
 * Load all section indexes for a workspace
 */
function loadSectionIndexes(workspace: string): SectionIndexItem[] {
  const items: SectionIndexItem[] = [];
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  
  if (!existsSync(catalogPath)) {
    return items;
  }
  
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  
  for (const section of catalog.sections || []) {
    const indexPath = join(CONTENT_DIR, 'workspaces', workspace, section.id, 'index.json');
    if (!existsSync(indexPath)) {
      continue;
    }
    
    // Load all pages
    let currentPage: any = JSON.parse(readFileSync(indexPath, 'utf-8'));
    while (currentPage) {
      items.push(...(currentPage.items || []));
      
      if (currentPage.nextPage) {
        const nextPagePath = join(CONTENT_DIR, 'workspaces', workspace, section.id, currentPage.nextPage);
        if (existsSync(nextPagePath)) {
          currentPage = JSON.parse(readFileSync(nextPagePath, 'utf-8'));
        } else {
          currentPage = null;
        }
      } else {
        currentPage = null;
      }
    }
  }
  
  return items;
}

/**
 * Filter items based on bundle criteria
 */
function filterItems(items: SectionIndexItem[], bundle: BundleDefinition): SectionIndexItem[] {
  return items.filter(item => {
    // Filter by kind
    if (!bundle.includeKinds.includes(item.kind)) {
      return false;
    }
    
    // Filter by scenario
    if (bundle.filters.scenario && item.scenario !== bundle.filters.scenario) {
      return false;
    }
    
    // Filter by levels
    if (bundle.filters.levels && bundle.filters.levels.length > 0) {
      if (!bundle.filters.levels.includes(item.level)) {
        return false;
      }
    }
    
    // Filter by register
    if (bundle.filters.register && item.register !== bundle.filters.register) {
      return false;
    }
    
    // Filter by primaryStructure
    if (bundle.filters.primaryStructure && item.primaryStructure !== bundle.filters.primaryStructure) {
      return false;
    }
    
    return true;
  });
}

/**
 * Validate bundle
 */
function validateBundle(bundlePath: string, bundle: BundleDefinition): void {
  console.log(`\n📦 Validating: ${bundle.id}`);
  
  // Check workspace exists
  const workspacePath = join(CONTENT_DIR, 'workspaces', bundle.workspace);
  if (!existsSync(workspacePath)) {
    addError(`Workspace "${bundle.workspace}" does not exist`);
    return;
  }
  
  // Load items and check filters produce results
  const allItems = loadSectionIndexes(bundle.workspace);
  const filteredItems = filterItems(allItems, bundle);
  
  if (filteredItems.length === 0) {
    addError(`Bundle filters produce 0 items. Check filters: ${JSON.stringify(bundle.filters)}`);
  } else {
    console.log(`   ✅ Filters produce ${filteredItems.length} item(s)`);
    
    // Check for duplicate (kind, id) pairs
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const item of filteredItems) {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
    
    if (duplicates.length > 0) {
      addError(`Duplicate items found: ${duplicates.join(', ')}`);
    }
    
    // Check all entry URLs exist
    let missingEntries = 0;
    for (const item of filteredItems) {
      const match = item.entryUrl.match(/\/v1\/workspaces\/([^/]+)\/(packs|drills|exams)\/([^/]+)\/(pack|drill|exam)\.json$/);
      if (match) {
        const [, workspace, section, itemId] = match;
        const entryPath = join(CONTENT_DIR, 'workspaces', workspace, section, itemId, `${section.slice(0, -1)}.json`);
        if (!existsSync(entryPath)) {
          missingEntries++;
          addWarning(`Entry document not found: ${item.entryUrl}`);
        }
      }
    }
    
    if (missingEntries === 0) {
      console.log(`   ✅ All ${filteredItems.length} entry documents exist`);
    }
  }
  
  // Validate ordering is stable
  if (!bundle.ordering.stable) {
    addError('ordering.stable must be true');
  }
  
  // Validate ordering keys are valid
  const validOrderKeys = ['level', 'kind', 'title', 'scenario', 'primaryStructure'];
  for (const key of bundle.ordering.by) {
    if (!validOrderKeys.includes(key)) {
      addError(`Invalid ordering key: ${key} (must be one of: ${validOrderKeys.join(', ')})`);
    }
  }
}

/**
 * Main validation
 */
function validateBundles(): void {
  console.log('🔍 Validating Bundle Definitions\n');
  
  if (!existsSync(BUNDLES_DIR)) {
    console.log('No bundles directory found.');
    return;
  }
  
  const files = readdirSync(BUNDLES_DIR)
    .filter(file => file.endsWith('.json'))
    .filter(file => {
      const filePath = join(BUNDLES_DIR, file);
      return statSync(filePath).isFile();
    });
  
  if (files.length === 0) {
    console.log('No bundle definitions found.');
    return;
  }
  
  for (const file of files) {
    const filePath = join(BUNDLES_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const bundle = JSON.parse(content);
      
      // Basic schema validation
      if (bundle.version !== 1) {
        addError(`${file}: Invalid version: ${bundle.version} (expected 1)`);
        continue;
      }
      
      if (!bundle.id || !bundle.workspace || !bundle.title || !bundle.filters || !bundle.includeKinds || !bundle.ordering) {
        addError(`${file}: Missing required fields`);
        continue;
      }
      
      // Validate bundle
      validateBundle(filePath, bundle);
    } catch (err: any) {
      addError(`${file}: Failed to parse: ${err.message}`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  if (errorCount === 0) {
    console.log('✅ All bundles are valid!');
  } else {
    console.log(`❌ Validation failed with ${errorCount} error(s)`);
    process.exit(1);
  }
}

validateBundles();

