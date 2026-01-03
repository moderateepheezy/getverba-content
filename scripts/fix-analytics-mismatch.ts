#!/usr/bin/env tsx

/**
 * Fix analytics mismatches by recomputing analytics for all packs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computePackAnalytics, type PackEntry } from './content-quality/computeAnalytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

function findPackFiles(workspaceId: string): Array<{ path: string; pack: PackEntry }> {
  const packsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'packs');
  if (!existsSync(packsDir)) {
    return [];
  }

  const packFiles: Array<{ path: string; pack: PackEntry }> = [];
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir, 'pack.json');
    if (!existsSync(packPath)) {
      continue;
    }

    try {
      const content = readFileSync(packPath, 'utf-8');
      const pack: PackEntry = JSON.parse(content);
      packFiles.push({ path: packPath, pack });
    } catch (err: any) {
      console.warn(`⚠️  Failed to read ${packPath}: ${err.message}`);
    }
  }

  return packFiles;
}

function updatePackAnalytics(packFile: { path: string; pack: PackEntry }): boolean {
  try {
    const { path, pack } = packFile;

    // Recompute analytics
    const computedAnalytics = computePackAnalytics(pack);

    // Update analytics in pack (preserve other analytics fields)
    const updatedPack = {
      ...pack,
      analytics: {
        ...pack.analytics,
        // Update computed fields
        promptCount: computedAnalytics.promptCount,
        multiSlotRate: computedAnalytics.multiSlotRate,
        scenarioTokenHitAvg: computedAnalytics.scenarioTokenHitAvg,
        scenarioTokenQualifiedRate: computedAnalytics.scenarioTokenQualifiedRate,
        uniqueTokenRate: computedAnalytics.uniqueTokenRate,
        bannedPhraseViolations: computedAnalytics.bannedPhraseViolations,
        passesQualityGates: computedAnalytics.passesQualityGates,
        // Preserve version and qualityGateVersion
        version: computedAnalytics.version,
        qualityGateVersion: computedAnalytics.qualityGateVersion
      }
    };

    writeFileSync(path, JSON.stringify(updatedPack, null, 2) + '\n', 'utf-8');
    console.log(`✅ Updated analytics for ${pack.id}`);
    return true;
  } catch (err: any) {
    console.error(`❌ Failed to update ${packFile.pack.id}: ${err.message}`);
    return false;
  }
}

function main() {
  const workspaceId = process.argv[2] || 'de';
  
  console.log(`\n🔄 Recomputing pack analytics for workspace: ${workspaceId}\n`);

  const packFiles = findPackFiles(workspaceId);
  console.log(`Found ${packFiles.length} pack(s)\n`);

  let updated = 0;
  let failed = 0;

  for (const packFile of packFiles) {
    if (updatePackAnalytics(packFile)) {
      updated++;
    } else {
      failed++;
    }
  }

  console.log(`\n✅ Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${packFiles.length}`);
}

main();

