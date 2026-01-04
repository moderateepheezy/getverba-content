#!/usr/bin/env tsx

/**
 * Fix Level Mismatches Script
 * 
 * Reads the level accuracy report and fixes content items with level mismatches.
 * Options:
 * - Auto-downgrade level if confidence >95%
 * - Flag for manual review
 * - Suggest vocabulary replacements
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');
const REPORT_FILE = join(META_DIR, 'level-accuracy-report.json');
const FIX_LOG_FILE = join(META_DIR, 'level-fix-log.json');

interface FixLog {
  generatedAt: string;
  fixes: Array<{
    id: string;
    kind: string;
    workspace: string;
    action: 'auto-fixed' | 'flagged' | 'skipped';
    oldLevel: string;
    newLevel?: string;
    reason: string;
    entryUrl: string;
  }>;
  summary: {
    total: number;
    autoFixed: number;
    flagged: number;
    skipped: number;
  };
}

function resolveEntryPath(entryUrl: string): string {
  // Convert /v1/workspaces/{ws}/{type}/{id}/{file}.json to file path
  const relativePath = entryUrl.replace(/^\/v1\//, '');
  return join(CONTENT_DIR, relativePath);
}

function getLevelOrder(level: string): number {
  const order: Record<string, number> = {
    'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6
  };
  return order[level.toUpperCase()] || 999;
}

function determineNewLevel(claimedLevel: string, detectedLevel: string | null): string | null {
  if (!detectedLevel) {
    return null;
  }

  const claimedOrder = getLevelOrder(claimedLevel);
  const detectedOrder = getLevelOrder(detectedLevel);

  // If detected is significantly higher, downgrade to detected level
  if (detectedOrder > claimedOrder + 1) {
    return detectedLevel;
  }

  // If detected is one level higher, consider downgrading
  if (detectedOrder === claimedOrder + 1) {
    // Conservative: only downgrade if very confident
    return detectedLevel;
  }

  return null;
}

async function fixMismatches(
  autoFix: boolean = false,
  confidenceThreshold: number = 0.95
): Promise<void> {
  console.log('🔧 Fixing level mismatches...\n');

  if (!existsSync(REPORT_FILE)) {
    console.error('❌ Level accuracy report not found. Run analyze-level-accuracy.ts first.');
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(REPORT_FILE, 'utf-8'));
  const mismatches = report.mismatches || [];

  if (mismatches.length === 0) {
    console.log('✅ No mismatches to fix!');
    return;
  }

  console.log(`📋 Found ${mismatches.length} items with level mismatches\n`);

  const fixLog: FixLog = {
    generatedAt: new Date().toISOString(),
    fixes: [],
    summary: {
      total: mismatches.length,
      autoFixed: 0,
      flagged: 0,
      skipped: 0
    }
  };

  for (const mismatch of mismatches) {
    const entryPath = resolveEntryPath(mismatch.entryUrl);

    if (!existsSync(entryPath)) {
      console.warn(`⚠️  Entry not found: ${entryPath}`);
      fixLog.fixes.push({
        id: mismatch.id,
        kind: mismatch.kind,
        workspace: mismatch.workspace,
        action: 'skipped',
        oldLevel: mismatch.claimedLevel,
        reason: 'Entry file not found',
        entryUrl: mismatch.entryUrl
      });
      fixLog.summary.skipped++;
      continue;
    }

    try {
      const entry = JSON.parse(readFileSync(entryPath, 'utf-8'));
      const claimedLevel = entry.level;

      // Determine if we should auto-fix
      const shouldAutoFix = autoFix && 
                            mismatch.confidence >= confidenceThreshold &&
                            mismatch.detectedLevel !== null;

      if (shouldAutoFix) {
        const newLevel = determineNewLevel(claimedLevel, mismatch.detectedLevel);

        if (newLevel && newLevel !== claimedLevel) {
          // Auto-fix: update level
          entry.level = newLevel;
          writeFileSync(entryPath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');

          console.log(`✅ Auto-fixed: ${mismatch.id} (${claimedLevel} → ${newLevel})`);

          fixLog.fixes.push({
            id: mismatch.id,
            kind: mismatch.kind,
            workspace: mismatch.workspace,
            action: 'auto-fixed',
            oldLevel: claimedLevel,
            newLevel: newLevel,
            reason: `Confidence: ${(mismatch.confidence * 100).toFixed(1)}%, Detected: ${mismatch.detectedLevel}`,
            entryUrl: mismatch.entryUrl
          });
          fixLog.summary.autoFixed++;
        } else {
          // Can't determine new level
          fixLog.fixes.push({
            id: mismatch.id,
            kind: mismatch.kind,
            workspace: mismatch.workspace,
            action: 'flagged',
            oldLevel: claimedLevel,
            reason: `Cannot determine appropriate level. Issues: ${mismatch.issues.join('; ')}`,
            entryUrl: mismatch.entryUrl
          });
          fixLog.summary.flagged++;
        }
      } else {
        // Flag for manual review
        console.log(`⚠️  Flagged for review: ${mismatch.id} (${claimedLevel}, confidence: ${(mismatch.confidence * 100).toFixed(1)}%)`);

        fixLog.fixes.push({
          id: mismatch.id,
          kind: mismatch.kind,
          workspace: mismatch.workspace,
          action: 'flagged',
          oldLevel: claimedLevel,
          reason: `Confidence below threshold or auto-fix disabled. Issues: ${mismatch.issues.join('; ')}`,
          entryUrl: mismatch.entryUrl
        });
        fixLog.summary.flagged++;
      }
    } catch (error) {
      console.error(`❌ Failed to process ${entryPath}: ${error}`);
      fixLog.fixes.push({
        id: mismatch.id,
        kind: mismatch.kind,
        workspace: mismatch.workspace,
        action: 'skipped',
        oldLevel: mismatch.claimedLevel,
        reason: `Error: ${error}`,
        entryUrl: mismatch.entryUrl
      });
      fixLog.summary.skipped++;
    }
  }

  // Save fix log
  if (!existsSync(META_DIR)) {
    require('fs').mkdirSync(META_DIR, { recursive: true });
  }
  writeFileSync(FIX_LOG_FILE, JSON.stringify(fixLog, null, 2), 'utf-8');

  // Print summary
  console.log('\n📊 Fix Summary:');
  console.log(`   Total: ${fixLog.summary.total}`);
  console.log(`   Auto-fixed: ${fixLog.summary.autoFixed}`);
  console.log(`   Flagged for review: ${fixLog.summary.flagged}`);
  console.log(`   Skipped: ${fixLog.summary.skipped}`);
  console.log(`\n📝 Fix log saved to: ${FIX_LOG_FILE}`);

  if (fixLog.summary.autoFixed > 0) {
    console.log('\n✅ Re-run analyze-level-accuracy.ts to verify fixes');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const autoFix = args.includes('--auto-fix');
const confidenceThreshold = parseFloat(
  args.find(arg => arg.startsWith('--confidence='))?.split('=')[1] || '0.95'
);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: tsx scripts/fix-level-mismatches.ts [options]

Options:
  --auto-fix              Automatically fix level mismatches (default: false)
  --confidence=<number>   Minimum confidence threshold for auto-fix (default: 0.95)
  --help, -h              Show this help message

Examples:
  tsx scripts/fix-level-mismatches.ts
    # Flag all mismatches for manual review (no changes)

  tsx scripts/fix-level-mismatches.ts --auto-fix
    # Auto-fix mismatches with confidence >= 0.95

  tsx scripts/fix-level-mismatches.ts --auto-fix --confidence=0.90
    # Auto-fix mismatches with confidence >= 0.90
`);
  process.exit(0);
}

fixMismatches(autoFix, confidenceThreshold).catch(error => {
  console.error('❌ Fix failed:', error);
  process.exit(1);
});

