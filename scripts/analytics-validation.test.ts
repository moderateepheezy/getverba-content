#!/usr/bin/env tsx

/**
 * Unit tests for analytics validation
 * 
 * Tests:
 * - Validation requires analytics for generated content
 * - Validation allows optional analytics for handcrafted content
 * - Validation detects analytics mismatches
 * - Validation enforces passesQualityGates === true for generated content
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = join(__dirname, '..', '.test-analytics');
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

function setupCatalog(workspace: string) {
  const catalog = {
    schemaVersion: 1,
    version: '1.0.0',
    workspace: workspace,
    languageCode: 'de',
    languageName: 'German',
    sections: [
      {
        id: 'context',
        kind: 'pack',
        title: 'Context',
        itemsUrl: `/v1/workspaces/${workspace}/context/index.json`
      }
    ]
  };
  
  mkdirSync(join(CONTENT_DIR, 'workspaces', workspace), { recursive: true });
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  const index = {
    schemaVersion: 1,
    version: 'v1',
    kind: 'pack',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-pack',
        kind: 'pack',
        title: 'Test Pack',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: `/v1/workspaces/${workspace}/packs/test-pack/pack.json`
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(CONTENT_DIR, 'workspaces', workspace, 'context'), { recursive: true });
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', workspace, 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
}

function runValidation(): { success: boolean; output: string; errors: string[] } {
  try {
    const output = execSync(
      `npx tsx scripts/validate-content.ts`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        env: { ...process.env, CONTENT_DIR: CONTENT_DIR },
        stdio: 'pipe'
      }
    );
    return { success: true, output, errors: [] };
  } catch (error: any) {
    const output = error.stdout || error.message || '';
    const errors = output.split('\n').filter((line: string) => 
      line.includes('Error') || line.includes('❌') || line.includes('analytics')
    );
    return { success: false, output, errors };
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

// Test: Generated pack without analytics should fail
test('generated pack missing analytics: validation should fail', () => {
  setupTestDir();
  setupCatalog('test-ws');
  
  try {
    const pack = {
      schemaVersion: 1,
      id: 'test-pack',
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test description',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        { id: 'p1', text: 'Ich gehe zur Arbeit.', intent: 'inform', gloss_en: 'I go to work.' }
      ],
      sessionPlan: {
        version: 1,
        steps: [{ id: 'step1', title: 'Step 1', promptIds: ['p1'] }]
      },
      provenance: {
        source: 'template',
        sourceRef: 'test-template',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      },
      review: {
        status: 'needs_review'
      }
      // Missing analytics block
    };
    
    const packPath = join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    const result = runValidation();
    
    assert(!result.success, 'Validation should fail for generated pack without analytics');
    assert(
      result.errors.some(err => err.includes('analytics') || err.includes('missing')),
      `Expected analytics error, got: ${result.errors.join(', ')}`
    );
    
    console.log('   ✅ Generated pack without analytics correctly rejected');
  } finally {
    cleanupTestDir();
  }
});

// Test: Generated pack with incorrect analytics should fail
test('generated pack with mismatched analytics: validation should fail', () => {
  setupTestDir();
  setupCatalog('test-ws');
  
  try {
    const pack = {
      schemaVersion: 1,
      id: 'test-pack',
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test description',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        { id: 'p1', text: 'Ich gehe zur Arbeit.', intent: 'inform', gloss_en: 'I go to work.', slotsChanged: ['subject', 'verb'] },
        { id: 'p2', text: 'Du kommst zur Schule.', intent: 'inform', gloss_en: 'You come to school.', slotsChanged: ['verb'] }
      ],
      sessionPlan: {
        version: 1,
        steps: [{ id: 'step1', title: 'Step 1', promptIds: ['p1', 'p2'] }]
      },
      analytics: {
        version: 1,
        qualityGateVersion: 'qg-2025-01-01',
        scenario: 'work',
        register: 'neutral',
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb'],
        promptCount: 999, // Wrong count - should be 2
        multiSlotRate: 0.99, // Wrong rate - should be 0.5
        scenarioTokenHitAvg: 0,
        scenarioTokenQualifiedRate: 0,
        uniqueTokenRate: 0,
        bannedPhraseViolations: 0,
        passesQualityGates: true
      },
      provenance: {
        source: 'template',
        sourceRef: 'test-template',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      },
      review: {
        status: 'needs_review'
      }
    };
    
    const packPath = join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    const result = runValidation();
    
    assert(!result.success, 'Validation should fail for pack with mismatched analytics');
    assert(
      result.errors.some(err => err.includes('mismatch') || err.includes('promptCount') || err.includes('multiSlotRate')),
      `Expected analytics mismatch error, got: ${result.errors.join(', ')}`
    );
    
    console.log('   ✅ Mismatched analytics correctly detected');
  } finally {
    cleanupTestDir();
  }
});

// Test: Handcrafted pack without analytics should pass
test('handcrafted pack without analytics: validation should pass', () => {
  setupTestDir();
  setupCatalog('test-ws');
  
  try {
    const pack = {
      schemaVersion: 1,
      id: 'test-pack',
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test description',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        { id: 'p1', text: 'Ich gehe zur Arbeit.', intent: 'inform', gloss_en: 'I go to work.' }
      ],
      sessionPlan: {
        version: 1,
        steps: [{ id: 'step1', title: 'Step 1', promptIds: ['p1'] }]
      },
      provenance: {
        source: 'handcrafted',
        sourceRef: 'manual',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      }
      // No analytics block - should be OK for handcrafted
    };
    
    const packPath = join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    const result = runValidation();
    
    // Should pass (or at least not fail on missing analytics)
    assert(
      !result.errors.some(err => err.includes('analytics') && err.includes('required')),
      `Handcrafted pack should not require analytics, got errors: ${result.errors.join(', ')}`
    );
    
    console.log('   ✅ Handcrafted pack without analytics correctly allowed');
  } finally {
    cleanupTestDir();
  }
});

// Test: Generated pack with passesQualityGates === false should fail
test('generated pack with passesQualityGates false: validation should fail', () => {
  setupTestDir();
  setupCatalog('test-ws');
  
  try {
    const pack = {
      schemaVersion: 1,
      id: 'test-pack',
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test description',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        { id: 'p1', text: 'Ich gehe zur Arbeit.', intent: 'inform', gloss_en: 'I go to work.' }
      ],
      sessionPlan: {
        version: 1,
        steps: [{ id: 'step1', title: 'Step 1', promptIds: ['p1'] }]
      },
      analytics: {
        version: 1,
        qualityGateVersion: 'qg-2025-01-01',
        scenario: 'work',
        register: 'neutral',
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb'],
        promptCount: 1,
        multiSlotRate: 0,
        scenarioTokenHitAvg: 0,
        scenarioTokenQualifiedRate: 0,
        uniqueTokenRate: 0.5,
        bannedPhraseViolations: 0,
        passesQualityGates: false // Should fail validation
      },
      provenance: {
        source: 'template',
        sourceRef: 'test-template',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      },
      review: {
        status: 'needs_review'
      }
    };
    
    const packPath = join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    const result = runValidation();
    
    assert(!result.success, 'Validation should fail for pack with passesQualityGates === false');
    assert(
      result.errors.some(err => err.includes('passesQualityGates')),
      `Expected passesQualityGates error, got: ${result.errors.join(', ')}`
    );
    
    console.log('   ✅ passesQualityGates === false correctly rejected');
  } finally {
    cleanupTestDir();
  }
});

// Run all tests
console.log('\n🧪 Running analytics validation tests...\n');

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


