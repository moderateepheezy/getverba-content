#!/usr/bin/env tsx

/**
 * Unit tests for workspace hash generation
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = join(__dirname, '..', '.test-hashes');

// Simple hash computation for testing (same logic as generate-workspace-hashes.ts)
import { createHash } from 'crypto';

function stableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function collectIndexFilesRecursive(indexPath: string, contentDir: string, visited: Set<string> = new Set()): string[] {
  const files: string[] = [];
  
  if (visited.has(indexPath)) {
    return files; // Loop
  }
  visited.add(indexPath);
  
  const fullPath = join(contentDir, indexPath.replace(/^\/v1\//, ''));
  if (!existsSync(fullPath)) {
    return files;
  }
  
  files.push(fullPath);
  
  try {
    const index = JSON.parse(readFileSync(fullPath, 'utf-8'));
    if (typeof index.nextPage === 'string') {
      files.push(...collectIndexFilesRecursive(index.nextPage, contentDir, visited));
    }
  } catch (err) {
    // Skip invalid
  }
  
  return files;
}

function computeTestHash(workspace: string, contentDir: string): string {
  const files: string[] = [];
  const catalogPath = join(contentDir, 'workspaces', workspace, 'catalog.json');
  
  if (existsSync(catalogPath)) {
    files.push(catalogPath);
    
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    if (Array.isArray(catalog.sections)) {
      for (const section of catalog.sections) {
        if (section.itemsUrl) {
          // Collect all index files (including pagination)
          files.push(...collectIndexFilesRecursive(section.itemsUrl, contentDir));
          
          // Collect entry documents from all index pages
          const indexFiles = collectIndexFilesRecursive(section.itemsUrl, contentDir);
          for (const indexFile of indexFiles) {
            try {
              const index = JSON.parse(readFileSync(indexFile, 'utf-8'));
              if (Array.isArray(index.items)) {
                for (const item of index.items) {
                  if (item.entryUrl) {
                    const entryPath = join(contentDir, item.entryUrl.replace(/^\/v1\//, ''));
                    if (existsSync(entryPath) && !files.includes(entryPath)) {
                      files.push(entryPath);
                    }
                  }
                }
              }
            } catch (err) {
              // Skip invalid
            }
          }
        }
      }
    }
  }
  
  files.sort();
  const hash = createHash('sha256');
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(content);
    const stable = stableStringify(parsed);
    hash.update(stable);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'pack-1'), { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error: any) {
    console.error(`❌ ${name}`);
    console.error(`   ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('Running workspace hash generation tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Same content -> same hash
  const result1 = await test('same content produces same hash', async () => {
    setupTestDir();
    
    const catalog = {
      schemaVersion: 1,
      version: 'v1',
      workspace: 'test-ws',
      languageCode: 'test',
      languageName: 'Test',
      sections: []
    };
    
    writeFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      JSON.stringify(catalog, null, 2)
    );
    
    const contentDir = join(TEST_DIR, 'v1');
    const hash1 = computeTestHash('test-ws', contentDir);
    const hash2 = computeTestHash('test-ws', contentDir);
    
    if (hash1 !== hash2) {
      throw new Error(`Hashes differ: ${hash1} vs ${hash2}`);
    }
    
    cleanupTestDir();
  });
  if (result1) passed++; else failed++;
  
  // Test 2: Modifying one entry -> hash changes
  const result2 = await test('modifying content changes hash', async () => {
    setupTestDir();
    
    const catalog1 = {
      schemaVersion: 1,
      version: 'v1',
      workspace: 'test-ws',
      languageCode: 'test',
      languageName: 'Test',
      sections: []
    };
    
    const catalog2 = {
      schemaVersion: 1,
      version: 'v1',
      workspace: 'test-ws',
      languageCode: 'test',
      languageName: 'Test Modified', // Changed
      sections: []
    };
    
    writeFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      JSON.stringify(catalog1, null, 2)
    );
    const contentDir = join(TEST_DIR, 'v1');
    const hash1 = computeTestHash('test-ws', contentDir);
    
    writeFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      JSON.stringify(catalog2, null, 2)
    );
    const hash2 = computeTestHash('test-ws', contentDir);
    
    if (hash1 === hash2) {
      throw new Error(`Hashes should differ but are the same: ${hash1}`);
    }
    
    cleanupTestDir();
  });
  if (result2) passed++; else failed++;
  
  // Test 3: Hash is deterministic (same content = same hash)
  const result3 = await test('hash is deterministic and stable', async () => {
    setupTestDir();
    
    const catalog = {
      schemaVersion: 1,
      version: 'v1',
      workspace: 'test-ws',
      languageCode: 'test',
      languageName: 'Test',
      sections: []
    };
    
    writeFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      JSON.stringify(catalog, null, 2)
    );
    
    const contentDir = join(TEST_DIR, 'v1');
    const hash1 = computeTestHash('test-ws', contentDir);
    
    // Recompute without changes
    const hash2 = computeTestHash('test-ws', contentDir);
    const hash3 = computeTestHash('test-ws', contentDir);
    
    if (hash1 !== hash2 || hash2 !== hash3) {
      throw new Error(`Hashes should be identical but got: ${hash1}, ${hash2}, ${hash3}`);
    }
    
    cleanupTestDir();
  });
  if (result3) passed++; else failed++;
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

