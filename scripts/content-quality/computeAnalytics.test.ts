#!/usr/bin/env tsx

/**
 * Unit tests for computeAnalytics.ts
 * 
 * Tests:
 * - Deterministic computation of all metrics
 * - Multi-slot rate calculation
 * - Scenario token metrics
 * - Unique token rate
 * - Banned phrase detection
 * - Quality gate pass/fail logic
 */

import { computePackAnalytics, computeDrillAnalytics } from './computeAnalytics';

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

// Test: Multi-slot rate calculation
test('multiSlotRate: correctly calculates ratio of prompts with 2+ slotsChanged', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb', 'object'],
    prompts: [
      { id: 'p1', text: 'Ich gehe zur Arbeit.', slotsChanged: ['subject', 'verb'] },
      { id: 'p2', text: 'Du kommst zur Schule.', slotsChanged: ['verb'] },
      { id: 'p3', text: 'Wir machen Sport.', slotsChanged: ['subject', 'verb', 'object'] },
      { id: 'p4', text: 'Er sieht den Film.', slotsChanged: ['verb'] }
    ],
    provenance: { source: 'template' }
  };
  
  const analytics = computePackAnalytics(pack);
  
  // 2 out of 4 prompts have 2+ slotsChanged (p1, p3)
  assert(analytics.multiSlotRate === 0.5, `Expected multiSlotRate 0.5, got ${analytics.multiSlotRate}`);
  assert(analytics.promptCount === 4, `Expected promptCount 4, got ${analytics.promptCount}`);
  
  console.log('   ✅ Multi-slot rate calculation correct');
});

// Test: Scenario token metrics
test('scenarioTokenHitAvg: correctly calculates average scenario token hits', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    prompts: [
      { id: 'p1', text: 'Das Meeting beginnt um 14:30.' }, // "meeting" + time = 2+ tokens
      { id: 'p2', text: 'Ich gehe zur Arbeit.' }, // "arbeit" = 1 token (should fail)
      { id: 'p3', text: 'Der Manager hat ein Projekt.' }, // "manager" + "projekt" = 2+ tokens
      { id: 'p4', text: 'Wir treffen uns im Büro.' } // "büro" = 1 token (should fail)
    ],
    provenance: { source: 'template' }
  };
  
  const analytics = computePackAnalytics(pack);
  
  // p1: meeting (1) + time context, p3: manager (1) + projekt (1) = at least 2 hits each
  // p2, p4: only 1 token each
  // Average should be > 0
  assert(analytics.scenarioTokenHitAvg > 0, `Expected scenarioTokenHitAvg > 0, got ${analytics.scenarioTokenHitAvg}`);
  assert(analytics.scenarioTokenQualifiedRate < 1.0, `Expected some prompts to fail token requirement, got ${analytics.scenarioTokenQualifiedRate}`);
  
  console.log('   ✅ Scenario token metrics calculation correct');
});

// Test: Unique token rate
test('uniqueTokenRate: correctly calculates unique token ratio', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    prompts: [
      { id: 'p1', text: 'Ich gehe zur Arbeit.' },
      { id: 'p2', text: 'Du kommst zur Schule.' },
      { id: 'p3', text: 'Wir machen Sport.' }
    ],
    provenance: { source: 'template' }
  };
  
  const analytics = computePackAnalytics(pack);
  
  // Should have reasonable unique token rate (not 0, not 1)
  assert(analytics.uniqueTokenRate > 0, `Expected uniqueTokenRate > 0, got ${analytics.uniqueTokenRate}`);
  assert(analytics.uniqueTokenRate < 1, `Expected uniqueTokenRate < 1, got ${analytics.uniqueTokenRate}`);
  
  console.log('   ✅ Unique token rate calculation correct');
});

// Test: Banned phrase detection
test('bannedPhraseViolations: correctly detects banned phrases', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    prompts: [
      { id: 'p1', text: 'In today\'s lesson, we will practice German.' }, // Banned phrase
      { id: 'p2', text: 'Let\'s practice this sentence.' }, // Banned phrase
      { id: 'p3', text: 'Ich gehe zur Arbeit.' } // Clean
    ],
    provenance: { source: 'template' }
  };
  
  const analytics = computePackAnalytics(pack);
  
  assert(analytics.bannedPhraseViolations === 2, `Expected 2 banned phrase violations, got ${analytics.bannedPhraseViolations}`);
  assert(analytics.passesQualityGates === false, 'Pack with banned phrases should fail quality gates');
  
  console.log('   ✅ Banned phrase detection correct');
});

// Test: Quality gates pass
test('passesQualityGates: correctly determines if pack passes quality gates', () => {
  // Good pack that should pass
  const goodPack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    register: 'formal',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb', 'object'],
    prompts: [
      { id: 'p1', text: 'Können Sie mir helfen? Das Meeting beginnt um 14:30.', slotsChanged: ['subject', 'verb'] }, // Formal + tokens + multi-slot
      { id: 'p2', text: 'Wir treffen uns am Montag im Büro.', slotsChanged: ['subject', 'verb', 'object'] }, // Tokens + weekday + multi-slot
      { id: 'p3', text: 'Der Manager hat ein Projekt für Sie.', slotsChanged: ['verb', 'object'] }, // Formal + tokens + multi-slot
      { id: 'p4', text: 'Das Büro ist am Dienstag geöffnet.', slotsChanged: ['subject', 'verb'] } // Tokens + weekday + multi-slot
    ],
    provenance: { source: 'template' }
  };
  
  const analytics = computePackAnalytics(goodPack);
  
  // Should pass: no banned phrases, multi-slot rate >= 0.3, scenario tokens >= 0.8, formal register has Sie, concreteness markers
  assert(analytics.bannedPhraseViolations === 0, 'Should have no banned phrases');
  assert(analytics.multiSlotRate >= 0.3, `Multi-slot rate should be >= 0.3, got ${analytics.multiSlotRate}`);
  assert(analytics.passesQualityGates === true, 'Good pack should pass quality gates');
  
  console.log('   ✅ Quality gates pass logic correct');
});

// Test: Deterministic computation
test('deterministic: same input produces same output', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    prompts: [
      { id: 'p1', text: 'Ich gehe zur Arbeit.', slotsChanged: ['subject', 'verb'] },
      { id: 'p2', text: 'Du kommst zur Schule.', slotsChanged: ['verb'] }
    ],
    provenance: { source: 'template' }
  };
  
  const analytics1 = computePackAnalytics(pack);
  const analytics2 = computePackAnalytics(pack);
  
  // Compare all numeric fields (within floating point precision)
  assert(analytics1.promptCount === analytics2.promptCount, 'promptCount should match');
  assert(Math.abs(analytics1.multiSlotRate - analytics2.multiSlotRate) < 0.001, 'multiSlotRate should match');
  assert(Math.abs(analytics1.scenarioTokenHitAvg - analytics2.scenarioTokenHitAvg) < 0.001, 'scenarioTokenHitAvg should match');
  assert(Math.abs(analytics1.scenarioTokenQualifiedRate - analytics2.scenarioTokenQualifiedRate) < 0.001, 'scenarioTokenQualifiedRate should match');
  assert(Math.abs(analytics1.uniqueTokenRate - analytics2.uniqueTokenRate) < 0.001, 'uniqueTokenRate should match');
  assert(analytics1.bannedPhraseViolations === analytics2.bannedPhraseViolations, 'bannedPhraseViolations should match');
  assert(analytics1.passesQualityGates === analytics2.passesQualityGates, 'passesQualityGates should match');
  
  console.log('   ✅ Deterministic computation verified');
});

// Test: Drill analytics
test('drill analytics: correctly computes metrics for drill entries', () => {
  const drill = {
    id: 'test-drill',
    kind: 'drill',
    level: 'A1',
    exercises: [
      { id: 'ex1', prompt: 'Ich ___ (spielen) Fußball.', answer: 'spiele' },
      { id: 'ex2', prompt: 'Du ___ (kommen) zur Schule.', answer: 'kommst' },
      { id: 'ex3', prompt: 'Er ___ (machen) Sport.', answer: 'macht' }
    ],
    provenance: { source: 'template' }
  };
  
  const analytics = computeDrillAnalytics(drill);
  
  assert(analytics.version === 1, `Expected version 1, got ${analytics.version}`);
  assert(analytics.itemCount === 3, `Expected itemCount 3, got ${analytics.itemCount}`);
  assert(analytics.uniqueTokenRate > 0, `Expected uniqueTokenRate > 0, got ${analytics.uniqueTokenRate}`);
  assert(analytics.passesQualityGates === true, 'Drill with exercises should pass quality gates');
  
  console.log('   ✅ Drill analytics computation correct');
});

// Test: Empty prompts
test('empty prompts: handles packs with no prompts gracefully', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    prompts: [],
    provenance: { source: 'template' }
  };
  
  const analytics = computePackAnalytics(pack);
  
  assert(analytics.promptCount === 0, 'promptCount should be 0');
  assert(analytics.multiSlotRate === 0, 'multiSlotRate should be 0');
  assert(analytics.scenarioTokenHitAvg === 0, 'scenarioTokenHitAvg should be 0');
  assert(analytics.passesQualityGates === false, 'Pack with no prompts should fail quality gates');
  
  console.log('   ✅ Empty prompts handled correctly');
});

// Run all tests
console.log('\n🧪 Running computeAnalytics unit tests...\n');

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

