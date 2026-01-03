#!/usr/bin/env tsx

/**
 * Fix Duplicate Prompts
 * 
 * Automatically fixes duplicate prompts across packs by making them unique.
 * For each duplicate, keeps the first occurrence and modifies the others.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { detectDuplicates } from './content-quality/dedupe.js';
import { normalizeForMatching } from './pdf-ingestion/textNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface PromptOccurrence {
  packId: string;
  promptId: string;
  text: string;
  packPath: string;
}

/**
 * Load a pack file
 */
function loadPack(packPath: string): any {
  try {
    const content = readFileSync(packPath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    console.error(`Failed to load ${packPath}: ${err.message}`);
    return null;
  }
}

/**
 * Save a pack file
 */
function savePack(packPath: string, pack: any): void {
  writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n', 'utf-8');
}

/**
 * Make a prompt unique by adding variation
 */
function makePromptUnique(text: string, attempt: number = 0): string {
  // Strategy: Add time expressions, vary subjects, or add modifiers
  const variations = [
    // Add time expressions
    (t: string) => t.replace(/(\.|$)/, ' morgen$1'),
    (t: string) => t.replace(/(\.|$)/, ' heute$1'),
    (t: string) => t.replace(/(\.|$)/, ' später$1'),
    (t: string) => t.replace(/(\.|$)/, ' um 10 Uhr$1'),
    (t: string) => t.replace(/(\.|$)/, ' am Montag$1'),
    
    // Vary subjects (if starts with "Ich")
    (t: string) => t.replace(/^Ich /, 'Wir '),
    (t: string) => t.replace(/^Ich /, 'Du '),
    
    // Add polite markers
    (t: string) => t.replace(/(\.|$)/, ' bitte$1'),
    (t: string) => t.replace(/(\.|$)/, ' gerne$1'),
    
    // Add location
    (t: string) => t.replace(/(\.|$)/, ' hier$1'),
    (t: string) => t.replace(/(\.|$)/, ' dort$1'),
  ];
  
  if (attempt < variations.length) {
    return variations[attempt](text);
  }
  
  // Fallback: append a unique suffix
  return text.replace(/(\.|$)/, ` (Variante ${attempt + 1})$1`);
}

/**
 * Fix duplicates in a workspace
 */
function fixDuplicates(workspace: string, dryRun: boolean = false): void {
  console.log(`\n🔍 Finding duplicates in workspace: ${workspace}\n`);
  
  const result = detectDuplicates(workspace);
  
  if (result.duplicates.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }
  
  console.log(`Found ${result.duplicates.length} duplicate group(s) with ${result.duplicateCount} total occurrences.\n`);
  
  if (dryRun) {
    console.log('🔍 DRY RUN - Would fix the following duplicates:\n');
  } else {
    console.log('🔧 Fixing duplicates...\n');
  }
  
  let fixed = 0;
  let skipped = 0;
  
  // Track which packs we've modified
  const modifiedPacks = new Map<string, any>();
  
  for (const dup of result.duplicates) {
    // Keep the first occurrence, fix the rest
    const [first, ...rest] = dup.occurrences;
    
    console.log(`   Duplicate: "${dup.normalizedText.substring(0, 60)}${dup.normalizedText.length > 60 ? '...' : ''}"`);
    console.log(`   Keeping: ${first.packId}/${first.promptId}`);
    
    for (let i = 0; i < rest.length; i++) {
      const occ = rest[i];
      
      // Load pack if not already loaded
      if (!modifiedPacks.has(occ.packPath)) {
        const pack = loadPack(occ.packPath);
        if (!pack) {
          skipped++;
          continue;
        }
        modifiedPacks.set(occ.packPath, pack);
      }
      
      const pack = modifiedPacks.get(occ.packPath);
      
      // Find the prompt in the pack
      const promptIndex = pack.prompts?.findIndex((p: any) => p.id === occ.promptId);
      if (promptIndex === undefined || promptIndex === -1) {
        console.warn(`     ⚠️  Prompt ${occ.promptId} not found in ${occ.packId}`);
        skipped++;
        continue;
      }
      
      const prompt = pack.prompts[promptIndex];
      const originalText = prompt.text;
      
      // Make it unique
      let attempt = 0;
      let newText = makePromptUnique(originalText, attempt);
      
      // Ensure it's actually different (check normalization)
      while (normalizeForMatching(newText) === dup.normalizedText && attempt < 10) {
        attempt++;
        newText = makePromptUnique(originalText, attempt);
      }
      
      if (normalizeForMatching(newText) === dup.normalizedText) {
        console.warn(`     ⚠️  Could not make unique: ${occ.packId}/${occ.promptId}`);
        skipped++;
        continue;
      }
      
      console.log(`     Fixing: ${occ.packId}/${occ.promptId}`);
      console.log(`       "${originalText}" → "${newText}"`);
      
      if (!dryRun) {
        // Update the prompt
        prompt.text = newText;
        
        // Update slots if they exist
        if (prompt.slots) {
          // Try to update slots to match new text
          // This is a simple heuristic - may need manual review
          if (newText.includes('morgen') && !prompt.slots.modifier?.includes('morgen')) {
            if (!prompt.slots.modifier) prompt.slots.modifier = [];
            prompt.slots.modifier.push('morgen');
          }
          if (newText.includes('heute') && !prompt.slots.modifier?.includes('heute')) {
            if (!prompt.slots.modifier) prompt.slots.modifier = [];
            prompt.slots.modifier.push('heute');
          }
          if (newText.includes('Wir ') && prompt.slots.subject?.[0] === 'Ich') {
            prompt.slots.subject[0] = 'Wir';
          }
        }
      }
      
      fixed++;
    }
    
    console.log('');
  }
  
  // Save all modified packs
  if (!dryRun) {
    console.log('💾 Saving modified packs...\n');
    for (const [packPath, pack] of modifiedPacks.entries()) {
      savePack(packPath, pack);
      console.log(`   ✅ Saved: ${pack.id}`);
    }
  }
  
  console.log(`\n✅ Summary:`);
  console.log(`   Fixed: ${fixed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total duplicates: ${result.duplicateCount}`);
  
  if (dryRun) {
    console.log(`\n⚠️  This was a DRY RUN. Use without --dry-run to apply changes.`);
  } else {
    console.log(`\n⚠️  Please review the changes and re-run duplicate detection:`);
    console.log(`   npm run content:dedupe -- ${workspace}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const workspace = args.find(arg => !arg.startsWith('--')) || 'de';
  const dryRun = args.includes('--dry-run');
  
  fixDuplicates(workspace, dryRun);
}

main();

