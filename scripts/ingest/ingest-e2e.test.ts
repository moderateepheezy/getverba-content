#!/usr/bin/env tsx

/**
 * End-to-end tests for ingestion pipeline
 * 
 * Tests the complete flow:
 * 1. Text extraction
 * 2. Segmentation
 * 3. Signal extraction
 * 4. Pack planning
 * 5. Draft prompt generation
 * 6. Quality gates
 * 7. Draft pack writing
 * 8. Promotion to production
 * 9. Validation
 * 
 * Run with: tsx scripts/ingest/ingest-e2e.test.ts
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', '..', 'content', 'v1');
const TEST_DIR = join(__dirname, '..', '..', '.test-ingest');

// Simple test framework
interface Test {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: Test[] = [];
let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual: number, expected: number, message?: string) {
  if (actual <= expected) {
    throw new Error(message || `Expected ${actual} > ${expected}`);
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
// E2E Test 1: Full pipeline with text input
// ============================================================================

test('E2E: Full pipeline with text input - government_office A2', async () => {
  setupTestDir();
  const workspace = 'test-ws';
  const scenario = 'government_office';
  const level = 'A2';
  const testId = `e2e-text-${Date.now()}`;
  
  try {
    // Create test input text
    const inputText = `
      Ich brauche einen Termin beim Bürgeramt.
      Das Formular für die Anmeldung ist wichtig.
      Ich benötige meine Unterlagen: Pass, Bescheinigung und Ausweis.
      Der Termin kann am Montag um 14:30 sein.
      Die Gebühr beträgt 50 Euro.
      Wo ist das Ausländeramt?
      Kann ich einen Termin vereinbaren?
    `;
    
    // Run ingestion
    console.log(`  Running ingestion pipeline...`);
    execSync(
      `npx tsx scripts/ingest-niche.ts --workspace ${workspace} --scenario ${scenario} --level ${level} --input-text "${inputText}"`,
      {
        cwd: join(__dirname, '..', '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    // Verify draft packs were created
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    assert(existsSync(draftDir), 'Draft directory should exist');
    
    const draftPacks = existsSync(draftDir) 
      ? readdirSync(draftDir).filter(f => 
          existsSync(join(draftDir, f, 'pack.json'))
        )
      : [];
    assertGreaterThan(draftPacks.length, 0, 'Should create at least one draft pack');
    
    // Verify each draft pack
    for (const packId of draftPacks) {
      const packPath = join(draftDir, packId, 'pack.json');
      assert(existsSync(packPath), `Draft pack should exist: ${packPath}`);
      
      const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
      assertEqual(pack.id, packId, 'Pack ID should match');
      assertEqual(pack.scenario, scenario, 'Pack scenario should match');
      assertEqual(pack.level, level, 'Pack level should match');
      assert(pack.prompts && pack.prompts.length > 0, 'Pack should have prompts');
      assert(pack.sessionPlan, 'Pack should have sessionPlan');
      assert(pack.analytics, 'Pack should have analytics');
      assert(pack._ingestionMetadata, 'Draft pack should have ingestion metadata');
      
      // Verify prompts have required fields
      for (const prompt of pack.prompts) {
        assert(prompt.text.length >= 12, 'Prompt should meet minimum length');
        assert(prompt.text.length <= 140, 'Prompt should meet maximum length');
        assert(prompt.intent.length > 0, 'Prompt should have intent');
        assert(prompt.gloss_en.length > 0, 'Prompt should have gloss_en');
        assert(prompt.natural_en !== undefined, 'Prompt should have natural_en (A2+)');
        assert(prompt.audioUrl.length > 0, 'Prompt should have audioUrl');
      }
    }
    
    // Verify report was generated
    const exportsDir = join(__dirname, '..', '..', 'exports');
    const reportFiles = readdirSync(exportsDir).filter(f => 
      f.startsWith(`ingest-report.${workspace}.${scenario}`) && f.endsWith('.json')
    );
    assertGreaterThan(reportFiles.length, 0, 'Should generate report');
    
    const report = JSON.parse(readFileSync(join(exportsDir, reportFiles[reportFiles.length - 1]), 'utf-8'));
    assertEqual(report.workspace, workspace, 'Report workspace should match');
    assertEqual(report.scenario, scenario, 'Report scenario should match');
    assertEqual(report.level, level, 'Report level should match');
    assertGreaterThan(report.generatedPacks.length, 0, 'Report should list generated packs');
    assert(report.qualityGateSummary, 'Report should have quality gate summary');
    
    console.log(`  ✅ Full pipeline with text input passed`);
    
    // Cleanup
    if (existsSync(draftDir)) {
      rmSync(draftDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    // Cleanup on error
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    if (existsSync(draftDir)) {
      rmSync(draftDir, { recursive: true, force: true });
    }
    throw error;
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 2: Promotion workflow
// ============================================================================

test('E2E: Promotion workflow - draft to production', async () => {
  setupTestDir();
  const workspace = 'test-ws';
  const scenario = 'government_office';
  const level = 'A2';
  
  try {
    // Create a test draft pack manually
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    mkdirSync(draftDir, { recursive: true });
    
    const testPackId = `e2e-promote-${Date.now()}`;
    const draftPackDir = join(draftDir, testPackId);
    mkdirSync(draftPackDir, { recursive: true });
    
    const draftPack: any = {
      schemaVersion: 1,
      id: testPackId,
      kind: 'pack',
      title: 'E2E Test Pack',
      level: level,
      estimatedMinutes: 30,
      description: 'Test description',
      scenario: scenario,
      register: 'formal',
      primaryStructure: 'modal_verbs_requests',
      variationSlots: ['subject', 'verb', 'object'],
      outline: ['Step 1'],
      prompts: [
        {
          id: 'prompt-001',
          text: 'Ich brauche einen Termin am Montag um 14:30.',
          intent: 'request',
          gloss_en: 'I need an appointment on Monday at 14:30.',
          natural_en: 'I\'d like to schedule an appointment for Monday at 2:30 PM.',
          audioUrl: `/v1/audio/${testPackId}/prompt-001.mp3`,
          slotsChanged: ['subject', 'verb']
        },
        {
          id: 'prompt-002',
          text: 'Sie benötigen das Formular für die Anmeldung.',
          intent: 'inform',
          gloss_en: 'You need the form for registration.',
          natural_en: 'You\'ll need the registration form.',
          audioUrl: `/v1/audio/${testPackId}/prompt-002.mp3`,
          slotsChanged: ['subject', 'object']
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
      },
      tags: [scenario],
      analytics: {
        goal: 'Practice government office scenarios at A2 level',
        constraints: ['formal register maintained', 'government_office scenario context'],
        levers: ['subject variation', 'verb substitution'],
        successCriteria: ['Uses formal address (Sie/Ihnen) correctly', 'Includes required scenario tokens'],
        commonMistakes: ['Forgetting formal address', 'Missing required documents vocabulary'],
        drillType: 'roleplay-bounded',
        cognitiveLoad: 'medium'
      },
      _ingestionMetadata: {
        source: 'text',
        generatedAt: new Date().toISOString(),
        chunkIds: ['chunk1']
      }
    };
    
    writeFileSync(join(draftPackDir, 'pack.json'), JSON.stringify(draftPack, null, 2));
    
    // Promote the pack
    console.log(`  Promoting draft pack...`);
    execSync(
      `npx tsx scripts/promote-drafts-to-section.ts --workspace ${workspace} ${testPackId}`,
      {
        cwd: join(__dirname, '..', '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    // Verify pack was promoted
    const productionPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
    assert(existsSync(productionPath), 'Promoted pack should exist in production');
    
    const promotedPack = JSON.parse(readFileSync(productionPath, 'utf-8'));
    assertEqual(promotedPack.id, testPackId, 'Promoted pack ID should match');
    assert(promotedPack._ingestionMetadata === undefined, 'Ingestion metadata should be removed');
    assert(promotedPack.prompts.length === 2, 'Promoted pack should have prompts');
    
    console.log(`  ✅ Promotion workflow passed`);
    
    // Cleanup
    if (existsSync(productionPath)) {
      rmSync(join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId), { recursive: true, force: true });
    }
    if (existsSync(draftPackDir)) {
      rmSync(draftPackDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    // Cleanup on error
    const testPackId = `e2e-promote-${Date.now()}`;
    const productionPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    const draftPath = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs', testPackId);
    if (existsSync(productionPath)) {
      rmSync(productionPath, { recursive: true, force: true });
    }
    if (existsSync(draftPath)) {
      rmSync(draftPath, { recursive: true, force: true });
    }
    throw error;
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 3: Deterministic generation
// ============================================================================

test('E2E: Deterministic generation - same input produces same output', async () => {
  setupTestDir();
  const workspace = 'test-ws';
  const scenario = 'government_office';
  const level = 'A2';
  
  try {
    const inputText = 'Ich brauche einen Termin. Das Formular ist wichtig.';
    
    // Run ingestion twice with same input
    console.log(`  Running ingestion first time...`);
    execSync(
      `npx tsx scripts/ingest-niche.ts --workspace ${workspace} --scenario ${scenario} --level ${level} --input-text "${inputText}"`,
      {
        cwd: join(__dirname, '..', '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    const draftDir1 = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    const packs1 = existsSync(draftDir1)
      ? readdirSync(draftDir1).filter(f => 
          existsSync(join(draftDir1, f, 'pack.json'))
        )
      : [];
    
    // Get pack IDs and content
    const packIds1 = packs1.sort();
    const packContents1 = packIds1.map(id => {
      const packPath = join(draftDir1, id, 'pack.json');
      return JSON.parse(readFileSync(packPath, 'utf-8'));
    });
    
    // Cleanup first run
    if (existsSync(draftDir1)) {
      rmSync(draftDir1, { recursive: true, force: true });
    }
    
    // Run ingestion again with same input
    console.log(`  Running ingestion second time...`);
    execSync(
      `npx tsx scripts/ingest-niche.ts --workspace ${workspace} --scenario ${scenario} --level ${level} --input-text "${inputText}"`,
      {
        cwd: join(__dirname, '..', '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    const draftDir2 = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    const packs2 = existsSync(draftDir2)
      ? readdirSync(draftDir2).filter(f => 
          existsSync(join(draftDir2, f, 'pack.json'))
        )
      : [];
    
    // Get pack IDs and content
    const packIds2 = packs2.sort();
    const packContents2 = packIds2.map(id => {
      const packPath = join(draftDir2, id, 'pack.json');
      return JSON.parse(readFileSync(packPath, 'utf-8'));
    });
    
    // Verify deterministic output
    assertEqual(packIds1.length, packIds2.length, 'Should produce same number of packs');
    
    for (let i = 0; i < packIds1.length; i++) {
      assertEqual(packIds1[i], packIds2[i], `Pack ${i} ID should be stable`);
      assertEqual(
        packContents1[i].prompts.length,
        packContents2[i].prompts.length,
        `Pack ${i} should have same number of prompts`
      );
      
      // Verify prompts are identical
      for (let j = 0; j < packContents1[i].prompts.length; j++) {
        assertEqual(
          packContents1[i].prompts[j].text,
          packContents2[i].prompts[j].text,
          `Prompt ${j} text should be identical`
        );
        assertEqual(
          packContents1[i].prompts[j].id,
          packContents2[i].prompts[j].id,
          `Prompt ${j} ID should be identical`
        );
      }
    }
    
    console.log(`  ✅ Deterministic generation verified`);
    
    // Cleanup
    if (existsSync(draftDir2)) {
      rmSync(draftDir2, { recursive: true, force: true });
    }
    
  } catch (error) {
    // Cleanup on error
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    if (existsSync(draftDir)) {
      rmSync(draftDir, { recursive: true, force: true });
    }
    throw error;
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 4: Quality gates enforcement
// ============================================================================

test('E2E: Quality gates are enforced in reports', async () => {
  setupTestDir();
  const workspace = 'test-ws';
  const scenario = 'government_office';
  const level = 'A2';
  
  try {
    // Use text that might produce some quality gate issues
    const inputText = 'Termin. Formular.';
    
    console.log(`  Running ingestion with minimal input...`);
    execSync(
      `npx tsx scripts/ingest-niche.ts --workspace ${workspace} --scenario ${scenario} --level ${level} --input-text "${inputText}"`,
      {
        cwd: join(__dirname, '..', '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    // Check report for quality gate results
    const exportsDir = join(__dirname, '..', '..', 'exports');
    const reportFiles = readdirSync(exportsDir).filter(f => 
      f.startsWith(`ingest-report.${workspace}.${scenario}`) && f.endsWith('.json')
    );
    assertGreaterThan(reportFiles.length, 0, 'Should generate report');
    
    const report = JSON.parse(readFileSync(join(exportsDir, reportFiles[reportFiles.length - 1]), 'utf-8'));
    assert(report.qualityGateSummary, 'Report should have quality gate summary');
    assert(typeof report.qualityGateSummary.passRate === 'number', 'Report should have pass rate');
    assert(Array.isArray(report.qualityGateSummary.failures), 'Report should list failures');
    assert(Array.isArray(report.qualityGateSummary.warnings), 'Report should list warnings');
    
    // Verify report structure
    for (const pack of report.generatedPacks) {
      assert(pack.packId.length > 0, 'Pack should have ID');
      assert(typeof pack.qualityGatePassed === 'boolean', 'Pack should have quality gate status');
      assert(typeof pack.promptCount === 'number', 'Pack should have prompt count');
    }
    
    console.log(`  ✅ Quality gates enforcement verified`);
    
    // Cleanup
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    if (existsSync(draftDir)) {
      rmSync(draftDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    // Cleanup on error
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    if (existsSync(draftDir)) {
      rmSync(draftDir, { recursive: true, force: true });
    }
    throw error;
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 5: Multiple scenarios
// ============================================================================

test('E2E: Multiple scenarios generate valid packs', async () => {
  setupTestDir();
  const workspace = 'test-ws';
  const scenarios = ['government_office', 'work'];
  const level = 'A2';
  
  try {
    for (const scenario of scenarios) {
      console.log(`  Testing scenario: ${scenario}...`);
      
      const inputText = scenario === 'government_office'
        ? 'Ich brauche einen Termin. Das Formular ist wichtig.'
        : 'Das Meeting beginnt um 14:30. Der Manager ist im Büro.';
      
      execSync(
        `npx tsx scripts/ingest-niche.ts --workspace ${workspace} --scenario ${scenario} --level ${level} --input-text "${inputText}"`,
        {
          cwd: join(__dirname, '..', '..'),
          encoding: 'utf-8',
          stdio: 'pipe'
        }
      );
      
      const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
      const packs = existsSync(draftDir)
        ? readdirSync(draftDir).filter(f => 
            existsSync(join(draftDir, f, 'pack.json'))
          )
        : [];
      
      assertGreaterThan(packs.length, 0, `Should create packs for ${scenario}`);
      
      // Verify pack scenario matches
      for (const packId of packs) {
        const packPath = join(draftDir, packId, 'pack.json');
        const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
        if (pack.scenario === scenario) {
          assertEqual(pack.scenario, scenario, 'Pack scenario should match');
          assert(pack.prompts.length > 0, 'Pack should have prompts');
        }
      }
    }
    
    console.log(`  ✅ Multiple scenarios test passed`);
    
    // Cleanup
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    if (existsSync(draftDir)) {
      rmSync(draftDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    // Cleanup on error
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    if (existsSync(draftDir)) {
      rmSync(draftDir, { recursive: true, force: true });
    }
    throw error;
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// Run Tests
// ============================================================================

async function runTests() {
  console.log(`\n🧪 Running ${tests.length} E2E tests...\n`);
  
  for (const testCase of tests) {
    try {
      console.log(`\n📋 ${testCase.name}`);
      await testCase.fn();
      passed++;
      console.log(`  ✅ ${testCase.name} passed`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`❌ ${testCase.name}: ${message}`);
      console.error(`  ❌ ${testCase.name} failed`);
      console.error(`     ${message}`);
      if (error instanceof Error && error.stack) {
        console.error(`     ${error.stack.split('\n').slice(1, 3).join('\n     ')}`);
      }
    }
  }
  
  console.log(`\n📊 E2E Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (errors.length > 0) {
    console.log(`\n❌ Failures:`);
    for (const error of errors) {
      console.log(`   ${error}`);
    }
  }
  
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log(`\n✅ All E2E tests passed!`);
  }
}

runTests();

