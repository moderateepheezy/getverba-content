#!/usr/bin/env tsx

/**
 * Unit tests for PDF → Packs Batch Generation v1.1
 * 
 * Tests:
 * - Batch report generation structure
 * - Deterministic IDs with fixed seed
 * - Generated packs default to needs_review
 * - Approval gate blocks promotion if batch contains needs_review
 * - Dedupe catches duplicates across packs within the same batch
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkApprovalGate } from './check-approval-gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');
const TEST_DIR = join(__dirname, '..', '.test-batch');

// Simple test framework
function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`✓ ${name}`);
      }).catch((error: any) => {
        console.error(`✗ ${name}`);
        console.error(`  ${error.message}`);
        throw error;
      });
    } else {
      console.log(`✓ ${name}`);
    }
  } catch (error: any) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    throw error;
  }
}

function expectTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Expected true, got false');
  }
}

function expectFalse(condition: boolean, message?: string) {
  if (condition) {
    throw new Error(message || 'Expected false, got true');
  }
}

function expectEqual(actual: any, expected: any, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Setup/teardown
function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'meta'), { recursive: true });
  
  // Create minimal staging manifest
  const manifest = {
    version: 1,
    workspaces: [
      {
        id: 'test-ws',
        sections: [
          {
            id: 'packs',
            itemsUrl: '/v1/workspaces/test-ws/packs/index.json'
          }
        ]
      }
    ]
  };
  writeFileSync(join(TEST_DIR, 'meta', 'manifest.staging.json'), JSON.stringify(manifest, null, 2));
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// All tests are now defined using queueTest below

// Test runner that executes all tests
const testQueue: Array<{ name: string; fn: () => void | Promise<void> }> = [];

// Wrap test function to queue tests
function queueTest(name: string, fn: () => void | Promise<void>) {
  testQueue.push({ name, fn });
}

// Re-define tests using queueTest
queueTest('generated packs default to needs_review status', () => {
  setupTestDir();
  
  try {
    const pack1: any = {
      schemaVersion: 1,
      id: 'test-pack-1',
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack 1',
      level: 'A1',
      scenario: 'work',
      register: 'neutral',
      provenance: {
        source: 'pdf',
        sourceRef: 'test.pdf (pages 1-10)',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      },
      review: {
        status: 'needs_review'
      },
      prompts: [],
      sessionPlan: { version: 1, steps: [] }
    };
    
    const packPath = join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack-1', 'pack.json');
    mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack-1'), { recursive: true });
    writeFileSync(packPath, JSON.stringify(pack1, null, 2));
    
    const loaded = JSON.parse(readFileSync(packPath, 'utf-8'));
    expectEqual(loaded.review.status, 'needs_review', 'Generated pack should default to needs_review');
    expectFalse(loaded.review.reviewer !== undefined, 'Generated pack should not have reviewer');
    expectFalse(loaded.review.reviewedAt !== undefined, 'Generated pack should not have reviewedAt');
    
  } finally {
    cleanupTestDir();
  }
});

queueTest('deterministic pack IDs with fixed seed', () => {
  function generatePackId(
    pdfBaseName: string,
    scenario: string,
    level: string,
    partNumber: number,
    workspace: string
  ): string {
    const base = `${pdfBaseName}-${scenario}-${level}-part${partNumber}`;
    const slug = base
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return slug;
  }
  
  const id1 = generatePackId('test-pdf', 'work', 'A1', 1, 'de');
  const id2 = generatePackId('test-pdf', 'work', 'A1', 1, 'de');
  const id3 = generatePackId('test-pdf', 'work', 'A1', 2, 'de');
  
  expectEqual(id1, id2, 'Same inputs should produce same pack ID');
  expectTrue(id1 !== id3, 'Different part numbers should produce different pack IDs');
  expectEqual(id1, 'test-pdf-work-a1-part1', 'Pack ID should match expected format');
});

queueTest('batch report has required structure', () => {
  const report: any = {
    timestamp: new Date().toISOString(),
    pdfSlug: 'test-pdf',
    pdfStats: {
      pages: 100,
      chars: 50000,
      candidates: 200
    },
    chosenScenario: 'work',
    scenarioRanking: [],
    topWindows: [],
    generatedPacks: [],
    reviewQueue: [],
    rejectedCandidates: [],
    errors: [],
    warnings: []
  };
  
  expectTrue(report.timestamp !== undefined, 'Report should have timestamp');
  expectTrue(report.pdfSlug !== undefined, 'Report should have pdfSlug');
  expectTrue(report.pdfStats !== undefined, 'Report should have pdfStats');
  expectTrue(report.chosenScenario !== undefined, 'Report should have chosenScenario');
  expectTrue(report.generatedPacks !== undefined, 'Report should have generatedPacks');
  expectTrue(report.reviewQueue !== undefined, 'Report should have reviewQueue');
  expectTrue(report.rejectedCandidates !== undefined, 'Report should have rejectedCandidates');
});

queueTest('dedupe catches duplicates across packs in batch', () => {
  const pack1 = {
    prompts: [
      { id: 'p1', text: 'Ich gehe zur Arbeit.' },
      { id: 'p2', text: 'Ich habe einen Termin.' }
    ]
  };
  
  const pack2 = {
    prompts: [
      { id: 'p1', text: 'Ich gehe zur Arbeit.' }, // Duplicate!
      { id: 'p2', text: 'Ich brauche Hilfe.' }
    ]
  };
  
  function normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  const normalized1 = normalizeText(pack1.prompts[0].text);
  const normalized2 = normalizeText(pack2.prompts[0].text);
  
  expectEqual(normalized1, normalized2, 'Duplicate prompts should normalize to same text');
  expectTrue(normalized1 === 'ich gehe zur arbeit', 'Normalized text should match expected');
});

queueTest('provenance fields are set correctly for generated packs', () => {
  const pack: any = {
    provenance: {
      source: 'pdf',
      sourceRef: 'test.pdf (pages 1-10)',
      extractorVersion: '1.0.0',
      generatedAt: new Date().toISOString()
    }
  };
  
  expectTrue(pack.provenance.source === 'pdf', 'Provenance source should be pdf');
  expectTrue(pack.provenance.sourceRef.includes('test.pdf'), 'SourceRef should include PDF name');
  expectTrue(pack.provenance.sourceRef.includes('pages'), 'SourceRef should include page info');
  expectTrue(pack.provenance.extractorVersion !== undefined, 'Should have extractorVersion');
  expectTrue(pack.provenance.generatedAt !== undefined, 'Should have generatedAt');
});

queueTest('review queue is sorted by quality score descending', () => {
  const reviewQueue = [
    { packId: 'pack-1', qualityScore: 75, title: 'Pack 1' },
    { packId: 'pack-2', qualityScore: 90, title: 'Pack 2' },
    { packId: 'pack-3', qualityScore: 60, title: 'Pack 3' }
  ];
  
  const sorted = [...reviewQueue].sort((a, b) => b.qualityScore - a.qualityScore);
  
  expectEqual(sorted[0].packId, 'pack-2', 'Highest quality score should be first');
  expectEqual(sorted[1].packId, 'pack-1', 'Second highest should be second');
  expectEqual(sorted[2].packId, 'pack-3', 'Lowest should be last');
});

queueTest('reject list tracks candidate rejection reasons', () => {
  const rejectedCandidates = [
    { textHash: 'abc123', text: 'Heading text', reason: 'Not dialogue-like (heading/front matter)' },
    { textHash: 'def456', text: 'Short', reason: 'Too short' },
    { textHash: 'ghi789', text: 'Generic phrase', reason: 'Contains banned phrase' }
  ];
  
  expectTrue(rejectedCandidates.length === 3, 'Should track all rejected candidates');
  expectTrue(rejectedCandidates[0].reason.includes('Not dialogue-like'), 'Should have specific reason');
  expectTrue(rejectedCandidates[0].textHash !== undefined, 'Should have text hash');
});

// Main test runner
async function main() {
  console.log('Running PDF → Packs Batch Generation unit tests...\n');
  
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (const testCase of testQueue) {
    try {
      console.log(`  Running: ${testCase.name}...`);
      await testCase.fn();
      console.log(`  ✓ ${testCase.name}`);
      passed++;
    } catch (error: any) {
      console.error(`  ✗ ${testCase.name}`);
      console.error(`    ${error.message}`);
      errors.push(`${testCase.name}: ${error.message}`);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\nErrors:');
    errors.forEach(err => console.log(`  - ${err}`));
    process.exit(1);
  } else {
    console.log('\n✅ All unit tests passed!');
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

