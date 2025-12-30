#!/usr/bin/env tsx

/**
 * Duplicate Detection Script
 * 
 * Detects duplicate and near-duplicate prompts across packs.
 * 
 * Usage: npm run content:dedupe [--workspace <ws>]
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface Prompt {
  id: string;
  text: string;
  packId: string;
  packTitle: string;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate trigrams from text
 */
function generateTrigrams(text: string): Set<string> {
  const normalized = normalizeText(text);
  const trigrams = new Set<string>();
  
  for (let i = 0; i < normalized.length - 2; i++) {
    trigrams.add(normalized.substring(i, i + 3));
  }
  
  return trigrams;
}

/**
 * Compute Jaccard similarity using trigrams
 */
function trigramJaccard(text1: string, text2: string): number {
  const trigrams1 = generateTrigrams(text1);
  const trigrams2 = generateTrigrams(text2);
  
  const intersection = new Set([...trigrams1].filter(x => trigrams2.has(x)));
  const union = new Set([...trigrams1, ...trigrams2]);
  
  if (union.size === 0) return 1.0;
  return intersection.size / union.size;
}

/**
 * Load all prompts from a workspace
 */
function loadAllPrompts(workspace: string): Prompt[] {
  const prompts: Prompt[] = [];
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  
  if (!existsSync(packsDir)) {
    return prompts;
  }
  
  const packDirs = readdirSync(packsDir).filter(item => {
    const itemPath = join(packsDir, item);
    return statSync(itemPath).isDirectory();
  });
  
  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir, 'pack.json');
    if (!existsSync(packPath)) {
      continue;
    }
    
    try {
      const content = readFileSync(packPath, 'utf-8');
      const pack = JSON.parse(content);
      
      if (pack.prompts && Array.isArray(pack.prompts)) {
        for (const prompt of pack.prompts) {
          if (prompt.text) {
            prompts.push({
              id: prompt.id,
              text: prompt.text,
              packId: pack.id,
              packTitle: pack.title || pack.id
            });
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️  Failed to load pack ${packDir}: ${err}`);
    }
  }
  
  return prompts;
}

/**
 * Find exact duplicates
 */
function findExactDuplicates(prompts: Prompt[]): Array<{ normalized: string; prompts: Prompt[] }> {
  const normalizedMap = new Map<string, Prompt[]>();
  
  for (const prompt of prompts) {
    const normalized = normalizeText(prompt.text);
    if (!normalizedMap.has(normalized)) {
      normalizedMap.set(normalized, []);
    }
    normalizedMap.get(normalized)!.push(prompt);
  }
  
  const duplicates: Array<{ normalized: string; prompts: Prompt[] }> = [];
  for (const [normalized, promptList] of normalizedMap.entries()) {
    if (promptList.length > 1) {
      duplicates.push({ normalized, prompts: promptList });
    }
  }
  
  return duplicates;
}

/**
 * Find near-duplicates (similarity > threshold)
 */
function findNearDuplicates(prompts: Prompt[], threshold: number = 0.85): Array<{ prompt1: Prompt; prompt2: Prompt; similarity: number }> {
  const nearDuplicates: Array<{ prompt1: Prompt; prompt2: Prompt; similarity: number }> = [];
  
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      const similarity = trigramJaccard(prompts[i].text, prompts[j].text);
      if (similarity > threshold) {
        nearDuplicates.push({
          prompt1: prompts[i],
          prompt2: prompts[j],
          similarity
        });
      }
    }
  }
  
  return nearDuplicates;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  let workspace = 'de';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    }
  }
  
  console.log('🔍 Running duplicate detection...\n');
  console.log(`   Workspace: ${workspace}\n`);
  
  // Load all prompts
  const prompts = loadAllPrompts(workspace);
  console.log(`   Loaded ${prompts.length} prompts from ${new Set(prompts.map(p => p.packId)).size} packs\n`);
  
  // Check for exact duplicates
  const exactDuplicates = findExactDuplicates(prompts);
  
  if (exactDuplicates.length > 0) {
    console.error('❌ HARD FAIL: Found exact duplicate prompts\n');
    for (const dup of exactDuplicates) {
      console.error(`   Duplicate text (normalized): "${dup.normalized.substring(0, 60)}${dup.normalized.length > 60 ? '...' : ''}"`);
      console.error(`   Found in ${dup.prompts.length} location(s):`);
      for (const prompt of dup.prompts) {
        console.error(`     - ${prompt.packId} (${prompt.packTitle}): ${prompt.id}`);
      }
      console.error('');
    }
    process.exit(1);
  }
  
  console.log('✅ No exact duplicates found\n');
  
  // Check for near-duplicates
  const nearDuplicates = findNearDuplicates(prompts, 0.85);
  
  if (nearDuplicates.length > 0) {
    console.warn('⚠️  WARNING: Found near-duplicate prompts (similarity > 0.85)\n');
    for (const dup of nearDuplicates.slice(0, 20)) { // Limit output
      console.warn(`   Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
      console.warn(`   Prompt 1: ${dup.prompt1.packId} (${dup.prompt1.packTitle}): ${dup.prompt1.id}`);
      console.warn(`            "${dup.prompt1.text}"`);
      console.warn(`   Prompt 2: ${dup.prompt2.packId} (${dup.prompt2.packTitle}): ${dup.prompt2.id}`);
      console.warn(`            "${dup.prompt2.text}"`);
      console.warn('');
    }
    if (nearDuplicates.length > 20) {
      console.warn(`   ... and ${nearDuplicates.length - 20} more near-duplicates\n`);
    }
  } else {
    console.log('✅ No near-duplicates found (similarity > 0.85)\n');
  }
  
  // Summary
  console.log('Summary:');
  console.log(`  Total prompts: ${prompts.length}`);
  console.log(`  Exact duplicates: ${exactDuplicates.length} (HARD FAIL if > 0)`);
  console.log(`  Near-duplicates (>0.85): ${nearDuplicates.length} (warning only)`);
  
  if (exactDuplicates.length === 0) {
    console.log('\n✅ Duplicate check passed');
  }
}

main();

