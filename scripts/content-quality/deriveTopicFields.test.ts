#!/usr/bin/env tsx

/**
 * Unit tests for deriveTopicFields utility
 * 
 * Tests:
 * - Title parsing and extraction
 * - Slugification with German umlauts
 * - Order extraction from various patterns
 * - Validation rules
 * - Explicit metadata preservation
 */

import {
  deriveTopicFields,
  slugify,
  extractOrderFromTitle,
  cleanTitle,
  splitTitleParts,
  humanizePrimaryStructure,
  humanizeTag,
  isGenericLabel,
  validateTopicFields,
  GENERIC_TOPIC_LABELS,
  type PackEntry,
  type TopicFields
} from './deriveTopicFields.js';

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

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ============ slugify tests ============

test('slugify: basic string', () => {
  assertEqual(slugify('Hello World'), 'hello-world');
});

test('slugify: German umlauts', () => {
  assertEqual(slugify('Ärztin Österreich'), 'aerztin-oesterreich');
  assertEqual(slugify('Größe'), 'groesse');
  assertEqual(slugify('Übung'), 'uebung');
});

test('slugify: special characters', () => {
  assertEqual(slugify('Hello! World?'), 'hello-world');
  assertEqual(slugify('Test --- Value'), 'test-value');
});

test('slugify: already kebab-case', () => {
  assertEqual(slugify('already-kebab-case'), 'already-kebab-case');
});

test('slugify: length limit', () => {
  const longString = 'this-is-a-very-long-string-that-should-be-truncated-to-64-characters-maximum-length';
  const result = slugify(longString);
  assert(result.length <= 64, `Result length ${result.length} should be <= 64`);
});

test('slugify: numbers preserved', () => {
  assertEqual(slugify('Pack 123 Test'), 'pack-123-test');
});

// ============ extractOrderFromTitle tests ============

test('extractOrderFromTitle: em-dash pattern', () => {
  assertEqual(extractOrderFromTitle('Doctor A1 — 1: Making an Appointment'), 1);
  assertEqual(extractOrderFromTitle('Doctor A1 — 5: Describing Symptoms'), 5);
  assertEqual(extractOrderFromTitle('Housing A2 — 10: Rental Agreement'), 10);
});

test('extractOrderFromTitle: regular dash pattern', () => {
  assertEqual(extractOrderFromTitle('Doctor A1 - 3: Getting Prescription'), 3);
});

test('extractOrderFromTitle: hash pattern', () => {
  assertEqual(extractOrderFromTitle('Work Pack #2'), 2);
  assertEqual(extractOrderFromTitle('Lesson #15'), 15);
});

test('extractOrderFromTitle: Part N pattern', () => {
  assertEqual(extractOrderFromTitle('Doctor Part 3'), 3);
  assertEqual(extractOrderFromTitle('Part 7 - Advanced'), 7);
});

test('extractOrderFromTitle: Pack N pattern', () => {
  assertEqual(extractOrderFromTitle('Doctor Pack 4'), 4);
});

test('extractOrderFromTitle: no order found', () => {
  assertEqual(extractOrderFromTitle('Basic German Greetings'), undefined);
  assertEqual(extractOrderFromTitle('Introduction to German'), undefined);
});

// ============ cleanTitle tests ============

test('cleanTitle: removes CEFR levels', () => {
  assertEqual(cleanTitle('Doctor A1 Test'), 'Doctor Test');
  assertEqual(cleanTitle('Housing B2 Advanced'), 'Housing Advanced');
});

test('cleanTitle: removes numbering patterns', () => {
  assertEqual(cleanTitle('Doctor — 1: Making an Appointment'), 'Doctor Making an Appointment');
  assertEqual(cleanTitle('Pack #3 Test'), 'Test');
  assertEqual(cleanTitle('Part 2 of the Series'), 'of the Series');
});

test('cleanTitle: handles multiple patterns', () => {
  assertEqual(cleanTitle('Doctor A1 — 5: Getting Prescription'), 'Doctor Getting Prescription');
});

// ============ splitTitleParts tests ============

test('splitTitleParts: colon pattern', () => {
  const result = splitTitleParts('Doctor A1 — 1: Making an Appointment');
  assertEqual(result.topicPart, 'Making an Appointment');
  assertEqual(result.shortPart, 'Making an Appointment');
});

test('splitTitleParts: long right side truncated', () => {
  const result = splitTitleParts('Test: This is a very long title that should be truncated');
  assert(result.shortPart.length <= 28, `Short part should be <= 28 chars, got ${result.shortPart.length}`);
  assert(result.shortPart.endsWith('...'), 'Should end with ellipsis when truncated');
});

test('splitTitleParts: no colon', () => {
  const result = splitTitleParts('Basic German Greetings');
  assertEqual(result.topicPart, 'Basic German Greetings');
  assertEqual(result.shortPart, 'Basic German Greetings');
});

// ============ humanizePrimaryStructure tests ============

test('humanizePrimaryStructure: snake_case to Title Case', () => {
  assertEqual(humanizePrimaryStructure('modal_verbs_requests'), 'Modal Verbs Requests');
  assertEqual(humanizePrimaryStructure('dative_case'), 'Dative Case');
  assertEqual(humanizePrimaryStructure('verb_second_position'), 'Verb Second Position');
});

// ============ humanizeTag tests ============

test('humanizeTag: simple tag', () => {
  assertEqual(humanizeTag('doctor'), 'Doctor');
  assertEqual(humanizeTag('government_office'), 'Government Office');
});

// ============ isGenericLabel tests ============

test('isGenericLabel: detects generic labels', () => {
  assert(isGenericLabel('General'), 'Should detect "General"');
  assert(isGenericLabel('basics'), 'Should detect "basics"');
  assert(isGenericLabel('PACK'), 'Should detect "PACK" (case-insensitive)');
  assert(isGenericLabel('  Part  '), 'Should detect "Part" with whitespace');
});

test('isGenericLabel: non-generic labels', () => {
  assert(!isGenericLabel('Making an Appointment'), 'Should not flag specific labels');
  assert(!isGenericLabel('Describing Symptoms'), 'Should not flag specific labels');
  assert(!isGenericLabel('Doctor'), 'Should not flag scenario names');
});

// ============ deriveTopicFields tests ============

test('deriveTopicFields: explicit metadata preserved', () => {
  const pack: PackEntry = {
    id: 'test-pack',
    title: 'Doctor A1 — 1: Making an Appointment',
    analytics: {
      topicKey: 'custom-key',
      topicLabel: 'Custom Label',
      shortTitle: 'Custom Short',
      orderInTopic: 99
    }
  };
  
  const result = deriveTopicFields(pack);
  assertEqual(result.topicKey, 'custom-key');
  assertEqual(result.topicLabel, 'Custom Label');
  assertEqual(result.shortTitle, 'Custom Short');
  assertEqual(result.orderInTopic, 99);
});

test('deriveTopicFields: derives from title pattern', () => {
  const pack: PackEntry = {
    id: 'doctor_pack_1_a1',
    title: 'Doctor A1 — 1: Making an Appointment',
    scenario: 'doctor',
    primaryStructure: 'modal_verbs_requests'
  };
  
  const result = deriveTopicFields(pack);
  
  // topicLabel should be derived from primaryStructure
  assertEqual(result.topicLabel, 'Modal Verbs Requests');
  // topicKey should be slugified topicLabel
  assertEqual(result.topicKey, 'modal-verbs-requests');
  // shortTitle should be from title after colon
  assertEqual(result.shortTitle, 'Making an Appointment');
  // orderInTopic from "— 1:"
  assertEqual(result.orderInTopic, 1);
});

test('deriveTopicFields: derives from tags when no primaryStructure', () => {
  const pack: PackEntry = {
    id: 'test-pack',
    title: 'Simple Test Pack',
    tags: ['healthcare', 'basic']
  };
  
  const result = deriveTopicFields(pack);
  assertEqual(result.topicLabel, 'Healthcare');
});

test('deriveTopicFields: derives from title when no other metadata', () => {
  const pack: PackEntry = {
    id: 'test-pack',
    title: 'Basic German Greetings'
  };
  
  const result = deriveTopicFields(pack);
  assertEqual(result.topicLabel, 'Basic German Greetings');
  assertEqual(result.shortTitle, 'Basic German Greetings');
});

test('deriveTopicFields: handles long shortTitle', () => {
  const pack: PackEntry = {
    id: 'test-pack',
    title: 'This is a very long title that exceeds the 28 character limit for short titles'
  };
  
  const result = deriveTopicFields(pack);
  assert(result.shortTitle !== undefined, 'shortTitle should be defined');
  assert(result.shortTitle!.length <= 28, `shortTitle should be <= 28 chars, got ${result.shortTitle!.length}`);
});

// ============ validateTopicFields tests ============

test('validateTopicFields: valid fields pass', () => {
  const fields: TopicFields = {
    topicKey: 'making-an-appointment',
    topicLabel: 'Making an Appointment',
    shortTitle: 'Phone booking',
    orderInTopic: 1
  };
  
  const result = validateTopicFields(fields);
  assert(result.valid, `Expected valid, got errors: ${result.errors.join(', ')}`);
  assertEqual(result.errors.length, 0);
});

test('validateTopicFields: invalid topicKey format', () => {
  const fields: TopicFields = {
    topicKey: 'Invalid Key With Spaces',
  };
  
  const result = validateTopicFields(fields);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('kebab-case')), 'Should have kebab-case error');
});

test('validateTopicFields: topicKey too long', () => {
  const fields: TopicFields = {
    topicKey: 'a'.repeat(65),
  };
  
  const result = validateTopicFields(fields);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('too long')), 'Should have length error');
});

test('validateTopicFields: topicLabel too short', () => {
  const fields: TopicFields = {
    topicLabel: 'AB',
  };
  
  const result = validateTopicFields(fields);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('too short')), 'Should have length error');
});

test('validateTopicFields: topicLabel too long', () => {
  const fields: TopicFields = {
    topicLabel: 'A'.repeat(61),
  };
  
  const result = validateTopicFields(fields);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('too long')), 'Should have length error');
});

test('validateTopicFields: topicLabel purely numeric', () => {
  const fields: TopicFields = {
    topicLabel: '12345',
  };
  
  const result = validateTopicFields(fields);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('numeric')), 'Should have numeric error');
});

test('validateTopicFields: shortTitle too long', () => {
  const fields: TopicFields = {
    shortTitle: 'This short title is way too long',
  };
  
  const result = validateTopicFields(fields);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('too long')), 'Should have length error');
});

test('validateTopicFields: orderInTopic not integer', () => {
  const fields: TopicFields = {
    orderInTopic: 1.5,
  };
  
  const result = validateTopicFields(fields);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('integer')), 'Should have integer error');
});

test('validateTopicFields: orderInTopic less than 1', () => {
  const fields: TopicFields = {
    orderInTopic: 0,
  };
  
  const result = validateTopicFields(fields);
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('>= 1')), 'Should have >= 1 error');
});

test('validateTopicFields: generic label warning', () => {
  const fields: TopicFields = {
    topicLabel: 'General',
  };
  
  const result = validateTopicFields(fields);
  assert(result.valid, 'Should still be valid (warning only)');
  assert(result.warnings.some(w => w.includes('generic')), 'Should have generic warning');
});

// ============ Integration tests ============

test('deriveTopicFields: doctor pack pattern', () => {
  const pack: PackEntry = {
    id: 'doctor_pack_1_a1',
    title: 'Doctor A1 — 1: Making an Appointment',
    level: 'A1',
    scenario: 'doctor',
    primaryStructure: 'modal_verbs_requests',
    tags: ['doctor'],
    analytics: {
      primaryStructure: 'modal_verbs_requests'
    }
  };
  
  const result = deriveTopicFields(pack);
  
  // Validate the result
  const validation = validateTopicFields(result);
  assert(validation.valid, `Derived fields should be valid: ${validation.errors.join(', ')}`);
  
  // Check specific values
  assertEqual(result.orderInTopic, 1);
  assert(result.shortTitle !== undefined && result.shortTitle.length <= 28, 'shortTitle should be bounded');
});

test('deriveTopicFields: housing pack pattern', () => {
  const pack: PackEntry = {
    id: 'housing_pack_5_a2',
    title: 'Housing A2 — 5: Rental Agreement Signing',
    level: 'A2',
    scenario: 'housing',
    primaryStructure: 'dative_case',
    tags: ['housing']
  };
  
  const result = deriveTopicFields(pack);
  assertEqual(result.orderInTopic, 5);
  
  const validation = validateTopicFields(result);
  assert(validation.valid, `Derived fields should be valid: ${validation.errors.join(', ')}`);
});

// Run all tests
console.log('Running deriveTopicFields tests...\n');

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error: any) {
    console.error(`❌ ${name}`);
    console.error(`   ${error.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}


