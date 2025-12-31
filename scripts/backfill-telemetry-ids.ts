#!/usr/bin/env tsx

/**
 * Backfill Telemetry IDs
 * 
 * Adds contentId, contentHash, and revisionId to all existing entry documents
 * (packs, drills, exams) deterministically.
 * 
 * Usage:
 *   tsx scripts/backfill-telemetry-ids.ts [--workspace <ws>] [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeTelemetryIds } from './telemetry-ids';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface Stats {
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

/**
 * Extract workspace from entry path
 */
function extractWorkspace(entryPath: string): string | null {
  // Path format: content/v1/workspaces/{workspace}/packs|drills|exams/{id}/entry.json
  const parts = entryPath.split('/');
  const workspacesIdx = parts.indexOf('workspaces');
  if (workspacesIdx >= 0 && workspacesIdx + 1 < parts.length) {
    return parts[workspacesIdx + 1];
  }
  return null;
}

/**
 * Process a single entry file
 */
function processEntry(entryPath: string, dryRun: boolean): { updated: boolean; error?: string } {
  try {
    const content = readFileSync(entryPath, 'utf-8');
    const entry = JSON.parse(content);
    
    // Skip if already has all telemetry fields
    if (entry.contentId && entry.contentHash && entry.revisionId) {
      return { updated: false };
    }
    
    // Extract workspace from path
    const workspace = extractWorkspace(entryPath);
    if (!workspace) {
      return { updated: false, error: 'Could not extract workspace from path' };
    }
    
    // Compute telemetry IDs
    const telemetryIds = computeTelemetryIds(entry, workspace);
    
    // Add telemetry fields
    entry.contentId = telemetryIds.contentId;
    entry.contentHash = telemetryIds.contentHash;
    entry.revisionId = telemetryIds.revisionId;
    
    // Write back if not dry run
    if (!dryRun) {
      writeFileSync(entryPath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
    }
    
    return { updated: true };
  } catch (error: any) {
    return { updated: false, error: error.message };
  }
}

/**
 * Scan directory for entry files
 */
function scanEntryDirectory(
  dirPath: string,
  entryFileName: string,
  stats: Stats,
  dryRun: boolean
): void {
  if (!existsSync(dirPath)) {
    return;
  }
  
  const entries = readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const entryPath = join(dirPath, entry.name, entryFileName);
    
    if (existsSync(entryPath)) {
      stats.processed++;
      const result = processEntry(entryPath, dryRun);
      
      if (result.error) {
        stats.errors++;
        console.error(`❌ Error processing ${entryPath}: ${result.error}`);
      } else if (result.updated) {
        stats.updated++;
        console.log(`✅ ${dryRun ? '[DRY RUN] ' : ''}Updated: ${entryPath}`);
      } else {
        stats.skipped++;
      }
    }
  }
}

/**
 * Process all entries in a workspace
 */
function processWorkspace(workspaceId: string, dryRun: boolean): Stats {
  const stats: Stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };
  
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  
  if (!existsSync(workspaceDir)) {
    console.warn(`⚠️  Workspace ${workspaceId} not found, skipping`);
    return stats;
  }
  
  console.log(`\n📁 Processing workspace: ${workspaceId}`);
  
  // Process packs
  const packsDir = join(workspaceDir, 'packs');
  scanEntryDirectory(packsDir, 'pack.json', stats, dryRun);
  
  // Process drills
  const drillsDir = join(workspaceDir, 'drills');
  scanEntryDirectory(drillsDir, 'drill.json', stats, dryRun);
  
  // Process exams
  const examsDir = join(workspaceDir, 'exams');
  scanEntryDirectory(examsDir, 'exam.json', stats, dryRun);
  
  return stats;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let targetWorkspace: string | null = null;
  let dryRun = false;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--workspace' || args[i] === '-w') && i + 1 < args.length) {
      targetWorkspace = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run' || args[i] === '-n') {
      dryRun = true;
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
        .filter(d => d.isDirectory())
        .map(d => d.name);
  
  if (workspaces.length === 0) {
    console.error('❌ Error: No workspaces found');
    process.exit(1);
  }
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }
  
  console.log(`📦 Backfilling telemetry IDs for ${workspaces.length} workspace(s)...\n`);
  
  const totalStats: Stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };
  
  // Process each workspace
  for (const workspaceId of workspaces) {
    const stats = processWorkspace(workspaceId, dryRun);
    totalStats.processed += stats.processed;
    totalStats.updated += stats.updated;
    totalStats.skipped += stats.skipped;
    totalStats.errors += stats.errors;
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Processed: ${totalStats.processed} entries`);
  console.log(`   Updated: ${totalStats.updated} entries`);
  console.log(`   Skipped: ${totalStats.skipped} entries (already have telemetry IDs)`);
  console.log(`   Errors: ${totalStats.errors} entries`);
  console.log('='.repeat(60));
  
  if (dryRun) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else if (totalStats.updated > 0) {
    console.log('\n✅ Backfill complete!');
    console.log('\n⚠️  Next steps:');
    console.log('   1. Run: npm run content:validate');
    console.log('   2. Run: npm run content:generate-indexes');
    console.log('   3. Run: npm run content:quality');
  }
  
  if (totalStats.errors > 0) {
    process.exit(1);
  }
}

main();

