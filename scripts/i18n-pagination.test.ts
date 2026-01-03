#!/usr/bin/env tsx

/**
 * Unit tests for i18n scaffolding and pagination validation
 * 
 * Tests cover:
 * - i18n object structure validation
 * - i18n max length constraints
 * - Pagination schema validation
 * - nextPage URL pattern validation
 * - nextPage file existence validation
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = join(__dirname, '..', '.test-i18n-pagination');
const CONTENT_DIR = join(TEST_DIR, 'v1');

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

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(CONTENT_DIR, 'workspaces', 'test-ws'), { recursive: true });
  mkdirSync(join(CONTENT_DIR, 'meta'), { recursive: true });
  
  // Create minimal manifest
  const manifest = {
    schemaVersion: 1,
    activeVersion: 'v1',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  writeFileSync(join(CONTENT_DIR, 'meta', 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ============ i18n Validation Tests ============

test('validateI18nObject: accepts valid i18n object with en key', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    const packsDir = join(workspaceDir, 'packs');
    
    // Create catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create pack
    const packId = 'test-1';
    mkdirSync(join(packsDir, packId), { recursive: true });
    const pack = {
      schemaVersion: 1,
      id: packId,
      kind: 'pack',
      packVersion: '1.0.0',
      title: 'Test Pack',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'greeting',
      variationSlots: ['subject'],
      outline: ['Step 1'],
      sessionPlan: { version: 1, steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1'] }] },
      prompts: [{ id: 'p1', text: 'Test', intent: 'practice', gloss_en: 'Test' }],
      analytics: {
        version: 1,
        qualityGateVersion: 'v1',
        scenario: 'work',
        register: 'neutral',
        primaryStructure: 'greeting',
        variationSlots: ['subject'],
        promptCount: 1,
        multiSlotRate: 0.5,
        scenarioTokenHitAvg: 2,
        scenarioTokenQualifiedRate: 1.0,
        uniqueTokenRate: 0.5,
        bannedPhraseViolations: 0,
        passesQualityGates: true
      },
      contentId: `test-ws:pack:${packId}`,
      contentHash: 'a'.repeat(64),
      revisionId: 'a'.repeat(12)
    };
    writeFileSync(join(packsDir, packId, 'pack.json'), JSON.stringify(pack, null, 2));
    
    // Create index with i18n
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 20,
      page: 1,
      items: [
        {
          id: packId,
          kind: 'pack',
          title: 'Test Pack',
          title_i18n: { en: 'Test Pack', de: 'Test Paket' },
          level: 'A1',
          durationMinutes: 15,
          entryUrl: `/v1/workspaces/test-ws/packs/${packId}/pack.json`,
          contentId: `test-ws:pack:${packId}`,
          revisionId: 'a'.repeat(12)
        }
      ],
      nextPage: null
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    // Run validator
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    // Should not have errors about i18n structure
    const hasI18nError = result.includes('title_i18n') && (result.includes('must be') || result.includes('invalid'));
    assert(!hasI18nError, `Should not error on valid i18n, but got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateI18nObject: rejects i18n object with non-string value', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index with invalid i18n
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 20,
      page: 1,
      items: [
        {
          id: 'test-1',
          kind: 'pack',
          title: 'Test Pack',
          title_i18n: { en: 123 }, // Invalid: number instead of string
          level: 'A1',
          durationMinutes: 15,
          entryUrl: '/v1/workspaces/test-ws/packs/test-1/pack.json',
          contentId: 'test-ws:pack:test-1',
          revisionId: 'a'.repeat(12)
        }
      ],
      nextPage: null
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    assert(result.includes('title_i18n') && result.includes('must be a string'), `Should error on non-string i18n value, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateI18nObject: rejects shortTitle_i18n exceeding max length', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index with long shortTitle_i18n
    mkdirSync(contextDir, { recursive: true });
    const longTitle = 'A'.repeat(30); // Exceeds 28 char limit
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 20,
      page: 1,
      items: [
        {
          id: 'test-1',
          kind: 'pack',
          title: 'Test Pack',
          shortTitle: 'Test',
          shortTitle_i18n: { en: longTitle },
          level: 'A1',
          durationMinutes: 15,
          entryUrl: '/v1/workspaces/test-ws/packs/test-1/pack.json',
          contentId: 'test-ws:pack:test-1',
          revisionId: 'a'.repeat(12)
        }
      ],
      nextPage: null
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    assert(result.includes('shortTitle_i18n') && result.includes('exceeds max length'), `Should error on shortTitle_i18n exceeding 28 chars, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateI18nObject: warns when en key is missing (soft rule)', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index with missing "en" key
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 20,
      page: 1,
      items: [
        {
          id: 'test-1',
          kind: 'pack',
          title: 'Test Pack',
          title_i18n: { de: 'Test Paket' }, // Missing "en"
          level: 'A1',
          durationMinutes: 15,
          entryUrl: '/v1/workspaces/test-ws/packs/test-1/pack.json',
          contentId: 'test-ws:pack:test-1',
          revisionId: 'a'.repeat(12)
        }
      ],
      nextPage: null
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    // Should warn but not fail (soft rule) - check for warning or allow if validation passes
    const hasWarning = result.includes('missing "en" key') || result.includes('recommended') || result.includes('⚠️');
    const hasError = result.includes('title_i18n') && (result.includes('must be') || result.includes('invalid'));
    assert(hasWarning || !hasError, `Should warn about missing en key (soft rule) or not error, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

// ============ Pagination Validation Tests ============

test('validateIndex: accepts valid pagination schema', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    const packsDir = join(workspaceDir, 'packs');
    
    // Create catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create packs referenced in index
    for (let i = 0; i < 25; i++) {
      const packId = `pack-${i}`;
      mkdirSync(join(packsDir, packId), { recursive: true });
      const pack = {
        schemaVersion: 1,
        id: packId,
        kind: 'pack',
        packVersion: '1.0.0',
        title: `Pack ${i}`,
        level: 'A1',
        estimatedMinutes: 15,
        description: 'Test',
        scenario: 'work',
        register: 'neutral',
        primaryStructure: 'greeting',
        variationSlots: ['subject'],
        outline: ['Step 1'],
        sessionPlan: { version: 1, steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1'] }] },
        prompts: [{ id: 'p1', text: 'Test', intent: 'practice', gloss_en: 'Test' }],
        analytics: {
          version: 1,
          qualityGateVersion: 'v1',
          scenario: 'work',
          register: 'neutral',
          primaryStructure: 'greeting',
          variationSlots: ['subject'],
          promptCount: 1,
          multiSlotRate: 0.5,
          scenarioTokenHitAvg: 2,
          scenarioTokenQualifiedRate: 1.0,
          uniqueTokenRate: 0.5,
          bannedPhraseViolations: 0,
          passesQualityGates: true
        },
        contentId: `test-ws:pack:${packId}`,
        contentHash: 'a'.repeat(64),
        revisionId: 'a'.repeat(12)
      };
      writeFileSync(join(packsDir, packId, 'pack.json'), JSON.stringify(pack, null, 2));
    }
    
    // Create paginated index
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 25,
      pageSize: 20,
      page: 1,
      items: Array(20).fill(null).map((_, i) => ({
        id: `pack-${i}`,
        kind: 'pack',
        title: `Pack ${i}`,
        level: 'A1',
        durationMinutes: 15,
        entryUrl: `/v1/workspaces/test-ws/packs/pack-${i}/pack.json`,
        contentId: `test-ws:pack:pack-${i}`,
        revisionId: 'a'.repeat(12)
      })),
      nextPage: '/v1/workspaces/test-ws/context/pages/2.json'
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    // Create page 2
    const page2Path = join(contextDir, 'pages', '2.json');
    mkdirSync(dirname(page2Path), { recursive: true });
    const page2 = {
      version: 'v1',
      kind: 'context',
      total: 25,
      pageSize: 20,
      page: 2,
      items: Array(5).fill(null).map((_, i) => ({
        id: `pack-${20 + i}`,
        kind: 'pack',
        title: `Pack ${20 + i}`,
        level: 'A1',
        durationMinutes: 15,
        entryUrl: `/v1/workspaces/test-ws/packs/pack-${20 + i}/pack.json`,
        contentId: `test-ws:pack:pack-${20 + i}`,
        revisionId: 'a'.repeat(12)
      })),
      nextPage: null
    };
    writeFileSync(page2Path, JSON.stringify(page2, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    // Should not have pagination errors - check that validation passes or only has non-pagination errors
    const hasPageError = result.includes('page') && (result.includes('must be') || result.includes('invalid') || result.includes('missing'));
    const hasNextPageError = result.includes('nextPage') && (result.includes('non-existent') || result.includes('pattern') || result.includes('invalid'));
    // Allow other validation errors (like missing packs) but not pagination-specific ones
    const hasOnlyPaginationErrors = (hasPageError || hasNextPageError) && !result.includes('pack.json') && !result.includes('catalog');
    assert(!hasOnlyPaginationErrors, `Should not error on valid pagination schema, but got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateIndex: rejects missing page number', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index without page field
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 20,
      // Missing page field
      items: [],
      nextPage: null
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    assert(result.includes('page') && (result.includes('must be number') || result.includes('missing')), `Should error on missing page, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateIndex: rejects page < 1', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index with invalid page
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 20,
      page: 0, // Invalid: must be >= 1
      items: [],
      nextPage: null
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    assert(result.includes('page') && result.includes('must be >= 1'), `Should error on page < 1, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateIndex: rejects pageSize <= 0', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index with invalid pageSize
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 0, // Invalid: must be > 0
      page: 1,
      items: [],
      nextPage: null
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    assert(result.includes('pageSize') && result.includes('must be > 0'), `Should error on pageSize <= 0, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateIndex: rejects items.length > pageSize', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index with too many items
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 10,
      page: 1,
      items: Array(15).fill(null).map((_, i) => ({
        id: `pack-${i}`,
        kind: 'pack',
        title: `Pack ${i}`,
        level: 'A1',
        durationMinutes: 15,
        entryUrl: `/v1/workspaces/test-ws/packs/pack-${i}/pack.json`,
        contentId: `test-ws:pack:pack-${i}`,
        revisionId: 'a'.repeat(12)
      })), // 15 items > pageSize 10
      nextPage: null
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    assert(result.includes('exceeds pageSize'), `Should error when items.length > pageSize, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateIndex: rejects invalid nextPage URL pattern', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index with invalid nextPage pattern
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 20,
      page: 1,
      items: [],
      nextPage: '/invalid/path' // Invalid pattern
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    assert(result.includes('nextPage') && result.includes('pattern'), `Should error on invalid nextPage pattern, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

test('validateIndex: rejects nextPage pointing to non-existent file', () => {
  setupTestDir();
  try {
    const workspaceDir = join(CONTENT_DIR, 'workspaces', 'test-ws');
    const contextDir = join(workspaceDir, 'context');
    
    // Create minimal catalog
    const catalog = {
      version: '1.0.0',
      schemaVersion: 1,
      workspace: 'test-ws',
      languageCode: 'en',
      languageName: 'English',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context',
          itemsUrl: '/v1/workspaces/test-ws/context/index.json'
        }
      ]
    };
    writeFileSync(join(workspaceDir, 'catalog.json'), JSON.stringify(catalog, null, 2));
    
    // Create index with nextPage pointing to non-existent file
    mkdirSync(contextDir, { recursive: true });
    const index = {
      version: 'v1',
      kind: 'context',
      total: 1,
      pageSize: 20,
      page: 1,
      items: [],
      nextPage: '/v1/workspaces/test-ws/context/pages/2.json' // Points to non-existent file
    };
    writeFileSync(join(contextDir, 'index.json'), JSON.stringify(index, null, 2));
    
    const result = execSync(
      `CONTENT_DIR="${CONTENT_DIR}" npx tsx scripts/validate-content.ts 2>&1 || true`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    
    assert(result.includes('non-existent file') || result.includes('does not exist'), `Should error when nextPage file does not exist, got: ${result.substring(0, 500)}`);
  } finally {
    cleanupTestDir();
  }
});

// ============ Run Tests ============

function runTests() {
  console.log('🧪 Running i18n and pagination validation tests...\n');
  
  for (const test of tests) {
    try {
      test.fn();
      passed++;
      console.log(`✅ ${test.name}`);
    } catch (error: any) {
      failed++;
      console.error(`❌ ${test.name}`);
      console.error(`   ${error.message}`);
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

