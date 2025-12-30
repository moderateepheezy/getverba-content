#!/usr/bin/env tsx

/**
 * Duplicate Detection
 * 
 * Detects exact duplicate prompts across all packs in a workspace.
 * Hard fails if any duplicates are found.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeForMatching } from '../pdf-ingestion/textNormalize.js';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', '..', 'content', 'v1');

interface PromptDuplicate {
  normalizedText: string;
  textHash: string;
  occurrences: Array<{
    packId: string;
    promptId: string;
    text: string;
    packPath: string;
  }>;
}

interface DedupeResult {
  duplicates: PromptDuplicate[];
  totalPrompts: number;
  uniquePrompts: number;
  duplicateCount: number;
}

/**
 * Extract all prompts from a pack file
 */
function extractPrompts(packPath: string, packId: string): Array<{ id: string; text: string }> {
  try {
    const content = readFileSync(packPath, 'utf-8');
    const pack = JSON.parse(content);
    
    if (!pack.prompts || !Array.isArray(pack.prompts)) {
      return [];
    }
    
    return pack.prompts.map((p: any) => ({
      id: p.id || 'unknown',
      text: p.text || ''
    }));
  } catch (error: any) {
    console.error(`Error reading pack ${packId}: ${error.message}`);
    return [];
  }
}

/**
 * Detect duplicates across a workspace
 */
export function detectDuplicates(workspace: string): DedupeResult {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspace);
  
  if (!existsSync(workspaceDir)) {
    throw new Error(`Workspace not found: ${workspace}`);
  }
  
  const packsDir = join(workspaceDir, 'packs');
  if (!existsSync(packsDir)) {
    return {
      duplicates: [],
      totalPrompts: 0,
      uniquePrompts: 0,
      duplicateCount: 0
    };
  }
  
  const promptMap = new Map<string, PromptDuplicate>();
  let totalPrompts = 0;
  
  // Scan all packs
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  for (const packId of packDirs) {
    const packPath = join(packsDir, packId, 'pack.json');
    if (!existsSync(packPath)) {
      continue;
    }
    
    const prompts = extractPrompts(packPath, packId);
    totalPrompts += prompts.length;
    
    for (const prompt of prompts) {
      if (!prompt.text || prompt.text.trim().length === 0) {
        continue;
      }
      
      // Normalize text for comparison
      const normalized = normalizeForMatching(prompt.text);
      const textHash = createHash('sha256').update(normalized).digest('hex').substring(0, 16);
      
      if (!promptMap.has(textHash)) {
        promptMap.set(textHash, {
          normalizedText: normalized,
          textHash,
          occurrences: []
        });
      }
      
      const duplicate = promptMap.get(textHash)!;
      duplicate.occurrences.push({
        packId,
        promptId: prompt.id,
        text: prompt.text,
        packPath
      });
    }
  }
  
  // Filter to only actual duplicates (2+ occurrences)
  const duplicates = Array.from(promptMap.values())
    .filter(d => d.occurrences.length > 1)
    .sort((a, b) => b.occurrences.length - a.occurrences.length);
  
  const duplicateCount = duplicates.reduce((sum, d) => sum + d.occurrences.length, 0);
  const uniquePrompts = totalPrompts - duplicateCount + duplicates.length; // Subtract duplicates, add back one per group
  
  return {
    duplicates,
    totalPrompts,
    uniquePrompts,
    duplicateCount
  };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: tsx scripts/content-quality/dedupe.ts <workspace>');
    console.error('Example: tsx scripts/content-quality/dedupe.ts de');
    process.exit(1);
  }
  
  const workspace = args[0];
  
  try {
    console.log(`🔍 Checking for duplicate prompts in workspace: ${workspace}`);
    console.log('');
    
    const result = detectDuplicates(workspace);
    
    console.log(`📊 Statistics:`);
    console.log(`   Total prompts: ${result.totalPrompts}`);
    console.log(`   Unique prompts: ${result.uniquePrompts}`);
    console.log(`   Duplicate occurrences: ${result.duplicateCount}`);
    console.log(`   Duplicate groups: ${result.duplicates.length}`);
    console.log('');
    
    if (result.duplicates.length > 0) {
      console.error('❌ Duplicate prompts detected:');
      console.error('');
      
      for (const dup of result.duplicates) {
        console.error(`   Hash: ${dup.textHash}`);
        console.error(`   Normalized: "${dup.normalizedText.substring(0, 80)}${dup.normalizedText.length > 80 ? '...' : ''}"`);
        console.error(`   Occurrences (${dup.occurrences.length}):`);
        for (const occ of dup.occurrences) {
          console.error(`     - ${occ.packId}/${occ.promptId}: "${occ.text.substring(0, 60)}${occ.text.length > 60 ? '...' : ''}"`);
        }
        console.error('');
      }
      
      console.error(`❌ Found ${result.duplicates.length} duplicate group(s) with ${result.duplicateCount} total occurrences.`);
      console.error('   All duplicates must be removed before publishing.');
      process.exit(1);
    } else {
      console.log('✅ No duplicates found!');
      process.exit(0);
    }
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

