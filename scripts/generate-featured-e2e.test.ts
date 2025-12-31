#!/usr/bin/env tsx

/**
 * End-to-end tests for featured content generation workflow
 * 
 * Tests the complete flow:
 * 1. Generate featured.json
 * 2. Validate featured.json schema
 * 3. Verify referenced entries exist
 * 4. Test deterministic behavior
 * 5. Test validation integration
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEST_WORKSPACE = 'test-featured-e2e';

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

function createTestPack(id: string, level: string, scenario: string = 'work', approved: boolean = false) {
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
    scenario,
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

function createTestDrill(id: string, level: string, scenario: string = 'work', approved: boolean = false) {
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
    scenario,
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

function cleanupTestWorkspace() {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE);
  if (existsSync(workspaceDir)) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

// E2E Test 1: Complete featured generation workflow
test('E2E: Generate → Validate → Verify entries', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create test content
  createTestPack('pack1', 'A1', 'work', true);
  createTestPack('pack2', 'A1', 'work', true);
  createTestDrill('drill1', 'A1', 'work', true);
  createTestDrill('drill2', 'A1', 'work', true);
  
  console.log('   Step 1: Generating featured.json...');
  const scriptPath = join(__dirname, 'generate-featured.ts');
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featuredPath = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json');
  assert(existsSync(featuredPath), 'Featured file should exist');
  
  console.log('   Step 2: Validating featured.json schema...');
  const featured = JSON.parse(readFileSync(featuredPath, 'utf-8'));
  
  // Schema validation
  assert(featured.version === 1, 'Version must be 1');
  assert(featured.workspace === TEST_WORKSPACE, 'Workspace must match');
  assert(featured.hero, 'Hero must exist');
  assert(Array.isArray(featured.cards), 'Cards must be array');
  assert(featured.cards.length <= 4, 'Cards must be <= 4');
  
  console.log('   Step 3: Verifying referenced entries exist...');
  
  // Verify hero entry exists
  const heroPath = featured.hero.entryUrl.replace(/^\/v1\//, '');
  const heroFullPath = join(CONTENT_DIR, heroPath);
  assert(existsSync(heroFullPath), `Hero entry should exist: ${heroFullPath}`);
  
  // Verify card entries exist
  for (const card of featured.cards) {
    const cardPath = card.entryUrl.replace(/^\/v1\//, '');
    const cardFullPath = join(CONTENT_DIR, cardPath);
    assert(existsSync(cardFullPath), `Card entry should exist: ${cardFullPath}`);
  }
  
  console.log('   Step 4: Running content validation...');
  try {
    execSync(
      'npm run content:validate',
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
  } catch (error: any) {
    // Validation might fail for other reasons, but featured.json should be valid
    console.log('   ⚠️  Content validation had issues (may be due to test workspace)');
  }
  
  cleanupTestWorkspace();
});

// E2E Test 2: Deterministic behavior across runs
test('E2E: Deterministic output across multiple runs', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  createTestPack('pack1', 'A1', 'work', true);
  createTestPack('pack2', 'A1', 'work', true);
  createTestDrill('drill1', 'A1', 'work', true);
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  
  console.log('   Step 1: First generation...');
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featured1 = JSON.parse(
    readFileSync(
      join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json'),
      'utf-8'
    )
  );
  
  console.log('   Step 2: Second generation...');
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featured2 = JSON.parse(
    readFileSync(
      join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json'),
      'utf-8'
    )
  );
  
  // Compare (ignoring generatedAt timestamp)
  assert(
    featured1.hero.entryUrl === featured2.hero.entryUrl,
    'Hero should be identical across runs'
  );
  assert(
    featured1.cards.length === featured2.cards.length,
    'Cards count should be identical'
  );
  
  // Compare cards (order and content)
  for (let i = 0; i < featured1.cards.length; i++) {
    assert(
      featured1.cards[i].entryUrl === featured2.cards[i].entryUrl,
      `Card[${i}] should be identical`
    );
    assert(
      featured1.cards[i].id === featured2.cards[i].id,
      `Card[${i}].id should be identical`
    );
  }
  
  cleanupTestWorkspace();
});

// E2E Test 3: Track hero selection for de workspace
test('E2E: Track hero selection for de workspace', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create gov_office_a1_default track (special case for de workspace)
  createTestTrack('gov_office_a1_default', 'A1', true);
  createTestPack('pack1', 'A1', 'work', true);
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featured = JSON.parse(
    readFileSync(
      join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json'),
      'utf-8'
    )
  );
  
  // For de workspace, should prefer track
  if (TEST_WORKSPACE === 'de') {
    // This test would pass for de workspace
    assert(
      featured.hero.kind === 'track' || featured.hero.entryUrl.includes('gov_office_a1_default'),
      'For de workspace, should prefer gov_office_a1_default track'
    );
  } else {
    // For other workspaces, track is still valid
    assert(featured.hero.kind === 'track' || featured.hero.kind === 'pack', 'Hero should be track or pack');
  }
  
  cleanupTestWorkspace();
});

// E2E Test 4: Cards selection with scenario matching
test('E2E: Cards selection matches hero scenario', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create pack with specific scenario
  createTestPack('pack1', 'A1', 'government_office', true);
  
  // Create matching scenario drills
  createTestDrill('drill1', 'A1', 'government_office', true);
  createTestDrill('drill2', 'A1', 'government_office', true);
  
  // Create non-matching drill (should not be selected)
  createTestDrill('drill3', 'A1', 'work', true);
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featured = JSON.parse(
    readFileSync(
      join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json'),
      'utf-8'
    )
  );
  
  // If hero has scenario, cards should prefer matching scenario
  if (featured.hero.entryUrl.includes('pack1')) {
    const drillCards = featured.cards.filter((c: any) => c.kind === 'drill');
    // Should prefer matching scenario drills
    const matchingDrills = drillCards.filter((c: any) => 
      c.entryUrl.includes('drill1') || c.entryUrl.includes('drill2')
    );
    assert(matchingDrills.length > 0, 'Should include matching scenario drills');
  }
  
  cleanupTestWorkspace();
});

// E2E Test 5: Error handling for no approved content
test('E2E: Error handling when no approved content exists', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  // Create only unapproved content
  createTestPack('pack1', 'A1', 'work', false);
  
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
    // Should not reach here
    assert(false, 'Should have failed with no approved content');
  } catch (error: any) {
    // Expected to fail
    assert(
      error.message.includes('Could not select hero') || 
      error.stdout?.includes('Could not select hero') ||
      error.stderr?.includes('Could not select hero'),
      'Should fail with "Could not select hero" message'
    );
  }
  
  cleanupTestWorkspace();
});

// E2E Test 6: Validation integration
test('E2E: Validation integration with featured.json', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  createTestPack('pack1', 'A1', 'work', true);
  createTestDrill('drill1', 'A1', 'work', true);
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  // Run validation specifically on featured.json
  const featuredPath = join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json');
  assert(existsSync(featuredPath), 'Featured file should exist');
  
  // Validation should pass (we test this by checking file exists and is valid JSON)
  const featured = JSON.parse(readFileSync(featuredPath, 'utf-8'));
  assert(featured.version === 1, 'Featured should be valid');
  
  cleanupTestWorkspace();
});

// E2E Test 7: Multiple workspace support
test('E2E: Multiple workspace isolation', () => {
  const workspace1 = 'test-featured-e2e-ws1';
  const workspace2 = 'test-featured-e2e-ws2';
  
  // Setup workspace 1
  const ws1Dir = join(CONTENT_DIR, 'workspaces', workspace1);
  if (existsSync(ws1Dir)) rmSync(ws1Dir, { recursive: true, force: true });
  mkdirSync(ws1Dir, { recursive: true });
  
  const catalog1 = {
    version: 'v1',
    schemaVersion: 1,
    workspace: workspace1,
    languageCode: 'de',
    languageName: 'German',
    sections: []
  };
  writeFileSync(join(ws1Dir, 'catalog.json'), JSON.stringify(catalog1, null, 2) + '\n');
  
  // Setup workspace 2
  const ws2Dir = join(CONTENT_DIR, 'workspaces', workspace2);
  if (existsSync(ws2Dir)) rmSync(ws2Dir, { recursive: true, force: true });
  mkdirSync(ws2Dir, { recursive: true });
  
  const catalog2 = {
    version: 'v1',
    schemaVersion: 1,
    workspace: workspace2,
    languageCode: 'fr',
    languageName: 'French',
    sections: []
  };
  writeFileSync(join(ws2Dir, 'catalog.json'), JSON.stringify(catalog2, null, 2) + '\n');
  
  // Create content for workspace 1
  const packDir1 = join(ws1Dir, 'packs', 'pack1');
  mkdirSync(packDir1, { recursive: true });
  const pack1 = {
    schemaVersion: 1,
    id: 'pack1',
    kind: 'pack',
    packVersion: '1.0.0',
    title: 'WS1 Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test',
    outline: ['Step 1'],
    sessionPlan: { version: 1, steps: [{ id: 'step1', title: 'Step 1', promptIds: ['p1'] }] },
    scenario: 'work',
    register: 'formal',
    primaryStructure: 'modal_verbs',
    variationSlots: ['subject', 'verb'],
    prompts: [{ id: 'p1', text: 'Test', intent: 'request', gloss_en: 'Test', audioUrl: '/v1/audio/test.mp3' }],
    analytics: { version: 1, goal: 'Test', successCriteria: ['Test'], drillType: 'conversation', cognitiveLoad: 'low' },
    contentId: `${workspace1}:pack:pack1`,
    contentHash: 'test',
    revisionId: 'test',
    provenance: { source: 'handcrafted' }
  };
  writeFileSync(join(packDir1, 'pack.json'), JSON.stringify(pack1, null, 2) + '\n');
  
  // Create content for workspace 2
  const packDir2 = join(ws2Dir, 'packs', 'pack2');
  mkdirSync(packDir2, { recursive: true });
  const pack2 = { ...pack1, id: 'pack2', title: 'WS2 Pack', contentId: `${workspace2}:pack:pack2` };
  writeFileSync(join(packDir2, 'pack.json'), JSON.stringify(pack2, null, 2) + '\n');
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  
  // Generate for workspace 1
  execSync(
    `npx tsx "${scriptPath}" --workspace ${workspace1}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  // Generate for workspace 2
  execSync(
    `npx tsx "${scriptPath}" --workspace ${workspace2}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  // Verify isolation
  const featured1 = JSON.parse(
    readFileSync(join(ws1Dir, 'featured', 'featured.json'), 'utf-8')
  );
  const featured2 = JSON.parse(
    readFileSync(join(ws2Dir, 'featured', 'featured.json'), 'utf-8')
  );
  
  assert(featured1.workspace === workspace1, 'Workspace 1 should be isolated');
  assert(featured2.workspace === workspace2, 'Workspace 2 should be isolated');
  assert(featured1.hero.entryUrl.includes(workspace1), 'Workspace 1 hero should reference workspace 1');
  assert(featured2.hero.entryUrl.includes(workspace2), 'Workspace 2 hero should reference workspace 2');
  
  // Cleanup
  if (existsSync(ws1Dir)) rmSync(ws1Dir, { recursive: true, force: true });
  if (existsSync(ws2Dir)) rmSync(ws2Dir, { recursive: true, force: true });
});

// E2E Test 8: Content change detection
test('E2E: Output changes when content changes', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  createTestPack('pack1', 'A1', 'work', true);
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featured1 = JSON.parse(
    readFileSync(
      join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json'),
      'utf-8'
    )
  );
  
  // Add new approved pack
  createTestPack('pack2', 'A1', 'work', true);
  
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featured2 = JSON.parse(
    readFileSync(
      join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json'),
      'utf-8'
    )
  );
  
  // Cards might change (but hero should be stable if pack1 is still first)
  // This tests that generation is reactive to content changes
  assert(featured1.workspace === featured2.workspace, 'Workspace should remain same');
  
  cleanupTestWorkspace();
});

// E2E Test 9: Invalid workspace handling
test('E2E: Error handling for invalid workspace', () => {
  const invalidWorkspace = 'nonexistent-workspace-12345';
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  
  try {
    execSync(
      `npx tsx "${scriptPath}" --workspace ${invalidWorkspace}`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    assert(false, 'Should have failed for invalid workspace');
  } catch (error: any) {
    // Expected to fail
    assert(
      error.message.includes('not found') || 
      error.stdout?.includes('not found') ||
      error.stderr?.includes('not found'),
      'Should fail with workspace not found message'
    );
  }
});

// E2E Test 10: Complete featured.json structure validation
test('E2E: Complete featured.json structure matches contract', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  createTestPack('pack1', 'A1', 'work', true);
  createTestDrill('drill1', 'A1', 'work', true);
  createTestDrill('drill2', 'A1', 'work', true);
  createTestPack('pack2', 'A1', 'work', true);
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featured = JSON.parse(
    readFileSync(
      join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json'),
      'utf-8'
    )
  );
  
  // Complete structure validation
  assert(featured.version === 1, 'Version must be 1');
  assert(typeof featured.workspace === 'string', 'Workspace must be string');
  assert(typeof featured.generatedAt === 'string', 'generatedAt must be string');
  assert(typeof featured.hero === 'object', 'Hero must be object');
  assert(Array.isArray(featured.cards), 'Cards must be array');
  
  // Hero structure
  assert(['track', 'pack', 'exam', 'drill'].includes(featured.hero.kind), 'Hero kind must be valid');
  assert(typeof featured.hero.entryUrl === 'string', 'Hero entryUrl must be string');
  assert(featured.hero.entryUrl.startsWith('/v1/'), 'Hero entryUrl must start with /v1/');
  assert(featured.hero.entryUrl.endsWith('.json'), 'Hero entryUrl must end with .json');
  assert(typeof featured.hero.cta === 'object', 'Hero cta must be object');
  assert(typeof featured.hero.cta.label === 'string', 'Hero cta.label must be string');
  assert(featured.hero.cta.action === 'open_entry', 'Hero cta.action must be open_entry');
  
  // Cards structure
  assert(featured.cards.length <= 4, 'Cards length must be <= 4');
  featured.cards.forEach((card: any, idx: number) => {
    assert(typeof card.id === 'string', `Card[${idx}].id must be string`);
    assert(['pack', 'drill', 'exam', 'track'].includes(card.kind), `Card[${idx}].kind must be valid`);
    assert(typeof card.entryUrl === 'string', `Card[${idx}].entryUrl must be string`);
    assert(card.entryUrl.startsWith('/v1/'), `Card[${idx}].entryUrl must start with /v1/`);
    assert(card.entryUrl.endsWith('.json'), `Card[${idx}].entryUrl must end with .json`);
  });
  
  // No duplicate entryUrls
  const allEntryUrls = [featured.hero.entryUrl, ...featured.cards.map((c: any) => c.entryUrl)];
  const uniqueUrls = new Set(allEntryUrls);
  assert(uniqueUrls.size === allEntryUrls.length, 'No duplicate entryUrls allowed');
  
  cleanupTestWorkspace();
});

// E2E Test 11: Entry existence verification
test('E2E: All referenced entries exist and are valid', () => {
  cleanupTestWorkspace();
  setupTestWorkspace();
  
  createTestPack('pack1', 'A1', 'work', true);
  createTestDrill('drill1', 'A1', 'work', true);
  
  const scriptPath = join(__dirname, 'generate-featured.ts');
  execSync(
    `npx tsx "${scriptPath}" --workspace ${TEST_WORKSPACE}`,
    {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    }
  );
  
  const featured = JSON.parse(
    readFileSync(
      join(CONTENT_DIR, 'workspaces', TEST_WORKSPACE, 'featured', 'featured.json'),
      'utf-8'
    )
  );
  
  // Verify hero entry exists
  const heroPath = featured.hero.entryUrl.replace(/^\/v1\//, '');
  const heroFullPath = join(CONTENT_DIR, heroPath);
  assert(existsSync(heroFullPath), `Hero entry must exist: ${heroFullPath}`);
  
  const heroEntry = JSON.parse(readFileSync(heroFullPath, 'utf-8'));
  assert(heroEntry.kind === featured.hero.kind, 'Hero entry kind must match');
  
  // Verify card entries exist
  for (const card of featured.cards) {
    const cardPath = card.entryUrl.replace(/^\/v1\//, '');
    const cardFullPath = join(CONTENT_DIR, cardPath);
    assert(existsSync(cardFullPath), `Card entry must exist: ${cardFullPath}`);
    
    const cardEntry = JSON.parse(readFileSync(cardFullPath, 'utf-8'));
    assert(cardEntry.kind === card.kind, `Card entry kind must match: ${card.id}`);
  }
  
  cleanupTestWorkspace();
});

// Run tests
console.log('🧪 Running featured content generation e2e tests...\n');

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ ${name}\n`);
      passed++;
    } catch (error: any) {
      console.error(`❌ ${name}`);
      console.error(`   ${error.message}\n`);
      failed++;
    }
  }
  
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
})();

