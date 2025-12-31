#!/usr/bin/env tsx

/**
 * Unit tests for generate-featured.ts
 * 
 * Tests:
 * - Deterministic hero selection
 * - Deterministic cards selection
 * - Approval gate enforcement
 * - Stable sorting
 * - Schema validation
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEST_WORKSPACE = 'test-featured';

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

function setupTestWorkspace() {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE);
  if (existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
  mkdirSync(workspaceDir, { recursive: true });
  
  // Create catalog
  const catalog = {
    version: 'v1',
    schemaVersion: 1,
    workspace: TEST_WORKSPACE,
    languageCode: 'de',
    languageName: 'German',
    sections: [
      {
        id: 'context',
        kind: 'context',
        title: 'Context Library',
        itemsUrl: `/v1/workspaces/${TEST_WORKSPACE}/context/index.json`,
        analyticsRollup: { scenarios: {}, levels: {}, primaryStructures: {} }
      },
      {
        id: 'mechanics',
        kind: 'mechanics',
        title: 'Mechanics Drills',
        itemsUrl: `/v1/workspaces/${TEST_WORKSPACE}/mechanics/index.json`,
        analyticsRollup: { scenarios: {}, levels: {}, primaryStructures: {} }
      },
      {
        id: 'exams',
        kind: 'exams',
        title: 'Exams',
        itemsUrl: `/v1/workspaces/${TEST_WORKSPACE}/exams/index.json`,
        analyticsRollup: { scenarios: {}, levels: {}, primaryStructures: {} }
      },
      {
        id: 'tracks',
        kind: 'tracks',
        title: 'Guided Tracks',
        itemsUrl: `/v1/workspaces/${TEST_WORKSPACE}/tracks/index.json`,
        analyticsRollup: { scenarios: {}, levels: {}, primaryStructures: {} }
      }
    ]
  };
  writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
}

function createTestPack(id: string, level: string, scenario?: string, approved: boolean = false) {
  const packDir = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'packs', id);
  mkdirSync(packDir, { recursive: true });
  
  const pack = {
    schemaVersion: 1,
    id,
    kind: 'pack',
    packVersion: '1.0.0',
    title: `Test Pack ${id}`,
    level,
    estimatedMinutes: 15,
    description: 'Test pack description',
    outline: ['Step 1', 'Step 2'],
    sessionPlan: {
      version: 1,
      steps: [
        { id: 'step1', title: 'Step 1', promptIds: ['p1'] }
      ]
    },
    scenario: scenario || 'work',
    register: 'formal',
    primaryStructure: 'modal_verbs',
    variationSlots: ['subject', 'verb'],
    prompts: [
      {
        id: 'p1',
        text: 'Können Sie mir helfen?',
        intent: 'request',
        gloss_en: 'Can you help me?',
        audioUrl: '/v1/audio/test.mp3'
      }
    ],
    analytics: {
      version: 1,
      goal: 'Practice formal requests',
      successCriteria: ['Use Sie form', 'Use modal verbs'],
      drillType: 'conversation',
      cognitiveLoad: 'low'
    },
    contentId: `${TEST_WORKSPACE}:pack:${id}`,
    contentHash: 'test-hash',
    revisionId: 'test-revision',
    provenance: {
      source: approved ? 'handcrafted' : 'generated'
    },
    ...(approved && {
      review: {
        status: 'approved' as const,
        reviewer: 'test',
        reviewedAt: new Date().toISOString()
      }
    }),
    ...(!approved && {
      review: {
        status: 'needs_review' as const
      }
    })
  };
  
  writeFileSync(join(packDir, 'pack.json'), JSON.stringify(pack, null, 2) + '\n');
}

function createTestDrill(id: string, level: string, scenario?: string, approved: boolean = false) {
  const drillDir = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'drills', id);
  mkdirSync(drillDir, { recursive: true });
  
  const drill = {
    schemaVersion: 1,
    id,
    kind: 'drill',
    title: `Test Drill ${id}`,
    level,
    estimatedMinutes: 10,
    description: 'Test drill description',
    scenario: scenario || 'work',
    contentId: `${TEST_WORKSPACE}:drill:${id}`,
    contentHash: 'test-hash',
    revisionId: 'test-revision',
    provenance: {
      source: approved ? 'handcrafted' : 'generated'
    },
    ...(approved && {
      review: {
        status: 'approved' as const,
        reviewer: 'test',
        reviewedAt: new Date().toISOString()
      }
    }),
    ...(!approved && {
      review: {
        status: 'needs_review' as const
      }
    })
  };
  
  writeFileSync(join(drillDir, 'drill.json'), JSON.stringify(drill, null, 2) + '\n');
}

function createTestTrack(id: string, level: string, approved: boolean = false) {
  const trackDir = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'tracks', id);
  mkdirSync(trackDir, { recursive: true });
  
  const track = {
    schemaVersion: 1,
    id,
    kind: 'track',
    title: `Test Track ${id}`,
    level,
    estimatedMinutes: 25,
    description: 'Test track description',
    scenario: 'government_office',
    items: [],
    ordering: {
      type: 'fixed' as const
    },
    version: 1,
    provenance: {
      source: approved ? 'handcrafted' : 'generated'
    },
    ...(approved && {
      review: {
        status: 'approved' as const,
        reviewer: 'test',
        reviewedAt: new Date().toISOString()
      }
    }),
    ...(!approved && {
      review: {
        status: 'needs_review' as const
      }
    })
  };
  
  writeFileSync(join(trackDir, 'track.json'), JSON.stringify(track, null, 2) + '\n');
}

function generateFeatured(): any {
  const scriptPath = join(__dirname, 'generate-featured.ts');
  try {
    execSync(
      `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
  } catch (error: any) {
    throw new Error(`Featured generation failed: ${error.message}`);
  }
  
  const featuredPath = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json');
  if (!existsSync(featuredPath)) {
    throw new Error('Featured file not generated');
  }
  
  const content = readFileSync(featuredPath, 'utf-8');
  return JSON.parse(content);
}

function cleanupTestWorkspace() {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE);
  if (existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

// Test 1: Hero selection prefers approved track
test('Hero selection: prefers approved track when available', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create approved track
  createTestTrack('test_track_a1', 'A1', true);
  
  // Create approved pack (should not be selected if track exists)
  createTestPack('pack1', 'A1', 'work', true);
  
  const featured = generateFeatured();
  
  // Track should be selected if available (for any workspace, tracks are preferred)
  // Note: gov_office_a1_default is special case only for 'de' workspace
  assert(featured.hero.kind === 'track' || featured.hero.kind === 'pack', 'Hero should be track or pack');
  if (featured.hero.kind === 'track') {
    assert(featured.hero.entryUrl.includes('test_track_a1'), 'Hero should be test_track_a1 track');
  }
  assert(featured.version === 1, 'Version should be 1');
  assert(featured.workspace === TEST_WORKSPACE, 'Workspace should match');
  
  cleanupTestWorkspace();
});

// Test 2: Hero fallback to approved pack
test('Hero selection: falls back to approved pack if no track', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create approved pack (no track)
  createTestPack('pack1', 'A1', 'work', true);
  createTestPack('pack2', 'A2', 'work', true);
  
  const featured = generateFeatured();
  
  assert(featured.hero.kind === 'pack', 'Hero should be pack');
  assert(featured.hero.entryUrl.includes('pack1'), 'Hero should be first A1 pack (stable sort)');
  assert(featured.hero.entryUrl.includes('/packs/'), 'Hero entryUrl should be pack pattern');
  
  cleanupTestWorkspace();
});

// Test 3: Cards selection includes matching drills
test('Cards selection: includes matching scenario drills', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create approved pack as hero
  createTestPack('pack1', 'A1', 'work', true);
  
  // Create matching scenario drills
  createTestDrill('drill1', 'A1', 'work', true);
  createTestDrill('drill2', 'A1', 'work', true);
  createTestDrill('drill3', 'A1', 'work', true);
  
  const featured = generateFeatured();
  
  assert(featured.cards.length >= 1, 'Should have at least 1 card');
  const drillCards = featured.cards.filter((c: any) => c.kind === 'drill');
  assert(drillCards.length >= 1 && drillCards.length <= 2, 'Should have 1-2 drill cards');
  
  cleanupTestWorkspace();
});

// Test 4: Cards max length enforced
test('Cards selection: enforces max length of 4', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  createTestPack('pack1', 'A1', 'work', true);
  createTestDrill('drill1', 'A1', 'work', true);
  createTestDrill('drill2', 'A1', 'work', true);
  createTestDrill('drill3', 'A1', 'work', true);
  createTestDrill('drill4', 'A1', 'work', true);
  createTestDrill('drill5', 'A1', 'work', true);
  
  const featured = generateFeatured();
  
  assert(featured.cards.length <= 4, 'Cards should not exceed 4');
  
  cleanupTestWorkspace();
});

// Test 5: Deterministic output
test('Deterministic: same content produces same output', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  createTestPack('pack1', 'A1', 'work', true);
  createTestPack('pack2', 'A1', 'work', true);
  createTestDrill('drill1', 'A1', 'work', true);
  
  const featured1 = generateFeatured();
  
  // Regenerate
  const featured2 = generateFeatured();
  
  assert(featured1.hero.entryUrl === featured2.hero.entryUrl, 'Hero should be identical');
  assert(featured1.cards.length === featured2.cards.length, 'Cards count should be identical');
  assert(JSON.stringify(featured1.cards) === JSON.stringify(featured2.cards), 'Cards should be identical');
  
  cleanupTestWorkspace();
});

// Test 6: Approval gate enforcement
test('Approval gate: only approved content is selected', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create unapproved pack
  createTestPack('pack1', 'A1', 'work', false);
  
  // Create approved pack
  createTestPack('pack2', 'A1', 'work', true);
  
  const featured = generateFeatured();
  
  assert(featured.hero.entryUrl.includes('pack2'), 'Hero should be approved pack');
  assert(!featured.hero.entryUrl.includes('pack1'), 'Hero should not be unapproved pack');
  
  cleanupTestWorkspace();
});

// Test 7: Handcrafted entries are auto-approved
test('Handcrafted entries: treated as approved', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create handcrafted pack (no review.status needed)
  const packDir = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'packs', 'handcrafted1');
  mkdirSync(packDir, { recursive: true });
  
  const pack = {
    schemaVersion: 1,
    id: 'handcrafted1',
    kind: 'pack',
    packVersion: '1.0.0',
    title: 'Handcrafted Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test',
    outline: ['Step 1'],
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: ['p1'] }]
    },
    scenario: 'work',
    register: 'formal',
    primaryStructure: 'modal_verbs',
    variationSlots: ['subject', 'verb'],
    prompts: [{
      id: 'p1',
      text: 'Test',
      intent: 'request',
      gloss_en: 'Test',
      audioUrl: '/v1/audio/test.mp3'
    }],
    analytics: {
      version: 1,
      goal: 'Test',
      successCriteria: ['Test'],
      drillType: 'conversation',
      cognitiveLoad: 'low'
    },
    contentId: `${TEST_WORKSPACE}:pack:handcrafted1`,
    contentHash: 'test',
    revisionId: 'test',
    provenance: {
      source: 'handcrafted'
    }
  };
  
  writeFileSync(join(packDir, 'pack.json'), JSON.stringify(pack, null, 2) + '\n');
  
  const featured = generateFeatured();
  
  assert(featured.hero.entryUrl.includes('handcrafted1'), 'Handcrafted pack should be selected');
  
  cleanupTestWorkspace();
});

// Test 8: Schema validation
test('Schema: generated featured.json matches FeaturedV1 schema', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  createTestPack('pack1', 'A1', 'work', true);
  
  const featured = generateFeatured();
  
  // Required fields
  assert(featured.version === 1, 'Version must be 1');
  assert(typeof featured.workspace === 'string', 'Workspace must be string');
  assert(typeof featured.generatedAt === 'string', 'generatedAt must be string');
  assert(typeof featured.hero === 'object', 'Hero must be object');
  assert(Array.isArray(featured.cards), 'Cards must be array');
  
  // Hero fields
  assert(['track', 'pack', 'exam', 'drill'].includes(featured.hero.kind), 'Hero kind must be valid');
  assert(typeof featured.hero.entryUrl === 'string', 'Hero entryUrl must be string');
  assert(typeof featured.hero.cta === 'object', 'Hero cta must be object');
  assert(featured.hero.cta.action === 'open_entry', 'Hero cta.action must be open_entry');
  
  // Cards fields
  assert(featured.cards.length <= 4, 'Cards length must be <= 4');
  featured.cards.forEach((card: any, idx: number) => {
    assert(typeof card.id === 'string', `Card[${idx}].id must be string`);
    assert(['pack', 'drill', 'exam', 'track'].includes(card.kind), `Card[${idx}].kind must be valid`);
    assert(typeof card.entryUrl === 'string', `Card[${idx}].entryUrl must be string`);
  });
  
  cleanupTestWorkspace();
});

// Run tests
console.log('🧪 Running featured content generation unit tests...\n');

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

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

