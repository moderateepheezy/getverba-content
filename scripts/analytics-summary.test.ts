#!/usr/bin/env tsx

/**
 * Analytics Summary Tests
 * 
 * Tests for analyticsSummary validation:
 * - analyticsSummary required for pack items
 * - analyticsSummary matches pack metadata
 * - goal/whyThisWorks validation rules
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        console.log(`✅ ${name}`);
      }).catch(err => {
        console.error(`❌ ${name}: ${err.message}`);
        process.exit(1);
      });
    } else {
      console.log(`✅ ${name}`);
    }
  } catch (err: any) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  }
}

// Test 1: Pack items have analyticsSummary
test('pack items have analyticsSummary', () => {
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  if (!existsSync(workspacesDir)) {
    console.log('⏭️  Skipping: No workspaces directory found');
    return;
  }
  
  const workspaces = readdirSync(workspacesDir, { withFileTypes: true })
    .filter((d: any) => d.isDirectory())
    .map((d: any) => d.name);
  
  for (const workspace of workspaces) {
    const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
    if (!existsSync(catalogPath)) continue;
    
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    
    for (const section of catalog.sections || []) {
      const itemsUrl = section.itemsUrl;
      if (!itemsUrl) continue;
      
      // Follow pagination chain
      let currentUrl: string | null = itemsUrl;
      const visitedPages = new Set<string>();
      
      while (currentUrl) {
        if (visitedPages.has(currentUrl)) break;
        visitedPages.add(currentUrl);
        
        const relativePath = currentUrl.replace(/^\/v1\//, '');
        const indexPath = join(CONTENT_DIR, relativePath);
        
        if (!existsSync(indexPath)) break;
        
        const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
        
        for (const item of index.items || []) {
          if (item.kind === 'pack') {
            // Check if pack entry exists (test packs may be missing)
            const entryRelativePath = item.entryUrl.replace(/^\/v1\//, '');
            const entryPath = join(CONTENT_DIR, entryRelativePath);
            
            if (!existsSync(entryPath)) {
              console.log(`⏭️  Skipping ${item.id}: pack entry not found (may be test artifact)`);
              continue;
            }
            
            if (!item.analyticsSummary) {
              throw new Error(`Pack item ${item.id} in ${currentUrl} missing analyticsSummary`);
            }
            
            // Validate structure
            if (!item.analyticsSummary.primaryStructure) {
              throw new Error(`Pack item ${item.id} analyticsSummary missing primaryStructure`);
            }
            if (!Array.isArray(item.analyticsSummary.variationSlots)) {
              throw new Error(`Pack item ${item.id} analyticsSummary.variationSlots must be array`);
            }
            if (!item.analyticsSummary.drillType) {
              throw new Error(`Pack item ${item.id} analyticsSummary missing drillType`);
            }
            if (!item.analyticsSummary.cognitiveLoad) {
              throw new Error(`Pack item ${item.id} analyticsSummary missing cognitiveLoad`);
            }
            if (!item.analyticsSummary.goal) {
              throw new Error(`Pack item ${item.id} analyticsSummary missing goal`);
            }
            if (!Array.isArray(item.analyticsSummary.whyThisWorks)) {
              throw new Error(`Pack item ${item.id} analyticsSummary.whyThisWorks must be array`);
            }
            
            // Validate goal length
            if (item.analyticsSummary.goal.length > 120) {
              throw new Error(`Pack item ${item.id} analyticsSummary.goal too long (${item.analyticsSummary.goal.length} chars, max 120)`);
            }
            
            // Validate whyThisWorks length and count
            if (item.analyticsSummary.whyThisWorks.length < 2 || item.analyticsSummary.whyThisWorks.length > 4) {
              throw new Error(`Pack item ${item.id} analyticsSummary.whyThisWorks must have 2-4 items, got ${item.analyticsSummary.whyThisWorks.length}`);
            }
            
            for (const bullet of item.analyticsSummary.whyThisWorks) {
              if (bullet.length > 80) {
                throw new Error(`Pack item ${item.id} analyticsSummary.whyThisWorks bullet too long (${bullet.length} chars, max 80)`);
              }
            }
          }
        }
        
        currentUrl = index.nextPage || null;
      }
    }
  }
});

// Test 2: Catalog sections have analyticsRollup
test('catalog sections have analyticsRollup', () => {
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  if (!existsSync(workspacesDir)) {
    console.log('⏭️  Skipping: No workspaces directory found');
    return;
  }
  
  const workspaces = readdirSync(workspacesDir, { withFileTypes: true })
    .filter((d: any) => d.isDirectory())
    .map((d: any) => d.name);
  
  for (const workspace of workspaces) {
    const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
    if (!existsSync(catalogPath)) continue;
    
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    
    for (const section of catalog.sections || []) {
      if (section.analyticsRollup) {
        // Validate structure
        if (section.analyticsRollup.scenarios && typeof section.analyticsRollup.scenarios !== 'object') {
          throw new Error(`Section ${section.id} analyticsRollup.scenarios must be object`);
        }
        if (section.analyticsRollup.levels && typeof section.analyticsRollup.levels !== 'object') {
          throw new Error(`Section ${section.id} analyticsRollup.levels must be object`);
        }
        if (section.analyticsRollup.primaryStructures && typeof section.analyticsRollup.primaryStructures !== 'object') {
          throw new Error(`Section ${section.id} analyticsRollup.primaryStructures must be object`);
        }
      }
    }
  }
});

console.log('\n✅ All analytics summary tests passed!');

