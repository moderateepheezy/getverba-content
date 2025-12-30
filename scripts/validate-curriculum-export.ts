#!/usr/bin/env tsx

/**
 * Curriculum Export v2 Validator
 * 
 * Validates curriculum export files for schema correctness, referential integrity,
 * and coverage requirements.
 * 
 * Usage:
 *   npm run content:validate-curriculum [--workspace <ws>]
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  CurriculumExportV2,
  CurriculumBundleV2,
  CurriculumModuleV2
} from './exports/curriculumExportTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const EXPORTS_DIR = join(__dirname, '..', 'exports');
const META_DIR = join(__dirname, '..', 'content', 'meta');

// Configuration constants (must match generator)
const MIN_PACKS_PER_BUNDLE = 3;
const MIN_PRIMARY_STRUCTURES_PER_BUNDLE = 2;
const MIN_BUNDLE_MINUTES = 15;
const MAX_BUNDLE_MINUTES = 180;

interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  bundleId?: string;
  moduleId?: string;
  itemId?: string;
}

/**
 * Validate schema correctness
 */
function validateSchema(export_: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Check version
  if (export_.version !== 2) {
    errors.push({
      type: 'error',
      message: `Invalid version: expected 2, got ${export_.version}`
    });
  }
  
  // Check required fields
  if (!export_.exportedAt || typeof export_.exportedAt !== 'string') {
    errors.push({
      type: 'error',
      message: 'Missing or invalid exportedAt field'
    });
  }
  
  if (!export_.gitSha || typeof export_.gitSha !== 'string') {
    errors.push({
      type: 'error',
      message: 'Missing or invalid gitSha field'
    });
  }
  
  if (!export_.workspace || typeof export_.workspace !== 'string') {
    errors.push({
      type: 'error',
      message: 'Missing or invalid workspace field'
    });
  }
  
  if (!Array.isArray(export_.bundles)) {
    errors.push({
      type: 'error',
      message: 'Missing or invalid bundles array'
    });
    return errors; // Can't continue without bundles
  }
  
  // Validate each bundle
  for (const bundle of export_.bundles) {
    if (!bundle.id || typeof bundle.id !== 'string') {
      errors.push({
        type: 'error',
        message: 'Bundle missing id field',
        bundleId: bundle.id
      });
    }
    
    if (!bundle.title || typeof bundle.title !== 'string') {
      errors.push({
        type: 'error',
        message: 'Bundle missing title field',
        bundleId: bundle.id
      });
    }
    
    if (!bundle.level || !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(bundle.level)) {
      errors.push({
        type: 'error',
        message: `Bundle has invalid level: ${bundle.level}`,
        bundleId: bundle.id
      });
    }
    
    if (!Array.isArray(bundle.outcomes)) {
      errors.push({
        type: 'error',
        message: 'Bundle missing outcomes array',
        bundleId: bundle.id
      });
    }
    
    if (!Array.isArray(bundle.primaryStructures)) {
      errors.push({
        type: 'error',
        message: 'Bundle missing primaryStructures array',
        bundleId: bundle.id
      });
    }
    
    if (typeof bundle.estimatedMinutes !== 'number') {
      errors.push({
        type: 'error',
        message: 'Bundle missing or invalid estimatedMinutes',
        bundleId: bundle.id
      });
    }
    
    if (!Array.isArray(bundle.modules)) {
      errors.push({
        type: 'error',
        message: 'Bundle missing modules array',
        bundleId: bundle.id
      });
      continue; // Can't validate modules without array
    }
    
    // Validate modules
    for (const module of bundle.modules) {
      if (!module.id || typeof module.id !== 'string') {
        errors.push({
          type: 'error',
          message: 'Module missing id field',
          bundleId: bundle.id,
          moduleId: module.id
        });
      }
      
      if (!module.title || typeof module.title !== 'string') {
        errors.push({
          type: 'error',
          message: 'Module missing title field',
          bundleId: bundle.id,
          moduleId: module.id
        });
      }
      
      if (!Array.isArray(module.items)) {
        errors.push({
          type: 'error',
          message: 'Module missing items array',
          bundleId: bundle.id,
          moduleId: module.id
        });
        continue;
      }
      
      // Validate items
      for (const item of module.items) {
        if (!item.kind || !['pack', 'drill', 'exam'].includes(item.kind)) {
          errors.push({
            type: 'error',
            message: `Item has invalid kind: ${item.kind}`,
            bundleId: bundle.id,
            moduleId: module.id,
            itemId: item.id
          });
        }
        
        if (!item.id || typeof item.id !== 'string') {
          errors.push({
            type: 'error',
            message: 'Item missing id field',
            bundleId: bundle.id,
            moduleId: module.id,
            itemId: item.id
          });
        }
        
        if (!item.entryUrl || typeof item.entryUrl !== 'string') {
          errors.push({
            type: 'error',
            message: 'Item missing entryUrl field',
            bundleId: bundle.id,
            moduleId: module.id,
            itemId: item.id
          });
        }
        
        if (item.entryUrl && !item.entryUrl.startsWith('/v1/')) {
          errors.push({
            type: 'error',
            message: `Item entryUrl must start with /v1/: ${item.entryUrl}`,
            bundleId: bundle.id,
            moduleId: module.id,
            itemId: item.id
          });
        }
      }
    }
  }
  
  return errors;
}

/**
 * Validate referential integrity (all referenced items exist)
 */
function validateReferentialIntegrity(export_: CurriculumExportV2): ValidationError[] {
  const errors: ValidationError[] = [];
  const workspace = export_.workspace;
  
  for (const bundle of export_.bundles) {
    for (const module of bundle.modules) {
      for (const item of module.items) {
        // Resolve entry URL to local file
        const relativePath = item.entryUrl.replace(/^\/v1\//, '');
        const entryPath = join(CONTENT_DIR, relativePath);
        
        if (!existsSync(entryPath)) {
          errors.push({
            type: 'error',
            message: `Referenced item does not exist: ${item.entryUrl}`,
            bundleId: bundle.id,
            moduleId: module.id,
            itemId: item.id
          });
          continue;
        }
        
        // Validate entry document structure
        try {
          const content = readFileSync(entryPath, 'utf-8');
          const entry = JSON.parse(content);
          
          if (entry.id !== item.id) {
            errors.push({
              type: 'error',
              message: `Item ID mismatch: entry has ${entry.id}, reference has ${item.id}`,
              bundleId: bundle.id,
              moduleId: module.id,
              itemId: item.id
            });
          }
          
          if (entry.kind !== item.kind) {
            errors.push({
              type: 'error',
              message: `Item kind mismatch: entry has ${entry.kind}, reference has ${item.kind}`,
              bundleId: bundle.id,
              moduleId: module.id,
              itemId: item.id
            });
          }
        } catch (error: any) {
          errors.push({
            type: 'error',
            message: `Failed to read entry document: ${error.message}`,
            bundleId: bundle.id,
            moduleId: module.id,
            itemId: item.id
          });
        }
      }
    }
  }
  
  return errors;
}

/**
 * Validate no duplicate entryUrls
 */
function validateNoDuplicates(export_: CurriculumExportV2): ValidationError[] {
  const errors: ValidationError[] = [];
  const entryUrlSet = new Set<string>();
  
  for (const bundle of export_.bundles) {
    for (const module of bundle.modules) {
      for (const item of module.items) {
        if (entryUrlSet.has(item.entryUrl)) {
          errors.push({
            type: 'error',
            message: `Duplicate entryUrl: ${item.entryUrl}`,
            bundleId: bundle.id,
            moduleId: module.id,
            itemId: item.id
          });
        }
        entryUrlSet.add(item.entryUrl);
      }
    }
  }
  
  return errors;
}

/**
 * Validate bundle coverage requirements
 */
function validateCoverage(export_: CurriculumExportV2): ValidationError[] {
  const errors: ValidationError[] = [];
  
  for (const bundle of export_.bundles) {
    // Count packs
    let packCount = 0;
    for (const module of bundle.modules) {
      for (const item of module.items) {
        if (item.kind === 'pack') {
          packCount++;
        }
      }
    }
    
    if (packCount < MIN_PACKS_PER_BUNDLE) {
      errors.push({
        type: 'error',
        message: `Bundle has only ${packCount} packs (minimum ${MIN_PACKS_PER_BUNDLE})`,
        bundleId: bundle.id
      });
    }
    
    // Check primary structures
    if (bundle.primaryStructures.length < MIN_PRIMARY_STRUCTURES_PER_BUNDLE) {
      errors.push({
        type: 'error',
        message: `Bundle has only ${bundle.primaryStructures.length} primary structures (minimum ${MIN_PRIMARY_STRUCTURES_PER_BUNDLE})`,
        bundleId: bundle.id
      });
    }
    
    // Check estimated minutes
    if (bundle.estimatedMinutes < MIN_BUNDLE_MINUTES) {
      errors.push({
        type: 'error',
        message: `Bundle has only ${bundle.estimatedMinutes} minutes (minimum ${MIN_BUNDLE_MINUTES})`,
        bundleId: bundle.id
      });
    }
    
    if (bundle.estimatedMinutes > MAX_BUNDLE_MINUTES) {
      errors.push({
        type: 'error',
        message: `Bundle has ${bundle.estimatedMinutes} minutes (maximum ${MAX_BUNDLE_MINUTES})`,
        bundleId: bundle.id
      });
    }
    
    // Validate outcomes count
    if (bundle.outcomes.length < 3) {
      errors.push({
        type: 'warning',
        message: `Bundle has only ${bundle.outcomes.length} outcomes (recommended minimum 3)`,
        bundleId: bundle.id
      });
    }
    
    if (bundle.outcomes.length > 8) {
      errors.push({
        type: 'warning',
        message: `Bundle has ${bundle.outcomes.length} outcomes (recommended maximum 8)`,
        bundleId: bundle.id
      });
    }
  }
  
  return errors;
}

/**
 * Main validation function
 */
function validateExport(workspace: string): boolean {
  console.log(`🔍 Validating curriculum export for workspace: ${workspace}`);
  
  const jsonPath = join(EXPORTS_DIR, `curriculum.v2.${workspace}.json`);
  
  if (!existsSync(jsonPath)) {
    console.error(`❌ Export file not found: ${jsonPath}`);
    console.error(`   Run: npm run content:export-curriculum -- --workspace ${workspace}`);
    return false;
  }
  
  let export_: CurriculumExportV2;
  try {
    const content = readFileSync(jsonPath, 'utf-8');
    export_ = JSON.parse(content);
  } catch (error: any) {
    console.error(`❌ Failed to parse export file: ${error.message}`);
    return false;
  }
  
  const allErrors: ValidationError[] = [];
  
  // Run all validations
  console.log('   Validating schema...');
  allErrors.push(...validateSchema(export_));
  
  console.log('   Validating referential integrity...');
  allErrors.push(...validateReferentialIntegrity(export_));
  
  console.log('   Validating no duplicates...');
  allErrors.push(...validateNoDuplicates(export_));
  
  console.log('   Validating coverage requirements...');
  allErrors.push(...validateCoverage(export_));
  
  // Report results
  const errors = allErrors.filter(e => e.type === 'error');
  const warnings = allErrors.filter(e => e.type === 'warning');
  
  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s):`);
    for (const warning of warnings) {
      const context = [
        warning.bundleId && `bundle=${warning.bundleId}`,
        warning.moduleId && `module=${warning.moduleId}`,
        warning.itemId && `item=${warning.itemId}`
      ].filter(Boolean).join(', ');
      console.log(`   ${warning.message}${context ? ` (${context})` : ''}`);
    }
  }
  
  if (errors.length > 0) {
    console.error(`\n❌ ${errors.length} error(s):`);
    for (const error of errors) {
      const context = [
        error.bundleId && `bundle=${error.bundleId}`,
        error.moduleId && `module=${error.moduleId}`,
        error.itemId && `item=${error.itemId}`
      ].filter(Boolean).join(', ');
      console.error(`   ${error.message}${context ? ` (${context})` : ''}`);
    }
    return false;
  }
  
  console.log(`\n✅ Validation passed!`);
  console.log(`   ${export_.bundles.length} bundles validated`);
  if (warnings.length > 0) {
    console.log(`   ${warnings.length} warning(s) (non-blocking)`);
  }
  
  return true;
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
      console.error('Usage: validate-curriculum-export.ts --workspace <ws>');
      console.error('Example: npm run content:validate-curriculum -- --workspace de');
      process.exit(1);
    }
  }
  
  const success = validateExport(workspace);
  process.exit(success ? 0 : 1);
}

main();

