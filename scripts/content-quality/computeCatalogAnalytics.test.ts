#!/usr/bin/env tsx

/**
 * Unit tests for computeCatalogAnalytics.ts
 * 
 * Tests:
 * - slotSwitchDensity calculation
 * - promptDiversityScore calculation
 * - scenarioCoverageScore calculation
 * - estimatedCognitiveLoad determination
 * - Pack and Drill analytics computation
 */

import {
  computeSlotSwitchDensity,
  computePromptDiversityScore,
  computeScenarioCoverageScore,
  estimateCognitiveLoad,
  computePackCatalogAnalytics,
  computeDrillCatalogAnalytics
} from './computeCatalogAnalytics';

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

// Test: slotSwitchDensity calculation
test('slotSwitchDensity: correctly calculates % of prompts with 2+ slotsChanged', () => {
  const prompts = [
    { id: 'p1', text: 'Test 1', slotsChanged: ['subject', 'verb'] }, // 2 slots
    { id: 'p2', text: 'Test 2', slotsChanged: ['verb'] }, // 1 slot
    { id: 'p3', text: 'Test 3', slotsChanged: ['subject', 'verb', 'time'] }, // 3 slots
    { id: 'p4', text: 'Test 4', slotsChanged: ['verb'] } // 1 slot
  ];
  
  const density = computeSlotSwitchDensity(prompts);
  
  // 2 out of 4 prompts have 2+ slots (p1, p3)
  assert(density === 0.5, `Expected slotSwitchDensity 0.5, got ${density}`);
  
  console.log('   ✅ slotSwitchDensity calculation correct');
});

test('slotSwitchDensity: handles empty prompts', () => {
  const density = computeSlotSwitchDensity([]);
  assert(density === 0, `Expected slotSwitchDensity 0 for empty prompts, got ${density}`);
  console.log('   ✅ slotSwitchDensity handles empty prompts');
});

test('slotSwitchDensity: handles prompts without slotsChanged', () => {
  const prompts = [
    { id: 'p1', text: 'Test 1' }, // No slotsChanged
    { id: 'p2', text: 'Test 2', slotsChanged: ['subject', 'verb'] }
  ];
  
  const density = computeSlotSwitchDensity(prompts);
  // Only 1 out of 2 has 2+ slots
  assert(density === 0.5, `Expected slotSwitchDensity 0.5, got ${density}`);
  console.log('   ✅ slotSwitchDensity handles missing slotsChanged');
});

// Test: promptDiversityScore calculation
test('promptDiversityScore: correctly calculates lexical and structural diversity', () => {
  const prompts = [
    { id: 'p1', text: 'Ich gehe zur Arbeit.' },
    { id: 'p2', text: 'Du kommst zur Schule.' },
    { id: 'p3', text: 'Wir machen Sport.' },
    { id: 'p4', text: 'Er sieht den Film.' }
  ];
  
  const score = computePromptDiversityScore(prompts);
  
  // Should have reasonable diversity (not 0, not 1)
  assert(score > 0, `Expected promptDiversityScore > 0, got ${score}`);
  assert(score < 1, `Expected promptDiversityScore < 1, got ${score}`);
  
  console.log('   ✅ promptDiversityScore calculation correct');
});

test('promptDiversityScore: handles identical prompts', () => {
  const prompts = [
    { id: 'p1', text: 'Test text.' },
    { id: 'p2', text: 'Test text.' },
    { id: 'p3', text: 'Test text.' }
  ];
  
  const score = computePromptDiversityScore(prompts);
  
  // Identical prompts should have low diversity
  assert(score < 0.5, `Expected low diversity for identical prompts, got ${score}`);
  
  console.log('   ✅ promptDiversityScore handles identical prompts');
});

test('promptDiversityScore: handles single prompt', () => {
  const prompts = [
    { id: 'p1', text: 'Test text.' }
  ];
  
  const score = computePromptDiversityScore(prompts);
  
  // Single prompt should return 0.5 (moderate diversity)
  assert(score === 0.5, `Expected promptDiversityScore 0.5 for single prompt, got ${score}`);
  
  console.log('   ✅ promptDiversityScore handles single prompt');
});

// Test: scenarioCoverageScore calculation
test('scenarioCoverageScore: correctly calculates scenario token group coverage', () => {
  const prompts = [
    { id: 'p1', text: 'Das Meeting beginnt um 14:30.' }, // Contains "meeting"
    { id: 'p2', text: 'Ich gehe zur Arbeit.' }, // Contains "arbeit"
    { id: 'p3', text: 'Der Manager hat ein Projekt.' } // Contains "manager" and "projekt"
  ];
  
  const score = computeScenarioCoverageScore(prompts, 'work');
  
  // Should have some coverage (work scenario has tokens like meeting, arbeit, manager, projekt)
  assert(score > 0, `Expected scenarioCoverageScore > 0, got ${score}`);
  assert(score <= 1, `Expected scenarioCoverageScore <= 1, got ${score}`);
  
  console.log('   ✅ scenarioCoverageScore calculation correct');
});

test('scenarioCoverageScore: handles unknown scenario', () => {
  const prompts = [
    { id: 'p1', text: 'Test text.' }
  ];
  
  const score = computeScenarioCoverageScore(prompts, 'unknown_scenario');
  
  // Unknown scenario should return 0
  assert(score === 0, `Expected scenarioCoverageScore 0 for unknown scenario, got ${score}`);
  
  console.log('   ✅ scenarioCoverageScore handles unknown scenario');
});

test('scenarioCoverageScore: handles empty prompts', () => {
  const score = computeScenarioCoverageScore([], 'work');
  assert(score === 0, `Expected scenarioCoverageScore 0 for empty prompts, got ${score}`);
  console.log('   ✅ scenarioCoverageScore handles empty prompts');
});

// Test: estimateCognitiveLoad
test('estimateCognitiveLoad: correctly estimates load from pack characteristics', () => {
  // Low load: few slots, low density, short prompts
  const lowLoad = estimateCognitiveLoad(
    ['subject', 'verb'], // 2 slots
    0.2, // Low density
    [
      { id: 'p1', text: 'Short text.' },
      { id: 'p2', text: 'Another short.' }
    ]
  );
  assert(lowLoad === 'low', `Expected 'low' cognitive load, got '${lowLoad}'`);
  
  // Medium load: moderate slots, medium density
  const mediumLoad = estimateCognitiveLoad(
    ['subject', 'verb', 'time'], // 3 slots
    0.4, // Medium density
    [
      { id: 'p1', text: 'This is a longer prompt with more words.' },
      { id: 'p2', text: 'Another longer prompt here.' }
    ]
  );
  assert(mediumLoad === 'medium' || mediumLoad === 'high', `Expected 'medium' or 'high' cognitive load, got '${mediumLoad}'`);
  
  // High load: many slots, high density, long prompts
  const highLoad = estimateCognitiveLoad(
    ['subject', 'verb', 'object', 'time', 'location'], // 5 slots
    0.6, // High density
    [
      { id: 'p1', text: 'This is a very long prompt with many words and complex structure.' },
      { id: 'p2', text: 'Another very long prompt with many words and complex structure here.' }
    ]
  );
  assert(highLoad === 'high', `Expected 'high' cognitive load, got '${highLoad}'`);
  
  console.log('   ✅ estimateCognitiveLoad calculation correct');
});

// Test: computePackCatalogAnalytics
test('computePackCatalogAnalytics: correctly computes all catalog metrics', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'time'],
    prompts: [
      { id: 'p1', text: 'Das Meeting beginnt um 14:30.', slotsChanged: ['subject', 'verb'] },
      { id: 'p2', text: 'Ich gehe zur Arbeit.', slotsChanged: ['verb'] },
      { id: 'p3', text: 'Der Manager hat ein Projekt.', slotsChanged: ['subject', 'verb', 'time'] }
    ]
  };
  
  const analytics = computePackCatalogAnalytics(pack);
  
  // Check all required fields
  assert(analytics.primaryStructure === 'modal_verbs_requests', 'primaryStructure should match');
  assert(analytics.variationSlots.length === 3, 'variationSlots should match');
  assert(typeof analytics.slotSwitchDensity === 'number', 'slotSwitchDensity should be number');
  assert(analytics.slotSwitchDensity >= 0 && analytics.slotSwitchDensity <= 1, 'slotSwitchDensity should be 0-1');
  assert(typeof analytics.promptDiversityScore === 'number', 'promptDiversityScore should be number');
  assert(analytics.promptDiversityScore >= 0 && analytics.promptDiversityScore <= 1, 'promptDiversityScore should be 0-1');
  assert(typeof analytics.scenarioCoverageScore === 'number', 'scenarioCoverageScore should be number');
  assert(analytics.scenarioCoverageScore >= 0 && analytics.scenarioCoverageScore <= 1, 'scenarioCoverageScore should be 0-1');
  assert(['low', 'medium', 'high'].includes(analytics.estimatedCognitiveLoad), 'estimatedCognitiveLoad should be valid enum');
  
  console.log('   ✅ computePackCatalogAnalytics correct');
});

// Test: computeDrillCatalogAnalytics
test('computeDrillCatalogAnalytics: correctly computes drill analytics', () => {
  const drill = {
    id: 'test-drill',
    kind: 'drill',
    level: 'A1',
    exercises: [
      { id: 'ex1', prompt: 'Ich ___ (spielen) Fußball.' },
      { id: 'ex2', prompt: 'Du ___ (kommen) zur Schule.' },
      { id: 'ex3', prompt: 'Er ___ (machen) Sport.' }
    ]
  };
  
  const analytics = computeDrillCatalogAnalytics(drill);
  
  // Check all required fields
  assert(analytics.primaryStructure === 'drill_pattern', 'primaryStructure should be drill_pattern');
  assert(Array.isArray(analytics.variationSlots), 'variationSlots should be array');
  assert(analytics.slotSwitchDensity === 0, 'slotSwitchDensity should be 0 for drills');
  assert(typeof analytics.promptDiversityScore === 'number', 'promptDiversityScore should be number');
  assert(analytics.scenarioCoverageScore === 0, 'scenarioCoverageScore should be 0 for drills');
  assert(['low', 'medium', 'high'].includes(analytics.estimatedCognitiveLoad), 'estimatedCognitiveLoad should be valid enum');
  
  console.log('   ✅ computeDrillCatalogAnalytics correct');
});

// Test: Deterministic computation
test('deterministic: same input produces same output', () => {
  const pack = {
    id: 'test-pack',
    kind: 'pack',
    scenario: 'work',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    prompts: [
      { id: 'p1', text: 'Ich gehe zur Arbeit.', slotsChanged: ['subject', 'verb'] },
      { id: 'p2', text: 'Du kommst zur Schule.', slotsChanged: ['verb'] }
    ]
  };
  
  const analytics1 = computePackCatalogAnalytics(pack);
  const analytics2 = computePackCatalogAnalytics(pack);
  
  // All fields should match exactly
  assert(analytics1.primaryStructure === analytics2.primaryStructure, 'primaryStructure should match');
  assert(JSON.stringify(analytics1.variationSlots) === JSON.stringify(analytics2.variationSlots), 'variationSlots should match');
  assert(Math.abs(analytics1.slotSwitchDensity - analytics2.slotSwitchDensity) < 0.001, 'slotSwitchDensity should match');
  assert(Math.abs(analytics1.promptDiversityScore - analytics2.promptDiversityScore) < 0.001, 'promptDiversityScore should match');
  assert(Math.abs(analytics1.scenarioCoverageScore - analytics2.scenarioCoverageScore) < 0.001, 'scenarioCoverageScore should match');
  assert(analytics1.estimatedCognitiveLoad === analytics2.estimatedCognitiveLoad, 'estimatedCognitiveLoad should match');
  
  console.log('   ✅ Deterministic computation verified');
});

// Run all tests
console.log('\n🧪 Running computeCatalogAnalytics unit tests...\n');

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

