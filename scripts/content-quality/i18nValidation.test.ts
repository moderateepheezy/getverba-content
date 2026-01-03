#!/usr/bin/env tsx

/**
 * Tests for i18n Validation Utilities
 * 
 * Tests cover:
 * - title_i18n validation (locale keys, values, required "en")
 * - shortTitle_i18n validation
 * - description_i18n validation  
 * - groupId/groupTitle/groupTitle_i18n validation
 * - Cross-field consistency warnings
 * - Backward compatibility (missing fields are valid)
 */

import {
  isValidLocaleKey,
  isValidGroupId,
  validateI18nRecord,
  validateTitleI18n,
  validateShortTitleI18n,
  validateDescriptionI18n,
  validateGroupingMetadata,
  validateI18nAndGrouping,
  createTitleI18nFromTitle,
  getDoctorPackGroup,
  DOCTOR_SCENARIO_GROUPS
} from './i18nValidation.js';

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

// ============ Locale Key Tests ============

test('isValidLocaleKey accepts "en"', () => {
  assert(isValidLocaleKey('en'), '"en" should be valid');
});

test('isValidLocaleKey accepts "de"', () => {
  assert(isValidLocaleKey('de'), '"de" should be valid');
});

test('isValidLocaleKey accepts "de-AT"', () => {
  assert(isValidLocaleKey('de-AT'), '"de-AT" should be valid');
});

test('isValidLocaleKey accepts "pt-BR"', () => {
  assert(isValidLocaleKey('pt-BR'), '"pt-BR" should be valid');
});

test('isValidLocaleKey rejects "ENG"', () => {
  assert(!isValidLocaleKey('ENG'), '"ENG" should be invalid (3 letters)');
});

test('isValidLocaleKey rejects "e"', () => {
  assert(!isValidLocaleKey('e'), '"e" should be invalid (1 letter)');
});

test('isValidLocaleKey rejects "en-us" (lowercase region)', () => {
  assert(!isValidLocaleKey('en-us'), '"en-us" should be invalid (region must be uppercase)');
});

test('isValidLocaleKey rejects "EN" (uppercase language)', () => {
  assert(!isValidLocaleKey('EN'), '"EN" should be invalid (language must be lowercase)');
});

test('isValidLocaleKey rejects "en_US" (underscore)', () => {
  assert(!isValidLocaleKey('en_US'), '"en_US" should be invalid (must use hyphen)');
});

// ============ Group ID Tests ============

test('isValidGroupId accepts "appointments"', () => {
  assert(isValidGroupId('appointments'), '"appointments" should be valid');
});

test('isValidGroupId accepts "booking-appointments"', () => {
  assert(isValidGroupId('booking-appointments'), '"booking-appointments" should be valid');
});

test('isValidGroupId accepts "describing_symptoms"', () => {
  assert(isValidGroupId('describing_symptoms'), '"describing_symptoms" should be valid');
});

test('isValidGroupId accepts "group1"', () => {
  assert(isValidGroupId('group1'), '"group1" should be valid');
});

test('isValidGroupId rejects empty string', () => {
  assert(!isValidGroupId(''), 'empty string should be invalid');
});

test('isValidGroupId rejects "123start"', () => {
  assert(!isValidGroupId('123start'), '"123start" should be invalid (starts with number)');
});

test('isValidGroupId rejects "Appointments" (uppercase)', () => {
  assert(!isValidGroupId('Appointments'), '"Appointments" should be invalid (uppercase)');
});

test('isValidGroupId rejects strings over 40 chars', () => {
  const longId = 'a'.repeat(41);
  assert(!isValidGroupId(longId), 'strings over 40 chars should be invalid');
});

// ============ title_i18n Validation Tests ============

test('validateTitleI18n: valid with "en" key', () => {
  const result = validateTitleI18n({ en: 'Doctor Appointment' });
  assert(result.valid, 'Should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateTitleI18n: valid with multiple locales', () => {
  const result = validateTitleI18n({ 
    en: 'Doctor Appointment', 
    de: 'Arzttermin' 
  });
  assert(result.valid, 'Should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateTitleI18n: invalid when missing "en"', () => {
  const result = validateTitleI18n({ de: 'Arzttermin' });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('must include "en"')), 'Should require "en" locale');
});

test('validateTitleI18n: invalid when empty object', () => {
  const result = validateTitleI18n({});
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('at least one locale')), 'Should require at least one locale');
});

test('validateTitleI18n: invalid when value is empty string', () => {
  const result = validateTitleI18n({ en: '' });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('non-empty')), 'Should require non-empty value');
});

test('validateTitleI18n: invalid when value is whitespace only', () => {
  const result = validateTitleI18n({ en: '   ' });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('non-empty')), 'Should require non-empty value');
});

test('validateTitleI18n: invalid when value exceeds 80 chars', () => {
  const longTitle = 'A'.repeat(81);
  const result = validateTitleI18n({ en: longTitle });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('exceeds max length')), 'Should enforce max length');
});

test('validateTitleI18n: valid when value is exactly 80 chars', () => {
  const exactTitle = 'A'.repeat(80);
  const result = validateTitleI18n({ en: exactTitle });
  assert(result.valid, 'Should be valid');
});

test('validateTitleI18n: invalid with bad locale key', () => {
  const result = validateTitleI18n({ 'english': 'Doctor Appointment' });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('invalid locale key')), 'Should reject invalid locale key');
});

test('validateTitleI18n: invalid when value is not a string', () => {
  const result = validateTitleI18n({ en: 123 });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('must be a string')), 'Should require string value');
});

test('validateTitleI18n: valid when undefined (optional field)', () => {
  const result = validateTitleI18n(undefined);
  assert(result.valid, 'Should be valid when undefined');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateTitleI18n: valid when null (optional field)', () => {
  const result = validateTitleI18n(null);
  assert(result.valid, 'Should be valid when null');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateTitleI18n: warns about leading/trailing whitespace', () => {
  const result = validateTitleI18n({ en: '  Doctor Appointment  ' });
  assert(result.valid, 'Should be valid (whitespace is just a warning)');
  assert(result.warnings.some(w => w.includes('whitespace')), 'Should warn about whitespace');
});

// ============ shortTitle_i18n Validation Tests ============

test('validateShortTitleI18n: valid with short title', () => {
  const result = validateShortTitleI18n({ en: 'Phone booking' });
  assert(result.valid, 'Should be valid');
});

test('validateShortTitleI18n: invalid when exceeds 28 chars', () => {
  const longTitle = 'A'.repeat(29);
  const result = validateShortTitleI18n({ en: longTitle });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('exceeds max length')), 'Should enforce 28 char limit');
});

test('validateShortTitleI18n: valid when exactly 28 chars', () => {
  const exactTitle = 'A'.repeat(28);
  const result = validateShortTitleI18n({ en: exactTitle });
  assert(result.valid, 'Should be valid');
});

// ============ Grouping Metadata Tests ============

test('validateGroupingMetadata: valid with no grouping fields', () => {
  const result = validateGroupingMetadata({ title: 'Test' });
  assert(result.valid, 'Should be valid with no grouping fields');
});

test('validateGroupingMetadata: valid with groupId and groupTitle', () => {
  const result = validateGroupingMetadata({
    groupId: 'booking-appointments',
    groupTitle: 'Booking Appointments'
  });
  assert(result.valid, 'Should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateGroupingMetadata: valid with all grouping fields', () => {
  const result = validateGroupingMetadata({
    groupId: 'booking-appointments',
    groupTitle: 'Booking Appointments',
    groupTitle_i18n: { en: 'Booking Appointments', de: 'Terminbuchung' }
  });
  assert(result.valid, 'Should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateGroupingMetadata: invalid with groupId but no groupTitle', () => {
  const result = validateGroupingMetadata({
    groupId: 'booking-appointments'
  });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('groupTitle is missing')), 'Should require groupTitle');
});

test('validateGroupingMetadata: invalid with groupTitle but no groupId', () => {
  const result = validateGroupingMetadata({
    groupTitle: 'Booking Appointments'
  });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('groupId is missing')), 'Should require groupId');
});

test('validateGroupingMetadata: invalid with bad groupId format', () => {
  const result = validateGroupingMetadata({
    groupId: 'BookingAppointments', // Invalid: uppercase
    groupTitle: 'Booking Appointments'
  });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('invalid')), 'Should reject invalid groupId');
});

test('validateGroupingMetadata: invalid with empty groupTitle', () => {
  const result = validateGroupingMetadata({
    groupId: 'booking-appointments',
    groupTitle: ''
  });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('non-empty')), 'Should require non-empty groupTitle');
});

test('validateGroupingMetadata: invalid with groupTitle_i18n missing "en"', () => {
  const result = validateGroupingMetadata({
    groupId: 'booking-appointments',
    groupTitle: 'Booking Appointments',
    groupTitle_i18n: { de: 'Terminbuchung' }
  });
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.some(e => e.includes('must include "en"')), 'Should require "en" in groupTitle_i18n');
});

// ============ Combined Validation Tests ============

test('validateI18nAndGrouping: valid with all fields correct', () => {
  const result = validateI18nAndGrouping({
    title: 'Doctor Appointment',
    title_i18n: { en: 'Doctor Appointment' },
    shortTitle: 'Phone booking',
    shortTitle_i18n: { en: 'Phone booking' },
    groupId: 'booking-appointments',
    groupTitle: 'Booking Appointments',
    groupTitle_i18n: { en: 'Booking Appointments' }
  });
  assert(result.valid, 'Should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateI18nAndGrouping: valid when no i18n or grouping fields present (backward compat)', () => {
  const result = validateI18nAndGrouping({
    title: 'Doctor Appointment',
    shortTitle: 'Phone booking'
  });
  assert(result.valid, 'Should be valid - backward compatible');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('validateI18nAndGrouping: warns when title_i18n.en differs from title', () => {
  const result = validateI18nAndGrouping({
    title: 'Doctor Appointment',
    title_i18n: { en: 'Different Title' }
  });
  assert(result.valid, 'Should be valid (mismatch is just a warning)');
  assert(result.warnings.some(w => w.includes('does not match')), 'Should warn about mismatch');
});

test('validateI18nAndGrouping: invalid when title_i18n is invalid', () => {
  const result = validateI18nAndGrouping({
    title: 'Doctor Appointment',
    title_i18n: { de: 'Arzttermin' } // Missing "en"
  });
  assert(!result.valid, 'Should be invalid');
});

// ============ Helper Function Tests ============

test('createTitleI18nFromTitle creates correct structure', () => {
  const result = createTitleI18nFromTitle('Doctor Appointment');
  assertDeepEqual(result, { en: 'Doctor Appointment' }, 'Should create correct i18n object');
});

// ============ Doctor Group Detection Tests ============

test('getDoctorPackGroup detects booking-appointments from title', () => {
  const group = getDoctorPackGroup({ title: 'Doctor A1 — 1: Making an Appointment' });
  assertEqual(group, 'booking-appointments', 'Should detect booking-appointments group');
});

test('getDoctorPackGroup detects describing-symptoms from title', () => {
  const group = getDoctorPackGroup({ title: 'Doctor A1 — 2: Describing Symptoms' });
  assertEqual(group, 'describing-symptoms', 'Should detect describing-symptoms group');
});

test('getDoctorPackGroup detects getting-prescriptions from title', () => {
  const group = getDoctorPackGroup({ title: 'Doctor A1 — 3: Getting Prescription' });
  assertEqual(group, 'getting-prescriptions', 'Should detect getting-prescriptions group');
});

test('getDoctorPackGroup uses shortTitle as fallback', () => {
  const group = getDoctorPackGroup({ shortTitle: 'Symptom description' });
  assertEqual(group, 'describing-symptoms', 'Should detect from shortTitle');
});

test('getDoctorPackGroup uses topicLabel as fallback', () => {
  const group = getDoctorPackGroup({ topicLabel: 'Making an Appointment' });
  assertEqual(group, 'booking-appointments', 'Should detect from topicLabel');
});

test('getDoctorPackGroup returns null for unrecognized content', () => {
  const group = getDoctorPackGroup({ title: 'Some Random Pack' });
  assertEqual(group, null, 'Should return null for unrecognized content');
});

// ============ Predefined Groups Tests ============

test('DOCTOR_SCENARIO_GROUPS has correct structure', () => {
  assert(DOCTOR_SCENARIO_GROUPS['booking-appointments'] !== undefined, 'Should have booking-appointments');
  assert(DOCTOR_SCENARIO_GROUPS['describing-symptoms'] !== undefined, 'Should have describing-symptoms');
  assert(DOCTOR_SCENARIO_GROUPS['getting-prescriptions'] !== undefined, 'Should have getting-prescriptions');
  
  // Check structure
  const group = DOCTOR_SCENARIO_GROUPS['booking-appointments'];
  assertEqual(group.groupId, 'booking-appointments', 'groupId should match key');
  assertEqual(group.groupTitle, 'Booking Appointments', 'Should have groupTitle');
  assertEqual(group.groupTitle_i18n.en, 'Booking Appointments', 'Should have groupTitle_i18n.en');
});

// Run all tests
console.log('Running i18n validation tests...\n');

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

