#!/usr/bin/env tsx

/**
 * Approval Gate Check
 * 
 * Validates that all content referenced in staging manifest has review.status === "approved"
 * (unless provenance.source === "handcrafted").
 * 
 * Hard fails if any unapproved content is found.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');

interface EntryReference {
  kind: 'pack' | 'drill';
  id: string;
  entryUrl: string;
  workspace: string;
  section?: string;
}

interface UnapprovedEntry {
  entry: EntryReference;
  reason: string;
  packPath?: string;
  reviewStatus?: string;
  provenanceSource?: string;
}

/**
 * Load staging manifest
 */
function loadStagingManifest(): any {
  const manifestPath = join(META_DIR, 'manifest.staging.json');
  if (!existsSync(manifestPath)) {
    throw new Error('Staging manifest not found: manifest.staging.json');
  }
  
  const content = readFileSync(manifestPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Resolve entry URL to file path
 */
function resolveEntryPath(entryUrl: string): string | null {
  // Parse: /v1/workspaces/{ws}/packs/{id}/pack.json
  // or: /v1/workspaces/{ws}/drills/{id}/drill.json
  const match = entryUrl.match(/^\/v1\/workspaces\/([^/]+)\/(packs|drills)\/([^/]+)\/(pack|drill)\.json$/);
  if (!match) {
    return null;
  }
  
  const [, workspace, section, entryId, entryType] = match;
  const fileName = entryType === 'pack' ? 'pack.json' : 'drill.json';
  return join(CONTENT_DIR, 'workspaces', workspace, section, entryId, fileName);
}

/**
 * Extract all entry references from manifest
 */
function extractEntryReferences(manifest: any): EntryReference[] {
  const references: EntryReference[] = [];
  
  if (!manifest.workspaces || !Array.isArray(manifest.workspaces)) {
    return references;
  }
  
  for (const ws of manifest.workspaces) {
    if (!ws.sections || !Array.isArray(ws.sections)) {
      continue;
    }
    
    for (const section of ws.sections) {
      if (!section.itemsUrl) {
        continue;
      }
      
      // Load section index
      const indexMatch = section.itemsUrl.match(/^\/v1\/workspaces\/([^/]+)\/([^/]+)\/index\.json$/);
      if (!indexMatch) {
        continue;
      }
      
      const [, workspace, sectionName] = indexMatch;
      const indexPath = join(CONTENT_DIR, 'workspaces', workspace, sectionName, 'index.json');
      
      if (!existsSync(indexPath)) {
        continue;
      }
      
      try {
        const indexContent = readFileSync(indexPath, 'utf-8');
        const index = JSON.parse(indexContent);
        
        if (index.items && Array.isArray(index.items)) {
          for (const item of index.items) {
            if (item.entryUrl) {
              const entryMatch = item.entryUrl.match(/^\/v1\/workspaces\/([^/]+)\/(packs|drills)\/([^/]+)\/(pack|drill)\.json$/);
              if (entryMatch) {
                const [, , kind, id] = entryMatch;
                references.push({
                  kind: kind as 'pack' | 'drill',
                  id,
                  entryUrl: item.entryUrl,
                  workspace,
                  section: sectionName
                });
              }
            }
          }
        }
      } catch (error: any) {
        console.warn(`Warning: Failed to load index ${indexPath}: ${error.message}`);
      }
    }
  }
  
  return references;
}

/**
 * Check approval status of an entry
 */
function checkEntryApproval(entry: EntryReference): UnapprovedEntry | null {
  const entryPath = resolveEntryPath(entry.entryUrl);
  
  if (!entryPath || !existsSync(entryPath)) {
    return {
      entry,
      reason: `Entry file not found: ${entryPath || entry.entryUrl}`
    };
  }
  
  try {
    const content = readFileSync(entryPath, 'utf-8');
    const entryDoc = JSON.parse(content);
    
    // Check provenance
    const provenance = entryDoc.provenance;
    const review = entryDoc.review;
    
    // Handcrafted entries are exempt
    if (provenance && provenance.source === 'handcrafted') {
      return null; // Approved (handcrafted)
    }
    
    // Generated entries must have review.status === "approved"
    if (!review) {
      return {
        entry,
        reason: 'Missing review block (required for generated content)',
        packPath: entryPath
      };
    }
    
    if (review.status !== 'approved') {
      return {
        entry,
        reason: `Review status is "${review.status}", must be "approved"`,
        packPath: entryPath,
        reviewStatus: review.status,
        provenanceSource: provenance?.source
      };
    }
    
    // If approved, must have reviewer and reviewedAt
    if (!review.reviewer || !review.reviewedAt) {
      return {
        entry,
        reason: 'Approved entry missing reviewer or reviewedAt',
        packPath: entryPath,
        reviewStatus: review.status
      };
    }
    
    // Meaning-safety gate: If approved and generated, all prompts must have gloss_en and intent
    if (review.status === 'approved' && provenance && provenance.source !== 'handcrafted') {
      const prompts = entryDoc.prompts;
      if (Array.isArray(prompts)) {
        for (let i = 0; i < prompts.length; i++) {
          const prompt = prompts[i];
          if (!prompt.gloss_en || typeof prompt.gloss_en !== 'string' || prompt.gloss_en.trim() === '') {
            return {
              entry,
              reason: `Prompt ${i} missing or empty gloss_en (required for approved generated content)`,
              packPath: entryPath,
              reviewStatus: review.status,
              provenanceSource: provenance.source
            };
          }
          if (!prompt.intent || typeof prompt.intent !== 'string' || prompt.intent.trim() === '') {
            return {
              entry,
              reason: `Prompt ${i} missing or empty intent (required for approved generated content)`,
              packPath: entryPath,
              reviewStatus: review.status,
              provenanceSource: provenance.source
            };
          }
        }
      }
    }
    
    return null; // Approved
  } catch (error: any) {
    return {
      entry,
      reason: `Error reading entry: ${error.message}`,
      packPath: entryPath
    };
  }
}

/**
 * Check all entries in staging manifest
 */
export function checkApprovalGate(skipGate: boolean = false): { passed: boolean; unapproved: UnapprovedEntry[] } {
  if (skipGate) {
    console.log('⚠️  Approval gate skipped (--skip-approval-gate)');
    return { passed: true, unapproved: [] };
  }
  
  const manifest = loadStagingManifest();
  const references = extractEntryReferences(manifest);
  
  console.log(`🔍 Checking approval status for ${references.length} entry/entries...`);
  
  const unapproved: UnapprovedEntry[] = [];
  
  for (const entry of references) {
    const result = checkEntryApproval(entry);
    if (result) {
      unapproved.push(result);
    }
  }
  
  return {
    passed: unapproved.length === 0,
    unapproved
  };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const skipGate = args.includes('--skip-approval-gate');
  
  try {
    const result = checkApprovalGate(skipGate);
    
    if (result.passed) {
      console.log('✅ Approval gate passed: All referenced entries are approved');
      process.exit(0);
    } else {
      console.error('❌ Approval gate failed: Unapproved entries found');
      console.error('');
      
      for (const entry of result.unapproved) {
        console.error(`   ${entry.entry.kind}/${entry.entry.id} (${entry.entry.workspace}):`);
        console.error(`     Reason: ${entry.reason}`);
        if (entry.packPath) {
          console.error(`     Path: ${entry.packPath}`);
        }
        if (entry.reviewStatus) {
          console.error(`     Review status: ${entry.reviewStatus}`);
        }
        if (entry.provenanceSource) {
          console.error(`     Source: ${entry.provenanceSource}`);
        }
        console.error('');
      }
      
      console.error(`❌ Found ${result.unapproved.length} unapproved entry/entries.`);
      console.error('   All entries must be approved before promoting to production.');
      console.error('   Use: ./scripts/approve-pack.sh <packId> --reviewer <name>');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

