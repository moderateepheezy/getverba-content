#!/usr/bin/env tsx

/**
 * Apply Token Patch
 * 
 * Applies a token mining patch to scenario dictionaries.
 * Updates dictionaries, preserves sorting, deduplicates, and runs quality checks.
 * 
 * Usage:
 *   tsx scripts/apply-token-patch.ts --file reports/token-mining/deutschimblick/2025-01-01/suggested-dictionary.patch.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { normalizeForMatching } from './pdf-ingestion/textNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

interface TokenPatchSuggestion {
  scenario: string;
  addTokens: Array<{
    token: string;
    strength: 'strong' | 'medium' | 'weak';
    reason: string;
    score: number;
    frequency: number;
    examples: string[];
  }>;
}

interface TokenPatch {
  workspace: string;
  profileId: string;
  generatedAt: string;
  suggestions: TokenPatchSuggestion[];
}

// Files to update (key files with SCENARIO_TOKEN_DICTS)
const FILES_TO_UPDATE = [
  'scripts/content-quality/computeAnalytics.ts',
  'scripts/pdf-ingestion/pdf-to-packs-batch.ts',
  'scripts/pdf-ingestion/tokenMining.ts',
  'scripts/content-quality/coherence-report.ts'
];

/**
 * Parse CLI arguments
 */
function parseArgs(): { file: string } {
  let patchFile = '';
  
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];
    
    if (arg === '--file' && next) {
      patchFile = next;
      i++;
    }
  }
  
  if (!patchFile) {
    throw new Error('Missing required: --file');
  }
  
  return { file: patchFile };
}

/**
 * Update scenario token dictionary in a file
 */
function updateDictionaryInFile(
  filePath: string,
  scenario: string,
  newTokens: string[]
): boolean {
  if (!existsSync(filePath)) {
    console.warn(`   ⚠️  File not found: ${filePath}`);
    return false;
  }
  
  let content = readFileSync(filePath, 'utf-8');
  
  // Find SCENARIO_TOKEN_DICTS block
  const dictRegex = new RegExp(
    `(const SCENARIO_TOKEN_DICTS[^}]+${scenario}:\\s*\\[)([^\\]]+)(\\][^}]*?)`,
    's'
  );
  
  const match = content.match(dictRegex);
  if (!match) {
    console.warn(`   ⚠️  Scenario "${scenario}" not found in ${filePath}`);
    return false;
  }
  
  // Extract existing tokens
  const existingTokens = match[2]
    .split(',')
    .map(t => t.trim().replace(/['"]/g, ''))
    .filter(t => t.length > 0);
  
  // Merge and dedupe (normalize for matching)
  const existingNormalized = existingTokens.map(t => normalizeForMatching(t));
  const newTokensNormalized = newTokens.map(t => normalizeForMatching(t));
  
  const merged: string[] = [];
  const seen = new Set<string>();
  
  // Add existing tokens
  for (const token of existingTokens) {
    const normalized = normalizeForMatching(token);
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  // Add new tokens (not already present)
  for (const token of newTokens) {
    const normalized = normalizeForMatching(token);
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  // Sort alphabetically (case-insensitive)
  merged.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  
  // Rebuild array
  const tokensStr = merged.map(t => `'${t.replace(/'/g, "\\'")}'`).join(', ');
  const newDict = match[1] + '\n    ' + tokensStr + '\n  ' + match[3];
  
  content = content.replace(dictRegex, newDict);
  writeFileSync(filePath, content, 'utf-8');
  
  return true;
}

/**
 * Main execution
 */
function main() {
  try {
    const args = parseArgs();
    
    if (!existsSync(args.file)) {
      throw new Error(`Patch file not found: ${args.file}`);
    }
    
    // Load patch
    console.log('📋 Loading token patch...');
    const patchContent = readFileSync(args.file, 'utf-8');
    const patch: TokenPatch = JSON.parse(patchContent);
    
    console.log(`   Profile ID: ${patch.profileId}`);
    console.log(`   Workspace: ${patch.workspace}`);
    console.log(`   Scenarios: ${patch.suggestions.map(s => s.scenario).join(', ')}`);
    console.log('');
    
    // Apply each suggestion
    console.log('📝 Applying patch...');
    let totalAdded = 0;
    
    for (const suggestion of patch.suggestions) {
      const tokensToAdd = suggestion.addTokens.map(t => t.token);
      console.log(`   ${suggestion.scenario}: ${tokensToAdd.length} tokens`);
      
      // Update each file
      let updatedCount = 0;
      for (const file of FILES_TO_UPDATE) {
        const filePath = join(PROJECT_ROOT, file);
        if (updateDictionaryInFile(filePath, suggestion.scenario, tokensToAdd)) {
          updatedCount++;
        }
      }
      
      if (updatedCount > 0) {
        console.log(`     ✓ Updated ${updatedCount} file(s)`);
        totalAdded += tokensToAdd.length;
      } else {
        console.warn(`     ⚠️  No files updated for scenario "${suggestion.scenario}"`);
      }
    }
    
    console.log('');
    console.log(`✅ Patch applied: ${totalAdded} tokens added`);
    console.log('');
    
    // Run quality checks
    console.log('🔍 Running quality checks...');
    try {
      execSync('npm run content:quality', {
        cwd: PROJECT_ROOT,
        stdio: 'inherit'
      });
      console.log('   ✓ Quality checks passed');
    } catch (error: any) {
      console.error('   ❌ Quality checks failed');
      throw error;
    }
    console.log('');
    
    // Run tests
    console.log('🧪 Running tests...');
    try {
      execSync('npm test', {
        cwd: PROJECT_ROOT,
        stdio: 'inherit'
      });
      console.log('   ✓ Tests passed');
    } catch (error: any) {
      console.error('   ❌ Tests failed');
      throw error;
    }
    console.log('');
    
    console.log('✅ Token patch applied successfully!');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Review updated files');
    console.log('   2. Re-run batch generation to verify improvement');
    console.log('');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

