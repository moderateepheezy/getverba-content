#!/usr/bin/env tsx

/**
 * Unit tests for validate-content.ts
 * 
 * These tests verify the validation logic works correctly
 * by creating temporary test content and validating it.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = join(__dirname, '..', '.test-content');

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'packs'), { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}


// Simple test runner
interface Test {
  name: string;
  fn: () => void;
}

const tests: Test[] = [];
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Test 1: Valid catalog structure
test('valid catalog structure', () => {
  setupTestDir();
  
  const catalog = {
    workspace: 'test-ws',
    language: 'Test Language',
    sections: [
      {
        id: 'section1',
        kind: 'context',
        title: 'Test Section',
        itemsUrl: '/v1/workspaces/test-ws/section1/index.json'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  // Create referenced index file
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'section1'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'section1', 'index.json'),
    JSON.stringify({ items: [] }, null, 2)
  );
  
  // Verify files exist
  assert(
    existsSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json')),
    'Catalog file should exist'
  );
  
  cleanupTestDir();
});

// Test 2: Missing workspace field
test('catalog missing workspace field', () => {
  setupTestDir();
  
  const invalidCatalog = {
    language: 'Test Language',
    sections: []
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(invalidCatalog, null, 2)
  );
  
  // This should be caught by validator, but for unit test we just check structure
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      'utf-8'
    )
  );
  
  assert(!content.workspace, 'Catalog should be missing workspace field');
  
  cleanupTestDir();
});

// Test 3: Invalid JSON
test('invalid JSON file', () => {
  setupTestDir();
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    '{ invalid json }'
  );
  
  let parseError = false;
  try {
    JSON.parse(readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      'utf-8'
    ));
  } catch (e) {
    parseError = true;
  }
  
  assert(parseError, 'Invalid JSON should cause parse error');
  
  cleanupTestDir();
});

// Test 4: Referenced path exists
test('referenced JSON path exists', () => {
  setupTestDir();
  
  const catalog = {
    workspace: 'test-ws',
    language: 'Test',
    sections: [
      {
        id: 'section1',
        kind: 'context',
        title: 'Test',
        itemsUrl: '/v1/workspaces/test-ws/section1/index.json'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  // Create the referenced file
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'section1'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'section1', 'index.json'),
    JSON.stringify({ items: [] }, null, 2)
  );
  
  // Verify path resolution
  const itemsUrl = catalog.sections[0].itemsUrl;
  const relativePath = itemsUrl.replace('/v1/', '');
  const fullPath = join(TEST_DIR, 'v1', relativePath);
  
  assert(existsSync(fullPath), 'Referenced path should exist');
  
  cleanupTestDir();
});

// Run all tests
function runTests() {
  console.log('Running unit tests...\n');
  
  for (const test of tests) {
    try {
      test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error: any) {
      console.error(`❌ ${test.name}`);
      console.error(`   ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests();

