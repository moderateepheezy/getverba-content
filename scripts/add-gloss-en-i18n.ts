#!/usr/bin/env tsx
/**
 * Add gloss_en_i18n to all prompts in packs and drills
 * 
 * This script ensures 100% coverage of gloss_en_i18n by adding it to all prompts
 * that have gloss_en but are missing gloss_en_i18n.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Prompt {
  id: string;
  text: string;
  gloss_en?: string;
  gloss_en_i18n?: Record<string, string>;
  [key: string]: any;
}

interface EntryDocument {
  prompts?: Prompt[];
  [key: string]: any;
}

function addGlossEnI18n(filePath: string, dryRun: boolean = false): { updated: boolean; promptCount: number } {
  const content = readFileSync(filePath, 'utf-8');
  const entry: EntryDocument = JSON.parse(content);
  
  if (!entry.prompts || !Array.isArray(entry.prompts)) {
    return { updated: false, promptCount: 0 };
  }
  
  let updated = false;
  let promptCount = 0;
  
  for (const prompt of entry.prompts) {
    if (prompt.gloss_en && typeof prompt.gloss_en === 'string') {
      promptCount++;
      
      // Add gloss_en_i18n if missing or if it doesn't have "en" key
      if (!prompt.gloss_en_i18n) {
        prompt.gloss_en_i18n = { en: prompt.gloss_en };
        updated = true;
      } else if (!prompt.gloss_en_i18n.en) {
        // Ensure "en" key exists
        prompt.gloss_en_i18n.en = prompt.gloss_en;
        updated = true;
      }
    }
  }
  
  if (updated && !dryRun) {
    // Write back with proper formatting (2 spaces indentation)
    const updatedContent = JSON.stringify(entry, null, 2) + '\n';
    writeFileSync(filePath, updatedContent, 'utf-8');
  }
  
  return { updated, promptCount };
}

function findFiles(dir: string, pattern: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        findFiles(fullPath, pattern, files);
      } else if (entry.isFile() && entry.name === pattern) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Ignore errors (permissions, etc.)
  }
  
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const write = args.includes('--write') || args.includes('-w');
  
  if (!dryRun && !write) {
    console.log('⚠️  Running in dry-run mode. Use --write to apply changes.');
    console.log('');
  }
  
  const contentDir = join(__dirname, '..', 'content', 'v1', 'workspaces');
  
  // Find all pack.json files
  const packFiles = findFiles(contentDir, 'pack.json');
  
  // Find all drill.json files
  const drillFiles = findFiles(contentDir, 'drill.json');
  
  const allFiles = [...packFiles, ...drillFiles];
  
  console.log(`Found ${packFiles.length} pack files and ${drillFiles.length} drill files`);
  console.log(`Total files to process: ${allFiles.length}`);
  console.log('');
  
  let totalUpdated = 0;
  let totalPrompts = 0;
  let filesWithUpdates: string[] = [];
  
  for (const filePath of allFiles) {
    const result = addGlossEnI18n(filePath, dryRun || !write);
    
    if (result.promptCount > 0) {
      totalPrompts += result.promptCount;
      
      if (result.updated) {
        totalUpdated++;
        filesWithUpdates.push(filePath);
        const relativePath = filePath.replace(process.cwd() + '/', '');
        console.log(`✅ ${relativePath} - ${result.promptCount} prompt(s) updated`);
      }
    }
  }
  
  console.log('');
  console.log('Summary:');
  console.log(`  Total files processed: ${allFiles.length}`);
  console.log(`  Files with updates: ${totalUpdated}`);
  console.log(`  Total prompts found: ${totalPrompts}`);
  console.log('');
  
  if (dryRun || !write) {
    console.log('ℹ️  This was a dry run. Use --write to apply changes.');
  } else {
    console.log('✅ All changes applied successfully!');
  }
  
  if (filesWithUpdates.length > 0 && (dryRun || !write)) {
    console.log('');
    console.log('Files that would be updated:');
    filesWithUpdates.slice(0, 10).forEach(f => {
      console.log(`  - ${f.replace(process.cwd() + '/', '')}`);
    });
    if (filesWithUpdates.length > 10) {
      console.log(`  ... and ${filesWithUpdates.length - 10} more`);
    }
  }
}

try {
  main();
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}

