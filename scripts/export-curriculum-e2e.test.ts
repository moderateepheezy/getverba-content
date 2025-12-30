#!/usr/bin/env tsx

/**
 * Comprehensive E2E Tests for B2B Curriculum Export
 * 
 * Tests the complete export flow:
 * 1. Creates test content
 * 2. Runs export command
 * 3. Verifies all outputs exist and are valid
 * 4. Verifies deterministic behavior
 * 5. Verifies integrity checks
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const TEST_DIR = join(ROOT_DIR, '.test-curriculum-export-e2e');
const TEST_CONTENT_DIR = join(TEST_DIR, 'content', 'v1');
const TEST_EXPORTS_DIR = join(TEST_DIR, 'exports', 'bundles');

interface Test {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: Test[] = [];
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_CONTENT_DIR, { recursive: true });
  mkdirSync(TEST_EXPORTS_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Test helper: Create test pack
function createTestPack(id: string, scenario: string, level: string, primaryStructure: string, register: string = 'neutral') {
  const packDir = join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'packs', id);
  mkdirSync(packDir, { recursive: true });
  
  const pack = {
    schemaVersion: 1,
    id,
    kind: 'pack',
    title: `Test Pack ${id}`,
    level,
    estimatedMinutes: 15,
    description: `Test pack for ${scenario}`,
    scenario,
    register,
    primaryStructure,
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1', 'Step 2'],
    prompts: [
      {
        id: 'prompt-1',
        text: 'Test prompt text',
        intent: 'request',
        gloss_en: 'Test prompt English',
        slotsChanged: ['subject']
      },
      {
        id: 'prompt-2',
        text: 'Another test prompt',
        intent: 'ask',
        gloss_en: 'Another test prompt English',
        slotsChanged: ['verb']
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step-1',
          title: 'Step 1',
          promptIds: ['prompt-1', 'prompt-2']
        }
      ]
    },
    tags: [scenario, level.toLowerCase()],
    analytics: {
      goal: 'Test goal',
      successCriteria: ['Criterion 1', 'Criterion 2'],
      drillType: 'substitution',
      cognitiveLoad: 'low'
    }
  };
  
  writeFileSync(join(packDir, 'pack.json'), JSON.stringify(pack, null, 2));
  return pack;
}

// Test helper: Create test drill
function createTestDrill(id: string, level: string) {
  const drillDir = join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'drills', id);
  mkdirSync(drillDir, { recursive: true });
  
  const drill = {
    schemaVersion: 1,
    id,
    kind: 'drill',
    title: `Test Drill ${id}`,
    level,
    estimatedMinutes: 10,
    description: 'Test drill description',
    exercises: [
      { id: 'ex-1', type: 'fill-blank', prompt: 'Test', answer: 'Answer' }
    ]
  };
  
  writeFileSync(join(drillDir, 'drill.json'), JSON.stringify(drill, null, 2));
  return drill;
}

// Test helper: Create catalog
function createTestCatalog() {
  const catalog = {
    version: 'v1',
    schemaVersion: 1,
    workspace: 'test-ws',
    languageCode: 'de',
    languageName: 'German',
    sections: [
      {
        id: 'context',
        kind: 'context',
        title: 'Context Library',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json'
      },
      {
        id: 'mechanics',
        kind: 'mechanics',
        title: 'Mechanics Drills',
        itemsUrl: '/v1/workspaces/test-ws/mechanics/index.json'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  return catalog;
}

// Test helper: Create section index
function createSectionIndex(sectionId: string, items: any[]) {
  const sectionDir = join(TEST_CONTENT_DIR, 'workspaces', 'test-ws', sectionId);
  mkdirSync(sectionDir, { recursive: true });
  
  const index = {
    version: 'v1',
    kind: sectionId === 'context' ? 'context' : 'drills',
    total: items.length,
    pageSize: 20,
    items,
    nextPage: null
  };
  
  writeFileSync(join(sectionDir, 'index.json'), JSON.stringify(index, null, 2));
  return index;
}

// ============================================================================
// E2E Test 1: Basic Export Flow
// ============================================================================

test('E2E: Basic export creates all required files', () => {
  setupTestDir();
  
  try {
    // Create test content
    createTestCatalog();
    
    const pack1 = createTestPack('pack_1', 'work', 'A1', 'verb_position', 'formal');
    const pack2 = createTestPack('pack_2', 'work', 'A1', 'negation', 'neutral');
    const drill1 = createTestDrill('drill_1', 'A1');
    
    createSectionIndex('context', [
      {
        id: 'pack_1',
        kind: 'pack',
        title: pack1.title,
        level: pack1.level,
        durationMinutes: pack1.estimatedMinutes,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_1/pack.json',
        scenario: pack1.scenario,
        register: pack1.register,
        primaryStructure: pack1.primaryStructure,
        analyticsSummary: {
          primaryStructure: pack1.primaryStructure,
          scenario: pack1.scenario,
          register: pack1.register,
          variationSlots: pack1.variationSlots,
          goal: pack1.analytics.goal,
          whyThisWorks: pack1.analytics.successCriteria
        }
      },
      {
        id: 'pack_2',
        kind: 'pack',
        title: pack2.title,
        level: pack2.level,
        durationMinutes: pack2.estimatedMinutes,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_2/pack.json',
        scenario: pack2.scenario,
        register: pack2.register,
        primaryStructure: pack2.primaryStructure,
        analyticsSummary: {
          primaryStructure: pack2.primaryStructure,
          scenario: pack2.scenario,
          register: pack2.register,
          variationSlots: pack2.variationSlots,
          goal: pack2.analytics.goal,
          whyThisWorks: pack2.analytics.successCriteria
        }
      }
    ]);
    
    createSectionIndex('mechanics', [
      {
        id: 'drill_1',
        kind: 'drill',
        title: drill1.title,
        level: drill1.level,
        durationMinutes: drill1.estimatedMinutes,
        entryUrl: '/v1/workspaces/test-ws/drills/drill_1/drill.json'
      }
    ]);
    
    // Run export
    const bundleId = 'test_bundle_basic';
    const output = execSync(
      `npx tsx scripts/export-curriculum.ts --workspace test-ws --bundle-id ${bundleId} --title "Test Bundle" --levels A1 --scenarios work --include-sections context,mechanics`,
      {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
        env: { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR, EXPORTS_DIR: TEST_EXPORTS_DIR }
      }
    );
    
    // Verify bundle directory exists
    const bundleDir = join(TEST_EXPORTS_DIR, bundleId);
    assert(existsSync(bundleDir), 'Bundle directory should exist');
    
    // Verify bundle.json exists and is valid
    const bundleJsonPath = join(bundleDir, 'bundle.json');
    assert(existsSync(bundleJsonPath), 'bundle.json should exist');
    const bundle = JSON.parse(readFileSync(bundleJsonPath, 'utf-8'));
    assert(bundle.bundleId === bundleId, 'Bundle ID should match');
    assert(bundle.workspace === 'test-ws', 'Workspace should match');
    assert(bundle.modules.length > 0, 'Should have modules');
    assert(bundle.totals.packs === 2, 'Should have 2 packs');
    assert(bundle.totals.drills === 1, 'Should have 1 drill');
    
    // Verify syllabus.md exists
    const syllabusPath = join(bundleDir, 'syllabus.md');
    assert(existsSync(syllabusPath), 'syllabus.md should exist');
    const syllabus = readFileSync(syllabusPath, 'utf-8');
    assert(syllabus.includes('Test Bundle'), 'Syllabus should include bundle title');
    assert(syllabus.includes('Module'), 'Syllabus should include modules');
    
    // Verify SCORM manifest exists
    const scormPath = join(bundleDir, 'scorm', 'imsmanifest.xml');
    assert(existsSync(scormPath), 'SCORM manifest should exist');
    const scorm = readFileSync(scormPath, 'utf-8');
    assert(scorm.includes('<?xml'), 'SCORM manifest should be valid XML');
    assert(scorm.includes(bundleId), 'SCORM manifest should include bundle ID');
    
    // Verify integrity report exists
    const integrityPath = join(bundleDir, 'reports', 'integrity.json');
    assert(existsSync(integrityPath), 'Integrity report should exist');
    const integrity = JSON.parse(readFileSync(integrityPath, 'utf-8'));
    assert(Array.isArray(integrity.errors), 'Integrity report should have errors array');
    assert(Array.isArray(integrity.warnings), 'Integrity report should have warnings array');
    assert(integrity.stats, 'Integrity report should have stats');
    assert(integrity.coherence, 'Integrity report should have coherence');
    
    // Verify content directory exists with entry documents
    const contentDir = join(bundleDir, 'content');
    assert(existsSync(contentDir), 'Content directory should exist');
    const pack1Path = join(contentDir, 'workspaces', 'test-ws', 'packs', 'pack_1', 'pack.json');
    assert(existsSync(pack1Path), 'Pack 1 entry document should exist');
    const pack2Path = join(contentDir, 'workspaces', 'test-ws', 'packs', 'pack_2', 'pack.json');
    assert(existsSync(pack2Path), 'Pack 2 entry document should exist');
    const drill1Path = join(contentDir, 'workspaces', 'test-ws', 'drills', 'drill_1', 'drill.json');
    assert(existsSync(drill1Path), 'Drill 1 entry document should exist');
    
    // Verify ZIP file exists
    const zipPath = join(TEST_EXPORTS_DIR, `${bundleId}.zip`);
    // ZIP might not be created if zip command is not available, so this is optional
    if (existsSync(zipPath)) {
      const zipStats = statSync(zipPath);
      assert(zipStats.size > 0, 'ZIP file should not be empty');
    }
    
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 2: Deterministic Behavior
// ============================================================================

test('E2E: Same inputs produce identical bundle.json', () => {
  setupTestDir();
  
  try {
    // Create test content
    createTestCatalog();
    
    createTestPack('pack_a', 'work', 'A1', 'verb_position', 'formal');
    createTestPack('pack_b', 'work', 'A1', 'negation', 'neutral');
    createTestPack('pack_c', 'restaurant', 'A1', 'verb_position', 'neutral');
    
    createSectionIndex('context', [
      {
        id: 'pack_a',
        kind: 'pack',
        title: 'Pack A',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_a/pack.json',
        scenario: 'work',
        register: 'formal',
        primaryStructure: 'verb_position',
        analyticsSummary: {
          primaryStructure: 'verb_position',
          scenario: 'work',
          register: 'formal',
          variationSlots: ['subject', 'verb'],
          goal: 'Test goal',
          whyThisWorks: ['Criterion 1']
        }
      },
      {
        id: 'pack_b',
        kind: 'pack',
        title: 'Pack B',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_b/pack.json',
        scenario: 'work',
        register: 'neutral',
        primaryStructure: 'negation',
        analyticsSummary: {
          primaryStructure: 'negation',
          scenario: 'work',
          register: 'neutral',
          variationSlots: ['subject', 'verb'],
          goal: 'Test goal',
          whyThisWorks: ['Criterion 1']
        }
      },
      {
        id: 'pack_c',
        kind: 'pack',
        title: 'Pack C',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_c/pack.json',
        scenario: 'restaurant',
        register: 'neutral',
        primaryStructure: 'verb_position',
        analyticsSummary: {
          primaryStructure: 'verb_position',
          scenario: 'restaurant',
          register: 'neutral',
          variationSlots: ['subject', 'verb'],
          goal: 'Test goal',
          whyThisWorks: ['Criterion 1']
        }
      }
    ]);
    
    // Run export twice
    const bundleId = 'test_bundle_deterministic';
    const exportCmd = `npx tsx scripts/export-curriculum.ts --workspace test-ws --bundle-id ${bundleId} --title "Test Bundle" --levels A1`;
    const env = { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR, EXPORTS_DIR: TEST_EXPORTS_DIR };
    
    execSync(exportCmd, { cwd: ROOT_DIR, encoding: 'utf-8', env });
    const bundle1 = JSON.parse(readFileSync(join(TEST_EXPORTS_DIR, bundleId, 'bundle.json'), 'utf-8'));
    
    // Remove and re-export
    rmSync(join(TEST_EXPORTS_DIR, bundleId), { recursive: true, force: true });
    execSync(exportCmd, { cwd: ROOT_DIR, encoding: 'utf-8', env });
    const bundle2 = JSON.parse(readFileSync(join(TEST_EXPORTS_DIR, bundleId, 'bundle.json'), 'utf-8'));
    
    // Verify identical structure
    assert(bundle1.bundleId === bundle2.bundleId, 'Bundle IDs should match');
    assert(bundle1.modules.length === bundle2.modules.length, 'Module counts should match');
    
    // Verify module items are in same order
    for (let i = 0; i < bundle1.modules.length; i++) {
      const mod1 = bundle1.modules[i];
      const mod2 = bundle2.modules[i];
      assert(mod1.id === mod2.id, `Module ${i} IDs should match`);
      assert(mod1.items.length === mod2.items.length, `Module ${i} item counts should match`);
      
      for (let j = 0; j < mod1.items.length; j++) {
        assert(mod1.items[j].id === mod2.items[j].id, `Module ${i} item ${j} IDs should match`);
      }
    }
    
    // Verify items are in deterministic order (work formal should come before work neutral, which should come before restaurant)
    const allItems1 = bundle1.modules.flatMap(m => m.items);
    const allItems2 = bundle2.modules.flatMap(m => m.items);
    assert(allItems1[0].id === 'pack_a', 'First item should be pack_a (work formal)');
    assert(allItems1[1].id === 'pack_b', 'Second item should be pack_b (work neutral)');
    assert(allItems1[2].id === 'pack_c', 'Third item should be pack_c (restaurant)');
    assert(JSON.stringify(allItems1.map(i => i.id)) === JSON.stringify(allItems2.map(i => i.id)), 'Item order should be identical');
    
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 3: Filtering by Levels and Scenarios
// ============================================================================

test('E2E: Filtering by levels and scenarios works correctly', () => {
  setupTestDir();
  
  try {
    createTestCatalog();
    
    createTestPack('pack_a1_work', 'work', 'A1', 'verb_position');
    createTestPack('pack_a2_work', 'work', 'A2', 'verb_position');
    createTestPack('pack_a1_rest', 'restaurant', 'A1', 'verb_position');
    
    createSectionIndex('context', [
      {
        id: 'pack_a1_work',
        kind: 'pack',
        title: 'Pack A1 Work',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_a1_work/pack.json',
        scenario: 'work',
        primaryStructure: 'verb_position',
        analyticsSummary: { primaryStructure: 'verb_position', scenario: 'work', register: 'neutral', variationSlots: [], goal: 'Test', whyThisWorks: [] }
      },
      {
        id: 'pack_a2_work',
        kind: 'pack',
        title: 'Pack A2 Work',
        level: 'A2',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_a2_work/pack.json',
        scenario: 'work',
        primaryStructure: 'verb_position',
        analyticsSummary: { primaryStructure: 'verb_position', scenario: 'work', register: 'neutral', variationSlots: [], goal: 'Test', whyThisWorks: [] }
      },
      {
        id: 'pack_a1_rest',
        kind: 'pack',
        title: 'Pack A1 Restaurant',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_a1_rest/pack.json',
        scenario: 'restaurant',
        primaryStructure: 'verb_position',
        analyticsSummary: { primaryStructure: 'verb_position', scenario: 'restaurant', register: 'neutral', variationSlots: [], goal: 'Test', whyThisWorks: [] }
      }
    ]);
    
    // Export with A1 and work filters
    const bundleId = 'test_bundle_filtered';
    execSync(
      `npx tsx scripts/export-curriculum.ts --workspace test-ws --bundle-id ${bundleId} --title "Test Bundle" --levels A1 --scenarios work`,
      { cwd: ROOT_DIR, encoding: 'utf-8', env: { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR, EXPORTS_DIR: TEST_EXPORTS_DIR } }
    );
    
    const bundle = JSON.parse(readFileSync(join(TEST_EXPORTS_DIR, bundleId, 'bundle.json'), 'utf-8'));
    const allItems = bundle.modules.flatMap(m => m.items);
    
    assert(allItems.length === 1, `Should have 1 item, got ${allItems.length}`);
    assert(allItems[0].id === 'pack_a1_work', 'Should only include pack_a1_work');
    assert(allItems[0].level === 'A1', 'Item should be A1');
    assert(allItems[0].scenario === 'work', 'Item should be work scenario');
    
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 4: Explicit IDs
// ============================================================================

test('E2E: Explicit IDs filter works correctly', () => {
  setupTestDir();
  
  try {
    createTestCatalog();
    
    createTestPack('pack_1', 'work', 'A1', 'verb_position');
    createTestPack('pack_2', 'work', 'A1', 'negation');
    createTestPack('pack_3', 'work', 'A1', 'modal_verbs');
    
    createSectionIndex('context', [
      {
        id: 'pack_1',
        kind: 'pack',
        title: 'Pack 1',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_1/pack.json',
        scenario: 'work',
        primaryStructure: 'verb_position',
        analyticsSummary: { primaryStructure: 'verb_position', scenario: 'work', register: 'neutral', variationSlots: [], goal: 'Test', whyThisWorks: [] }
      },
      {
        id: 'pack_2',
        kind: 'pack',
        title: 'Pack 2',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_2/pack.json',
        scenario: 'work',
        primaryStructure: 'negation',
        analyticsSummary: { primaryStructure: 'negation', scenario: 'work', register: 'neutral', variationSlots: [], goal: 'Test', whyThisWorks: [] }
      },
      {
        id: 'pack_3',
        kind: 'pack',
        title: 'Pack 3',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_3/pack.json',
        scenario: 'work',
        primaryStructure: 'modal_verbs',
        analyticsSummary: { primaryStructure: 'modal_verbs', scenario: 'work', register: 'neutral', variationSlots: [], goal: 'Test', whyThisWorks: [] }
      }
    ]);
    
    // Export with explicit IDs
    const bundleId = 'test_bundle_explicit';
    execSync(
      `npx tsx scripts/export-curriculum.ts --workspace test-ws --bundle-id ${bundleId} --title "Test Bundle" --include-pack-ids pack_1,pack_3`,
      { cwd: ROOT_DIR, encoding: 'utf-8', env: { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR, EXPORTS_DIR: TEST_EXPORTS_DIR } }
    );
    
    const bundle = JSON.parse(readFileSync(join(TEST_EXPORTS_DIR, bundleId, 'bundle.json'), 'utf-8'));
    const allItems = bundle.modules.flatMap(m => m.items);
    const itemIds = allItems.map(i => i.id).sort();
    
    assert(itemIds.length === 2, `Should have 2 items, got ${itemIds.length}`);
    assert(itemIds[0] === 'pack_1', 'Should include pack_1');
    assert(itemIds[1] === 'pack_3', 'Should include pack_3');
    assert(!itemIds.includes('pack_2'), 'Should not include pack_2');
    
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 5: Max Limits
// ============================================================================

test('E2E: Max limits are enforced correctly', () => {
  setupTestDir();
  
  try {
    createTestCatalog();
    
    // Create 10 packs
    for (let i = 1; i <= 10; i++) {
      createTestPack(`pack_${i}`, 'work', 'A1', 'verb_position');
    }
    
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `pack_${i + 1}`,
      kind: 'pack',
      title: `Pack ${i + 1}`,
      level: 'A1',
      durationMinutes: 15,
      entryUrl: `/v1/workspaces/test-ws/packs/pack_${i + 1}/pack.json`,
      scenario: 'work',
      primaryStructure: 'verb_position',
      analyticsSummary: { primaryStructure: 'verb_position', scenario: 'work', register: 'neutral', variationSlots: [], goal: 'Test', whyThisWorks: [] }
    }));
    
    createSectionIndex('context', items);
    
    // Export with max-packs limit
    const bundleId = 'test_bundle_max_limits';
    execSync(
      `npx tsx scripts/export-curriculum.ts --workspace test-ws --bundle-id ${bundleId} --title "Test Bundle" --max-packs 5`,
      { cwd: ROOT_DIR, encoding: 'utf-8', env: { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR, EXPORTS_DIR: TEST_EXPORTS_DIR } }
    );
    
    const bundle = JSON.parse(readFileSync(join(TEST_EXPORTS_DIR, bundleId, 'bundle.json'), 'utf-8'));
    
    assert(bundle.totals.packs === 5, `Should have 5 packs, got ${bundle.totals.packs}`);
    
  } finally {
    cleanupTestDir();
  }
});

// ============================================================================
// E2E Test 6: Integrity Report Validation
// ============================================================================

test('E2E: Integrity report validates bundle correctly', () => {
  setupTestDir();
  
  try {
    createTestCatalog();
    
    const pack1 = createTestPack('pack_1', 'work', 'A1', 'verb_position');
    const pack2 = createTestPack('pack_2', 'work', 'A1', 'negation');
    
    createSectionIndex('context', [
      {
        id: 'pack_1',
        kind: 'pack',
        title: pack1.title,
        level: pack1.level,
        durationMinutes: pack1.estimatedMinutes,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_1/pack.json',
        scenario: pack1.scenario,
        register: pack1.register,
        primaryStructure: pack1.primaryStructure,
        analyticsSummary: {
          primaryStructure: pack1.primaryStructure,
          scenario: pack1.scenario,
          register: pack1.register,
          variationSlots: pack1.variationSlots,
          goal: pack1.analytics.goal,
          whyThisWorks: pack1.analytics.successCriteria
        }
      },
      {
        id: 'pack_2',
        kind: 'pack',
        title: pack2.title,
        level: pack2.level,
        durationMinutes: pack2.estimatedMinutes,
        entryUrl: '/v1/workspaces/test-ws/packs/pack_2/pack.json',
        scenario: pack2.scenario,
        register: pack2.register,
        primaryStructure: pack2.primaryStructure,
        analyticsSummary: {
          primaryStructure: pack2.primaryStructure,
          scenario: pack2.scenario,
          register: pack2.register,
          variationSlots: pack2.variationSlots,
          goal: pack2.analytics.goal,
          whyThisWorks: pack2.analytics.successCriteria
        }
      }
    ]);
    
    const bundleId = 'test_bundle_integrity';
    execSync(
      `npx tsx scripts/export-curriculum.ts --workspace test-ws --bundle-id ${bundleId} --title "Test Bundle" --levels A1`,
      { cwd: ROOT_DIR, encoding: 'utf-8', env: { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR, EXPORTS_DIR: TEST_EXPORTS_DIR } }
    );
    
    const integrityPath = join(TEST_EXPORTS_DIR, bundleId, 'reports', 'integrity.json');
    assert(existsSync(integrityPath), 'Integrity report should exist');
    
    const integrity = JSON.parse(readFileSync(integrityPath, 'utf-8'));
    
    // Verify no errors (all entry documents exist)
    assert(integrity.errors.length === 0, `Should have no errors, got ${integrity.errors.length}`);
    
    // Verify stats
    assert(integrity.stats.levelDistribution.A1 === 2, 'Should have 2 A1 items');
    assert(integrity.stats.scenarioDistribution.work === 2, 'Should have 2 work items');
    
    // Verify coherence
    assert(integrity.coherence.totalItems === 2, 'Should have 2 total items');
    assert(integrity.coherence.totalPacks === 2, 'Should have 2 packs');
    assert(integrity.coherenceScorecard.scenarioCoverage === 100, 'Should have 100% scenario coverage');
    
  } finally {
    cleanupTestDir();
  }
});

// Main test runner
async function main() {
  console.log('🧪 Running Comprehensive B2B Curriculum Export E2E Tests\n');
  
  setupTestDir();
  
  try {
    for (const test of tests) {
      try {
        await test.fn();
        passed++;
        console.log(`✅ ${test.name}`);
      } catch (error: any) {
        failed++;
        console.error(`❌ ${test.name}: ${error.message}`);
        if (error.stack) {
          console.error(error.stack);
        }
      }
    }
  } finally {
    cleanupTestDir();
  }
  
  console.log(`\n📊 E2E Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main();

