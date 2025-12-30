#!/usr/bin/env tsx

/**
 * Comprehensive Unit Tests for B2B Curriculum Export
 * 
 * Tests all functions with edge cases and error conditions.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sortItemsDeterministically, planBundle, filterItems, applyExplicitIds } from './exports/bundlePlanner.js';
import { generateSCORMManifest } from './exports/scormLikeManifest.js';
import { generateSyllabus } from './exports/syllabusMd.js';
import { generateIntegrityReport } from './exports/integrityReport.js';
import type { BundleItem, BundleSelectionCriteria, CurriculumBundle } from './exports/exportTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DIR = join(__dirname, '..', '.test-curriculum-export');

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
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ============================================================================
// Test: Deterministic Ordering
// ============================================================================

test('Deterministic ordering: scenario priority', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'b', entryUrl: '/v1/packs/b/pack.json', title: 'B', level: 'A1', scenario: 'restaurant', estimatedMinutes: 15 },
    { kind: 'pack', id: 'a', entryUrl: '/v1/packs/a/pack.json', title: 'A', level: 'A1', scenario: 'work', estimatedMinutes: 15 }
  ];
  const sorted = sortItemsDeterministically(items);
  assert(sorted[0].scenario === 'work', 'work should come before restaurant');
  assert(sorted[1].scenario === 'restaurant', 'restaurant should come after work');
});

test('Deterministic ordering: level priority', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'b', entryUrl: '/v1/packs/b/pack.json', title: 'B', level: 'A2', scenario: 'work', estimatedMinutes: 15 },
    { kind: 'pack', id: 'a', entryUrl: '/v1/packs/a/pack.json', title: 'A', level: 'A1', scenario: 'work', estimatedMinutes: 15 }
  ];
  const sorted = sortItemsDeterministically(items);
  assert(sorted[0].level === 'A1', 'A1 should come before A2');
  assert(sorted[1].level === 'A2', 'A2 should come after A1');
});

test('Deterministic ordering: register priority', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'b', entryUrl: '/v1/packs/b/pack.json', title: 'B', level: 'A1', scenario: 'work', register: 'neutral', estimatedMinutes: 15 },
    { kind: 'pack', id: 'a', entryUrl: '/v1/packs/a/pack.json', title: 'A', level: 'A1', scenario: 'work', register: 'formal', estimatedMinutes: 15 }
  ];
  const sorted = sortItemsDeterministically(items);
  assert(sorted[0].register === 'formal', 'formal should come before neutral');
  assert(sorted[1].register === 'neutral', 'neutral should come after formal');
});

test('Deterministic ordering: primaryStructure priority', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'b', entryUrl: '/v1/packs/b/pack.json', title: 'B', level: 'A1', scenario: 'work', register: 'neutral', primaryStructure: 'verb_position', estimatedMinutes: 15 },
    { kind: 'pack', id: 'a', entryUrl: '/v1/packs/a/pack.json', title: 'A', level: 'A1', scenario: 'work', register: 'neutral', primaryStructure: 'negation', estimatedMinutes: 15 }
  ];
  const sorted = sortItemsDeterministically(items);
  assert(sorted[0].primaryStructure === 'negation', 'negation should come before verb_position alphabetically');
  assert(sorted[1].primaryStructure === 'verb_position', 'verb_position should come after negation');
});

test('Deterministic ordering: id tie-breaker', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'pack_b', entryUrl: '/v1/packs/pack_b/pack.json', title: 'B', level: 'A1', scenario: 'work', register: 'neutral', primaryStructure: 'verb_position', estimatedMinutes: 15 },
    { kind: 'pack', id: 'pack_a', entryUrl: '/v1/packs/pack_a/pack.json', title: 'A', level: 'A1', scenario: 'work', register: 'neutral', primaryStructure: 'verb_position', estimatedMinutes: 15 }
  ];
  const sorted = sortItemsDeterministically(items);
  assert(sorted[0].id === 'pack_a', 'pack_a should come before pack_b alphabetically');
  assert(sorted[1].id === 'pack_b', 'pack_b should come after pack_a');
});

test('Deterministic ordering: same input produces identical output', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'pack_b', entryUrl: '/v1/packs/pack_b/pack.json', title: 'B', level: 'A2', scenario: 'restaurant', estimatedMinutes: 15 },
    { kind: 'pack', id: 'pack_a', entryUrl: '/v1/packs/pack_a/pack.json', title: 'A', level: 'A1', scenario: 'work', estimatedMinutes: 15 }
  ];
  const sorted1 = sortItemsDeterministically(items);
  const sorted2 = sortItemsDeterministically(items);
  assert(JSON.stringify(sorted1.map(i => i.id)) === JSON.stringify(sorted2.map(i => i.id)), 'Sorting should be deterministic');
});

test('Deterministic ordering: handles missing optional fields', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'b', entryUrl: '/v1/packs/b/pack.json', title: 'B', level: 'A1', estimatedMinutes: 15 },
    { kind: 'pack', id: 'a', entryUrl: '/v1/packs/a/pack.json', title: 'A', level: 'A1', scenario: 'work', estimatedMinutes: 15 }
  ];
  const sorted = sortItemsDeterministically(items);
  // Items with scenario should come before items without
  assert(sorted[0].scenario === 'work', 'Item with scenario should come first');
});

// ============================================================================
// Test: Filtering
// ============================================================================

test('Filter by levels: includes only specified levels', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'a1', entryUrl: '/v1/packs/a1/pack.json', title: 'A1', level: 'A1', estimatedMinutes: 15 },
    { kind: 'pack', id: 'a2', entryUrl: '/v1/packs/a2/pack.json', title: 'A2', level: 'A2', estimatedMinutes: 15 },
    { kind: 'pack', id: 'b1', entryUrl: '/v1/packs/b1/pack.json', title: 'B1', level: 'B1', estimatedMinutes: 15 }
  ];
  const criteria: BundleSelectionCriteria = { workspace: 'de', bundleId: 'test', title: 'Test', levels: ['A1', 'A2'] };
  const filtered = filterItems(items, criteria);
  assert(filtered.length === 2, `Expected 2 items, got ${filtered.length}`);
  assert(filtered.every(i => ['A1', 'A2'].includes(i.level)), 'All items should be A1 or A2');
});

test('Filter by scenarios: includes only specified scenarios', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'work', entryUrl: '/v1/packs/work/pack.json', title: 'Work', level: 'A1', scenario: 'work', estimatedMinutes: 15 },
    { kind: 'pack', id: 'rest', entryUrl: '/v1/packs/rest/pack.json', title: 'Rest', level: 'A1', scenario: 'restaurant', estimatedMinutes: 15 }
  ];
  const criteria: BundleSelectionCriteria = { workspace: 'de', bundleId: 'test', title: 'Test', scenarios: ['work'] };
  const filtered = filterItems(items, criteria);
  assert(filtered.length === 1, `Expected 1 item, got ${filtered.length}`);
  assert(filtered[0].scenario === 'work', 'Should only include work scenario');
});

test('Filter by max-packs: limits pack count', () => {
  const items: BundleItem[] = Array.from({ length: 10 }, (_, i) => ({
    kind: 'pack' as const,
    id: `pack_${i}`,
    entryUrl: `/v1/packs/pack_${i}/pack.json`,
    title: `Pack ${i}`,
    level: 'A1',
    estimatedMinutes: 15
  }));
  const criteria: BundleSelectionCriteria = { workspace: 'de', bundleId: 'test', title: 'Test', maxPacks: 5 };
  const filtered = filterItems(items, criteria);
  const packs = filtered.filter(i => i.kind === 'pack');
  assert(packs.length === 5, `Expected 5 packs, got ${packs.length}`);
});

test('Filter by max-drills: limits drill count', () => {
  const items: BundleItem[] = Array.from({ length: 10 }, (_, i) => ({
    kind: 'drill' as const,
    id: `drill_${i}`,
    entryUrl: `/v1/drills/drill_${i}/drill.json`,
    title: `Drill ${i}`,
    level: 'A1',
    estimatedMinutes: 10
  }));
  const criteria: BundleSelectionCriteria = { workspace: 'de', bundleId: 'test', title: 'Test', maxDrills: 3 };
  const filtered = filterItems(items, criteria);
  const drills = filtered.filter(i => i.kind === 'drill');
  assert(drills.length === 3, `Expected 3 drills, got ${drills.length}`);
});

// ============================================================================
// Test: Explicit IDs
// ============================================================================

test('Apply explicit IDs: includes only specified pack IDs', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'pack_1', entryUrl: '/v1/packs/pack_1/pack.json', title: 'Pack 1', level: 'A1', estimatedMinutes: 15 },
    { kind: 'pack', id: 'pack_2', entryUrl: '/v1/packs/pack_2/pack.json', title: 'Pack 2', level: 'A1', estimatedMinutes: 15 },
    { kind: 'pack', id: 'pack_3', entryUrl: '/v1/packs/pack_3/pack.json', title: 'Pack 3', level: 'A1', estimatedMinutes: 15 }
  ];
  const criteria: BundleSelectionCriteria = { workspace: 'de', bundleId: 'test', title: 'Test', explicitPackIds: ['pack_1', 'pack_3'] };
  const filtered = applyExplicitIds(items, criteria);
  assert(filtered.length === 2, `Expected 2 items, got ${filtered.length}`);
  assert(filtered.some(i => i.id === 'pack_1'), 'Should include pack_1');
  assert(filtered.some(i => i.id === 'pack_3'), 'Should include pack_3');
  assert(!filtered.some(i => i.id === 'pack_2'), 'Should not include pack_2');
});

test('Apply explicit IDs: empty list returns all items', () => {
  const items: BundleItem[] = [
    { kind: 'pack', id: 'pack_1', entryUrl: '/v1/packs/pack_1/pack.json', title: 'Pack 1', level: 'A1', estimatedMinutes: 15 }
  ];
  const criteria: BundleSelectionCriteria = { workspace: 'de', bundleId: 'test', title: 'Test' };
  const filtered = applyExplicitIds(items, criteria);
  assert(filtered.length === 1, 'Should return all items when no explicit IDs');
});

// ============================================================================
// Test: Bundle Planning
// ============================================================================

test('Plan bundle: groups items into modules', () => {
  const items: BundleItem[] = Array.from({ length: 15 }, (_, i) => ({
    kind: 'pack' as const,
    id: `pack_${i}`,
    entryUrl: `/v1/packs/pack_${i}/pack.json`,
    title: `Pack ${i}`,
    level: 'A1',
    scenario: 'work',
    estimatedMinutes: 15
  }));
  const criteria: BundleSelectionCriteria = { workspace: 'de', bundleId: 'test', title: 'Test' };
  const modules = planBundle(items, criteria);
  assert(modules.length > 1, `Expected multiple modules, got ${modules.length}`);
  assert(modules.every(m => m.items.length <= 8), 'Each module should have <= 8 items');
});

test('Plan bundle: module IDs are sequential', () => {
  const items: BundleItem[] = Array.from({ length: 20 }, (_, i) => ({
    kind: 'pack' as const,
    id: `pack_${i}`,
    entryUrl: `/v1/packs/pack_${i}/pack.json`,
    title: `Pack ${i}`,
    level: 'A1',
    estimatedMinutes: 15
  }));
  const criteria: BundleSelectionCriteria = { workspace: 'de', bundleId: 'test', title: 'Test' };
  const modules = planBundle(items, criteria);
  modules.forEach((module, idx) => {
    assert(module.id === `m${idx + 1}`, `Module ${idx} should have id m${idx + 1}, got ${module.id}`);
  });
});

// ============================================================================
// Test: SCORM Manifest
// ============================================================================

test('Generate SCORM manifest: creates valid XML', () => {
  const bundle: CurriculumBundle = {
    bundleId: 'test_bundle',
    workspace: 'de',
    title: 'Test Bundle',
    version: '2025-01-01',
    generatedAt: '2025-01-01T00:00:00.000Z',
    selection: {},
    modules: [{
      id: 'm1',
      title: 'Module 1',
      items: [{
        kind: 'pack',
        id: 'pack_1',
        entryUrl: '/v1/workspaces/de/packs/pack_1/pack.json',
        title: 'Pack 1',
        level: 'A1',
        estimatedMinutes: 15
      }]
    }],
    totals: { packs: 1, drills: 0, exams: 0, estimatedMinutes: 15 }
  };
  const manifest = generateSCORMManifest(bundle);
  assert(manifest.includes('<?xml'), 'Should start with XML declaration');
  assert(manifest.includes('<manifest'), 'Should contain manifest tag');
  assert(manifest.includes('test_bundle'), 'Should contain bundle ID');
  assert(manifest.includes('Test Bundle'), 'Should contain bundle title');
});

test('Generate SCORM manifest: includes all modules', () => {
  const bundle: CurriculumBundle = {
    bundleId: 'test',
    workspace: 'de',
    title: 'Test',
    version: '2025-01-01',
    generatedAt: '2025-01-01T00:00:00.000Z',
    selection: {},
    modules: [
      { id: 'm1', title: 'Module 1', items: [] },
      { id: 'm2', title: 'Module 2', items: [] }
    ],
    totals: { packs: 0, drills: 0, exams: 0, estimatedMinutes: 0 }
  };
  const manifest = generateSCORMManifest(bundle);
  assert(manifest.includes('item_module_1'), 'Should include module 1');
  assert(manifest.includes('item_module_2'), 'Should include module 2');
});

test('Generate SCORM manifest: escapes XML special characters', () => {
  const bundle: CurriculumBundle = {
    bundleId: 'test',
    workspace: 'de',
    title: 'Test & "Special" <Characters>',
    version: '2025-01-01',
    generatedAt: '2025-01-01T00:00:00.000Z',
    selection: {},
    modules: [],
    totals: { packs: 0, drills: 0, exams: 0, estimatedMinutes: 0 }
  };
  const manifest = generateSCORMManifest(bundle);
  assert(!manifest.includes('&'), 'Should not contain unescaped &');
  assert(manifest.includes('&amp;'), 'Should contain escaped &');
  assert(manifest.includes('&quot;'), 'Should contain escaped "');
  assert(manifest.includes('&lt;'), 'Should contain escaped <');
  assert(manifest.includes('&gt;'), 'Should contain escaped >');
});

// ============================================================================
// Test: Syllabus
// ============================================================================

test('Generate syllabus: includes all required sections', () => {
  const bundle: CurriculumBundle = {
    bundleId: 'test',
    workspace: 'de',
    title: 'Test Bundle',
    version: '2025-01-01',
    generatedAt: '2025-01-01T00:00:00.000Z',
    selection: { levels: ['A1'] },
    modules: [{
      id: 'm1',
      title: 'Module 1',
      items: [{
        kind: 'pack',
        id: 'pack_1',
        entryUrl: '/v1/packs/pack_1/pack.json',
        title: 'Pack 1',
        level: 'A1',
        estimatedMinutes: 15
      }]
    }],
    totals: { packs: 1, drills: 0, exams: 0, estimatedMinutes: 15 }
  };
  const syllabus = generateSyllabus(bundle);
  assert(syllabus.includes('# Test Bundle'), 'Should include title');
  assert(syllabus.includes('Bundle ID'), 'Should include bundle ID section');
  assert(syllabus.includes('Modules'), 'Should include modules section');
  assert(syllabus.includes('Module 1'), 'Should include module title');
  assert(syllabus.includes('Pack 1'), 'Should include item title');
});

// ============================================================================
// Test: Integrity Report
// ============================================================================

test('Generate integrity report: detects duplicate IDs', () => {
  setupTestDir();
  
  const bundle: CurriculumBundle = {
    bundleId: 'test',
    workspace: 'de',
    title: 'Test',
    version: '2025-01-01',
    generatedAt: '2025-01-01T00:00:00.000Z',
    selection: {},
    modules: [
      {
        id: 'm1',
        title: 'Module 1',
        items: [
          { kind: 'pack', id: 'pack_1', entryUrl: '/v1/packs/pack_1/pack.json', title: 'Pack 1', level: 'A1', estimatedMinutes: 15 },
          { kind: 'pack', id: 'pack_1', entryUrl: '/v1/packs/pack_1/pack.json', title: 'Pack 1', level: 'A1', estimatedMinutes: 15 }
        ]
      }
    ],
    totals: { packs: 2, drills: 0, exams: 0, estimatedMinutes: 30 }
  };
  
  const report = generateIntegrityReport(bundle, TEST_DIR);
  assert(report.errors.length > 0, 'Should detect duplicate ID error');
  assert(report.errors.some(e => e.type === 'duplicate_id'), 'Should have duplicate_id error');
  
  cleanupTestDir();
});

test('Generate integrity report: computes distributions', () => {
  setupTestDir();
  
  const bundle: CurriculumBundle = {
    bundleId: 'test',
    workspace: 'de',
    title: 'Test',
    version: '2025-01-01',
    generatedAt: '2025-01-01T00:00:00.000Z',
    selection: {},
    modules: [{
      id: 'm1',
      title: 'Module 1',
      items: [
        { kind: 'pack', id: 'pack_1', entryUrl: '/v1/packs/pack_1/pack.json', title: 'Pack 1', level: 'A1', scenario: 'work', estimatedMinutes: 15 },
        { kind: 'pack', id: 'pack_2', entryUrl: '/v1/packs/pack_2/pack.json', title: 'Pack 2', level: 'A2', scenario: 'restaurant', estimatedMinutes: 15 }
      ]
    }],
    totals: { packs: 2, drills: 0, exams: 0, estimatedMinutes: 30 }
  };
  
  const report = generateIntegrityReport(bundle, TEST_DIR);
  assert(report.stats.levelDistribution.A1 === 1, 'Should count A1 level');
  assert(report.stats.levelDistribution.A2 === 1, 'Should count A2 level');
  assert(report.stats.scenarioDistribution.work === 1, 'Should count work scenario');
  assert(report.stats.scenarioDistribution.restaurant === 1, 'Should count restaurant scenario');
  
  cleanupTestDir();
});

// Main test runner
function main() {
  console.log('🧪 Running Comprehensive B2B Curriculum Export Unit Tests\n');
  
  setupTestDir();
  
  try {
    for (const test of tests) {
      try {
        test.fn();
        passed++;
      } catch (error: any) {
        failed++;
        console.error(`❌ ${test.name}: ${error.message}`);
      }
    }
  } finally {
    cleanupTestDir();
  }
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main();
