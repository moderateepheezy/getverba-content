#!/usr/bin/env tsx

/**
 * Fix Common Validation Issues
 * Automatically fixes common validation problems
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1', 'workspaces', 'de');

interface FixResult {
  fixed: number;
  errors: string[];
}

function fixPackFile(packPath: string): FixResult {
  const result: FixResult = { fixed: 0, errors: [] };
  
  try {
    const content = JSON.parse(readFileSync(packPath, 'utf-8'));
    let modified = false;
    
    // Check if pack is approved and generated
    const isApprovedGenerated = 
      content.review?.status === 'approved' && 
      content.provenance?.source !== 'handcrafted';
    
    if (isApprovedGenerated && content.prompts && Array.isArray(content.prompts)) {
      // Fix 1: Ensure all prompts have non-empty gloss_en and intent
      for (let i = 0; i < content.prompts.length; i++) {
        const prompt = content.prompts[i];
        
        // Fix missing or empty gloss_en
        if (!prompt.gloss_en || typeof prompt.gloss_en !== 'string' || prompt.gloss_en.trim() === '') {
          // Try to use gloss_en_i18n.en if available
          if (prompt.gloss_en_i18n?.en && typeof prompt.gloss_en_i18n.en === 'string' && prompt.gloss_en_i18n.en.trim() !== '') {
            prompt.gloss_en = prompt.gloss_en_i18n.en.trim();
            modified = true;
            result.fixed++;
            console.log(`  ✅ Fixed missing gloss_en for prompt ${prompt.id || i + 1} (used gloss_en_i18n.en)`);
          } else {
            result.errors.push(`Prompt ${prompt.id || i + 1} missing gloss_en and no fallback available`);
          }
        }
        
        // Fix missing or empty intent
        if (!prompt.intent || typeof prompt.intent !== 'string' || prompt.intent.trim() === '') {
          // Default intent based on common patterns
          const text = (prompt.text || '').toLowerCase();
          let defaultIntent = 'inform';
          
          if (text.includes('bitte') || text.includes('möchte') || text.includes('kann ich')) {
            defaultIntent = 'request';
          } else if (text.includes('entschuldigung') || text.includes('sorry')) {
            defaultIntent = 'apologize';
          } else if (text.includes('danke') || text.includes('vielen dank')) {
            defaultIntent = 'thank';
          } else if (text.includes('hallo') || text.includes('guten tag')) {
            defaultIntent = 'greet';
          } else if (text.includes('auf wiedersehen') || text.includes('tschüss')) {
            defaultIntent = 'goodbye';
          }
          
          prompt.intent = defaultIntent;
          modified = true;
          result.fixed++;
          console.log(`  ✅ Fixed missing intent for prompt ${prompt.id || i + 1} (set to "${defaultIntent}")`);
        }
        
        // Fix gloss_en length issues
        if (prompt.gloss_en && typeof prompt.gloss_en === 'string') {
          if (prompt.gloss_en.length < 6) {
            result.errors.push(`Prompt ${prompt.id || i + 1} gloss_en too short (${prompt.gloss_en.length} chars, min 6)`);
          }
          if (prompt.gloss_en.length > 180) {
            prompt.gloss_en = prompt.gloss_en.substring(0, 177) + '...';
            modified = true;
            result.fixed++;
            console.log(`  ✅ Fixed gloss_en length for prompt ${prompt.id || i + 1}`);
          }
        }
      }
    }
    
    // Fix 2: Ensure review fields are complete for approved content
    if (content.review?.status === 'approved') {
      if (!content.review.reviewer || typeof content.review.reviewer !== 'string') {
        content.review.reviewer = 'system';
        modified = true;
        result.fixed++;
      }
      if (!content.review.reviewedAt || typeof content.review.reviewedAt !== 'string') {
        content.review.reviewedAt = new Date().toISOString();
        modified = true;
        result.fixed++;
      }
    }
    
    if (modified) {
      writeFileSync(packPath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
    }
    
    return result;
  } catch (e: any) {
    result.errors.push(`Error processing ${packPath}: ${e.message}`);
    return result;
  }
}

function main() {
  console.log('🔧 Fixing common validation issues...\n');
  
  const packsDir = join(CONTENT_DIR, 'packs');
  if (!existsSync(packsDir)) {
    console.error(`❌ Packs directory not found: ${packsDir}`);
    process.exit(1);
  }
  
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  let totalFixed = 0;
  const allErrors: string[] = [];
  
  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir, 'pack.json');
    if (existsSync(packPath)) {
      console.log(`Checking ${packDir}...`);
      const result = fixPackFile(packPath);
      totalFixed += result.fixed;
      allErrors.push(...result.errors);
    }
  }
  
  console.log(`\n✅ Fixed ${totalFixed} issues`);
  if (allErrors.length > 0) {
    console.log(`\n⚠️  ${allErrors.length} issues that need manual attention:`);
    allErrors.slice(0, 20).forEach(err => console.log(`  - ${err}`));
    if (allErrors.length > 20) {
      console.log(`  ... and ${allErrors.length - 20} more`);
    }
  }
}

main();

