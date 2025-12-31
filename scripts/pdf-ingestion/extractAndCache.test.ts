#!/usr/bin/env tsx

/**
 * Unit tests for extraction cache
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeCacheKey, getCachePath, loadCachedExtraction, saveCachedExtraction } from './extractAndCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const TEST_CACHE_DIR = join(PROJECT_ROOT, '.test-pdf-cache');

// Simple test framework
function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`✓ ${name}`);
      }).catch((error: any) => {
        console.error(`✗ ${name}`);
        console.error(`  ${error.message}`);
        throw error;
      });
    } else {
      console.log(`✓ ${name}`);
    }
  } catch (error: any) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    throw error;
  }
}

function expectTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Expected true, got false');
  }
}

function expectEqual(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Setup/teardown
function setupTestDir() {
  if (existsSync(TEST_CACHE_DIR)) {
    rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_CACHE_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_CACHE_DIR)) {
    rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
  }
}

// Test: Cache key stability (same file => same key)
test('cache key stability', () => {
  setupTestDir();
  
  try {
    // Create a test file
    const testFile = join(TEST_CACHE_DIR, 'test.pdf');
    const content = 'This is test PDF content';
    writeFileSync(testFile, content, 'utf-8');
    
    // Compute cache key twice
    const key1 = computeCacheKey(testFile);
    const key2 = computeCacheKey(testFile);
    
    expectEqual(key1, key2, 'Same file should produce same cache key');
    expectTrue(key1.length > 0, 'Cache key should not be empty');
    expectTrue(key1.includes('-'), 'Cache key should contain separator');
    
    console.log('   ✅ Cache key is stable');
  } finally {
    cleanupTestDir();
  }
});

// Test: Cache key differs for different files
test('cache key differs for different files', () => {
  setupTestDir();
  
  try {
    const testFile1 = join(TEST_CACHE_DIR, 'test1.pdf');
    const testFile2 = join(TEST_CACHE_DIR, 'test2.pdf');
    
    writeFileSync(testFile1, 'Content 1', 'utf-8');
    writeFileSync(testFile2, 'Content 2', 'utf-8');
    
    const key1 = computeCacheKey(testFile1);
    const key2 = computeCacheKey(testFile2);
    
    expectTrue(key1 !== key2, 'Different files should produce different cache keys');
    
    console.log('   ✅ Cache keys differ for different files');
  } finally {
    cleanupTestDir();
  }
});

// Test: Get cache path
test('get cache path', () => {
  setupTestDir();
  
  try {
    const profileId = 'test-profile';
    const cacheKey = 'test-key-123';
    
    const cachePath = getCachePath(profileId, cacheKey);
    
    expectTrue(cachePath.includes(profileId), 'Cache path should include profile ID');
    expectTrue(cachePath.includes(cacheKey), 'Cache path should include cache key');
    expectTrue(cachePath.endsWith('.json'), 'Cache path should end with .json');
    
    console.log('   ✅ Cache path format correct');
  } finally {
    cleanupTestDir();
  }
});

// Test: Save and load cached extraction
test('save and load cached extraction', () => {
  setupTestDir();
  
  try {
    const profileId = 'test-profile';
    const cacheKey = 'test-key-123';
    const pdfPath = 'test.pdf';
    
    const extraction = {
      pages: [
        { pageNumber: 1, text: 'Page 1', charCount: 6 },
        { pageNumber: 2, text: 'Page 2', charCount: 6 }
      ],
      method: 'text' as const,
      warnings: [],
      pageCount: 2,
      totalChars: 12,
      avgCharsPerPage: 6
    };
    
    // Save cache
    const cachePath = saveCachedExtraction(profileId, cacheKey, pdfPath, extraction);
    expectTrue(existsSync(cachePath), 'Cache file should be created');
    
    // Load cache
    const cached = loadCachedExtraction(profileId, cacheKey);
    expectTrue(cached !== null, 'Should load cached extraction');
    if (cached) {
      expectEqual(cached.pdfId, profileId, 'Should have correct pdfId');
      expectEqual(cached.cacheKey, cacheKey, 'Should have correct cacheKey');
      expectEqual(cached.pages.length, 2, 'Should have correct page count');
      expectEqual(cached.totalChars, 12, 'Should have correct total chars');
    }
    
    console.log('   ✅ Save and load cache works');
  } finally {
    cleanupTestDir();
  }
});

// Test: Load non-existent cache returns null
test('load non-existent cache returns null', () => {
  setupTestDir();
  
  try {
    const cached = loadCachedExtraction('non-existent', 'non-existent-key');
    expectTrue(cached === null, 'Should return null for non-existent cache');
    
    console.log('   ✅ Non-existent cache handling correct');
  } finally {
    cleanupTestDir();
  }
});

// Test: Cache version mismatch invalidates cache
test('cache version mismatch invalidates cache', () => {
  setupTestDir();
  
  try {
    const profileId = 'test-profile';
    const cacheKey = 'test-key-123';
    const pdfPath = 'test.pdf';
    
    const extraction = {
      pages: [{ pageNumber: 1, text: 'Page 1', charCount: 6 }],
      method: 'text' as const,
      warnings: [],
      pageCount: 1,
      totalChars: 6,
      avgCharsPerPage: 6
    };
    
    // Save with old version
    const cachePath = saveCachedExtraction(profileId, cacheKey, pdfPath, extraction);
    
    // Manually modify cache to have old version
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
    cached.extractionVersion = '0.9.0'; // Old version
    writeFileSync(cachePath, JSON.stringify(cached, null, 2));
    
    // Try to load - should return null due to version mismatch
    const loaded = loadCachedExtraction(profileId, cacheKey);
    expectTrue(loaded === null, 'Should return null for version mismatch');
    
    console.log('   ✅ Cache version mismatch handling correct');
  } finally {
    cleanupTestDir();
  }
});

// Test: Cache key includes file hash and version
test('cache key includes file hash and version', () => {
  setupTestDir();
  
  try {
    const testFile = join(TEST_CACHE_DIR, 'test.pdf');
    writeFileSync(testFile, 'Test content', 'utf-8');
    
    const key = computeCacheKey(testFile);
    
    // Key should have format: <fileHash>-<versionHash>
    const parts = key.split('-');
    expectTrue(parts.length >= 2, 'Cache key should have at least 2 parts');
    expectTrue(parts[0].length >= 8, 'File hash part should be at least 8 chars');
    expectTrue(parts[1].length >= 4, 'Version hash part should be at least 4 chars');
    
    console.log('   ✅ Cache key format correct');
  } finally {
    cleanupTestDir();
  }
});

// Main test runner
async function main() {
  console.log('🧪 Running extraction cache tests...\n');
  
  try {
    await test('cache key stability', () => {});
    await test('cache key differs for different files', () => {});
    await test('get cache path', () => {});
    await test('save and load cached extraction', () => {});
    await test('load non-existent cache returns null', () => {});
    
    console.log('\n✅ All extraction cache tests passed!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

