#!/usr/bin/env tsx

/**
 * Integration tests for index enrichment with topic fields
 * 
 * Tests:
 * - Index items include topic fields after generation
 * - Pack entries with explicit metadata are preserved
 * - Derived fields are valid according to schema
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { deriveTopicFields, validateTopicFields, type PackEntry } from './deriveTopicFields.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTENT_DIR = join(__dirname, '..', '..', 'content', 'v1');

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

// ============ Integration tests ============

test('doctor packs have topic fields after derivation', () => {
  // Read a doctor pack and verify topic fields can be derived
  const packPath = join(CONTENT_DIR, 'workspaces', 'de', 'packs', 'doctor_pack_1_a1', 'pack.json');
  
  if (!existsSync(packPath)) {
    throw new Error('Test pack not found: doctor_pack_1_a1');
  }
  
  const packContent = readFileSync(packPath, 'utf-8');
  const pack = JSON.parse(packContent);
  
  const packEntry: PackEntry = {
    id: pack.id,
    title: pack.title,
    level: pack.level,
    scenario: pack.scenario,
    primaryStructure: pack.primaryStructure,
    tags: pack.tags,
    analytics: pack.analytics
  };
  
  const topicFields = deriveTopicFields(packEntry);
  
  // Should have all topic fields
  assert(topicFields.topicKey !== undefined, 'topicKey should be defined');
  assert(topicFields.topicLabel !== undefined, 'topicLabel should be defined');
  assert(topicFields.shortTitle !== undefined, 'shortTitle should be defined');
  assert(topicFields.orderInTopic !== undefined, 'orderInTopic should be defined');
  
  // Validate the fields
  const validation = validateTopicFields(topicFields);
  assert(validation.valid, `Topic fields should be valid: ${validation.errors.join(', ')}`);
});

test('explicit topic metadata in pack is preserved', () => {
  const packPath = join(CONTENT_DIR, 'workspaces', 'de', 'packs', 'doctor_pack_1_a1', 'pack.json');
  
  if (!existsSync(packPath)) {
    throw new Error('Test pack not found: doctor_pack_1_a1');
  }
  
  const packContent = readFileSync(packPath, 'utf-8');
  const pack = JSON.parse(packContent);
  
  // If pack has explicit topic metadata in analytics, it should be used
  if (pack.analytics?.topicKey) {
    const packEntry: PackEntry = {
      id: pack.id,
      title: pack.title,
      level: pack.level,
      scenario: pack.scenario,
      primaryStructure: pack.primaryStructure,
      tags: pack.tags,
      analytics: pack.analytics
    };
    
    const topicFields = deriveTopicFields(packEntry);
    
    assertEqual(topicFields.topicKey, pack.analytics.topicKey, 'Explicit topicKey should be preserved');
    assertEqual(topicFields.topicLabel, pack.analytics.topicLabel, 'Explicit topicLabel should be preserved');
    assertEqual(topicFields.shortTitle, pack.analytics.shortTitle, 'Explicit shortTitle should be preserved');
    assertEqual(topicFields.orderInTopic, pack.analytics.orderInTopic, 'Explicit orderInTopic should be preserved');
  }
});

test('housing packs derive valid topic fields', () => {
  const packPath = join(CONTENT_DIR, 'workspaces', 'de', 'packs', 'housing_pack_1_a1', 'pack.json');
  
  if (!existsSync(packPath)) {
    console.log('   ⚠️  Skipping: housing_pack_1_a1 not found');
    return;
  }
  
  const packContent = readFileSync(packPath, 'utf-8');
  const pack = JSON.parse(packContent);
  
  const packEntry: PackEntry = {
    id: pack.id,
    title: pack.title,
    level: pack.level,
    scenario: pack.scenario,
    primaryStructure: pack.primaryStructure,
    tags: pack.tags,
    analytics: pack.analytics
  };
  
  const topicFields = deriveTopicFields(packEntry);
  
  // Validate the fields
  const validation = validateTopicFields(topicFields);
  assert(validation.valid, `Topic fields should be valid: ${validation.errors.join(', ')}`);
  
  // Check expected order extraction
  // Housing pack 1 should have order 1
  assertEqual(topicFields.orderInTopic, 1, 'Housing pack 1 should have orderInTopic = 1');
});

test('work packs derive valid topic fields', () => {
  const packPath = join(CONTENT_DIR, 'workspaces', 'de', 'packs', 'work_pack_1_a2', 'pack.json');
  
  if (!existsSync(packPath)) {
    console.log('   ⚠️  Skipping: work_pack_1_a2 not found');
    return;
  }
  
  const packContent = readFileSync(packPath, 'utf-8');
  const pack = JSON.parse(packContent);
  
  const packEntry: PackEntry = {
    id: pack.id,
    title: pack.title,
    level: pack.level,
    scenario: pack.scenario,
    primaryStructure: pack.primaryStructure,
    tags: pack.tags,
    analytics: pack.analytics
  };
  
  const topicFields = deriveTopicFields(packEntry);
  
  // Validate the fields
  const validation = validateTopicFields(topicFields);
  assert(validation.valid, `Topic fields should be valid: ${validation.errors.join(', ')}`);
});

test('all de packs derive valid topic fields', () => {
  const packsDir = join(CONTENT_DIR, 'workspaces', 'de', 'packs');
  
  if (!existsSync(packsDir)) {
    throw new Error('Packs directory not found');
  }
  
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  
  let validCount = 0;
  let invalidCount = 0;
  const invalidPacks: string[] = [];
  
  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir, 'pack.json');
    
    if (!existsSync(packPath)) {
      continue;
    }
    
    try {
      const packContent = readFileSync(packPath, 'utf-8');
      const pack = JSON.parse(packContent);
      
      const packEntry: PackEntry = {
        id: pack.id,
        title: pack.title,
        level: pack.level,
        scenario: pack.scenario,
        primaryStructure: pack.primaryStructure,
        tags: pack.tags,
        analytics: pack.analytics
      };
      
      const topicFields = deriveTopicFields(packEntry);
      const validation = validateTopicFields(topicFields);
      
      if (validation.valid) {
        validCount++;
      } else {
        invalidCount++;
        invalidPacks.push(`${packDir}: ${validation.errors.join(', ')}`);
      }
    } catch (err: any) {
      invalidCount++;
      invalidPacks.push(`${packDir}: ${err.message}`);
    }
  }
  
  console.log(`   📦 Checked ${validCount + invalidCount} packs: ${validCount} valid, ${invalidCount} invalid`);
  
  if (invalidCount > 0) {
    throw new Error(`Invalid packs:\n${invalidPacks.slice(0, 5).join('\n')}`);
  }
});

test('shortTitle never exceeds 28 characters', () => {
  const packsDir = join(CONTENT_DIR, 'workspaces', 'de', 'packs');
  
  if (!existsSync(packsDir)) {
    throw new Error('Packs directory not found');
  }
  
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  
  const violations: string[] = [];
  
  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir, 'pack.json');
    
    if (!existsSync(packPath)) {
      continue;
    }
    
    try {
      const packContent = readFileSync(packPath, 'utf-8');
      const pack = JSON.parse(packContent);
      
      const packEntry: PackEntry = {
        id: pack.id,
        title: pack.title,
        level: pack.level,
        scenario: pack.scenario,
        primaryStructure: pack.primaryStructure,
        tags: pack.tags,
        analytics: pack.analytics
      };
      
      const topicFields = deriveTopicFields(packEntry);
      
      if (topicFields.shortTitle && topicFields.shortTitle.length > 28) {
        violations.push(`${packDir}: shortTitle "${topicFields.shortTitle}" is ${topicFields.shortTitle.length} chars`);
      }
    } catch (err) {
      // Skip parse errors (handled by other tests)
    }
  }
  
  if (violations.length > 0) {
    throw new Error(`ShortTitle violations:\n${violations.join('\n')}`);
  }
});

test('topicKey is always valid kebab-case', () => {
  const packsDir = join(CONTENT_DIR, 'workspaces', 'de', 'packs');
  
  if (!existsSync(packsDir)) {
    throw new Error('Packs directory not found');
  }
  
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  
  const kebabCaseRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const violations: string[] = [];
  
  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir, 'pack.json');
    
    if (!existsSync(packPath)) {
      continue;
    }
    
    try {
      const packContent = readFileSync(packPath, 'utf-8');
      const pack = JSON.parse(packContent);
      
      const packEntry: PackEntry = {
        id: pack.id,
        title: pack.title,
        level: pack.level,
        scenario: pack.scenario,
        primaryStructure: pack.primaryStructure,
        tags: pack.tags,
        analytics: pack.analytics
      };
      
      const topicFields = deriveTopicFields(packEntry);
      
      if (topicFields.topicKey && !kebabCaseRegex.test(topicFields.topicKey)) {
        violations.push(`${packDir}: topicKey "${topicFields.topicKey}" is not kebab-case`);
      }
    } catch (err) {
      // Skip parse errors (handled by other tests)
    }
  }
  
  if (violations.length > 0) {
    throw new Error(`TopicKey violations:\n${violations.join('\n')}`);
  }
});

// Run all tests
console.log('Running index enrichment integration tests...\n');

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

