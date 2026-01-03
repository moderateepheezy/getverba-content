#!/usr/bin/env tsx
/**
 * Find prompts with generic/placeholder gloss_en values
 * 
 * This script identifies all prompts that have generic placeholder values
 * instead of actual translations of the German text.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Prompt {
  id: string;
  text: string;
  gloss_en?: string;
  [key: string]: any;
}

interface EntryDocument {
  id: string;
  prompts?: Prompt[];
  [key: string]: any;
}

// Generic placeholder patterns to detect
const GENERIC_PATTERNS = [
  /^I am providing information\.?$/i,
  /^I need to schedule something\.?$/i,
  /^I would like to request something\.?$/i,
  /^I am working on the project\.?$/i,
  /^I am practicing this grammar mechanic\.?$/i,
  /^Can you help me\??$/i,
  /^Here's the information\.?$/i,
  /^I'd like to request that\.?$/i,
  /^I need to schedule that\.?$/i,
  /^This is a practice sentence for learning German\.?$/i,
  /^\(gloss pending\)$/i,
];

function isGenericGlossEn(glossEn: string): boolean {
  return GENERIC_PATTERNS.some(pattern => pattern.test(glossEn.trim()));
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
    // Ignore errors
  }
  
  return files;
}

function main() {
  const contentDir = join(__dirname, '..', 'content', 'v1', 'workspaces');
  
  const packFiles = findFiles(contentDir, 'pack.json');
  const drillFiles = findFiles(contentDir, 'drill.json');
  const allFiles = [...packFiles, ...drillFiles];
  
  console.log(`Scanning ${allFiles.length} files...\n`);
  
  const results: Array<{
    file: string;
    entryId: string;
    promptId: string;
    text: string;
    glossEn: string;
  }> = [];
  
  for (const filePath of allFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const entry: EntryDocument = JSON.parse(content);
      
      if (!entry.prompts || !Array.isArray(entry.prompts)) {
        continue;
      }
      
      for (const prompt of entry.prompts) {
        if (prompt.gloss_en && typeof prompt.gloss_en === 'string') {
          if (isGenericGlossEn(prompt.gloss_en)) {
            results.push({
              file: filePath.replace(process.cwd() + '/', ''),
              entryId: entry.id,
              promptId: prompt.id,
              text: prompt.text,
              glossEn: prompt.gloss_en,
            });
          }
        }
      }
    } catch (err) {
      // Skip invalid files
    }
  }
  
  // Group by generic pattern
  const byPattern: Record<string, typeof results> = {};
  
  for (const result of results) {
    const pattern = GENERIC_PATTERNS.find(p => p.test(result.glossEn.trim()))?.toString() || 'other';
    if (!byPattern[pattern]) {
      byPattern[pattern] = [];
    }
    byPattern[pattern].push(result);
  }
  
  console.log('Summary:');
  console.log(`  Total prompts with generic gloss_en: ${results.length}`);
  console.log(`  Total files affected: ${new Set(results.map(r => r.file)).size}`);
  console.log('');
  
  console.log('Breakdown by pattern:');
  for (const [pattern, items] of Object.entries(byPattern)) {
    const patternName = pattern.replace(/^\/\^?|\$?\/[gi]*$/g, '');
    console.log(`  "${patternName}": ${items.length} prompts`);
  }
  console.log('');
  
  // Show examples
  console.log('Examples (first 20):');
  results.slice(0, 20).forEach((result, idx) => {
    console.log(`\n${idx + 1}. ${result.file}`);
    console.log(`   Entry: ${result.entryId}`);
    console.log(`   Prompt: ${result.promptId}`);
    console.log(`   German: "${result.text}"`);
    console.log(`   Current gloss_en: "${result.glossEn}"`);
  });
  
  if (results.length > 20) {
    console.log(`\n... and ${results.length - 20} more`);
  }
  
  console.log('\n💡 Next steps:');
  console.log('   1. Review the examples above');
  console.log('   2. Update gloss_en values to be actual translations of the German text');
  console.log('   3. Update gloss_en_i18n.en to match the new gloss_en');
  console.log('   4. Consider using a translation service or manual review for accuracy');
}

main();

