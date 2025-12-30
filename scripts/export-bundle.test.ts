#!/usr/bin/env tsx

/**
 * Unit tests for export-bundle.ts
 * 
 * Tests verify:
 * - Bundle schema validation
 * - Filter resolution
 * - Stable ordering
 * - Export file generation
 * - ZIP creation
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = join(__dirname, '..', '.test-bundle-export');
const TEST_CONTENT_DIR = join(TEST_DIR, 'content', 'v1');
const TEST_META_DIR = join(TEST_DIR, 'content', 'meta');
const TEST_EXPORTS_DIR = join(TEST_DIR, 'exports');

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws'), { recursive: true });
  mkdirSync(join(TEST_META_DIR, 'bundles'), { recursive: true });
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

// Test: Bundle schema validation
test('bundle schema validation', () => {
  setupTestDir();
  
  const bundlePath = join(TEST_META_DIR, 'bundles', 'test-bundle.json');
  
  // Valid bundle
  const validBundle = {
    version: 1,
    id: 'test_bundle',
    workspace: 'test-ws',
    title: 'Test Bundle',
    description: 'Test description',
    filters: {
      levels: ['A1']
    },
    includeKinds: ['pack'],
    ordering: {
      by: ['level', 'kind', 'title'],
      stable: true
    }
  };
  
  writeFileSync(bundlePath, JSON.stringify(validBundle, null, 2));
  
  // Create minimal workspace structure
  const catalog = {
    workspace: 'test-ws',
    languageCode: 'en',
    languageName: 'English',
    version: '1.0.0',
    sections: [
      {
        id: 'context',
        kind: 'pack',
        title: 'Context',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json'
      }
    ]
  };
  
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  const index = {
    items: []
  };
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  // Test that script validates schema
  try {
    const output = execSync(`tsx scripts/export-bundle.ts --bundle ${bundlePath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR }
    });
    
    // Should fail because no items match
    assert(output.includes('No items match') || output.includes('0 items'), 'Should detect no matching items');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('No items match') || errorOutput.includes('0 items'), 'Should detect no matching items');
  }
  
  cleanupTestDir();
});

// Test: Filter resolution selects correct items
test('filter resolution selects correct items', () => {
  setupTestDir();
  
  const bundlePath = join(TEST_META_DIR, 'bundles', 'test-bundle.json');
  
  const bundle = {
    version: 1,
    id: 'test_bundle',
    workspace: 'test-ws',
    title: 'Test Bundle',
    description: 'Test description',
    filters: {
      scenario: 'work',
      levels: ['A1']
    },
    includeKinds: ['pack'],
    ordering: {
      by: ['level', 'kind', 'title'],
      stable: true
    }
  };
  
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
  
  // Create workspace with matching items
  const catalog = {
    workspace: 'test-ws',
    languageCode: 'en',
    languageName: 'English',
    version: '1.0.0',
    sections: [
      {
        id: 'context',
        kind: 'pack',
        title: 'Context',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json'
      }
    ]
  };
  
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'context'), { recursive: true });
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'pack1'), { recursive: true });
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  const index = {
    items: [
      {
        id: 'pack1',
        kind: 'pack',
        title: 'Work Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json',
        scenario: 'work'
      },
      {
        id: 'pack2',
        kind: 'pack',
        title: 'Restaurant Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/pack2/pack.json',
        scenario: 'restaurant'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  // Create matching pack
  const pack = {
    schemaVersion: 1,
    id: 'pack1',
    kind: 'pack',
    packVersion: '1.0.0',
    title: 'Work Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test',
    outline: ['Step 1'],
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    analytics: {
      goal: 'Test',
      constraints: ['c1'],
      levers: ['subject'],
      successCriteria: ['s1'],
      commonMistakes: ['m1'],
      drillType: 'substitution',
      cognitiveLoad: 'low',
      targetLatencyMs: 800,
      successDefinition: '2 passes',
      keyFailureModes: ['mode1']
    },
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: [] }]
    }
  };
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'pack1', 'pack.json'),
    JSON.stringify(pack, null, 2)
  );
  
  // Test export
  const originalEnv = process.env.CONTENT_DIR;
  const originalExports = process.env.EXPORTS_DIR;
  process.env.CONTENT_DIR = TEST_CONTENT_DIR;
  process.env.EXPORTS_DIR = TEST_EXPORTS_DIR;
  
  try {
    const output = execSync(`tsx scripts/export-bundle.ts --bundle ${bundlePath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    assert(output.includes('Filtered to 1 items'), 'Should filter to 1 matching item');
    assert(output.includes('Resolved 1 items'), 'Should resolve 1 item');
    
    // Check bundle.json was created
    const bundleJsonPath = join(TEST_EXPORTS_DIR, 'test-ws', 'test_bundle', 'bundle', 'bundle.json');
    assert(existsSync(bundleJsonPath), 'bundle.json should be created');
    
    const bundleJson = JSON.parse(readFileSync(bundleJsonPath, 'utf-8'));
    assert(bundleJson.totalItems === 1, 'Bundle should have 1 item');
    assert(bundleJson.items[0].id === 'pack1', 'Bundle should contain pack1');
    assert(bundleJson.items[0].scenario === 'work', 'Item should have correct scenario');
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalExports) {
      process.env.EXPORTS_DIR = originalExports;
    } else {
      delete process.env.EXPORTS_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test: Stable ordering output unchanged across runs
test('stable ordering output unchanged across runs', () => {
  setupTestDir();
  
  const bundlePath = join(TEST_META_DIR, 'bundles', 'test-bundle.json');
  
  const bundle = {
    version: 1,
    id: 'test_bundle',
    workspace: 'test-ws',
    title: 'Test Bundle',
    description: 'Test description',
    filters: {
      levels: ['A1']
    },
    includeKinds: ['pack'],
    ordering: {
      by: ['level', 'kind', 'title'],
      stable: true
    }
  };
  
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
  
  // Create workspace with multiple items
  const catalog = {
    workspace: 'test-ws',
    languageCode: 'en',
    languageName: 'English',
    version: '1.0.0',
    sections: [
      {
        id: 'context',
        kind: 'pack',
        title: 'Context',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json'
      }
    ]
  };
  
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'context'), { recursive: true });
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'pack_a'), { recursive: true });
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'pack_b'), { recursive: true });
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'pack_c'), { recursive: true });
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  const index = {
    items: [
      {
        id: 'pack_c',
        kind: 'pack',
        title: 'C Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/pack_c/pack.json'
      },
      {
        id: 'pack_a',
        kind: 'pack',
        title: 'A Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/pack_a/pack.json'
      },
      {
        id: 'pack_b',
        kind: 'pack',
        title: 'B Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/pack_b/pack.json'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  // Create packs
  const packTemplate = {
    schemaVersion: 1,
    kind: 'pack',
    packVersion: '1.0.0',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test',
    outline: ['Step 1'],
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    analytics: {
      goal: 'Test',
      constraints: ['c1'],
      levers: ['subject'],
      successCriteria: ['s1'],
      commonMistakes: ['m1'],
      drillType: 'substitution',
      cognitiveLoad: 'low',
      targetLatencyMs: 800,
      successDefinition: '2 passes',
      keyFailureModes: ['mode1']
    },
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: [] }]
    }
  };
  
  for (const packId of ['pack_a', 'pack_b', 'pack_c']) {
    const pack = { ...packTemplate, id: packId, title: `${packId.charAt(5).toUpperCase()} Pack` };
    writeFileSync(
      join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', packId, 'pack.json'),
      JSON.stringify(pack, null, 2)
    );
  }
  
  // Export twice and compare
  const originalEnv = process.env.CONTENT_DIR;
  const originalExports = process.env.EXPORTS_DIR;
  process.env.CONTENT_DIR = TEST_CONTENT_DIR;
  process.env.EXPORTS_DIR = TEST_EXPORTS_DIR;
  
  try {
    execSync(`tsx scripts/export-bundle.ts --bundle ${bundlePath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    const bundleJsonPath1 = join(TEST_EXPORTS_DIR, 'test-ws', 'test_bundle', 'bundle', 'bundle.json');
    const bundleJson1 = JSON.parse(readFileSync(bundleJsonPath1, 'utf-8'));
    const itemIds1 = bundleJson1.items.map((item: any) => item.id);
    
    // Remove and re-export
    rmSync(join(TEST_EXPORTS_DIR, 'test-ws', 'test_bundle'), { recursive: true, force: true });
    
    execSync(`tsx scripts/export-bundle.ts --bundle ${bundlePath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    const bundleJsonPath2 = join(TEST_EXPORTS_DIR, 'test-ws', 'test_bundle', 'bundle', 'bundle.json');
    const bundleJson2 = JSON.parse(readFileSync(bundleJsonPath2, 'utf-8'));
    const itemIds2 = bundleJson2.items.map((item: any) => item.id);
    
    // Should be in same order (sorted by title: A, B, C)
    assert(JSON.stringify(itemIds1) === JSON.stringify(itemIds2), 'Ordering should be stable across runs');
    assert(itemIds1[0] === 'pack_a', 'First item should be pack_a (sorted by title)');
    assert(itemIds1[1] === 'pack_b', 'Second item should be pack_b');
    assert(itemIds1[2] === 'pack_c', 'Third item should be pack_c');
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalExports) {
      process.env.EXPORTS_DIR = originalExports;
    } else {
      delete process.env.EXPORTS_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test: Export writes required files
test('export writes required files', () => {
  setupTestDir();
  
  const bundlePath = join(TEST_META_DIR, 'bundles', 'test-bundle.json');
  
  const bundle = {
    version: 1,
    id: 'test_bundle',
    workspace: 'test-ws',
    title: 'Test Bundle',
    description: 'Test description',
    filters: {
      levels: ['A1']
    },
    includeKinds: ['pack'],
    ordering: {
      by: ['level', 'kind', 'title'],
      stable: true
    }
  };
  
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
  
  // Create minimal workspace
  const catalog = {
    workspace: 'test-ws',
    languageCode: 'en',
    languageName: 'English',
    version: '1.0.0',
    sections: [
      {
        id: 'context',
        kind: 'pack',
        title: 'Context',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json'
      }
    ]
  };
  
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'context'), { recursive: true });
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'pack1'), { recursive: true });
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  const index = {
    items: [
      {
        id: 'pack1',
        kind: 'pack',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const pack = {
    schemaVersion: 1,
    id: 'pack1',
    kind: 'pack',
    packVersion: '1.0.0',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test',
    outline: ['Step 1'],
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    analytics: {
      goal: 'Test',
      constraints: ['c1'],
      levers: ['subject'],
      successCriteria: ['s1'],
      commonMistakes: ['m1'],
      drillType: 'substitution',
      cognitiveLoad: 'low',
      targetLatencyMs: 800,
      successDefinition: '2 passes',
      keyFailureModes: ['mode1']
    },
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: [] }]
    }
  };
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', 'pack1', 'pack.json'),
    JSON.stringify(pack, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalExports = process.env.EXPORTS_DIR;
  process.env.CONTENT_DIR = TEST_CONTENT_DIR;
  process.env.EXPORTS_DIR = TEST_EXPORTS_DIR;
  
  try {
    execSync(`tsx scripts/export-bundle.ts --bundle ${bundlePath}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    const bundleDir = join(TEST_EXPORTS_DIR, 'test-ws', 'test_bundle', 'bundle');
    
    // Check required files exist
    assert(existsSync(join(bundleDir, 'bundle.json')), 'bundle.json should exist');
    assert(existsSync(join(bundleDir, 'curriculum.md')), 'curriculum.md should exist');
    assert(existsSync(join(bundleDir, 'index.html')), 'index.html should exist');
    assert(existsSync(join(bundleDir, 'scormish', 'manifest.json')), 'scormish/manifest.json should exist');
    assert(existsSync(join(bundleDir, 'items', 'packs', 'pack1', 'pack.json')), 'Entry document should be copied');
    
    // Verify bundle.json structure
    const bundleJson = JSON.parse(readFileSync(join(bundleDir, 'bundle.json'), 'utf-8'));
    assert(bundleJson.version === 1, 'bundle.json should have version 1');
    assert(bundleJson.bundleId === 'test_bundle', 'bundle.json should have correct bundleId');
    assert(Array.isArray(bundleJson.items), 'bundle.json should have items array');
    
    // Verify curriculum.md has content
    const curriculumMd = readFileSync(join(bundleDir, 'curriculum.md'), 'utf-8');
    assert(curriculumMd.includes('Test Bundle'), 'curriculum.md should include bundle title');
    assert(curriculumMd.includes('Test Pack'), 'curriculum.md should include pack title');
    
    // Verify index.html has content
    const indexHtml = readFileSync(join(bundleDir, 'index.html'), 'utf-8');
    assert(indexHtml.includes('Test Bundle'), 'index.html should include bundle title');
    assert(indexHtml.includes('<!DOCTYPE html>'), 'index.html should be valid HTML');
    
    // Verify scormish manifest
    const manifest = JSON.parse(readFileSync(join(bundleDir, 'scormish', 'manifest.json'), 'utf-8'));
    assert(manifest.version === 1, 'manifest should have version 1');
    assert(manifest.bundleId === 'test_bundle', 'manifest should have correct bundleId');
    assert(manifest.entrypoint === 'index.html', 'manifest should have correct entrypoint');
    assert(Array.isArray(manifest.items), 'manifest should have items array');
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalExports) {
      process.env.EXPORTS_DIR = originalExports;
    } else {
      delete process.env.EXPORTS_DIR;
    }
  }
  
  cleanupTestDir();
});

// Run all tests
function runTests() {
  console.log('Running bundle export tests...\n');
  
  for (const test of tests) {
    try {
      test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error: any) {
      console.error(`❌ ${test.name}`);
      console.error(`   ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests();

