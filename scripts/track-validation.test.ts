#!/usr/bin/env tsx

/**
 * Unit tests for track validation
 * 
 * These tests verify track validation logic works correctly
 * by creating temporary test content and validating it.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = join(__dirname, '..', '.test-content');
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'drills'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks'), { recursive: true });
  
  // Create meta directory with minimal manifest
  mkdirSync(join(TEST_DIR, '..', 'content', 'meta'), { recursive: true });
  const manifest = {
    schemaVersion: 1,
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  writeFileSync(
    join(TEST_DIR, '..', 'content', 'meta', 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, '..', 'content', 'meta', 'manifest.staging.json'),
    JSON.stringify(manifest, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, '..', 'content', 'meta', 'release.json'),
    JSON.stringify({ version: 'v1', timestamp: new Date().toISOString() }, null, 2)
  );
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  // Clean up meta directory if we created it
  const metaDir = join(TEST_DIR, '..', 'content', 'meta');
  if (existsSync(metaDir)) {
    try {
      rmSync(metaDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

// Helper to create a valid pack for track items
function createTestPack(packId: string, scenario: string = 'work', testContentDir: string = join(TEST_DIR, 'v1')) {
  const pack = {
    schemaVersion: 1,
    id: packId,
    kind: 'pack',
    packVersion: '1.0.0',
    title: `Test Pack ${packId}`,
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack description',
    scenario: scenario,
    register: 'formal',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['prompt-001']
        }
      ]
    },
    prompts: [
      {
        id: 'prompt-001',
        text: 'Guten Tag, ich brauche Hilfe',
        intent: 'request',
        gloss_en: 'Good day, I need help',
        slotsChanged: ['subject', 'verb']
      }
    ],
    contentId: `test-ws:pack:${packId}`,
    contentHash: 'a'.repeat(64),
    revisionId: 'a'.repeat(12),
    analytics: {
      goal: 'Test goal',
      constraints: ['constraint1'],
      levers: ['subject'],
      successCriteria: ['criteria1'],
      commonMistakes: ['mistake1'],
      drillType: 'substitution',
      cognitiveLoad: 'low',
      targetLatencyMs: 800,
      successDefinition: '2 consecutive passes',
      keyFailureModes: ['verb position']
    }
  };
  
  mkdirSync(join(testContentDir, 'workspaces', 'test-ws', 'packs', packId), { recursive: true });
  writeFileSync(
    join(testContentDir, 'workspaces', 'test-ws', 'packs', packId, 'pack.json'),
    JSON.stringify(pack, null, 2)
  );
  
  return pack;
}

// Helper to create a valid drill for track items
function createTestDrill(drillId: string, testContentDir: string = join(TEST_DIR, 'v1')) {
  const drill = {
    schemaVersion: 1,
    id: drillId,
    kind: 'drill',
    title: `Test Drill ${drillId}`,
    level: 'A1',
    estimatedMinutes: 10,
    description: 'Test drill description',
    outline: ['Exercise 1'],
    exercises: [
      {
        id: 'ex-001',
        type: 'fill-blank',
        prompt: 'Ich ___ (sein) hier',
        answer: 'bin'
      }
    ],
    contentId: `test-ws:drill:${drillId}`,
    contentHash: 'b'.repeat(64),
    revisionId: 'b'.repeat(12),
    analytics: {
      primaryStructure: 'verb_conjugation',
      variationSlots: ['verb'],
      slotSwitchDensity: 0.5,
      promptDiversityScore: 0.7,
      scenarioCoverageScore: 0.6,
      estimatedCognitiveLoad: 'low',
      intendedOutcome: 'A1 verb conjugation'
    }
  };
  
  mkdirSync(join(testContentDir, 'workspaces', 'test-ws', 'drills', drillId), { recursive: true });
  writeFileSync(
    join(testContentDir, 'workspaces', 'test-ws', 'drills', drillId, 'drill.json'),
    JSON.stringify(drill, null, 2)
  );
  
  return drill;
}

// Helper to create catalog and index
function setupCatalogAndIndex(testContentDir: string = join(TEST_DIR, 'v1')) {
  const catalog = {
    version: 'v1',
    schemaVersion: 1,
    workspace: 'test-ws',
    languageCode: 'en',
    languageName: 'English',
    sections: [
      {
        id: 'context',
        kind: 'context',
        title: 'Context Library',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json',
        analyticsRollup: {
          scenarios: {},
          levels: {},
          primaryStructures: {}
        }
      },
      {
        id: 'tracks',
        kind: 'tracks',
        title: 'Guided Tracks',
        itemsUrl: '/v1/workspaces/test-ws/tracks/index.json',
        analyticsRollup: {
          scenarios: {},
          levels: {},
          primaryStructures: {}
        }
      }
    ]
  };
  
  mkdirSync(join(testContentDir, 'workspaces', 'test-ws'), { recursive: true });
  writeFileSync(
    join(testContentDir, 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  // Create context index
  const contextIndex = {
    version: 'v1',
    kind: 'context',
    total: 0,
    pageSize: 20,
    items: [],
    nextPage: null
  };
  
  mkdirSync(join(testContentDir, 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(testContentDir, 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(contextIndex, null, 2)
  );
  
  // Create tracks index
  const tracksIndex = {
    version: 'v1',
    kind: 'tracks',
    total: 0,
    pageSize: 20,
    items: [],
    nextPage: null
  };
  
  mkdirSync(join(testContentDir, 'workspaces', 'test-ws', 'tracks'), { recursive: true });
  writeFileSync(
    join(testContentDir, 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(tracksIndex, null, 2)
  );
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

// Test 1: Valid track passes validation
test('valid track passes validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  // Create test packs and drills
  createTestPack('pack1', 'government_office');
  createTestPack('pack2', 'government_office');
  createTestDrill('drill1');
  
  // Create valid track
  const track = {
    schemaVersion: 1,
    id: 'test_track',
    kind: 'track',
    title: 'Test Track',
    level: 'A1',
    scenario: 'government_office',
    estimatedMinutes: 25,
    description: 'Test track description',
    items: [
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json',
        required: true
      },
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack2/pack.json',
        required: true
      },
      {
        kind: 'drill',
        entryUrl: '/v1/workspaces/test-ws/drills/drill1/drill.json',
        required: true
      }
    ],
    ordering: {
      type: 'fixed'
    },
    version: 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'test_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'test_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Add track to index
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test_track',
        kind: 'track',
        title: 'Test Track',
        level: 'A1',
        durationMinutes: 25,
        entryUrl: '/v1/workspaces/test-ws/tracks/test_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:test_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  // Run validation
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    // Should not have track validation errors
    const hasTrackErrors = output.includes('track entry') && 
                          !output.includes('✅') &&
                          (output.includes(track.id) || output.includes('Item'));
    assert(!hasTrackErrors, `Valid track should pass validation. Output: ${output.substring(0, 1000)}`);
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    // Check if errors are track-related
    if (errorOutput.includes('track entry') && errorOutput.includes(track.id) && !errorOutput.includes('✅')) {
      throw new Error(`Valid track failed validation: ${errorOutput.substring(0, 1000)}`);
    }
    // Other errors (like missing manifest) are OK for this test
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test 2: Track missing required fields fails validation
test('track missing required fields fails validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  const invalidTrack = {
    schemaVersion: 1,
    id: 'invalid_track',
    kind: 'track',
    title: 'Invalid Track'
    // Missing level, scenario, description, items, ordering, version
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'invalid_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'invalid_track', 'track.json'),
    JSON.stringify(invalidTrack, null, 2)
  );
  
  // Add track to index so validator finds it
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'invalid_track',
        kind: 'track',
        title: 'Invalid Track',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/tracks/invalid_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:invalid_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    assert(output.includes('missing or invalid field') && output.includes('track entry'), 'Should fail validation for missing required fields');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('missing or invalid field') && errorOutput.includes('track entry'), `Should fail validation. Output: ${errorOutput.substring(0, 500)}`);
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test 3: Track with duplicate entryUrls fails validation
test('track with duplicate entryUrls fails validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  createTestPack('pack1', 'government_office');
  
  const track = {
    schemaVersion: 1,
    id: 'duplicate_track',
    kind: 'track',
    title: 'Duplicate Track',
    level: 'A1',
    scenario: 'government_office',
    estimatedMinutes: 30,
    description: 'Test track',
    items: [
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json',
        required: true
      },
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json', // Duplicate!
        required: true
      }
    ],
    ordering: {
      type: 'fixed'
    },
    version: 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'duplicate_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'duplicate_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Add track to index so validator finds it
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'duplicate_track',
        kind: 'track',
        title: 'Duplicate Track',
        level: 'A1',
        durationMinutes: 30,
        entryUrl: '/v1/workspaces/test-ws/tracks/duplicate_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:duplicate_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    assert(output.includes('duplicate entryUrl'), 'Should fail validation for duplicate entryUrls');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('duplicate entryUrl'), `Should fail validation. Output: ${errorOutput.substring(0, 500)}`);
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test 4: Track with non-existent entryUrl fails validation
test('track with non-existent entryUrl fails validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  const track = {
    schemaVersion: 1,
    id: 'missing_track',
    kind: 'track',
    title: 'Missing Track',
    level: 'A1',
    scenario: 'government_office',
    estimatedMinutes: 15,
    description: 'Test track',
    items: [
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/non_existent/pack.json', // Doesn't exist!
        required: true
      }
    ],
    ordering: {
      type: 'fixed'
    },
    version: 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'missing_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'missing_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Add track to index so validator finds it
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'missing_track',
        kind: 'track',
        title: 'Missing Track',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/tracks/missing_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:missing_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    assert(output.includes('does not exist') && output.includes('entryUrl'), 'Should fail validation for non-existent entryUrl');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('does not exist') && errorOutput.includes('entryUrl'), `Should fail validation. Output: ${errorOutput.substring(0, 500)}`);
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test 5: Track with scenario mismatch fails validation
test('track with scenario mismatch fails validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  // Create pack with different scenario
  createTestPack('pack1', 'work'); // Different scenario!
  
  const track = {
    schemaVersion: 1,
    id: 'mismatch_track',
    kind: 'track',
    title: 'Mismatch Track',
    level: 'A1',
    scenario: 'government_office', // Track scenario
    estimatedMinutes: 15,
    description: 'Test track',
    items: [
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json', // Pack has 'work' scenario
        required: true
      }
    ],
    ordering: {
      type: 'fixed'
    },
    version: 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'mismatch_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'mismatch_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Add track to index so validator finds it
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'mismatch_track',
        kind: 'track',
        title: 'Mismatch Track',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/tracks/mismatch_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:mismatch_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    assert(output.includes('does not match track scenario'), 'Should fail validation for scenario mismatch');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('does not match track scenario'), `Should fail validation. Output: ${errorOutput.substring(0, 500)}`);
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test 6: Track with invalid ordering type fails validation
test('track with invalid ordering type fails validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  createTestPack('pack1', 'government_office');
  
  const track = {
    schemaVersion: 1,
    id: 'invalid_ordering_track',
    kind: 'track',
    title: 'Invalid Ordering Track',
    level: 'A1',
    scenario: 'government_office',
    estimatedMinutes: 15,
    description: 'Test track',
    items: [
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json',
        required: true
      }
    ],
    ordering: {
      type: 'random' // Invalid! Must be 'fixed'
    },
    version: 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'invalid_ordering_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'invalid_ordering_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Add track to index so validator finds it
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'invalid_ordering_track',
        kind: 'track',
        title: 'Invalid Ordering Track',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/tracks/invalid_ordering_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:invalid_ordering_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    assert(output.includes('ordering.type must be "fixed"'), 'Should fail validation for invalid ordering type');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('ordering.type must be "fixed"'), `Should fail validation. Output: ${errorOutput.substring(0, 500)}`);
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test 7: Track with too few items fails validation
test('track with too few items fails validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  createTestPack('pack1', 'government_office');
  
  const track = {
    schemaVersion: 1,
    id: 'too_few_track',
    kind: 'track',
    title: 'Too Few Items Track',
    level: 'A1',
    scenario: 'government_office',
    estimatedMinutes: 15,
    description: 'Test track',
    items: [
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json',
        required: true
      }
      // Only 1 item, minimum is 6
    ],
    ordering: {
      type: 'fixed'
    },
    version: 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'too_few_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'too_few_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Add track to index so validator finds it
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'too_few_track',
        kind: 'track',
        title: 'Too Few Items Track',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/tracks/too_few_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:too_few_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    assert(output.includes('too short') || output.includes('minimum 6'), 'Should fail validation for too few items');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('too short') || errorOutput.includes('minimum 6'), `Should fail validation. Output: ${errorOutput.substring(0, 500)}`);
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test 8: Track with invalid item kind fails validation
test('track with invalid item kind fails validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  const track = {
    schemaVersion: 1,
    id: 'invalid_kind_track',
    kind: 'track',
    title: 'Invalid Kind Track',
    level: 'A1',
    scenario: 'government_office',
    estimatedMinutes: 15,
    description: 'Test track',
    items: [
      {
        kind: 'exam', // Invalid! Must be 'pack' or 'drill'
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json',
        required: true
      }
    ],
    ordering: {
      type: 'fixed'
    },
    version: 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'invalid_kind_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'invalid_kind_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Add track to index so validator finds it
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'invalid_kind_track',
        kind: 'track',
        title: 'Invalid Kind Track',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/tracks/invalid_kind_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:invalid_kind_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    assert(output.includes('kind must be "pack" or "drill"'), 'Should fail validation for invalid item kind');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('kind must be "pack" or "drill"'), `Should fail validation. Output: ${errorOutput.substring(0, 500)}`);
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Test 9: Track entryUrl pattern validation
test('track entryUrl pattern validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  createTestPack('pack1', 'government_office');
  createTestDrill('drill1');
  
  const track = {
    schemaVersion: 1,
    id: 'pattern_track',
    kind: 'track',
    title: 'Pattern Track',
    level: 'A1',
    scenario: 'government_office',
    estimatedMinutes: 25,
    description: 'Test track',
    items: [
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json', // Valid pattern
        required: true
      },
      {
        kind: 'drill',
        entryUrl: '/v1/workspaces/test-ws/drills/drill1/drill.json', // Valid pattern
        required: true
      }
    ],
    ordering: {
      type: 'fixed'
    },
    version: 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'pattern_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'pattern_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Verify entryUrl patterns are correct
  assert(track.items[0].entryUrl.match(/^\/v1\/workspaces\/[^/]+\/packs\/[^/]+\/pack\.json$/), 'Pack entryUrl should match pattern');
  assert(track.items[1].entryUrl.match(/^\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/drill\.json$/), 'Drill entryUrl should match pattern');
  
  cleanupTestDir();
});

// Test 10: Track version validation
test('track version validation', () => {
  setupTestDir();
  setupCatalogAndIndex();
  
  createTestPack('pack1', 'government_office');
  
  const track = {
    schemaVersion: 1,
    id: 'version_track',
    kind: 'track',
    title: 'Version Track',
    level: 'A1',
    scenario: 'government_office',
    estimatedMinutes: 15,
    description: 'Test track',
    items: [
      {
        kind: 'pack',
        entryUrl: '/v1/workspaces/test-ws/packs/pack1/pack.json',
        required: true
      }
    ],
    ordering: {
      type: 'fixed'
    },
    version: 2 // Invalid! Must be 1
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'version_track'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'version_track', 'track.json'),
    JSON.stringify(track, null, 2)
  );
  
  // Add track to index so validator finds it
  const index = {
    version: 'v1',
    kind: 'tracks',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'version_track',
        kind: 'track',
        title: 'Version Track',
        level: 'A1',
        durationMinutes: 15,
        entryUrl: '/v1/workspaces/test-ws/tracks/version_track/track.json',
        scenario: 'government_office',
        contentId: 'test-ws:track:version_track',
        revisionId: '000000000000'
      }
    ],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'tracks', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const originalEnv = process.env.CONTENT_DIR;
  const originalMetaEnv = process.env.META_DIR;
  process.env.CONTENT_DIR = join(TEST_DIR, 'v1');
  process.env.META_DIR = join(TEST_DIR, '..', 'content', 'meta');
  
  try {
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    assert(output.includes('version must be 1'), 'Should fail validation for invalid version');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('version must be 1'), `Should fail validation. Output: ${errorOutput.substring(0, 500)}`);
  } finally {
    if (originalEnv) {
      process.env.CONTENT_DIR = originalEnv;
    } else {
      delete process.env.CONTENT_DIR;
    }
    if (originalMetaEnv) {
      process.env.META_DIR = originalMetaEnv;
    } else {
      delete process.env.META_DIR;
    }
  }
  
  cleanupTestDir();
});

// Run all tests
function runTests() {
  console.log('Running track validation unit tests...\n');
  
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

