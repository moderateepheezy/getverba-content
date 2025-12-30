#!/usr/bin/env tsx

/**
 * B2B Curriculum Export CLI
 * 
 * Exports curriculum bundles with deterministic manifests, SCORM-like metadata,
 * and human-readable syllabus for school/LMS distribution.
 * 
 * Usage:
 *   npm run content:export-curriculum -- \
 *     --workspace de \
 *     --bundle-id gov_office_a1_v1 \
 *     --title "German A1 — Government Office Survival" \
 *     --levels A1 \
 *     --scenarios government_office \
 *     --include-sections context,mechanics \
 *     --max-packs 12 \
 *     --max-drills 8
 * 
 *   npm run content:export-curriculum -- \
 *     --workspace de \
 *     --bundle-id work_a2_interviews_v1 \
 *     --title "German A2 — Work & Interviews" \
 *     --include-pack-ids work_1,shopping_conversations,restaurant_conversations \
 *     --include-drill-ids separable_verbs_a1,akkusativ_prepositions_a1
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BundleSelectionCriteria } from './exports/exportTypes.js';
import { buildBundle, writeBundleArtifacts, createBundleZip } from './exports/bundleBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = process.env.CONTENT_DIR || join(__dirname, '..', 'content', 'v1');
const EXPORTS_DIR = process.env.EXPORTS_DIR || join(__dirname, '..', 'exports', 'bundles');

/**
 * Parse command line arguments
 */
function parseArgs(): BundleSelectionCriteria {
  const args = process.argv.slice(2);
  
  let workspace: string | null = null;
  let bundleId: string | null = null;
  let title: string | null = null;
  const levels: string[] = [];
  const scenarios: string[] = [];
  const tags: string[] = [];
  const includeSections: string[] = [];
  let maxPacks: number | undefined;
  let maxDrills: number | undefined;
  let maxExams: number | undefined;
  const explicitPackIds: string[] = [];
  const explicitDrillIds: string[] = [];
  const explicitExamIds: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if ((arg === '--workspace' || arg === '-w') && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if ((arg === '--bundle-id' || arg === '--bundleId') && i + 1 < args.length) {
      bundleId = args[i + 1];
      i++;
    } else if (arg === '--title' && i + 1 < args.length) {
      title = args[i + 1];
      i++;
    } else if (arg === '--levels' && i + 1 < args.length) {
      levels.push(...args[i + 1].split(',').map(l => l.trim().toUpperCase()));
      i++;
    } else if (arg === '--scenarios' && i + 1 < args.length) {
      scenarios.push(...args[i + 1].split(',').map(s => s.trim().toLowerCase()));
      i++;
    } else if (arg === '--tags' && i + 1 < args.length) {
      tags.push(...args[i + 1].split(',').map(t => t.trim()));
      i++;
    } else if (arg === '--include-sections' && i + 1 < args.length) {
      includeSections.push(...args[i + 1].split(',').map(s => s.trim()));
      i++;
    } else if (arg === '--max-packs' && i + 1 < args.length) {
      maxPacks = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--max-drills' && i + 1 < args.length) {
      maxDrills = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--max-exams' && i + 1 < args.length) {
      maxExams = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--include-pack-ids' && i + 1 < args.length) {
      explicitPackIds.push(...args[i + 1].split(',').map(id => id.trim()));
      i++;
    } else if (arg === '--include-drill-ids' && i + 1 < args.length) {
      explicitDrillIds.push(...args[i + 1].split(',').map(id => id.trim()));
      i++;
    } else if (arg === '--include-exam-ids' && i + 1 < args.length) {
      explicitExamIds.push(...args[i + 1].split(',').map(id => id.trim()));
      i++;
    }
  }
  
  // Validate required arguments
  if (!workspace) {
    console.error('❌ Error: --workspace is required');
    process.exit(1);
  }
  
  if (!bundleId) {
    console.error('❌ Error: --bundle-id is required');
    process.exit(1);
  }
  
  if (!title) {
    console.error('❌ Error: --title is required');
    process.exit(1);
  }
  
  const criteria: BundleSelectionCriteria = {
    workspace,
    bundleId,
    title,
    levels: levels.length > 0 ? levels : undefined,
    scenarios: scenarios.length > 0 ? scenarios : undefined,
    tags: tags.length > 0 ? tags : undefined,
    includeSections: includeSections.length > 0 ? includeSections : undefined,
    maxPacks,
    maxDrills,
    maxExams,
    explicitPackIds: explicitPackIds.length > 0 ? explicitPackIds : undefined,
    explicitDrillIds: explicitDrillIds.length > 0 ? explicitDrillIds : undefined,
    explicitExamIds: explicitExamIds.length > 0 ? explicitExamIds : undefined
  };
  
  return criteria;
}

/**
 * Main function
 */
function main() {
  console.log('📦 B2B Curriculum Export v2');
  console.log('─'.repeat(50));
  
  // Parse arguments
  const criteria = parseArgs();
  
  // Validate workspace exists
  const workspacePath = join(CONTENT_DIR, 'workspaces', criteria.workspace);
  if (!existsSync(workspacePath)) {
    console.error(`❌ Error: Workspace not found: ${workspacePath}`);
    process.exit(1);
  }
  
  // Create output directory
  mkdirSync(EXPORTS_DIR, { recursive: true });
  
  const bundleOutputDir = join(EXPORTS_DIR, criteria.bundleId);
  
  try {
    // Build bundle
    const bundle = buildBundle(criteria, CONTENT_DIR, bundleOutputDir);
    
    // Write artifacts
    writeBundleArtifacts(bundle, CONTENT_DIR, bundleOutputDir);
    
    // Create ZIP
    const zipPath = join(EXPORTS_DIR, `${criteria.bundleId}.zip`);
    createBundleZip(bundleOutputDir, zipPath);
    
    console.log(`\n✅ Bundle export complete!`);
    console.log(`   Bundle directory: ${bundleOutputDir}`);
    console.log(`   ZIP file: ${zipPath}`);
    console.log(`   Modules: ${bundle.modules.length}`);
    console.log(`   Total items: ${bundle.totals.packs + bundle.totals.drills + bundle.totals.exams}`);
    console.log(`   Estimated time: ${bundle.totals.estimatedMinutes} minutes`);
    
  } catch (error: any) {
    console.error(`\n❌ Export failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
