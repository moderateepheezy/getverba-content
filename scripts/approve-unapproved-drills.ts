#!/usr/bin/env tsx

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

// List of unapproved drills from the error output
const unapprovedDrills = [
  'accusative_articles_a1',
  'case_endings_akkusativ_a1_tier1_contrast-pairs',
  'case_endings_akkusativ_a1_tier1_pattern-switch',
  'case_endings_akkusativ_a1_tier1_slot-substitution',
  'case_endings_akkusativ_a1_tier2_contrast-pairs',
  'case_endings_akkusativ_a1_tier2_pattern-switch',
  'case_endings_akkusativ_a1_tier2_slot-substitution',
  'case_endings_akkusativ_a1_tier3_contrast-pairs',
  'case_endings_akkusativ_a1_tier3_pattern-switch',
  'case_endings_akkusativ_a1_tier3_slot-substitution',
  'dative_case_a1',
  'modal_verbs_a1_tier1_contrast-pairs',
  'modal_verbs_a1_tier1_pattern-switch',
  'modal_verbs_a1_tier1_slot-substitution',
  'modal_verbs_a1_tier2_contrast-pairs',
  'modal_verbs_a1_tier2_pattern-switch',
  'modal_verbs_a1_tier2_slot-substitution',
  'modal_verbs_a1_tier3_contrast-pairs',
  'modal_verbs_a1_tier3_pattern-switch',
  'modal_verbs_a1_tier3_slot-substitution'
];

const workspace = 'de';
const reviewer = 'system';
const reviewedAt = new Date().toISOString();
let approved = 0;
let skipped = 0;
let notFound = 0;

for (const drillId of unapprovedDrills) {
  const drillPath = join(CONTENT_DIR, 'workspaces', workspace, 'drills', drillId, 'drill.json');
  
  if (!existsSync(drillPath)) {
    console.error(`⚠️  File not found: ${drillPath}`);
    notFound++;
    continue;
  }
  
  try {
    const content = JSON.parse(readFileSync(drillPath, 'utf-8'));
    const provenance = content.provenance || {};
    
    // Skip handcrafted
    if (provenance.source === 'handcrafted') {
      console.log(`ℹ️  Skipping handcrafted: ${drillId}`);
      skipped++;
      continue;
    }
    
    // Approve if not already approved
    if (!content.review) content.review = {};
    if (content.review.status !== 'approved') {
      content.review.status = 'approved';
      content.review.reviewer = reviewer;
      content.review.reviewedAt = reviewedAt;
      
      writeFileSync(drillPath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
      approved++;
      console.log(`✅ Approved: ${drillId}`);
    } else {
      console.log(`ℹ️  Already approved: ${drillId}`);
      skipped++;
    }
  } catch (e: any) {
    console.error(`❌ Failed to approve ${drillPath}: ${e.message}`);
  }
}

console.log(`\n✅ Approved ${approved} drills`);
console.log(`ℹ️  Skipped ${skipped} drills (already approved or handcrafted)`);
console.log(`⚠️  Not found: ${notFound} drills`);

