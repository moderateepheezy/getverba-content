#!/usr/bin/env tsx

/**
 * List Bundles
 * 
 * Lists all available bundle definitions and validates their schema.
 * 
 * Usage:
 *   tsx scripts/list-bundles.ts
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUNDLES_DIR = join(__dirname, '..', 'content', 'meta', 'bundles');

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

/**
 * Validate bundle schema
 */
function validateBundleSchema(bundle: any, filePath: string): string[] {
  const errors: string[] = [];
  
  if (bundle.version !== 1) {
    errors.push(`Invalid version: ${bundle.version} (expected 1)`);
  }
  
  if (!bundle.id || typeof bundle.id !== 'string') {
    errors.push('Missing or invalid id field');
  }
  
  if (!bundle.workspace || typeof bundle.workspace !== 'string') {
    errors.push('Missing or invalid workspace field');
  }
  
  if (!bundle.title || typeof bundle.title !== 'string') {
    errors.push('Missing or invalid title field');
  }
  
  if (!bundle.description || typeof bundle.description !== 'string') {
    errors.push('Missing or invalid description field');
  }
  
  if (!bundle.filters || typeof bundle.filters !== 'object') {
    errors.push('Missing or invalid filters field');
  }
  
  if (!Array.isArray(bundle.includeKinds) || bundle.includeKinds.length === 0) {
    errors.push('Missing or invalid includeKinds field (must be non-empty array)');
  } else {
    const validKinds = ['pack', 'drill', 'exam'];
    for (const kind of bundle.includeKinds) {
      if (!validKinds.includes(kind)) {
        errors.push(`Invalid kind in includeKinds: ${kind} (must be one of: ${validKinds.join(', ')})`);
      }
    }
  }
  
  if (!bundle.ordering || typeof bundle.ordering !== 'object') {
    errors.push('Missing or invalid ordering field');
  } else {
    if (!Array.isArray(bundle.ordering.by) || bundle.ordering.by.length === 0) {
      errors.push('Missing or invalid ordering.by field (must be non-empty array)');
    }
    if (bundle.ordering.stable !== true) {
      errors.push('ordering.stable must be true (deterministic ordering required)');
    }
  }
  
  return errors;
}

/**
 * List all bundles
 */
function listBundles(): void {
  console.log('📦 Available Bundles\n');
  console.log('='.repeat(60));
  
  if (!existsSync(BUNDLES_DIR)) {
    console.log('No bundles directory found. Create bundles in: content/meta/bundles/');
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
  
  const bundles: Array<{ file: string; bundle: BundleDefinition; errors: string[] }> = [];
  
  for (const file of files) {
    const filePath = join(BUNDLES_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const bundle = JSON.parse(content);
      const errors = validateBundleSchema(bundle, filePath);
      bundles.push({ file, bundle, errors });
    } catch (err: any) {
      bundles.push({ file, bundle: {} as BundleDefinition, errors: [`Failed to parse: ${err.message}`] });
    }
  }
  
  // Sort by workspace, then by ID
  bundles.sort((a, b) => {
    const wsA = a.bundle.workspace || '';
    const wsB = b.bundle.workspace || '';
    if (wsA !== wsB) {
      return wsA.localeCompare(wsB);
    }
    const idA = a.bundle.id || '';
    const idB = b.bundle.id || '';
    return idA.localeCompare(idB);
  });
  
  let validCount = 0;
  let invalidCount = 0;
  
  for (const { file, bundle, errors } of bundles) {
    if (errors.length === 0) {
      validCount++;
      console.log(`\n✅ ${bundle.id || file}`);
      console.log(`   Workspace: ${bundle.workspace || 'N/A'}`);
      console.log(`   Title: ${bundle.title || 'N/A'}`);
      if (bundle.filters) {
        const filterParts: string[] = [];
        if (bundle.filters.scenario) filterParts.push(`scenario: ${bundle.filters.scenario}`);
        if (bundle.filters.levels) filterParts.push(`levels: ${bundle.filters.levels.join(', ')}`);
        if (bundle.filters.register) filterParts.push(`register: ${bundle.filters.register}`);
        if (bundle.filters.primaryStructure) filterParts.push(`primaryStructure: ${bundle.filters.primaryStructure}`);
        if (filterParts.length > 0) {
          console.log(`   Filters: ${filterParts.join(', ')}`);
        }
      }
      console.log(`   Kinds: ${(bundle.includeKinds || []).join(', ')}`);
      console.log(`   File: ${file}`);
    } else {
      invalidCount++;
      console.log(`\n❌ ${file}`);
      for (const error of errors) {
        console.log(`   Error: ${error}`);
      }
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary: ${validCount} valid, ${invalidCount} invalid`);
  
  if (invalidCount > 0) {
    process.exit(1);
  }
}

listBundles();

