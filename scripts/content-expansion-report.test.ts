#!/usr/bin/env tsx

/**
 * Unit tests for content-expansion-report.ts
 * 
 * These tests verify the expansion report logic works correctly
 * by creating temporary test packs and analyzing them.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = join(__dirname, '..', '.test-expansion-content');
const CONTENT_DIR = join(TEST_DIR, 'content', 'v1');

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(CONTENT_DIR, { recursive: true });
  mkdirSync(join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-1'), { recursive: true });
  mkdirSync(join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-2'), { recursive: true });
  mkdirSync(join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-3'), { recursive: true });
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

// Test 1: Pack with valid multi-slot variation (should pass)
test('pack with valid multi-slot variation passes', () => {
  setupTestDir();
  
  const pack = {
    id: 'test-pack-1',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Test Pack 1',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack',
    scenario: 'shopping',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb', 'object', 'modifier'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich zahle 50€ an der Kasse.',
        intent: 'inform',
        gloss_en: 'I pay 50 euros at the checkout.',
        slotsChanged: ['subject', 'verb', 'modifier']
      },
      {
        id: 'prompt-002',
        text: 'Wir kaufen das Produkt für 30€.',
        intent: 'inform',
        gloss_en: 'We buy the product for 30 euros.',
        slotsChanged: ['subject', 'verb', 'object', 'modifier']
      },
      {
        id: 'prompt-003',
        text: 'Der Preis kostet 25€.',
        intent: 'inform',
        gloss_en: 'The price costs 25 euros.',
        slotsChanged: ['verb', 'object']
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['prompt-001', 'prompt-002', 'prompt-003']
        }
      ]
    }
  };
  
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-1', 'pack.json'),
    JSON.stringify(pack, null, 2)
  );
  
  // Run expansion report
  const originalContentDir = process.env.CONTENT_DIR;
  const originalReportPath = process.env.REPORT_PATH;
  const testReportPath = join(TEST_DIR, 'content-expansion-report.json');
  
  try {
    const scriptPath = join(__dirname, 'content-expansion-report.ts');
    const output = execSync(`npx tsx ${scriptPath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { 
        ...process.env, 
        CONTENT_DIR: CONTENT_DIR,
        REPORT_PATH: testReportPath
      }
    });
    
    // Check report was generated
    assert(existsSync(testReportPath), 'Report should be generated');
    
    const report = JSON.parse(readFileSync(testReportPath, 'utf-8'));
    assert(report.totalPacks === 1, 'Should find 1 pack');
    assert(report.packs.length === 1, 'Should have 1 pack in report');
    
    const packMetrics = report.packs[0];
    assert(packMetrics.packId === 'test-pack-1', 'Pack ID should match');
    assert(packMetrics.percentMultiSlotVariation >= 30, 'Should have >= 30% multi-slot variation');
    assert(packMetrics.bannedPhraseHits === 0, 'Should have 0 banned phrase hits');
    assert(packMetrics.duplicateSentenceCount === 0, 'Should have 0 duplicates');
    assert(report.passed === true, 'Report should pass');
    
    // Cleanup report
    if (existsSync(testReportPath)) {
      rmSync(testReportPath);
    }
  } finally {
    if (originalContentDir) {
      process.env.CONTENT_DIR = originalContentDir;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalReportPath) {
      process.env.REPORT_PATH = originalReportPath;
    } else {
      delete process.env.REPORT_PATH;
    }
  }
  
  cleanupTestDir();
});

// Test 2: Pack with banned phrase (should fail)
test('pack with banned phrase fails', () => {
  setupTestDir();
  
  const pack = {
    id: 'test-pack-2',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Test Pack 2',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack',
    scenario: 'shopping',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'In today\'s lesson, we will practice German.',
        intent: 'inform',
        gloss_en: 'In today\'s lesson, we will practice German.',
        slotsChanged: ['subject', 'verb']
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['prompt-001']
        }
      ]
    }
  };
  
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-2', 'pack.json'),
    JSON.stringify(pack, null, 2)
  );
  
  const testReportPath = join(TEST_DIR, 'content-expansion-report.json');
  
  try {
    const scriptPath = join(__dirname, 'content-expansion-report.ts');
    execSync(`npx tsx ${scriptPath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { 
        ...process.env, 
        CONTENT_DIR: CONTENT_DIR,
        REPORT_PATH: testReportPath
      }
    });
    
    throw new Error('Script should have failed but did not');
  } catch (err: any) {
    // Expected to fail
    assert(err.status === 1 || err.code === 1, 'Script should exit with code 1');
    
    if (existsSync(testReportPath)) {
      const report = JSON.parse(readFileSync(testReportPath, 'utf-8'));
      assert(report.summary.totalBannedPhraseHits > 0, 'Should detect banned phrases');
      assert(report.passed === false, 'Report should fail');
      assert(report.failures.length > 0, 'Should have failures');
      
      // Cleanup report
      rmSync(testReportPath);
    }
  }
  
  cleanupTestDir();
});

// Test 3: Pack with low multi-slot variation (should fail)
test('pack with low multi-slot variation fails', () => {
  setupTestDir();
  
  const pack = {
    id: 'test-pack-3',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Test Pack 3',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack',
    scenario: 'shopping',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich zahle 50€.',
        intent: 'inform',
        gloss_en: 'I pay 50 euros.',
        slotsChanged: ['subject']
      },
      {
        id: 'prompt-002',
        text: 'Wir zahlen 30€.',
        intent: 'inform',
        gloss_en: 'We pay 30 euros.',
        slotsChanged: ['subject']
      },
      {
        id: 'prompt-003',
        text: 'Sie zahlen 25€.',
        intent: 'inform',
        gloss_en: 'You pay 25 euros.',
        slotsChanged: ['subject']
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['prompt-001', 'prompt-002', 'prompt-003']
        }
      ]
    }
  };
  
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-3', 'pack.json'),
    JSON.stringify(pack, null, 2)
  );
  
  const testReportPath = join(TEST_DIR, 'content-expansion-report.json');
  
  try {
    const scriptPath = join(__dirname, 'content-expansion-report.ts');
    execSync(`npx tsx ${scriptPath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { 
        ...process.env, 
        CONTENT_DIR: CONTENT_DIR,
        REPORT_PATH: testReportPath
      }
    });
    
    throw new Error('Script should have failed but did not');
  } catch (err: any) {
    // Expected to fail
    assert(err.status === 1 || err.code === 1, 'Script should exit with code 1');
    
    if (existsSync(testReportPath)) {
      const report = JSON.parse(readFileSync(testReportPath, 'utf-8'));
      assert(report.packs[0].percentMultiSlotVariation < 30, 'Should have < 30% multi-slot variation');
      assert(report.passed === false, 'Report should fail');
      
      // Cleanup report
      rmSync(testReportPath);
    }
  }
  
  cleanupTestDir();
});

// Test 4: Pack with duplicate sentences (should fail)
test('pack with duplicate sentences fails', () => {
  setupTestDir();
  
  mkdirSync(join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-4'), { recursive: true });
  
  const pack = {
    id: 'test-pack-4',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Test Pack 4',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack',
    scenario: 'shopping',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich zahle 50€ an der Kasse.',
        intent: 'inform',
        gloss_en: 'I pay 50 euros at the checkout.',
        slotsChanged: ['subject', 'verb', 'modifier']
      },
      {
        id: 'prompt-002',
        text: 'Ich zahle 50€ an der Kasse.',
        intent: 'inform',
        gloss_en: 'I pay 50 euros at the checkout.',
        slotsChanged: ['subject', 'verb', 'modifier']
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['prompt-001', 'prompt-002']
        }
      ]
    }
  };
  
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-4', 'pack.json'),
    JSON.stringify(pack, null, 2)
  );
  
  const testReportPath = join(TEST_DIR, 'content-expansion-report.json');
  
  try {
    const scriptPath = join(__dirname, 'content-expansion-report.ts');
    execSync(`npx tsx ${scriptPath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { 
        ...process.env, 
        CONTENT_DIR: CONTENT_DIR,
        REPORT_PATH: testReportPath
      }
    });
    
    throw new Error('Script should have failed but did not');
  } catch (err: any) {
    // Expected to fail
    assert(err.status === 1 || err.code === 1, 'Script should exit with code 1');
    
    if (existsSync(testReportPath)) {
      const report = JSON.parse(readFileSync(testReportPath, 'utf-8'));
      assert(report.packs[0].duplicateSentenceCount > 0, 'Should detect duplicates');
      assert(report.passed === false, 'Report should fail');
      
      // Cleanup report
      rmSync(testReportPath);
    }
  }
  
  cleanupTestDir();
});

// Test 5: Multiple packs with mixed results
test('multiple packs with mixed results', () => {
  setupTestDir();
  
  // Pack 1: Valid
  const pack1 = {
    id: 'test-pack-valid',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Valid Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack',
    scenario: 'shopping',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb', 'object'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich zahle 50€ an der Kasse.',
        intent: 'inform',
        gloss_en: 'I pay 50 euros at the checkout.',
        slotsChanged: ['subject', 'verb', 'modifier']
      },
      {
        id: 'prompt-002',
        text: 'Wir kaufen das Produkt für 30€.',
        intent: 'inform',
        gloss_en: 'We buy the product for 30 euros.',
        slotsChanged: ['subject', 'verb', 'object', 'modifier']
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['prompt-001', 'prompt-002']
        }
      ]
    }
  };
  
  // Pack 2: Invalid (low multi-slot)
  const pack2 = {
    id: 'test-pack-invalid',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Invalid Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack',
    scenario: 'shopping',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich zahle 50€.',
        intent: 'inform',
        gloss_en: 'I pay 50 euros.',
        slotsChanged: ['subject']
      },
      {
        id: 'prompt-002',
        text: 'Wir zahlen 30€.',
        intent: 'inform',
        gloss_en: 'We pay 30 euros.',
        slotsChanged: ['subject']
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['prompt-001', 'prompt-002']
        }
      ]
    }
  };
  
  mkdirSync(join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-valid'), { recursive: true });
  mkdirSync(join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-invalid'), { recursive: true });
  
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-valid', 'pack.json'),
    JSON.stringify(pack1, null, 2)
  );
  writeFileSync(
    join(CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'test-pack-invalid', 'pack.json'),
    JSON.stringify(pack2, null, 2)
  );
  
  const testReportPath = join(TEST_DIR, 'content-expansion-report.json');
  
  try {
    const scriptPath = join(__dirname, 'content-expansion-report.ts');
    execSync(`npx tsx ${scriptPath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { 
        ...process.env, 
        CONTENT_DIR: CONTENT_DIR,
        REPORT_PATH: testReportPath
      }
    });
    
    throw new Error('Script should have failed but did not');
  } catch (err: any) {
    // Expected to fail due to invalid pack
    assert(err.status === 1 || err.code === 1, 'Script should exit with code 1');
    
    if (existsSync(testReportPath)) {
      const report = JSON.parse(readFileSync(testReportPath, 'utf-8'));
      assert(report.totalPacks === 2, 'Should find 2 packs');
      assert(report.packs.length === 2, 'Should have 2 packs in report');
      assert(report.passed === false, 'Report should fail');
      assert(report.summary.packsBelowMultiSlotThreshold > 0, 'Should detect packs below threshold');
      
      // Cleanup report
      rmSync(testReportPath);
    }
  }
  
  cleanupTestDir();
});

// Run all tests
function runTests() {
  console.log('Running content-expansion-report tests...\n');
  
  for (const testCase of tests) {
    try {
      testCase.fn();
      passed++;
      console.log(`✅ ${testCase.name}`);
    } catch (err: any) {
      failed++;
      console.error(`❌ ${testCase.name}`);
      console.error(`   ${err.message}`);
    }
  }
  
  console.log(`\nTests: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Cleanup on exit
process.on('exit', () => {
  cleanupTestDir();
});

runTests();

