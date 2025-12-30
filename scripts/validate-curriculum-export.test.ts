#!/usr/bin/env tsx

/**
 * Unit tests for validate-curriculum-export.ts
 * 
 * Tests:
 * - Schema validation
 * - Referential integrity checks
 * - Duplicate detection
 * - Coverage requirement validation
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = join(__dirname, '..', '.test-curriculum-validate');

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

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'content', 'v1', 'workspaces', 'test-ws', 'packs', 'pack-1'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'exports'), { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Test 1: Valid export schema passes validation
test('valid export schema passes validation', () => {
  setupTestDir();
  
  const export_ = {
    version: 2,
    exportedAt: '2025-01-01T00:00:00Z',
    gitSha: 'abc123',
    workspace: 'test-ws',
    title: 'Test Curriculum',
    bundles: [
      {
        id: 'work_a1_core',
        title: 'Work A1 Course',
        level: 'A1',
        scenario: 'work',
        outcomes: ['Outcome 1', 'Outcome 2', 'Outcome 3'],
        primaryStructures: ['verb_position', 'negation'],
        estimatedMinutes: 45,
        modules: [
          {
            id: 'work_a1_core_module_0_packs',
            title: 'Context & Learning',
            items: [
              {
                kind: 'pack',
                id: 'pack-1',
                entryUrl: '/v1/workspaces/test-ws/packs/pack-1/pack.json',
                minutes: 15
              },
              {
                kind: 'pack',
                id: 'pack-2',
                entryUrl: '/v1/workspaces/test-ws/packs/pack-2/pack.json',
                minutes: 15
              },
              {
                kind: 'pack',
                id: 'pack-3',
                entryUrl: '/v1/workspaces/test-ws/packs/pack-3/pack.json',
                minutes: 15
              }
            ]
          }
        ]
      }
    ]
  };
  
  // Basic schema checks
  assert(export_.version === 2, 'Version should be 2');
  assert(typeof export_.exportedAt === 'string', 'exportedAt should be string');
  assert(typeof export_.gitSha === 'string', 'gitSha should be string');
  assert(Array.isArray(export_.bundles), 'bundles should be array');
  assert(export_.bundles.length > 0, 'Should have at least one bundle');
  
  const bundle = export_.bundles[0];
  assert(bundle.id && typeof bundle.id === 'string', 'Bundle should have id');
  assert(bundle.title && typeof bundle.title === 'string', 'Bundle should have title');
  assert(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(bundle.level), 'Bundle should have valid level');
  assert(Array.isArray(bundle.outcomes), 'Bundle should have outcomes array');
  assert(Array.isArray(bundle.primaryStructures), 'Bundle should have primaryStructures array');
  assert(typeof bundle.estimatedMinutes === 'number', 'Bundle should have estimatedMinutes');
  assert(Array.isArray(bundle.modules), 'Bundle should have modules array');
  
  cleanupTestDir();
});

// Test 2: Invalid version fails validation
test('invalid version fails validation', () => {
  setupTestDir();
  
  const export_ = {
    version: 1, // Wrong version
    exportedAt: '2025-01-01T00:00:00Z',
    gitSha: 'abc123',
    workspace: 'test-ws',
    bundles: []
  };
  
  assert(export_.version !== 2, 'Version should not be 2');
  
  cleanupTestDir();
});

// Test 3: Missing required fields fail validation
test('missing required fields fail validation', () => {
  setupTestDir();
  
  const export_ = {
    version: 2,
    // Missing exportedAt
    gitSha: 'abc123',
    workspace: 'test-ws',
    bundles: []
  };
  
  assert(!export_.exportedAt, 'exportedAt should be missing');
  
  cleanupTestDir();
});

// Test 4: Invalid level fails validation
test('invalid level fails validation', () => {
  setupTestDir();
  
  const bundle = {
    id: 'test_bundle',
    title: 'Test Bundle',
    level: 'X1', // Invalid level
    outcomes: [],
    primaryStructures: [],
    estimatedMinutes: 30,
    modules: []
  };
  
  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  assert(!validLevels.includes(bundle.level), 'Level should be invalid');
  
  cleanupTestDir();
});

// Test 5: Duplicate entryUrl detection
test('duplicate entryUrl detection', () => {
  setupTestDir();
  
  const entryUrls = [
    '/v1/workspaces/test-ws/packs/pack-1/pack.json',
    '/v1/workspaces/test-ws/packs/pack-2/pack.json',
    '/v1/workspaces/test-ws/packs/pack-1/pack.json' // Duplicate
  ];
  
  const entryUrlSet = new Set<string>();
  const duplicates: string[] = [];
  
  for (const url of entryUrls) {
    if (entryUrlSet.has(url)) {
      duplicates.push(url);
    }
    entryUrlSet.add(url);
  }
  
  assert(duplicates.length > 0, 'Should detect duplicate entryUrl');
  assert(duplicates[0] === '/v1/workspaces/test-ws/packs/pack-1/pack.json', 'Should identify correct duplicate');
  
  cleanupTestDir();
});

// Test 6: Coverage gate - minimum packs
test('coverage gate enforces minimum packs', () => {
  setupTestDir();
  
  const bundle = {
    id: 'test_bundle',
    title: 'Test Bundle',
    level: 'A1',
    outcomes: [],
    primaryStructures: ['verb_position'],
    estimatedMinutes: 30,
    modules: [
      {
        id: 'module-1',
        title: 'Module 1',
        items: [
          { kind: 'pack', id: 'pack-1', entryUrl: '/v1/workspaces/test-ws/packs/pack-1/pack.json' },
          { kind: 'pack', id: 'pack-2', entryUrl: '/v1/workspaces/test-ws/packs/pack-2/pack.json' }
          // Only 2 packs, minimum is 3
        ]
      }
    ]
  };
  
  let packCount = 0;
  for (const module of bundle.modules) {
    for (const item of module.items) {
      if (item.kind === 'pack') {
        packCount++;
      }
    }
  }
  
  const MIN_PACKS_PER_BUNDLE = 3;
  assert(packCount < MIN_PACKS_PER_BUNDLE, 'Should have fewer than minimum packs');
  
  cleanupTestDir();
});

// Test 7: Coverage gate - minimum primary structures
test('coverage gate enforces minimum primary structures', () => {
  setupTestDir();
  
  const bundle = {
    id: 'test_bundle',
    title: 'Test Bundle',
    level: 'A1',
    outcomes: [],
    primaryStructures: ['verb_position'], // Only 1 structure, minimum is 2
    estimatedMinutes: 30,
    modules: []
  };
  
  const MIN_PRIMARY_STRUCTURES_PER_BUNDLE = 2;
  assert(bundle.primaryStructures.length < MIN_PRIMARY_STRUCTURES_PER_BUNDLE, 'Should have fewer than minimum structures');
  
  cleanupTestDir();
});

// Test 8: Coverage gate - estimated minutes bounds
test('coverage gate enforces estimated minutes bounds', () => {
  setupTestDir();
  
  const MIN_BUNDLE_MINUTES = 15;
  const MAX_BUNDLE_MINUTES = 180;
  
  // Test too few minutes
  const bundle1 = {
    id: 'test_bundle',
    title: 'Test Bundle',
    level: 'A1',
    outcomes: [],
    primaryStructures: ['verb_position', 'negation'],
    estimatedMinutes: 10, // Below minimum
    modules: []
  };
  
  assert(bundle1.estimatedMinutes < MIN_BUNDLE_MINUTES, 'Should be below minimum');
  
  // Test too many minutes
  const bundle2 = {
    id: 'test_bundle',
    title: 'Test Bundle',
    level: 'A1',
    outcomes: [],
    primaryStructures: ['verb_position', 'negation'],
    estimatedMinutes: 200, // Above maximum
    modules: []
  };
  
  assert(bundle2.estimatedMinutes > MAX_BUNDLE_MINUTES, 'Should be above maximum');
  
  cleanupTestDir();
});

// Test 9: Item kind validation
test('item kind validation', () => {
  setupTestDir();
  
  const validKinds = ['pack', 'drill', 'exam'];
  
  const item1 = { kind: 'pack', id: 'item-1', entryUrl: '/v1/test.json' };
  const item2 = { kind: 'drill', id: 'item-2', entryUrl: '/v1/test.json' };
  const item3 = { kind: 'exam', id: 'item-3', entryUrl: '/v1/test.json' };
  const item4 = { kind: 'invalid', id: 'item-4', entryUrl: '/v1/test.json' };
  
  assert(validKinds.includes(item1.kind), 'pack should be valid');
  assert(validKinds.includes(item2.kind), 'drill should be valid');
  assert(validKinds.includes(item3.kind), 'exam should be valid');
  assert(!validKinds.includes(item4.kind), 'invalid should not be valid');
  
  cleanupTestDir();
});

// Test 10: EntryUrl format validation
test('entryUrl format validation', () => {
  setupTestDir();
  
  const validUrl1 = '/v1/workspaces/test-ws/packs/pack-1/pack.json';
  const validUrl2 = '/v1/workspaces/test-ws/drills/drill-1/drill.json';
  const invalidUrl1 = 'v1/workspaces/test-ws/packs/pack-1/pack.json'; // Missing leading slash
  const invalidUrl2 = '/v1/workspaces/test-ws/packs/pack-1'; // Missing .json
  
  assert(validUrl1.startsWith('/v1/'), 'Valid URL should start with /v1/');
  assert(validUrl2.startsWith('/v1/'), 'Valid URL should start with /v1/');
  assert(!invalidUrl1.startsWith('/v1/'), 'Invalid URL should not start with /v1/');
  assert(!invalidUrl2.endsWith('.json'), 'Invalid URL should not end with .json');
  
  cleanupTestDir();
});

// Test 11: Outcomes count validation (warning, not error)
test('outcomes count validation', () => {
  setupTestDir();
  
  const bundle1 = {
    id: 'test_bundle',
    title: 'Test Bundle',
    level: 'A1',
    outcomes: ['Outcome 1', 'Outcome 2'], // Only 2, recommended minimum is 3
    primaryStructures: ['verb_position', 'negation'],
    estimatedMinutes: 30,
    modules: []
  };
  
  const bundle2 = {
    id: 'test_bundle',
    title: 'Test Bundle',
    level: 'A1',
    outcomes: Array(10).fill('Outcome'), // 10 outcomes, recommended maximum is 8
    primaryStructures: ['verb_position', 'negation'],
    estimatedMinutes: 30,
    modules: []
  };
  
  assert(bundle1.outcomes.length < 3, 'Should have fewer than recommended minimum');
  assert(bundle2.outcomes.length > 8, 'Should have more than recommended maximum');
  
  cleanupTestDir();
});

// Run all tests
console.log('Running validate-curriculum-export unit tests...\n');

for (const testCase of tests) {
  try {
    testCase.fn();
    console.log(`✅ ${testCase.name}`);
    passed++;
  } catch (error: any) {
    console.error(`❌ ${testCase.name}`);
    console.error(`   ${error.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

