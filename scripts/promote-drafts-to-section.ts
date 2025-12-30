#!/usr/bin/env tsx

/**
 * Promote draft packs to production section
 * 
 * Copies draft packs to canonical /packs/<id>/pack.json
 * Updates section indexes
 * Runs validation + quality gates
 * 
 * Usage:
 *   tsx scripts/promote-drafts-to-section.ts --workspace de pack-id-1 pack-id-2 ...
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace = 'de';
  const packIds: string[] = [];
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      packIds.push(args[i]);
    }
  }
  
  if (packIds.length === 0) {
    console.error('❌ Error: Must provide at least one pack ID');
    process.exit(1);
  }
  
  console.log(`\n📦 Promoting ${packIds.length} draft pack(s) to production...`);
  console.log(`   Workspace: ${workspace}`);
  
  const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
  const productionDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  
  const promotedPacks: string[] = [];
  const failedPacks: Array<{ id: string; reason: string }> = [];
  
  for (const packId of packIds) {
    const draftPath = join(draftDir, packId, 'pack.json');
    const productionPath = join(productionDir, packId, 'pack.json');
    
    if (!existsSync(draftPath)) {
      failedPacks.push({ id: packId, reason: 'Draft pack not found' });
      console.error(`   ❌ ${packId}: Draft pack not found at ${draftPath}`);
      continue;
    }
    
    try {
      // Read and validate draft pack
      const packContent = readFileSync(draftPath, 'utf-8');
      const pack = JSON.parse(packContent);
      
      // Remove ingestion metadata before promoting
      delete pack._ingestionMetadata;
      
      // Create production directory
      const productionPackDir = join(productionDir, packId);
      if (!existsSync(productionPackDir)) {
        mkdirSync(productionPackDir, { recursive: true });
      }
      
      // Write to production
      writeFileSync(productionPath, JSON.stringify(pack, null, 2) + '\n', 'utf-8');
      promotedPacks.push(packId);
      console.log(`   ✅ Promoted ${packId}`);
      
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      failedPacks.push({ id: packId, reason });
      console.error(`   ❌ ${packId}: ${reason}`);
    }
  }
  
  if (promotedPacks.length === 0) {
    console.error(`\n❌ No packs were promoted.`);
    process.exit(1);
  }
  
  console.log(`\n✅ Promoted ${promotedPacks.length} pack(s) to production`);
  
  // Update indexes
  console.log(`\n📋 Updating section indexes...`);
  try {
    execSync(`npm run content:generate-indexes -- --workspace ${workspace}`, {
      stdio: 'inherit',
      cwd: join(__dirname, '..')
    });
    console.log(`   ✅ Indexes updated`);
  } catch (error) {
    console.error(`   ⚠️  Warning: Failed to update indexes`);
  }
  
  // Run validation
  console.log(`\n🔍 Running validation...`);
  try {
    execSync('npm run content:validate', {
      stdio: 'inherit',
      cwd: join(__dirname, '..')
    });
    console.log(`   ✅ Validation passed`);
  } catch (error) {
    console.error(`   ⚠️  Warning: Validation failed - please review errors`);
  }
  
  // Run quality gates
  console.log(`\n🎯 Running quality gates...`);
  try {
    execSync('npm run content:quality', {
      stdio: 'inherit',
      cwd: join(__dirname, '..')
    });
    console.log(`   ✅ Quality gates passed`);
  } catch (error) {
    console.error(`   ⚠️  Warning: Quality gates failed - please review errors`);
  }
  
  if (failedPacks.length > 0) {
    console.log(`\n⚠️  Failed to promote ${failedPacks.length} pack(s):`);
    for (const failed of failedPacks) {
      console.log(`   - ${failed.id}: ${failed.reason}`);
    }
  }
  
  console.log(`\n✅ Promotion complete!`);
  console.log(`\n📋 Promoted packs:`);
  for (const packId of promotedPacks) {
    console.log(`   - ${packId}`);
  }
  console.log(`\n⚠️  Next steps:`);
  console.log(`   1. Review promoted packs in: content/v1/workspaces/${workspace}/packs/`);
  console.log(`   2. Ensure all validation and quality gates passed`);
  console.log(`   3. Add to review queue if needed: content/review/pending.json`);
}

main();

