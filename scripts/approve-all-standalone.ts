#!/usr/bin/env tsx

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');

// Load staging manifest
const manifestPath = join(META_DIR, 'manifest.staging.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Extract all entry references from catalog
function extractEntryUrls(manifest: any): Array<{ workspace: string; kind: string; id: string; entryUrl: string }> {
  const urls: Array<{ workspace: string; kind: string; id: string; entryUrl: string }> = [];
  
  if (!manifest.workspaces) return urls;
  
  for (const [workspace, catalogPath] of Object.entries(manifest.workspaces)) {
    if (typeof catalogPath !== 'string') continue;
    
    const catalogMatch = catalogPath.match(/^\/v1\/workspaces\/([^/]+)\/catalog\.json$/);
    if (!catalogMatch) continue;
    
    const catalogPathResolved = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
    try {
      const catalog = JSON.parse(readFileSync(catalogPathResolved, 'utf-8'));
      
      // Extract from sections
      if (catalog.sections && Array.isArray(catalog.sections)) {
        for (const section of catalog.sections) {
          if (!section.itemsUrl) continue;
          
          const indexMatch = section.itemsUrl.match(/^\/v1\/workspaces\/([^/]+)\/([^/]+)\/index\.json$/);
          if (!indexMatch) continue;
          
          const [, workspaceFromUrl, sectionName] = indexMatch;
          const indexPath = join(CONTENT_DIR, 'workspaces', workspaceFromUrl, sectionName, 'index.json');
          
          try {
            const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
            
            if (index.items && Array.isArray(index.items)) {
              for (const item of index.items) {
                if (item.entryUrl) {
                  const entryMatch = item.entryUrl.match(/^\/v1\/workspaces\/([^/]+)\/(packs|drills)\/([^/]+)\/(pack|drill)\.json$/);
                  if (entryMatch) {
                    const [, , kind, id] = entryMatch;
                    urls.push({ workspace: workspaceFromUrl, kind, id, entryUrl: item.entryUrl });
                  }
                }
              }
            }
          } catch (e) {}
        }
      }
      
      // Extract from mechanics index
      const mechanicsIndexPath = join(CONTENT_DIR, 'workspaces', workspace, 'mechanics', 'index.json');
      try {
        const mechanicsIndex = JSON.parse(readFileSync(mechanicsIndexPath, 'utf-8'));
        
        if (mechanicsIndex.mechanics && Array.isArray(mechanicsIndex.mechanics)) {
          for (const mechanic of mechanicsIndex.mechanics) {
            if (!mechanic.itemsUrl) continue;
            
            const mechanicMatch = mechanic.itemsUrl.match(/^\/v1\/workspaces\/([^/]+)\/mechanics\/([^/]+)\/index\.json$/);
            if (!mechanicMatch) continue;
            
            const [, workspaceFromUrl, mechanicId] = mechanicMatch;
            const mechanicIndexPath = join(CONTENT_DIR, 'workspaces', workspaceFromUrl, 'mechanics', mechanicId, 'index.json');
            
            try {
              const mechanicIndex = JSON.parse(readFileSync(mechanicIndexPath, 'utf-8'));
              
              if (mechanicIndex.items && Array.isArray(mechanicIndex.items)) {
                for (const item of mechanicIndex.items) {
                  if (item.entryUrl) {
                    const entryMatch = item.entryUrl.match(/^\/v1\/workspaces\/([^/]+)\/drills\/([^/]+)\/drill\.json$/);
                    if (entryMatch) {
                      const [, , id] = entryMatch;
                      if (!urls.find(u => u.entryUrl === item.entryUrl)) {
                        urls.push({ workspace: workspaceFromUrl, kind: 'drill', id, entryUrl: item.entryUrl });
                      }
                    }
                  }
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    } catch (e) {}
  }
  
  return urls;
}

const entryUrls = extractEntryUrls(manifest);
console.log(`Found ${entryUrls.length} entries in manifest`);

const reviewer = 'system';
const reviewedAt = new Date().toISOString();
let approved = 0;
let skipped = 0;

for (const entry of entryUrls) {
  const filePath = join(CONTENT_DIR, 'workspaces', entry.workspace, entry.kind + 's', entry.id, entry.kind === 'pack' ? 'pack.json' : 'drill.json');
  
  if (!existsSync(filePath)) {
    console.error(`⚠️  File not found: ${filePath}`);
    continue;
  }
  
  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    const provenance = content.provenance || {};
    
    // Skip handcrafted
    if (provenance.source === 'handcrafted') {
      skipped++;
      continue;
    }
    
    // Approve if not already approved
    if (!content.review) content.review = {};
    if (content.review.status !== 'approved') {
      content.review.status = 'approved';
      content.review.reviewer = reviewer;
      content.review.reviewedAt = reviewedAt;
      
      writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
      approved++;
      console.log(`✅ Approved: ${entry.kind}/${entry.id}`);
    } else {
      skipped++;
    }
  } catch (e: any) {
    console.error(`❌ Failed to approve ${filePath}: ${e.message}`);
  }
}

console.log(`\n✅ Approved ${approved} items`);
console.log(`ℹ️  Skipped ${skipped} items (already approved or handcrafted)`);

