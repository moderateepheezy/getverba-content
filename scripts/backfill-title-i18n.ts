#!/usr/bin/env tsx

/**
 * Backfill Script: Populate title_i18n, shortTitle_i18n, description_i18n
 * 
 * This script traverses all content JSON files and adds i18n fields
 * based on existing English values:
 * 
 * - If `title` exists and `title_i18n` doesn't → add `title_i18n: { "en": title }`
 * - If `shortTitle` exists and `shortTitle_i18n` doesn't → add `shortTitle_i18n: { "en": shortTitle }`
 * - If `description` exists and `description_i18n` doesn't → add `description_i18n: { "en": description }`
 * 
 * The script is idempotent: running it multiple times produces the same result.
 * 
 * Usage:
 *   pnpm backfill:i18n          # Dry run (default)
 *   pnpm backfill:i18n --write  # Actually write changes
 * 
 * Options:
 *   --write     Write changes to files (default is dry run)
 *   --verbose   Show detailed logging
 *   --help      Show this help message
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface BackfillStats {
  filesScanned: number;
  filesModified: number;
  titleI18nAdded: number;
  shortTitleI18nAdded: number;
  descriptionI18nAdded: number;
  indexItemsUpdated: number;
  scenarioItemsUpdated: number;
  errors: string[];
}

const stats: BackfillStats = {
  filesScanned: 0,
  filesModified: 0,
  titleI18nAdded: 0,
  shortTitleI18nAdded: 0,
  descriptionI18nAdded: 0,
  indexItemsUpdated: 0,
  scenarioItemsUpdated: 0,
  errors: []
};

let dryRun = true;
let verbose = false;

function log(message: string) {
  console.log(message);
}

function logVerbose(message: string) {
  if (verbose) {
    console.log(`  ${message}`);
  }
}

function logError(message: string) {
  console.error(`❌ ${message}`);
  stats.errors.push(message);
}

/**
 * Recursively find all JSON files in a directory
 */
function findJsonFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!existsSync(dir)) {
    return files;
  }
  
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      files.push(...findJsonFiles(fullPath));
    } else if (entry.isFile() && extname(entry.name) === '.json') {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Add i18n fields to an object if needed
 * Returns true if any changes were made
 */
function addI18nFields(obj: any, context: string): boolean {
  let changed = false;
  
  // Add title_i18n
  if (typeof obj.title === 'string' && obj.title.trim() && !obj.title_i18n) {
    obj.title_i18n = { en: obj.title };
    stats.titleI18nAdded++;
    logVerbose(`Added title_i18n to ${context}`);
    changed = true;
  }
  
  // Add shortTitle_i18n
  if (typeof obj.shortTitle === 'string' && obj.shortTitle.trim() && !obj.shortTitle_i18n) {
    obj.shortTitle_i18n = { en: obj.shortTitle };
    stats.shortTitleI18nAdded++;
    logVerbose(`Added shortTitle_i18n to ${context}`);
    changed = true;
  }
  
  // Add description_i18n (for entry documents AND nested structures like exam parts, practice modules)
  if (typeof obj.description === 'string' && obj.description.trim() && !obj.description_i18n) {
    // Add description_i18n to:
    // 1. Entry documents (has schemaVersion or kind at root)
    // 2. Nested structures (exam parts, practice modules, etc.) - they don't have schemaVersion/kind
    // Skip index items (they typically don't have descriptions, and if they do, they're not user-facing)
    const isIndexItem = obj.items !== undefined || obj.entryUrl !== undefined;
    if (!isIndexItem) {
      obj.description_i18n = { en: obj.description };
      stats.descriptionI18nAdded++;
      logVerbose(`Added description_i18n to ${context}`);
      changed = true;
    }
  }
  
  return changed;
}

/**
 * Process index items (context index, scenario index, etc.)
 */
function processIndexItems(items: any[], filePath: string): boolean {
  let changed = false;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const context = `${relative(CONTENT_DIR, filePath)}[${i}]`;
    
    if (addI18nFields(item, context)) {
      stats.indexItemsUpdated++;
      changed = true;
    }
  }
  
  return changed;
}

/**
 * Process scenario index (scenarios.json)
 */
function processScenarioIndex(scenarios: any[], filePath: string): boolean {
  let changed = false;
  
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const context = `${relative(CONTENT_DIR, filePath)}[${i}]`;
    
    if (addI18nFields(scenario, context)) {
      stats.scenarioItemsUpdated++;
      changed = true;
    }
    
    // Also handle subtitle if present
    if (typeof scenario.subtitle === 'string' && scenario.subtitle.trim() && !scenario.subtitle_i18n) {
      scenario.subtitle_i18n = { en: scenario.subtitle };
      logVerbose(`Added subtitle_i18n to ${context}`);
      changed = true;
    }
  }
  
  return changed;
}

/**
 * Process session plan steps (they have titles too)
 */
function processSessionPlan(sessionPlan: any, filePath: string): boolean {
  let changed = false;
  
  if (!sessionPlan || !Array.isArray(sessionPlan.steps)) {
    return false;
  }
  
  for (let i = 0; i < sessionPlan.steps.length; i++) {
    const step = sessionPlan.steps[i];
    const context = `${relative(CONTENT_DIR, filePath)}.sessionPlan.steps[${i}]`;
    
    if (typeof step.title === 'string' && step.title.trim() && !step.title_i18n) {
      step.title_i18n = { en: step.title };
      logVerbose(`Added title_i18n to ${context}`);
      changed = true;
    }
  }
  
  return changed;
}

/**
 * Process exam sections (they have titles)
 */
function processExamSections(sections: any[], filePath: string): boolean {
  let changed = false;
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const context = `${relative(CONTENT_DIR, filePath)}.sections[${i}]`;
    
    if (addI18nFields(section, context)) {
      changed = true;
    }
    
    // Process parts within sections
    if (Array.isArray(section.parts)) {
      for (let j = 0; j < section.parts.length; j++) {
        const part = section.parts[j];
        const partContext = `${context}.parts[${j}]`;
        
        if (addI18nFields(part, partContext)) {
          changed = true;
        }
      }
    }
  }
  
  return changed;
}

/**
 * Process practice modules in exams
 */
function processPracticeModules(modules: any[], filePath: string): boolean {
  let changed = false;
  
  for (let i = 0; i < modules.length; i++) {
    const module = modules[i];
    const context = `${relative(CONTENT_DIR, filePath)}.practiceModules[${i}]`;
    
    if (addI18nFields(module, context)) {
      changed = true;
    }
  }
  
  return changed;
}

/**
 * Process a single JSON file
 */
function processFile(filePath: string): boolean {
  stats.filesScanned++;
  
  let content: string;
  let data: any;
  
  try {
    content = readFileSync(filePath, 'utf-8');
    data = JSON.parse(content);
  } catch (err: any) {
    logError(`Failed to parse ${relative(CONTENT_DIR, filePath)}: ${err.message}`);
    return false;
  }
  
  let changed = false;
  const relPath = relative(CONTENT_DIR, filePath);
  
  // Process based on document type
  
  // 1. Entry documents (pack.json, exam.json, drill.json)
  if (data.schemaVersion !== undefined || (data.kind && typeof data.kind === 'string')) {
    // This is an entry document
    if (addI18nFields(data, relPath)) {
      changed = true;
    }
    
    // Process session plan steps
    if (data.sessionPlan) {
      if (processSessionPlan(data.sessionPlan, filePath)) {
        changed = true;
      }
    }
    
    // Process exam sections
    if (Array.isArray(data.sections)) {
      if (processExamSections(data.sections, filePath)) {
        changed = true;
      }
    }
    
    // Process practice modules
    if (Array.isArray(data.practiceModules)) {
      if (processPracticeModules(data.practiceModules, filePath)) {
        changed = true;
      }
    }
  }
  
  // 2. Context/section indexes (have items array)
  if (Array.isArray(data.items)) {
    if (processIndexItems(data.items, filePath)) {
      changed = true;
    }
  }
  
  // 3. Scenario index (scenarios.json)
  if (Array.isArray(data.scenarios)) {
    if (processScenarioIndex(data.scenarios, filePath)) {
      changed = true;
    }
  }
  
  // Write changes if needed
  if (changed) {
    stats.filesModified++;
    
    if (dryRun) {
      log(`📝 Would modify: ${relPath}`);
    } else {
      try {
        const newContent = JSON.stringify(data, null, 2) + '\n';
        writeFileSync(filePath, newContent, 'utf-8');
        log(`✅ Modified: ${relPath}`);
      } catch (err: any) {
        logError(`Failed to write ${relPath}: ${err.message}`);
        return false;
      }
    }
  }
  
  return changed;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Backfill i18n Fields Script

Usage:
  pnpm backfill:i18n          # Dry run (default)
  pnpm backfill:i18n --write  # Actually write changes

Options:
  --write     Write changes to files (default is dry run)
  --verbose   Show detailed logging
  --help      Show this help message

This script adds i18n fields based on existing English values:
  - title → title_i18n: { "en": title }
  - shortTitle → shortTitle_i18n: { "en": shortTitle }
  - description → description_i18n: { "en": description }

The script is idempotent and only modifies files when needed.
`);
    process.exit(0);
  }
  
  dryRun = !args.includes('--write');
  verbose = args.includes('--verbose');
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           i18n Fields Backfill Script                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified');
    console.log('   Use --write to apply changes');
    console.log('');
  } else {
    console.log('✏️  WRITE MODE - Files will be modified');
    console.log('');
  }
  
  // Find all JSON files in workspaces
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  const jsonFiles = findJsonFiles(workspacesDir);
  
  console.log(`Found ${jsonFiles.length} JSON files to process...\n`);
  
  // Process each file
  for (const filePath of jsonFiles) {
    processFile(filePath);
  }
  
  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Files scanned:           ${stats.filesScanned}`);
  console.log(`  Files ${dryRun ? 'would be ' : ''}modified:    ${stats.filesModified}`);
  console.log('');
  console.log('  Fields added:');
  console.log(`    - title_i18n:          ${stats.titleI18nAdded}`);
  console.log(`    - shortTitle_i18n:     ${stats.shortTitleI18nAdded}`);
  console.log(`    - description_i18n:    ${stats.descriptionI18nAdded}`);
  console.log('');
  console.log(`  Index items updated:     ${stats.indexItemsUpdated}`);
  console.log(`  Scenario items updated:  ${stats.scenarioItemsUpdated}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (stats.errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    for (const error of stats.errors) {
      console.log(`   - ${error}`);
    }
    process.exit(1);
  }
  
  if (dryRun && stats.filesModified > 0) {
    console.log('\n💡 Run with --write to apply these changes');
  }
  
  console.log('\n✅ Backfill complete!');
}

main();

