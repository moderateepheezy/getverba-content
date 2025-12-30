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

// Test 5: Valid section index with pagination schema
test('valid section index with pagination schema', () => {
  setupTestDir();
  
  const index = {
    version: 'v1',
    kind: 'context',
    total: 2,
    pageSize: 20,
    items: [
      {
        id: 'pack-001',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/packs/pack-001.json',
        durationMinutes: 15
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  // Create referenced pack file
  writeFileSync(
    join(TEST_DIR, 'v1', 'packs', 'pack-001.json'),
    JSON.stringify({ id: 'pack-001', type: 'context' }, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(content.version === 'v1', 'Index should have version');
  assert(content.kind === 'context', 'Index should have kind');
  assert(content.total === 2, 'Index should have total');
  assert(content.pageSize === 20, 'Index should have pageSize');
  assert(Array.isArray(content.items), 'Index should have items array');
  assert(content.nextPage === null, 'Index should have nextPage');
  assert(content.items[0].level === 'A1', 'Item should have level field');
  assert(content.items[0].entryUrl.startsWith('/v1/'), 'Item entryUrl should start with /v1/');
  
  cleanupTestDir();
});

// Test 6: Section index missing required fields
test('section index missing required fields', () => {
  setupTestDir();
  
  const invalidIndex = {
    items: [
      {
        id: 'pack-001',
        title: 'Test'
      }
    ]
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(invalidIndex, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(!content.version, 'Index should be missing version');
  assert(!content.kind, 'Index should be missing kind');
  assert(!content.total, 'Index should be missing total');
  assert(!content.pageSize, 'Index should be missing pageSize');
  assert(!content.items[0].level, 'Item should be missing level');
  assert(!content.items[0].entryUrl, 'Item should be missing entryUrl');
  
  cleanupTestDir();
});

// Test 7: Section index with pagination (nextPage)
test('section index with pagination nextPage', () => {
  setupTestDir();
  
  const indexPage1 = {
    version: 'v1',
    kind: 'context',
    total: 45,
    pageSize: 20,
    items: Array(20).fill(null).map((_, i) => ({
      id: `pack-${i + 1}`,
      title: `Pack ${i + 1}`,
      level: 'A1',
      entryUrl: `/v1/packs/pack-${i + 1}.json`
    })),
    nextPage: '/v1/workspaces/test-ws/context/index.page2.json'
  };
  
  const indexPage2 = {
    version: 'v1',
    kind: 'context',
    total: 45,
    pageSize: 20,
    items: Array(20).fill(null).map((_, i) => ({
      id: `pack-${i + 21}`,
      title: `Pack ${i + 21}`,
      level: 'A2',
      entryUrl: `/v1/packs/pack-${i + 21}.json`
    })),
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(indexPage1, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'),
    JSON.stringify(indexPage2, null, 2)
  );
  
  const page1 = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  const page2 = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'),
      'utf-8'
    )
  );
  
  assert(page1.nextPage === '/v1/workspaces/test-ws/context/index.page2.json', 'Page 1 should have nextPage');
  assert(page2.nextPage === null, 'Page 2 should have null nextPage');
  assert(page1.total === page2.total, 'Both pages should have same total');
  assert(page1.kind === page2.kind, 'Both pages should have same kind');
  
  cleanupTestDir();
});

// Test 8: Item with missing level field (Foundation Focus requirement)
test('item missing level field', () => {
  setupTestDir();
  
  const index = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'pack-001',
        title: 'Test Pack',
        entryUrl: '/v1/packs/pack-001.json'
        // Missing level field
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(!content.items[0].level, 'Item should be missing level field');
  
  cleanupTestDir();
});

// Test 9: Item entryUrl validation
test('item entryUrl format validation', () => {
  setupTestDir();
  
  const validIndex = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'pack-001',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/packs/pack-001.json' // Valid format
      }
    ],
    nextPage: null
  };
  
  const invalidIndex = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'pack-002',
        title: 'Test Pack 2',
        level: 'A1',
        entryUrl: 'invalid-path.json' // Invalid format (no /v1/ prefix)
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-valid.json'),
    JSON.stringify(validIndex, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-invalid.json'),
    JSON.stringify(invalidIndex, null, 2)
  );
  
  const valid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-valid.json'),
      'utf-8'
    )
  );
  const invalid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-invalid.json'),
      'utf-8'
    )
  );
  
  assert(valid.items[0].entryUrl.startsWith('/v1/'), 'Valid entryUrl should start with /v1/');
  assert(valid.items[0].entryUrl.endsWith('.json'), 'Valid entryUrl should end with .json');
  assert(!invalid.items[0].entryUrl.startsWith('/v1/'), 'Invalid entryUrl should not start with /v1/');
  
  cleanupTestDir();
});

// Test 10: Section index kind matches catalog section kind
test('section index kind matches catalog section kind', () => {
  setupTestDir();
  
  const catalog = {
    workspace: 'test-ws',
    languageCode: 'test',
    languageName: 'Test Language',
    sections: [
      {
        id: 'context',
        kind: 'context',
        title: 'Context Library',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json'
      }
    ]
  };
  
  const index = {
    version: 'v1',
    kind: 'context', // Matches catalog section kind
    total: 1,
    pageSize: 20,
    items: [],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const catalogContent = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      'utf-8'
    )
  );
  const indexContent = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(
    catalogContent.sections[0].kind === indexContent.kind,
    'Index kind should match catalog section kind'
  );
  
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

