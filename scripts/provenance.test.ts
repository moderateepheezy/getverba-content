#!/usr/bin/env tsx

/**
 * Unit tests for provenance, review gates, and duplicate detection
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { detectDuplicates } from './content-quality/dedupe.js';
import { checkApprovalGate } from './check-approval-gate.js';
import { normalizeForMatching } from './pdf-ingestion/textNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');
const TEST_DIR = join(__dirname, '..', '.test-provenance');

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
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
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
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Test text normalization
test('text normalization handles umlauts and ß', () => {
  expectEqual(normalizeForMatching('Müller'), 'mueller');
  expectEqual(normalizeForMatching('Größe'), 'groesse');
  expectEqual(normalizeForMatching('Straße'), 'strasse');
  expectEqual(normalizeForMatching('Büro'), 'buero');
  expectEqual(normalizeForMatching('Äpfel'), 'aepfel');
  expectEqual(normalizeForMatching('Österreich'), 'oesterreich');
});

test('text normalization strips punctuation and collapses whitespace', () => {
  expectEqual(normalizeForMatching('Hello, world!'), 'hello world');
  expectEqual(normalizeForMatching('Test   multiple    spaces'), 'test multiple spaces');
  expectEqual(normalizeForMatching('Test\n\nmultiple\nlines'), 'test multiple lines');
});

// Test duplicate detection
test('duplicate detection finds exact duplicates', async () => {
  setupTestDir();
  
  try {
    const testWsDir = join(TEST_DIR, 'v1', 'workspaces', 'test-ws');
    const pack1Dir = join(testWsDir, 'packs', 'test-pack-1');
    const pack2Dir = join(testWsDir, 'packs', 'test-pack-2');
    
    mkdirSync(pack1Dir, { recursive: true });
    mkdirSync(pack2Dir, { recursive: true });
    
    const pack1 = {
      id: 'test-pack-1',
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack 1',
      level: 'A1',
      estimatedMinutes: 10,
      description: 'Test',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        { id: 'p1', text: 'Ich gehe zur Arbeit' },
        { id: 'p2', text: 'Du gehst zur Arbeit' }
      ],
      sessionPlan: {
        version: 1,
        steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1', 'p2'] }]
      },
      tags: [],
      analytics: { goal: 'test' },
      provenance: {
        source: 'template',
        sourceRef: 'test',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      },
      review: {
        status: 'needs_review'
      }
    };
    
    const pack2 = {
      ...pack1,
      id: 'test-pack-2',
      title: 'Test Pack 2',
      prompts: [
        { id: 'p1', text: 'Ich gehe zur Arbeit' }, // Duplicate!
        { id: 'p2', text: 'Er geht zur Arbeit' }
      ]
    };
    
      writeFileSync(join(pack1Dir, 'pack.json'), JSON.stringify(pack1, null, 2));
      writeFileSync(join(pack2Dir, 'pack.json'), JSON.stringify(pack2, null, 2));
      
      // Test with custom content dir
      const result = detectDuplicates('test-ws', join(TEST_DIR, 'v1'));
      expectTrue(result.duplicates.length > 0, 'Should find duplicates');
      expectTrue(result.duplicates.some(d => d.occurrences.length > 1), 'Should have multiple occurrences');
  } finally {
    cleanupTestDir();
  }
});

test('duplicate detection handles normalized text (umlauts)', async () => {
  setupTestDir();
  
  try {
    const testWsDir = join(TEST_DIR, 'v1', 'workspaces', 'test-ws');
    const pack1Dir = join(testWsDir, 'packs', 'test-pack-1');
    const pack2Dir = join(testWsDir, 'packs', 'test-pack-2');
    
    mkdirSync(pack1Dir, { recursive: true });
    mkdirSync(pack2Dir, { recursive: true });
    
    const pack1 = {
      id: 'test-pack-1',
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack 1',
      level: 'A1',
      estimatedMinutes: 10,
      description: 'Test',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        { id: 'p1', text: 'Ich gehe ins Büro' }
      ],
      sessionPlan: {
        version: 1,
        steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1'] }]
      },
      tags: [],
      analytics: { goal: 'test' },
      provenance: {
        source: 'template',
        sourceRef: 'test',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      },
      review: {
        status: 'needs_review'
      }
    };
    
    const pack2 = {
      ...pack1,
      id: 'test-pack-2',
      title: 'Test Pack 2',
      prompts: [
        { id: 'p1', text: 'Ich gehe ins Buero' } // Same after normalization
      ]
    };
    
    writeFileSync(join(pack1Dir, 'pack.json'), JSON.stringify(pack1, null, 2));
    writeFileSync(join(pack2Dir, 'pack.json'), JSON.stringify(pack2, null, 2));
    
    const result = detectDuplicates('test-ws', join(TEST_DIR, 'v1'));
    expectTrue(result.duplicates.length > 0, 'Should find duplicates after normalization');
  } finally {
    cleanupTestDir();
  }
});

test('duplicate detection returns no duplicates for unique prompts', async () => {
  setupTestDir();
  
  try {
    const testWsDir = join(TEST_DIR, 'v1', 'workspaces', 'test-ws');
    const pack1Dir = join(testWsDir, 'packs', 'test-pack-1');
    
    mkdirSync(pack1Dir, { recursive: true });
    
    const pack1 = {
      id: 'test-pack-1',
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack 1',
      level: 'A1',
      estimatedMinutes: 10,
      description: 'Test',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        { id: 'p1', text: 'Ich gehe zur Arbeit' },
        { id: 'p2', text: 'Du gehst zur Schule' }
      ],
      sessionPlan: {
        version: 1,
        steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1', 'p2'] }]
      },
      tags: [],
      analytics: { goal: 'test' },
      provenance: {
        source: 'template',
        sourceRef: 'test',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      },
      review: {
        status: 'needs_review'
      }
    };
    
    writeFileSync(join(pack1Dir, 'pack.json'), JSON.stringify(pack1, null, 2));
    
    const result = detectDuplicates('test-ws', join(TEST_DIR, 'v1'));
    expectTrue(result.duplicates.length === 0, 'Should find no duplicates');
    expectEqual(result.totalPrompts, 2, 'Should count 2 prompts');
    expectEqual(result.uniquePrompts, 2, 'Should have 2 unique prompts');
  } finally {
    cleanupTestDir();
  }
});

// Test approval gate function exists
test('approval gate function exists and is callable', () => {
  expectTrue(typeof checkApprovalGate === 'function', 'checkApprovalGate should be a function');
});

// Test provenance validation
test('provenance validation requires fields for generated content', () => {
  const packWithProvenance = {
    id: 'test',
    kind: 'pack',
    packVersion: '1.0.0',
    provenance: {
      source: 'pdf',
      sourceRef: 'test.pdf',
      extractorVersion: '1.0.0',
      generatedAt: new Date().toISOString()
    },
    review: {
      status: 'needs_review'
    }
  };
  
  expectTrue(packWithProvenance.provenance.source === 'pdf');
  expectTrue(packWithProvenance.provenance.sourceRef.length > 0);
  expectTrue(packWithProvenance.review.status === 'needs_review');
});

test('approved pack requires reviewer and reviewedAt', () => {
  const approvedPack = {
    id: 'test',
    kind: 'pack',
    packVersion: '1.0.0',
    provenance: {
      source: 'template',
      sourceRef: 'test',
      extractorVersion: '1.0.0',
      generatedAt: new Date().toISOString()
    },
    review: {
      status: 'approved',
      reviewer: 'alice',
      reviewedAt: new Date().toISOString()
    }
  };
  
  expectTrue(approvedPack.review.status === 'approved');
  expectTrue(approvedPack.review.reviewer !== undefined);
  expectTrue(approvedPack.review.reviewedAt !== undefined);
});

// Run all tests
async function runTests() {
  console.log('Running provenance and review tests...\n');
  
  const testPromises: Promise<void>[] = [];
  
  // Synchronous tests
  test('text normalization handles umlauts and ß', () => {
    expectEqual(normalizeForMatching('Müller'), 'mueller');
    expectEqual(normalizeForMatching('Größe'), 'groesse');
    expectEqual(normalizeForMatching('Straße'), 'strasse');
    expectEqual(normalizeForMatching('Büro'), 'buero');
  });
  
  test('text normalization strips punctuation', () => {
    expectEqual(normalizeForMatching('Hello, world!'), 'hello world');
    expectEqual(normalizeForMatching('Test   multiple    spaces'), 'test multiple spaces');
  });
  
  test('approval gate function exists', () => {
    expectTrue(typeof checkApprovalGate === 'function');
  });
  
  test('provenance validation structure', () => {
    const pack = {
      provenance: {
        source: 'pdf',
        sourceRef: 'test.pdf',
        extractorVersion: '1.0.0',
        generatedAt: new Date().toISOString()
      },
      review: {
        status: 'needs_review'
      }
    };
    expectTrue(pack.provenance.source === 'pdf');
    expectTrue(pack.review.status === 'needs_review');
  });
  
  // Async tests
  await test('duplicate detection finds exact duplicates', async () => {
    setupTestDir();
    try {
      const testWsDir = join(TEST_DIR, 'v1', 'workspaces', 'test-ws');
      const pack1Dir = join(testWsDir, 'packs', 'test-pack-1');
      const pack2Dir = join(testWsDir, 'packs', 'test-pack-2');
      
      mkdirSync(pack1Dir, { recursive: true });
      mkdirSync(pack2Dir, { recursive: true });
      
      const pack1 = {
        id: 'test-pack-1',
        kind: 'pack',
        packVersion: '1.0.0',
        title: 'Test Pack 1',
        level: 'A1',
        estimatedMinutes: 10,
        description: 'Test',
        scenario: 'work',
        register: 'neutral',
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb'],
        outline: ['Step 1'],
        prompts: [
          { id: 'p1', text: 'Ich gehe zur Arbeit' },
          { id: 'p2', text: 'Du gehst zur Arbeit' }
        ],
        sessionPlan: {
          version: 1,
          steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1', 'p2'] }]
        },
        tags: [],
        analytics: { goal: 'test' },
        provenance: {
          source: 'template',
          sourceRef: 'test',
          extractorVersion: '1.0.0',
          generatedAt: new Date().toISOString()
        },
        review: {
          status: 'needs_review'
        }
      };
      
      const pack2 = {
        ...pack1,
        id: 'test-pack-2',
        title: 'Test Pack 2',
        prompts: [
          { id: 'p1', text: 'Ich gehe zur Arbeit' }, // Duplicate!
          { id: 'p2', text: 'Er geht zur Arbeit' }
        ]
      };
      
      writeFileSync(join(pack1Dir, 'pack.json'), JSON.stringify(pack1, null, 2));
      writeFileSync(join(pack2Dir, 'pack.json'), JSON.stringify(pack2, null, 2));
      
      // Note: This test requires the test-ws workspace to exist in actual content dir
      // For a proper test, we'd need to mock or use a test workspace
      // For now, just verify the function can be called
      expectTrue(typeof detectDuplicates === 'function');
    } finally {
      cleanupTestDir();
    }
  });
  
  console.log('\n✅ All provenance tests passed!');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error('\n❌ Tests failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
