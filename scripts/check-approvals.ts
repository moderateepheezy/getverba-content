#!/usr/bin/env tsx

/**
 * Check Approval Preflight
 * 
 * Verifies that all items referenced in the staging manifest are approved
 * in the review queue before promotion.
 * 
 * Usage: tsx scripts/check-approvals.ts <manifest-path>
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const REVIEW_DIR = join(__dirname, '..', 'content', 'review');

interface ReviewItem {
  id: string;
  kind: string;
  workspace: string;
  scenario?: string;
  level?: string;
  title?: string;
  createdAt?: string;
  sourceTemplate?: string;
}

interface Catalog {
  workspace: string;
  sections: Array<{
    id: string;
    kind: string;
    itemsUrl: string;
  }>;
}

interface SectionIndex {
  items: Array<{
    id: string;
    kind: string;
    entryUrl: string;
  }>;
}

interface Manifest {
  workspaces: string[] | Record<string, string>;
  workspaceHashes?: Record<string, string>;
}

/**
 * Extract item ID from entryUrl
 */
function extractItemId(entryUrl: string, kind: string): { id: string; workspace: string } | null {
  // Pattern: /v1/workspaces/{workspace}/packs/{id}/pack.json
  // Pattern: /v1/workspaces/{workspace}/drills/{id}/drill.json
  // Pattern: /v1/workspaces/{workspace}/exams/{id}/exam.json
  
  const match = entryUrl.match(/^\/v1\/workspaces\/([^/]+)\/(packs|drills|exams)\/([^/]+)\/(pack|drill|exam)\.json$/);
  if (!match) {
    return null;
  }
  
  const [, workspace, type, id] = match;
  return { id, workspace };
}

/**
 * Load all items from a section index
 */
function loadSectionIndex(itemsUrl: string): SectionIndex | null {
  // itemsUrl is like /v1/workspaces/de/context/index.json
  // Convert to local path
  const relativePath = itemsUrl.replace(/^\/v1\//, '');
  const indexPath = join(CONTENT_DIR, relativePath);
  
  if (!existsSync(indexPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Collect all item IDs referenced in manifest
 */
function collectManifestItems(manifestPath: string): Array<{ id: string; kind: string; workspace: string; entryUrl: string }> {
  const manifestContent = readFileSync(manifestPath, 'utf-8');
  const manifest: Manifest = JSON.parse(manifestContent);
  
  const items: Array<{ id: string; kind: string; workspace: string; entryUrl: string }> = [];
  
  // Handle both array and object formats for workspaces
  let workspaceList: string[] = [];
  if (Array.isArray(manifest.workspaces)) {
    workspaceList = manifest.workspaces;
  } else if (typeof manifest.workspaces === 'object' && manifest.workspaces !== null) {
    workspaceList = Object.keys(manifest.workspaces);
  }
  
  // For each workspace, load catalog and traverse sections
  for (const workspace of workspaceList) {
    const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
    if (!existsSync(catalogPath)) {
      continue;
    }
    
    try {
      const catalogContent = readFileSync(catalogPath, 'utf-8');
      const catalog: Catalog = JSON.parse(catalogContent);
      
      for (const section of catalog.sections || []) {
        const index = loadSectionIndex(section.itemsUrl);
        if (!index || !index.items) {
          continue;
        }
        
        for (const item of index.items) {
          const extracted = extractItemId(item.entryUrl, item.kind);
          if (extracted) {
            items.push({
              id: extracted.id,
              kind: item.kind,
              workspace: extracted.workspace,
              entryUrl: item.entryUrl
            });
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️  Failed to process workspace ${workspace}: ${err}`);
    }
  }
  
  return items;
}

/**
 * Load approved items
 */
function loadApprovedItems(): Set<string> {
  const approvedPath = join(REVIEW_DIR, 'approved.json');
  if (!existsSync(approvedPath)) {
    return new Set();
  }
  
  try {
    const content = readFileSync(approvedPath, 'utf-8');
    const approved: ReviewItem[] = JSON.parse(content);
    
    // Create set of "workspace:id" keys
    const approvedSet = new Set<string>();
    for (const item of approved) {
      approvedSet.add(`${item.workspace}:${item.id}`);
    }
    
    return approvedSet;
  } catch {
    return new Set();
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('❌ Error: Manifest path required');
    console.error('Usage: tsx scripts/check-approvals.ts <manifest-path>');
    process.exit(1);
  }
  
  const manifestPath = args[0];
  
  if (!existsSync(manifestPath)) {
    console.error(`❌ Error: Manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  
  console.log('🔍 Checking approval status for all manifest items...\n');
  
  // Collect all items from manifest
  const manifestItems = collectManifestItems(manifestPath);
  console.log(`   Found ${manifestItems.length} items in manifest`);
  
  // Load approved items
  const approvedSet = loadApprovedItems();
  console.log(`   Found ${approvedSet.size} approved items`);
  
  // Check each item
  const unapproved: Array<{ id: string; kind: string; workspace: string; entryUrl: string }> = [];
  
  for (const item of manifestItems) {
    const key = `${item.workspace}:${item.id}`;
    if (!approvedSet.has(key)) {
      unapproved.push(item);
    }
  }
  
  if (unapproved.length > 0) {
    console.error('\n❌ Promotion blocked: Found unapproved items in staging manifest');
    console.error('');
    console.error('Unapproved items:');
    for (const item of unapproved) {
      console.error(`  - ${item.workspace}:${item.id} (${item.kind}) - ${item.entryUrl}`);
    }
    console.error('');
    console.error('To approve items:');
    console.error('  1. Review items in content/review/pending.json');
    console.error('  2. Move approved items to content/review/approved.json');
    console.error('  3. Re-run promotion');
    process.exit(1);
  }
  
  console.log('\n✅ All items are approved');
}

main();

