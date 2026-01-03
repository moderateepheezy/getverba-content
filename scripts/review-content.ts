#!/usr/bin/env tsx

/**
 * Content Review Harness
 * 
 * Hard-fails if any pack has placeholder content or missing required fields.
 * This is the "ship readiness" gate, separate from schema validation and quality gates.
 * 
 * Usage:
 *   npm run content:review [--workspace <ws>]
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface ReviewError {
  file: string;
  packId: string;
  field: string;
  message: string;
}

interface ReviewWarning {
  file: string;
  packId: string;
  field: string;
  message: string;
}

const errors: ReviewError[] = [];
const warnings: ReviewWarning[] = [];

// Generic goal denylist (extendable)
const GENERIC_GOAL_DENYLIST = [
  'practice german',
  'learn german',
  'study german',
  'improve german',
  'practice language',
  'learn language',
  'study language',
  'improve language',
  'practice speaking',
  'practice grammar',
  'practice vocabulary',
  'generic practice',
  'basic practice',
  'simple practice',
  'general practice',
  'placeholder',
  'todo',
  'fixme',
  'tbd',
  'to be determined'
];

/**
 * Check if analytics contains TODO (case-insensitive)
 */
function containsTodo(analytics: any): boolean {
  if (!analytics || typeof analytics !== 'object') {
    return false;
  }
  
  const analyticsStr = JSON.stringify(analytics).toLowerCase();
  return analyticsStr.includes('todo') || analyticsStr.includes('fixme') || analyticsStr.includes('tbd');
}

/**
 * Check if goal is generic (matches denylist)
 */
function isGenericGoal(goal: string): boolean {
  if (!goal || typeof goal !== 'string') {
    return true; // Empty goal is considered generic
  }
  
  const goalLower = goal.toLowerCase().trim();
  
  // Check against denylist
  for (const phrase of GENERIC_GOAL_DENYLIST) {
    if (goalLower.includes(phrase)) {
      return true;
    }
  }
  
  // Check if goal is too short (likely placeholder)
  if (goalLower.length < 10) {
    return true;
  }
  
  return false;
}

/**
 * Review a pack entry
 */
function reviewPack(entryPath: string, packId: string): void {
  try {
    const content = readFileSync(entryPath, 'utf-8');
    const entry = JSON.parse(content);
    
    // Rule 1: Check analytics for TODO
    if (entry.analytics) {
      if (containsTodo(entry.analytics)) {
        errors.push({
          file: entryPath,
          packId: packId,
          field: 'analytics',
          message: 'analytics block contains TODO/FIXME/TBD placeholder'
        });
      }
      
      // Rule 2: Check goal is not generic
      if (entry.analytics.goal) {
        if (isGenericGoal(entry.analytics.goal)) {
          errors.push({
            file: entryPath,
            packId: packId,
            field: 'analytics.goal',
            message: `goal is too generic or matches denylist: "${entry.analytics.goal}"`
          });
        }
      } else {
        errors.push({
          file: entryPath,
          packId: packId,
          field: 'analytics.goal',
          message: 'analytics.goal is missing'
        });
      }
    } else {
      errors.push({
        file: entryPath,
        packId: packId,
        field: 'analytics',
        message: 'analytics block is missing'
      });
    }
    
    // Rule 3: Check required metadata fields
    if (!entry.scenario || typeof entry.scenario !== 'string' || entry.scenario.trim() === '') {
      errors.push({
        file: entryPath,
        packId: packId,
        field: 'scenario',
        message: 'scenario is missing or empty'
      });
    }
    
    if (!entry.register || typeof entry.register !== 'string' || entry.register.trim() === '') {
      errors.push({
        file: entryPath,
        packId: packId,
        field: 'register',
        message: 'register is missing or empty'
      });
    }
    
    if (!entry.primaryStructure || typeof entry.primaryStructure !== 'string' || entry.primaryStructure.trim() === '') {
      errors.push({
        file: entryPath,
        packId: packId,
        field: 'primaryStructure',
        message: 'primaryStructure is missing or empty'
      });
    }
    
    if (!Array.isArray(entry.variationSlots) || entry.variationSlots.length === 0) {
      errors.push({
        file: entryPath,
        packId: packId,
        field: 'variationSlots',
        message: 'variationSlots is missing or empty array'
      });
    }
    
    // Rule 4: Check sessionPlan
    if (!entry.sessionPlan || typeof entry.sessionPlan !== 'object') {
      errors.push({
        file: entryPath,
        packId: packId,
        field: 'sessionPlan',
        message: 'sessionPlan is missing or invalid'
      });
    } else {
      if (entry.sessionPlan.version !== 1) {
        errors.push({
          file: entryPath,
          packId: packId,
          field: 'sessionPlan.version',
          message: `sessionPlan.version must be 1, got ${entry.sessionPlan.version}`
        });
      }
      
      if (!Array.isArray(entry.sessionPlan.steps) || entry.sessionPlan.steps.length === 0) {
        errors.push({
          file: entryPath,
          packId: packId,
          field: 'sessionPlan.steps',
          message: 'sessionPlan.steps is missing or empty array'
        });
      } else {
        // Validate each step
        entry.sessionPlan.steps.forEach((step: any, idx: number) => {
          if (!step.id || typeof step.id !== 'string') {
            errors.push({
              file: entryPath,
              packId: packId,
              field: `sessionPlan.steps[${idx}].id`,
              message: 'step id is missing or invalid'
            });
          }
          
          if (!step.title || typeof step.title !== 'string') {
            errors.push({
              file: entryPath,
              packId: packId,
              field: `sessionPlan.steps[${idx}].title`,
              message: 'step title is missing or invalid'
            });
          }
          
          if (!Array.isArray(step.promptIds) || step.promptIds.length === 0) {
            errors.push({
              file: entryPath,
              packId: packId,
              field: `sessionPlan.steps[${idx}].promptIds`,
              message: 'step promptIds is missing or empty array'
            });
          }
        });
      }
    }
    
    // Rule 5: Check outline
    if (!Array.isArray(entry.outline) || entry.outline.length === 0) {
      errors.push({
        file: entryPath,
        packId: packId,
        field: 'outline',
        message: 'outline is missing or empty array'
      });
    }
    
    // Rule 6: Check prompts for gloss_en and intent
    if (entry.prompts && Array.isArray(entry.prompts)) {
      entry.prompts.forEach((prompt: any, idx: number) => {
        if (!prompt.gloss_en || typeof prompt.gloss_en !== 'string' || prompt.gloss_en.trim() === '') {
          errors.push({
            file: entryPath,
            packId: packId,
            field: `prompts[${idx}].gloss_en`,
            message: `prompt ${prompt.id || idx} is missing gloss_en`
          });
        }
        
        if (!prompt.intent || typeof prompt.intent !== 'string' || prompt.intent.trim() === '') {
          errors.push({
            file: entryPath,
            packId: packId,
            field: `prompts[${idx}].intent`,
            message: `prompt ${prompt.id || idx} is missing intent`
          });
        }
      });
    } else if (!entry.promptsUrl) {
      // If no prompts array and no promptsUrl, that's a problem
      warnings.push({
        file: entryPath,
        packId: packId,
        field: 'prompts',
        message: 'pack has no prompts array and no promptsUrl (may be intentional)'
      });
    }
    
  } catch (error: any) {
    errors.push({
      file: entryPath,
      packId: packId,
      field: 'parse',
      message: `Failed to parse pack: ${error.message}`
    });
  }
}

/**
 * Load all packs from a workspace
 */
function loadAllPacks(workspaceId: string): string[] {
  const packsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'packs');
  const packPaths: string[] = [];
  
  if (!existsSync(packsDir)) {
    return packPaths;
  }
  
  const entries = readdirSync(packsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    // Skip test packs
    if (entry.name.startsWith('test-')) {
      continue;
    }
    
    const packPath = join(packsDir, entry.name, 'pack.json');
    if (existsSync(packPath)) {
      packPaths.push(packPath);
    }
  }
  
  return packPaths;
}

/**
 * Review workspace
 */
function reviewWorkspace(workspaceId: string): void {
  const packPaths = loadAllPacks(workspaceId);
  
  console.log(`📦 Reviewing ${packPaths.length} pack(s) in workspace ${workspaceId}...`);
  
  for (const packPath of packPaths) {
    // Extract packId from path
    const packId = packPath.split('/').slice(-2, -1)[0];
    reviewPack(packPath, packId);
  }
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
        .filter(d => d.isDirectory() && d.name !== 'test-ws') // Exclude test-ws workspace
        .map(d => d.name);
  
  if (workspaces.length === 0) {
    console.error('❌ Error: No workspaces found');
    process.exit(1);
  }
  
  console.log(`🔍 Reviewing content for ${workspaces.length} workspace(s)...\n`);
  
  // Review each workspace
  for (const workspaceId of workspaces) {
    const workspacePath = join(workspacesDir, workspaceId);
    
    if (!existsSync(workspacePath)) {
      console.warn(`⚠️  Workspace ${workspaceId} not found, skipping`);
      continue;
    }
    
    reviewWorkspace(workspaceId);
  }
  
  // Report results
  console.log('\n📊 Review Summary:');
  console.log(`   Total packs checked: ${workspaces.reduce((sum, ws) => {
    const packs = loadAllPacks(ws);
    return sum + packs.length;
  }, 0)}`);
  console.log(`   Failures: ${errors.length}`);
  console.log(`   Warnings: ${warnings.length}`);
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(w => {
      const relPath = w.file.replace(process.cwd() + '/', '');
      console.log(`   ${w.packId} (${relPath}): ${w.field} - ${w.message}`);
    });
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Review failures:');
    errors.forEach(err => {
      const relPath = err.file.replace(process.cwd() + '/', '');
      console.log(`   ${err.packId} (${relPath}): ${err.field} - ${err.message}`);
    });
    console.log(`\n❌ Review failed with ${errors.length} error(s)`);
    process.exit(1);
  }
  
  console.log('\n✅ All packs passed review!');
}

// Run if executed directly
main();

