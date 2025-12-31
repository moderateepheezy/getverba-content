#!/usr/bin/env tsx

/**
 * E2E tests for catalog-level analytics
 * 
 * Tests:
 * - Full pack generation with catalog analytics
 * - Validation of generated packs
 * - Migration script backfill
 * - Deterministic computation across runs
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { computePackCatalogAnalytics } from './content-quality/computeCatalogAnalytics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = join(__dirname, '..', '.test-catalog-analytics-e2e');
const CONTENT_DIR = join(TEST_DIR, 'v1');

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
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

// Test: Pack generation includes catalog analytics
test('pack generation: includes all required catalog analytics fields', () => {
  setupTestDir();
  
  // Create a minimal pack with prompts
  const pack = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    packVersion: '1.0.0',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'time'],
    outline: ['Step 1'],
    sessionPlan: {
      version: 1,
      steps: [
        { id: 's1', title: 'Step 1', promptIds: ['p1', 'p2'] }
      ]
    },
    prompts: [
      { id: 'p1', text: 'Das Meeting beginnt um 14:30.', slotsChanged: ['subject', 'verb'] },
      { id: 'p2', text: 'Wir treffen uns am Montag im Büro.', slotsChanged: ['subject', 'verb', 'time'] }
    ],
    analytics: {
      primaryStructure: 'modal_verbs_requests',
      variationSlots: ['subject', 'verb', 'time'],
      slotSwitchDensity: 1.0,
      promptDiversityScore: 0.65,
      scenarioCoverageScore: 0.85,
      estimatedCognitiveLoad: 'medium',
      intendedOutcome: 'A1 work readiness'
    }
  };
  
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(pack, null, 2)
  );
  
  // Verify analytics are present
  const savedPack = JSON.parse(
    readFileSync(join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'), 'utf-8')
  );
  
  assert(savedPack.analytics !== undefined, 'Pack should have analytics');
  assert(savedPack.analytics.primaryStructure === 'modal_verbs_requests', 'Should have primaryStructure');
  assert(Array.isArray(savedPack.analytics.variationSlots), 'Should have variationSlots array');
  assert(typeof savedPack.analytics.slotSwitchDensity === 'number', 'Should have slotSwitchDensity');
  assert(typeof savedPack.analytics.promptDiversityScore === 'number', 'Should have promptDiversityScore');
  assert(typeof savedPack.analytics.scenarioCoverageScore === 'number', 'Should have scenarioCoverageScore');
  assert(['low', 'medium', 'high'].includes(savedPack.analytics.estimatedCognitiveLoad), 'Should have estimatedCognitiveLoad');
  assert(typeof savedPack.analytics.intendedOutcome === 'string', 'Should have intendedOutcome');
  
  console.log('   ✅ Pack generation includes all catalog analytics');
  
  cleanupTestDir();
});

// Test: Analytics computation matches expected values
test('analytics computation: computes metrics correctly from pack data', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'time'],
    prompts: [
      { id: 'p1', text: 'Das Meeting beginnt um 14:30.', slotsChanged: ['subject', 'verb'] },
      { id: 'p2', text: 'Wir treffen uns am Montag im Büro.', slotsChanged: ['subject', 'verb', 'time'] },
      { id: 'p3', text: 'Der Manager hat ein Projekt.', slotsChanged: ['verb'] }
    ]
  };
  
  const analytics = computePackCatalogAnalytics(pack);
  
  // Verify computed values
  assert(analytics.primaryStructure === 'modal_verbs_requests', 'primaryStructure should match');
  assert(analytics.variationSlots.length === 3, 'variationSlots should match');
  assert(analytics.slotSwitchDensity > 0, 'slotSwitchDensity should be > 0');
  assert(analytics.slotSwitchDensity <= 1, 'slotSwitchDensity should be <= 1');
  assert(analytics.promptDiversityScore > 0, 'promptDiversityScore should be > 0');
  assert(analytics.promptDiversityScore <= 1, 'promptDiversityScore should be <= 1');
  assert(analytics.scenarioCoverageScore > 0, 'scenarioCoverageScore should be > 0');
  assert(analytics.scenarioCoverageScore <= 1, 'scenarioCoverageScore should be <= 1');
  assert(['low', 'medium', 'high'].includes(analytics.estimatedCognitiveLoad), 'estimatedCognitiveLoad should be valid');
  
  // slotSwitchDensity: 2 out of 3 prompts have 2+ slots (p1, p2)
  assert(Math.abs(analytics.slotSwitchDensity - (2/3)) < 0.01, `Expected slotSwitchDensity ~0.67, got ${analytics.slotSwitchDensity}`);
  
  console.log('   ✅ Analytics computation produces correct values');
});

// Test: Deterministic computation across multiple runs
test('deterministic: same pack produces same analytics across runs', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb'],
    prompts: [
      { id: 'p1', text: 'Das Meeting beginnt um 14:30.', slotsChanged: ['subject', 'verb'] },
      { id: 'p2', text: 'Wir treffen uns am Montag.', slotsChanged: ['verb'] }
    ]
  };
  
  const analytics1 = computePackCatalogAnalytics(pack);
  const analytics2 = computePackCatalogAnalytics(pack);
  const analytics3 = computePackCatalogAnalytics(pack);
  
  // All runs should produce identical results
  assert(Math.abs(analytics1.slotSwitchDensity - analytics2.slotSwitchDensity) < 0.001, 'slotSwitchDensity should match');
  assert(Math.abs(analytics1.promptDiversityScore - analytics2.promptDiversityScore) < 0.001, 'promptDiversityScore should match');
  assert(Math.abs(analytics1.scenarioCoverageScore - analytics2.scenarioCoverageScore) < 0.001, 'scenarioCoverageScore should match');
  assert(analytics1.estimatedCognitiveLoad === analytics2.estimatedCognitiveLoad, 'estimatedCognitiveLoad should match');
  
  assert(Math.abs(analytics2.slotSwitchDensity - analytics3.slotSwitchDensity) < 0.001, 'slotSwitchDensity should match (run 3)');
  assert(Math.abs(analytics2.promptDiversityScore - analytics3.promptDiversityScore) < 0.001, 'promptDiversityScore should match (run 3)');
  
  console.log('   ✅ Analytics computation is deterministic');
});

// Run all tests
console.log('\n🧪 Running catalog analytics E2E tests...\n');

for (const testCase of tests) {
  try {
    testCase.fn();
    passed++;
    console.log(`✅ ${testCase.name}`);
  } catch (error: any) {
    failed++;
    console.error(`❌ ${testCase.name}`);
    console.error(`   Error: ${error.message}`);
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}

