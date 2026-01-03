#!/usr/bin/env tsx

/**
 * Approve All Items
 * Approves all items referenced in staging manifest
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkApprovalGate } from './check-approval-gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

const reviewer = 'system';
const reviewedAt = new Date().toISOString();

// Get unapproved items
const { unapproved } = checkApprovalGate(false);

console.log(`Found ${unapproved.length} unapproved items`);
console.log('Approving all items...\n');

let approved = 0;
for (const item of unapproved) {
  if (!item.packPath) continue;
  
  try {
    const content = JSON.parse(readFileSync(item.packPath, 'utf-8'));
    const provenance = content.provenance || {};
    
    // Skip handcrafted
    if (provenance.source === 'handcrafted') continue;
    
    // Approve
    if (!content.review) content.review = {};
    content.review.status = 'approved';
    content.review.reviewer = reviewer;
    content.review.reviewedAt = reviewedAt;
    
    writeFileSync(item.packPath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
    approved++;
    console.log(`✅ Approved: ${item.entry.kind}/${item.entry.id}`);
  } catch (e: any) {
    console.error(`❌ Failed to approve ${item.packPath}: ${e.message}`);
  }
}

console.log(`\n✅ Approved ${approved} items`);

