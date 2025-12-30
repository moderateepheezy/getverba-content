#!/usr/bin/env tsx

/**
 * Export Generation Tests
 * 
 * Tests for export generation:
 * - Export counts match section totals
 * - CSV headers are correct
 * - JSON structure is valid
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    await result;
    console.log(`✅ ${name}`);
  } catch (err: any) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  }
}

async function runTests() {
  await test('export JSON structure is valid', async () => {
    const workspacesDir = join(CONTENT_DIR, 'workspaces');
    if (!existsSync(workspacesDir)) {
      console.log('⏭️  Skipping: No workspaces directory found');
      return;
    }
    
    const workspaces = readdirSync(workspacesDir, { withFileTypes: true })
      .filter((d: any) => d.isDirectory())
      .map((d: any) => d.name);
    
    for (const workspace of workspaces) {
      const exportPath = join(CONTENT_DIR, 'workspaces', workspace, 'exports', 'catalog_export.json');
      
      if (!existsSync(exportPath)) {
        console.log(`⏭️  Skipping ${workspace}: Export not generated yet`);
        continue;
      }
      
      const exportData = JSON.parse(readFileSync(exportPath, 'utf-8'));
      
      if (!exportData.version || exportData.version !== 'v1') {
        throw new Error(`Invalid export version: ${exportData.version}`);
      }
      
      if (!exportData.workspace || exportData.workspace !== workspace) {
        throw new Error(`Export workspace mismatch: ${exportData.workspace} vs ${workspace}`);
      }
      
      if (typeof exportData.total !== 'number') {
        throw new Error('Export total must be a number');
      }
      
      if (!Array.isArray(exportData.items)) {
        throw new Error('Export items must be an array');
      }
      
      if (exportData.items.length !== exportData.total) {
        throw new Error(`Export total (${exportData.total}) doesn't match items length (${exportData.items.length})`);
      }
      
      // Validate first item structure
      if (exportData.items.length > 0) {
        const firstItem = exportData.items[0];
        const requiredFields = [
          'workspace', 'sectionId', 'packId', 'scenario', 'register',
          'primaryStructure', 'level', 'estimatedMinutes', 'variationSlots',
          'drillType', 'cognitiveLoad', 'goal', 'whyThisWorks', 'page', 'position'
        ];
        
        for (const field of requiredFields) {
          if (!(field in firstItem)) {
            throw new Error(`Export item missing required field: ${field}`);
          }
        }
      }
    }
  });
  
  await test('export CSV headers are correct', async () => {
    const workspacesDir = join(CONTENT_DIR, 'workspaces');
    if (!existsSync(workspacesDir)) {
      console.log('⏭️  Skipping: No workspaces directory found');
      return;
    }
    
    const workspaces = readdirSync(workspacesDir, { withFileTypes: true })
      .filter((d: any) => d.isDirectory())
      .map((d: any) => d.name);
    
    const expectedHeaders = [
      'workspace', 'sectionId', 'packId', 'scenario', 'register',
      'primaryStructure', 'level', 'estimatedMinutes', 'variationSlots',
      'drillType', 'cognitiveLoad', 'goal', 'whyThisWorks', 'page', 'position'
    ];
    
    for (const workspace of workspaces) {
      const exportPath = join(CONTENT_DIR, 'workspaces', workspace, 'exports', 'catalog_export.csv');
      
      if (!existsSync(exportPath)) {
        console.log(`⏭️  Skipping ${workspace}: Export not generated yet`);
        continue;
      }
      
      const csvContent = readFileSync(exportPath, 'utf-8');
      const lines = csvContent.trim().split('\n');
      
      if (lines.length === 0) {
        throw new Error('CSV export is empty');
      }
      
      const headers = lines[0].split(',');
      
      if (headers.length !== expectedHeaders.length) {
        throw new Error(`CSV header count mismatch: ${headers.length} vs ${expectedHeaders.length}`);
      }
      
      for (let i = 0; i < expectedHeaders.length; i++) {
        // Remove quotes if present
        const header = headers[i].replace(/^"|"$/g, '');
        if (header !== expectedHeaders[i]) {
          throw new Error(`CSV header mismatch at position ${i}: "${header}" vs "${expectedHeaders[i]}"`);
        }
      }
    }
  });
  
  await test('export counts match section totals', async () => {
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
      const exportPath = join(CONTENT_DIR, 'workspaces', workspace, 'exports', 'catalog_export.json');
      
      if (!existsSync(catalogPath) || !existsSync(exportPath)) {
        console.log(`⏭️  Skipping ${workspace}: Catalog or export not found`);
        continue;
      }
      
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
      const exportData = JSON.parse(readFileSync(exportPath, 'utf-8'));
      
      // Calculate total from section indexes (only counting entries that exist)
      let expectedTotal = 0;
      
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
          
          try {
            const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
            // Count only items whose entry files exist
            for (const item of index.items || []) {
              const entryRelativePath = item.entryUrl.replace(/^\/v1\//, '');
              const entryPath = join(CONTENT_DIR, entryRelativePath);
              if (existsSync(entryPath)) {
                expectedTotal++;
              }
            }
            currentUrl = index.nextPage || null;
          } catch {
            break;
          }
        }
      }
      
      if (exportData.total !== expectedTotal) {
        throw new Error(
          `Export total (${exportData.total}) doesn't match section index total (${expectedTotal}) for workspace ${workspace}`
        );
      }
    }
  });
  
  console.log('\n✅ All export generation tests passed!');
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
