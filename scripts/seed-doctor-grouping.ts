#!/usr/bin/env tsx

/**
 * Seed Doctor Scenario with Grouping Metadata
 * 
 * This script adds groupId, groupTitle, and groupTitle_i18n to all packs
 * in the Doctor scenario index. Every pack will be assigned to one of:
 * 
 * - booking-appointments: For packs about making/scheduling appointments
 * - describing-symptoms: For packs about describing health symptoms
 * - getting-prescriptions: For packs about prescriptions and medication
 * 
 * NO orphan scenarios allowed - every pack must belong to a group.
 * 
 * Usage:
 *   pnpm seed:doctor-grouping          # Dry run
 *   pnpm seed:doctor-grouping --write  # Apply changes
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { 
  DOCTOR_SCENARIO_GROUPS, 
  getDoctorPackGroup,
  type DoctorGroupId 
} from './content-quality/i18nValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const DOCTOR_INDEX_DIR = join(CONTENT_DIR, 'workspaces', 'de', 'context', 'doctor');

interface GroupingStats {
  'booking-appointments': number;
  'describing-symptoms': number;
  'getting-prescriptions': number;
}

let dryRun = true;
const stats: GroupingStats = {
  'booking-appointments': 0,
  'describing-symptoms': 0,
  'getting-prescriptions': 0
};

/**
 * Determine group for a pack based on its content
 * Uses intelligent detection with fallback to assignment based on pack number
 */
function determineGroup(item: any, packIndex: number): DoctorGroupId {
  // First try automatic detection
  const detected = getDoctorPackGroup({
    title: item.title,
    shortTitle: item.shortTitle,
    topicKey: item.topicKey,
    topicLabel: item.topicLabel
  });
  
  if (detected) {
    return detected;
  }
  
  // Fallback: assign based on pack number pattern
  // Typically packs 1,4,7 are appointments, 2,5,8 are symptoms, 3,6 are prescriptions
  // Extract number from pack id like "doctor_pack_1_a1"
  const match = item.id?.match(/doctor_pack_(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    const mod = num % 3;
    if (mod === 1) return 'booking-appointments';
    if (mod === 2) return 'describing-symptoms';
    return 'getting-prescriptions'; // mod === 0
  }
  
  // Ultimate fallback based on position in list
  const position = packIndex % 3;
  if (position === 0) return 'booking-appointments';
  if (position === 1) return 'describing-symptoms';
  return 'getting-prescriptions';
}

/**
 * Add grouping metadata to an item
 */
function addGroupingToItem(item: any, packIndex: number): boolean {
  // Skip if already has grouping
  if (item.groupId && item.groupTitle) {
    return false;
  }
  
  const groupId = determineGroup(item, packIndex);
  const groupConfig = DOCTOR_SCENARIO_GROUPS[groupId];
  
  item.groupId = groupConfig.groupId;
  item.groupTitle = groupConfig.groupTitle;
  item.groupTitle_i18n = { ...groupConfig.groupTitle_i18n };
  
  stats[groupId]++;
  return true;
}

/**
 * Process an index file
 */
function processIndexFile(filePath: string, globalIndex: number): { modified: boolean; itemCount: number } {
  if (!existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return { modified: false, itemCount: 0 };
  }
  
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  if (!Array.isArray(data.items)) {
    console.log(`⚠️  No items array in: ${filePath}`);
    return { modified: false, itemCount: 0 };
  }
  
  let modified = false;
  let localIndex = 0;
  
  for (const item of data.items) {
    if (addGroupingToItem(item, globalIndex + localIndex)) {
      modified = true;
    }
    localIndex++;
  }
  
  if (modified) {
    if (dryRun) {
      console.log(`📝 Would modify: ${filePath}`);
    } else {
      const newContent = JSON.stringify(data, null, 2) + '\n';
      writeFileSync(filePath, newContent, 'utf-8');
      console.log(`✅ Modified: ${filePath}`);
    }
  }
  
  return { modified, itemCount: localIndex };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Seed Doctor Scenario Grouping Script

Usage:
  pnpm seed:doctor-grouping          # Dry run (default)
  pnpm seed:doctor-grouping --write  # Apply changes

This script adds grouping metadata to all Doctor scenario packs:
  - groupId: Stable identifier for the group
  - groupTitle: English display label
  - groupTitle_i18n: Localized group titles

Groups:
  - booking-appointments: Appointment scheduling packs
  - describing-symptoms: Symptom description packs  
  - getting-prescriptions: Prescription-related packs

NO orphan packs - every pack will be assigned to a group.
`);
    process.exit(0);
  }
  
  dryRun = !args.includes('--write');
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Doctor Scenario Grouping Seed Script                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified');
    console.log('   Use --write to apply changes');
    console.log('');
  } else {
    console.log('✏️  WRITE MODE - Files will be modified');
    console.log('');
  }
  
  // Process all doctor index pages
  const indexFiles = [
    'index.json',
    'index.page2.json',
    'index.page3.json',
    'index.page4.json',
    'index.page5.json'
  ];
  
  let totalItems = 0;
  let filesModified = 0;
  
  for (const indexFile of indexFiles) {
    const filePath = join(DOCTOR_INDEX_DIR, indexFile);
    if (existsSync(filePath)) {
      const result = processIndexFile(filePath, totalItems);
      totalItems += result.itemCount;
      if (result.modified) filesModified++;
    }
  }
  
  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total items processed:   ${totalItems}`);
  console.log(`  Files ${dryRun ? 'would be ' : ''}modified:    ${filesModified}`);
  console.log('');
  console.log('  Items by group:');
  console.log(`    📅 Booking Appointments:  ${stats['booking-appointments']}`);
  console.log(`    🤒 Describing Symptoms:   ${stats['describing-symptoms']}`);
  console.log(`    💊 Getting Prescriptions: ${stats['getting-prescriptions']}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Verify no orphans
  const totalGrouped = stats['booking-appointments'] + stats['describing-symptoms'] + stats['getting-prescriptions'];
  if (totalGrouped < totalItems && totalItems > 0) {
    console.log(`\n⚠️  Warning: ${totalItems - totalGrouped} items may already have grouping`);
  }
  
  if (dryRun && filesModified > 0) {
    console.log('\n💡 Run with --write to apply these changes');
  }
  
  console.log('\n✅ Grouping seed complete!');
}

main();

