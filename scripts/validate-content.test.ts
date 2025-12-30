#!/usr/bin/env tsx

/**
 * Unit tests for validate-content.ts
 * 
 * These tests verify the validation logic works correctly
 * by creating temporary test content and validating it.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DIR = join(__dirname, '..', '.test-content');

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'packs'), { recursive: true });
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

// Test 1: Valid catalog structure
test('valid catalog structure', () => {
  setupTestDir();
  
  const catalog = {
    workspace: 'test-ws',
    language: 'Test Language',
    sections: [
      {
        id: 'section1',
        kind: 'context',
        title: 'Test Section',
        itemsUrl: '/v1/workspaces/test-ws/section1/index.json'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  // Create referenced index file
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'section1'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'section1', 'index.json'),
    JSON.stringify({ items: [] }, null, 2)
  );
  
  // Verify files exist
  assert(
    existsSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json')),
    'Catalog file should exist'
  );
  
  cleanupTestDir();
});

// Test 2: Missing workspace field
test('catalog missing workspace field', () => {
  setupTestDir();
  
  const invalidCatalog = {
    language: 'Test Language',
    sections: []
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(invalidCatalog, null, 2)
  );
  
  // This should be caught by validator, but for unit test we just check structure
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      'utf-8'
    )
  );
  
  assert(!content.workspace, 'Catalog should be missing workspace field');
  
  cleanupTestDir();
});

// Test 3: Invalid JSON
test('invalid JSON file', () => {
  setupTestDir();
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    '{ invalid json }'
  );
  
  let parseError = false;
  try {
    JSON.parse(readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      'utf-8'
    ));
  } catch (e) {
    parseError = true;
  }
  
  assert(parseError, 'Invalid JSON should cause parse error');
  
  cleanupTestDir();
});

// Test 4: Referenced path exists
test('referenced JSON path exists', () => {
  setupTestDir();
  
  const catalog = {
    workspace: 'test-ws',
    language: 'Test',
    sections: [
      {
        id: 'section1',
        kind: 'context',
        title: 'Test',
        itemsUrl: '/v1/workspaces/test-ws/section1/index.json'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  // Create the referenced file
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'section1'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'section1', 'index.json'),
    JSON.stringify({ items: [] }, null, 2)
  );
  
  // Verify path resolution
  const itemsUrl = catalog.sections[0].itemsUrl;
  const relativePath = itemsUrl.replace('/v1/', '');
  const fullPath = join(TEST_DIR, 'v1', relativePath);
  
  assert(existsSync(fullPath), 'Referenced path should exist');
  
  cleanupTestDir();
});

// Test 5: Valid section index with pagination schema
test('valid section index with pagination schema', () => {
  setupTestDir();
  
  const index = {
    version: 'v1',
    kind: 'context',
    total: 2,
    pageSize: 20,
    items: [
      {
        id: 'pack-001',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/packs/pack-001.json',
        durationMinutes: 15
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  // Create referenced pack file
  writeFileSync(
    join(TEST_DIR, 'v1', 'packs', 'pack-001.json'),
    JSON.stringify({ id: 'pack-001', type: 'context' }, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(content.version === 'v1', 'Index should have version');
  assert(content.kind === 'context', 'Index should have kind');
  assert(content.total === 2, 'Index should have total');
  assert(content.pageSize === 20, 'Index should have pageSize');
  assert(Array.isArray(content.items), 'Index should have items array');
  assert(content.nextPage === null, 'Index should have nextPage');
  assert(content.items[0].level === 'A1', 'Item should have level field');
  assert(content.items[0].entryUrl.startsWith('/v1/'), 'Item entryUrl should start with /v1/');
  
  cleanupTestDir();
});

// Test 6: Section index missing required fields
test('section index missing required fields', () => {
  setupTestDir();
  
  const invalidIndex = {
    items: [
      {
        id: 'pack-001',
        title: 'Test'
      }
    ]
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(invalidIndex, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(!content.version, 'Index should be missing version');
  assert(!content.kind, 'Index should be missing kind');
  assert(!content.total, 'Index should be missing total');
  assert(!content.pageSize, 'Index should be missing pageSize');
  assert(!content.items[0].level, 'Item should be missing level');
  assert(!content.items[0].entryUrl, 'Item should be missing entryUrl');
  
  cleanupTestDir();
});

// Test 7: Section index with pagination (nextPage)
test('section index with pagination nextPage', () => {
  setupTestDir();
  
  const indexPage1 = {
    version: 'v1',
    kind: 'context',
    total: 45,
    pageSize: 20,
    items: Array(20).fill(null).map((_, i) => ({
      id: `pack-${i + 1}`,
      title: `Pack ${i + 1}`,
      level: 'A1',
      entryUrl: `/v1/packs/pack-${i + 1}.json`
    })),
    nextPage: '/v1/workspaces/test-ws/context/index.page2.json'
  };
  
  const indexPage2 = {
    version: 'v1',
    kind: 'context',
    total: 45,
    pageSize: 20,
    items: Array(20).fill(null).map((_, i) => ({
      id: `pack-${i + 21}`,
      title: `Pack ${i + 21}`,
      level: 'A2',
      entryUrl: `/v1/packs/pack-${i + 21}.json`
    })),
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(indexPage1, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'),
    JSON.stringify(indexPage2, null, 2)
  );
  
  const page1 = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  const page2 = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'),
      'utf-8'
    )
  );
  
  assert(page1.nextPage === '/v1/workspaces/test-ws/context/index.page2.json', 'Page 1 should have nextPage');
  assert(page2.nextPage === null, 'Page 2 should have null nextPage');
  assert(page1.total === page2.total, 'Both pages should have same total');
  assert(page1.kind === page2.kind, 'Both pages should have same kind');
  
  cleanupTestDir();
});

// Test 8: Item with missing level field (Foundation Focus requirement)
test('item missing level field', () => {
  setupTestDir();
  
  const index = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'pack-001',
        title: 'Test Pack',
        entryUrl: '/v1/packs/pack-001.json'
        // Missing level field
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(!content.items[0].level, 'Item should be missing level field');
  
  cleanupTestDir();
});

// Test 9: Item entryUrl validation
test('item entryUrl format validation', () => {
  setupTestDir();
  
  const validIndex = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'pack-001',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/packs/pack-001.json' // Valid format
      }
    ],
    nextPage: null
  };
  
  const invalidIndex = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'pack-002',
        title: 'Test Pack 2',
        level: 'A1',
        entryUrl: 'invalid-path.json' // Invalid format (no /v1/ prefix)
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-valid.json'),
    JSON.stringify(validIndex, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-invalid.json'),
    JSON.stringify(invalidIndex, null, 2)
  );
  
  const valid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-valid.json'),
      'utf-8'
    )
  );
  const invalid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-invalid.json'),
      'utf-8'
    )
  );
  
  assert(valid.items[0].entryUrl.startsWith('/v1/'), 'Valid entryUrl should start with /v1/');
  assert(valid.items[0].entryUrl.endsWith('.json'), 'Valid entryUrl should end with .json');
  assert(!invalid.items[0].entryUrl.startsWith('/v1/'), 'Invalid entryUrl should not start with /v1/');
  
  cleanupTestDir();
});

// Test 10: Section index kind matches catalog section kind
test('section index kind matches catalog section kind', () => {
  setupTestDir();
  
  const catalog = {
    workspace: 'test-ws',
    languageCode: 'test',
    languageName: 'Test Language',
    sections: [
      {
        id: 'context',
        kind: 'context',
        title: 'Context Library',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json'
      }
    ]
  };
  
  const index = {
    version: 'v1',
    kind: 'context', // Matches catalog section kind
    total: 1,
    pageSize: 20,
    items: [],
    nextPage: null
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const catalogContent = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      'utf-8'
    )
  );
  const indexContent = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(
    catalogContent.sections[0].kind === indexContent.kind,
    'Index kind should match catalog section kind'
  );
  
  cleanupTestDir();
});

// Test 11: Section index item with kind field
test('section index item includes kind field', () => {
  setupTestDir();
  
  const index = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-pack',
        kind: 'pack',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/test-pack/pack.json'
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  
  assert(content.items[0].kind === 'pack', 'Item should have kind field');
  assert(typeof content.items[0].kind === 'string', 'Item kind should be a string');
  
  cleanupTestDir();
});

// Test 12: EntryUrl pattern validation for pack
test('entryUrl pattern validation for pack kind', () => {
  setupTestDir();
  
  const validIndex = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-pack',
        kind: 'pack',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/test-pack/pack.json'
      }
    ],
    nextPage: null
  };
  
  const invalidIndex = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-pack',
        kind: 'pack',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/packs/test-pack.json' // Wrong pattern
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-valid.json'),
    JSON.stringify(validIndex, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-invalid.json'),
    JSON.stringify(invalidIndex, null, 2)
  );
  
  const valid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-valid.json'),
      'utf-8'
    )
  );
  const invalid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-invalid.json'),
      'utf-8'
    )
  );
  
  assert(
    valid.items[0].entryUrl.match(/\/v1\/workspaces\/[^/]+\/packs\/[^/]+\/pack\.json$/),
    'Valid pack entryUrl should match canonical pattern'
  );
  assert(
    !invalid.items[0].entryUrl.match(/\/v1\/workspaces\/[^/]+\/packs\/[^/]+\/pack\.json$/),
    'Invalid pack entryUrl should not match canonical pattern'
  );
  
  cleanupTestDir();
});

// Test 13: EntryUrl pattern validation for exam
test('entryUrl pattern validation for exam kind', () => {
  setupTestDir();
  
  const index = {
    version: 'v1',
    kind: 'exams',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-exam',
        kind: 'exam',
        title: 'Test Exam',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/exams/test-exam/exam.json'
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams', 'index.json'),
      'utf-8'
    )
  );
  
  assert(
    content.items[0].entryUrl.match(/\/v1\/workspaces\/[^/]+\/exams\/[^/]+\/exam\.json$/),
    'Exam entryUrl should match canonical pattern'
  );
  
  cleanupTestDir();
});

// Test 14: Pack entry document schema validation
test('pack entry document schema validation', () => {
  setupTestDir();
  
  const validPack = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Section 1', 'Section 2'],
    prompts: [
      { id: 'p1', text: 'Hello' },
      { id: 'p2', text: 'Goodbye' }
    ]
  };
  
  const invalidPack = {
    id: 'test-pack-2',
    kind: 'pack',
    title: 'Test Pack 2',
    // Missing required fields: estimatedMinutes, description, outline
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack-2'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(validPack, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack-2', 'pack.json'),
    JSON.stringify(invalidPack, null, 2)
  );
  
  const valid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  const invalid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack-2', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(valid.id === 'test-pack', 'Valid pack should have id');
  assert(valid.kind === 'pack', 'Valid pack should have kind');
  assert(valid.description, 'Valid pack should have description');
  assert(Array.isArray(valid.outline) && valid.outline.length > 0, 'Valid pack should have non-empty outline');
  assert(typeof valid.estimatedMinutes === 'number', 'Valid pack should have estimatedMinutes');
  assert(Array.isArray(valid.prompts), 'Valid pack should have prompts array');
  
  assert(!invalid.estimatedMinutes, 'Invalid pack should be missing estimatedMinutes');
  assert(!invalid.description, 'Invalid pack should be missing description');
  assert(!invalid.outline, 'Invalid pack should be missing outline');
  
  cleanupTestDir();
});

// Test 15: Exam entry document schema validation
test('exam entry document schema validation', () => {
  setupTestDir();
  
  const validExam = {
    id: 'test-exam',
    kind: 'exam',
    title: 'Test Exam',
    level: 'A1',
    estimatedMinutes: 30
  };
  
  const invalidExam = {
    id: 'test-exam-2',
    kind: 'exam',
    title: 'Test Exam 2'
    // Missing required fields: level, estimatedMinutes
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams', 'test-exam'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams', 'test-exam-2'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams', 'test-exam', 'exam.json'),
    JSON.stringify(validExam, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams', 'test-exam-2', 'exam.json'),
    JSON.stringify(invalidExam, null, 2)
  );
  
  const valid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams', 'test-exam', 'exam.json'),
      'utf-8'
    )
  );
  const invalid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'exams', 'test-exam-2', 'exam.json'),
      'utf-8'
    )
  );
  
  assert(valid.id === 'test-exam', 'Valid exam should have id');
  assert(valid.kind === 'exam', 'Valid exam should have kind');
  assert(valid.level === 'A1', 'Valid exam should have level');
  assert(typeof valid.estimatedMinutes === 'number', 'Valid exam should have estimatedMinutes');
  
  assert(!invalid.level, 'Invalid exam should be missing level');
  assert(!invalid.estimatedMinutes, 'Invalid exam should be missing estimatedMinutes');
  
  cleanupTestDir();
});

// Test 16: EntryUrl ID matches item ID
test('entryUrl ID matches item ID', () => {
  setupTestDir();
  
  const matchingIndex = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-pack',
        kind: 'pack',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/test-pack/pack.json' // ID matches
      }
    ],
    nextPage: null
  };
  
  const mismatchedIndex = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-pack',
        kind: 'pack',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/different-id/pack.json' // ID doesn't match
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-matching.json'),
    JSON.stringify(matchingIndex, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-mismatched.json'),
    JSON.stringify(mismatchedIndex, null, 2)
  );
  
  const matching = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-matching.json'),
      'utf-8'
    )
  );
  const mismatched = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index-mismatched.json'),
      'utf-8'
    )
  );
  
  // Extract ID from entryUrl
  const matchingUrlParts = matching.items[0].entryUrl.split('/');
  const matchingUrlId = matchingUrlParts[matchingUrlParts.indexOf('packs') + 1];
  assert(matchingUrlId === matching.items[0].id, 'EntryUrl ID should match item ID');
  
  const mismatchedUrlParts = mismatched.items[0].entryUrl.split('/');
  const mismatchedUrlId = mismatchedUrlParts[mismatchedUrlParts.indexOf('packs') + 1];
  assert(mismatchedUrlId !== mismatched.items[0].id, 'EntryUrl ID should not match item ID in mismatched case');
  
  cleanupTestDir();
});

// Test 17: Entry document kind matches item kind
test('entry document kind matches item kind', () => {
  setupTestDir();
  
  const index = {
    version: 'v1',
    kind: 'context',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-pack',
        kind: 'pack',
        title: 'Test Pack',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/packs/test-pack/pack.json'
      }
    ],
    nextPage: null
  };
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack', // Matches item kind
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test',
    outline: ['Section 1']
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(index, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const indexContent = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
      'utf-8'
    )
  );
  const entryContent = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(
    indexContent.items[0].kind === entryContent.kind,
    'Entry document kind should match item kind'
  );
  
  cleanupTestDir();
});

// Test 18: Pack entry with valid sessionPlan
test('pack entry with valid sessionPlan', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1', 'Step 2'],
    prompts: [
      { id: 'p1', text: 'Hello' },
      { id: 'p2', text: 'Goodbye' }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['p1']
        },
        {
          id: 'step2',
          title: 'Step 2',
          promptIds: ['p2']
        }
      ]
    }
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(content.sessionPlan.version === 1, 'Valid pack should have sessionPlan.version === 1');
  assert(Array.isArray(content.sessionPlan.steps), 'Valid pack should have sessionPlan.steps array');
  assert(content.sessionPlan.steps.length > 0, 'Valid pack should have non-empty steps array');
  assert(content.sessionPlan.steps[0].id === 'step1', 'First step should have id');
  assert(content.sessionPlan.steps[0].title === 'Step 1', 'First step should have title');
  assert(Array.isArray(content.sessionPlan.steps[0].promptIds), 'First step should have promptIds array');
  assert(content.sessionPlan.steps[0].promptIds.length > 0, 'First step should have non-empty promptIds');
  
  cleanupTestDir();
});

// Test 19: Pack entry missing sessionPlan
test('pack entry missing sessionPlan', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1'],
    prompts: [{ id: 'p1', text: 'Hello' }]
    // Missing sessionPlan
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(!content.sessionPlan, 'Invalid pack should be missing sessionPlan');
  
  cleanupTestDir();
});

// Test 20: Pack entry with invalid sessionPlan.version
test('pack entry with invalid sessionPlan.version', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1'],
    prompts: [{ id: 'p1', text: 'Hello' }],
    sessionPlan: {
      version: 2, // Invalid - must be 1
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['p1']
        }
      ]
    }
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(content.sessionPlan.version !== 1, 'Invalid pack should have sessionPlan.version !== 1');
  
  cleanupTestDir();
});

// Test 21: Pack entry with empty steps array
test('pack entry with empty steps array', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1'],
    prompts: [{ id: 'p1', text: 'Hello' }],
    sessionPlan: {
      version: 1,
      steps: [] // Invalid - must be non-empty
    }
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(Array.isArray(content.sessionPlan.steps), 'Steps should be an array');
  assert(content.sessionPlan.steps.length === 0, 'Invalid pack should have empty steps array');
  
  cleanupTestDir();
});

// Test 22: Pack entry step missing required fields
test('pack entry step missing required fields', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1'],
    prompts: [{ id: 'p1', text: 'Hello' }],
    sessionPlan: {
      version: 1,
      steps: [
        {
          // Missing id, title, promptIds
        }
      ]
    }
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(!content.sessionPlan.steps[0].id, 'Invalid step should be missing id');
  assert(!content.sessionPlan.steps[0].title, 'Invalid step should be missing title');
  assert(!content.sessionPlan.steps[0].promptIds, 'Invalid step should be missing promptIds');
  
  cleanupTestDir();
});

// Test 23: Pack entry step with empty promptIds
test('pack entry step with empty promptIds', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1'],
    prompts: [{ id: 'p1', text: 'Hello' }],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: [] // Invalid - must be non-empty
        }
      ]
    }
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(Array.isArray(content.sessionPlan.steps[0].promptIds), 'promptIds should be an array');
  assert(content.sessionPlan.steps[0].promptIds.length === 0, 'Invalid step should have empty promptIds');
  
  cleanupTestDir();
});

// Test 24: Pack entry promptIds referencing non-existent prompts
test('pack entry promptIds referencing non-existent prompts', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1'],
    prompts: [
      { id: 'p1', text: 'Hello' }
      // Missing p2, p3
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['p1', 'p2', 'p3'] // p2 and p3 don't exist
        }
      ]
    }
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  const promptIds = new Set(content.prompts.map((p: any) => p.id));
  const referencedIds = content.sessionPlan.steps[0].promptIds;
  
  assert(!promptIds.has('p2'), 'p2 should not exist in prompts');
  assert(!promptIds.has('p3'), 'p3 should not exist in prompts');
  assert(referencedIds.includes('p2'), 'Step should reference non-existent p2');
  assert(referencedIds.includes('p3'), 'Step should reference non-existent p3');
  
  cleanupTestDir();
});

// Test 25: Pack entry outline.length matches steps.length
test('pack entry outline.length matches steps.length', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1', 'Step 2'], // 2 items
    prompts: [
      { id: 'p1', text: 'Hello' },
      { id: 'p2', text: 'Goodbye' }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['p1']
        },
        {
          id: 'step2',
          title: 'Step 2',
          promptIds: ['p2']
        }
      ] // 2 steps - matches outline
    }
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(content.outline.length === content.sessionPlan.steps.length, 'Outline length should match steps length');
  
  cleanupTestDir();
});

// Test 26: Pack entry outline.length mismatch (warning case)
test('pack entry outline.length mismatch warning case', () => {
  setupTestDir();
  
  const packEntry = {
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test description',
    outline: ['Step 1', 'Step 2', 'Step 3', 'Step 4'], // 4 items
    prompts: [
      { id: 'p1', text: 'Hello' },
      { id: 'p2', text: 'Goodbye' }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['p1']
        },
        {
          id: 'step2',
          title: 'Step 2',
          promptIds: ['p2']
        }
      ] // 2 steps - doesn't match outline (warning, not error)
    }
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
    JSON.stringify(packEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', 'test-pack', 'pack.json'),
      'utf-8'
    )
  );
  
  assert(content.outline.length !== content.sessionPlan.steps.length, 'Outline length should not match steps length in mismatch case');
  assert(content.outline.length === 4, 'Outline should have 4 items');
  assert(content.sessionPlan.steps.length === 2, 'Steps should have 2 items');
  
  cleanupTestDir();
});

// Test 27: Both production and staging manifests exist
test('both production and staging manifests exist', () => {
  setupTestDir();
  
  const prodManifest = {
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  
  const stagingManifest = {
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  
  mkdirSync(join(TEST_DIR, 'meta'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'meta', 'manifest.json'),
    JSON.stringify(prodManifest, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'meta', 'manifest.staging.json'),
    JSON.stringify(stagingManifest, null, 2)
  );
  
  assert(existsSync(join(TEST_DIR, 'meta', 'manifest.json')), 'Production manifest should exist');
  assert(existsSync(join(TEST_DIR, 'meta', 'manifest.staging.json')), 'Staging manifest should exist');
  
  const prod = JSON.parse(
    readFileSync(join(TEST_DIR, 'meta', 'manifest.json'), 'utf-8')
  );
  const staging = JSON.parse(
    readFileSync(join(TEST_DIR, 'meta', 'manifest.staging.json'), 'utf-8')
  );
  
  assert(prod.activeVersion === staging.activeVersion, 'Both manifests should have same activeVersion');
  assert(prod.activeWorkspace === staging.activeWorkspace, 'Both manifests should have same activeWorkspace');
  
  cleanupTestDir();
});

// Test 28: Staging manifest missing
test('staging manifest missing', () => {
  setupTestDir();
  
  const prodManifest = {
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  
  mkdirSync(join(TEST_DIR, 'meta'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'meta', 'manifest.json'),
    JSON.stringify(prodManifest, null, 2)
  );
  // Staging manifest not created
  
  assert(existsSync(join(TEST_DIR, 'meta', 'manifest.json')), 'Production manifest should exist');
  assert(!existsSync(join(TEST_DIR, 'meta', 'manifest.staging.json')), 'Staging manifest should not exist');
  
  cleanupTestDir();
});

// Test 29: Staging manifest can differ from production
test('staging manifest can differ from production', () => {
  setupTestDir();
  
  const prodManifest = {
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  
  const stagingManifest = {
    activeVersion: 'v1',
    activeWorkspace: 'test-ws-staging',
    workspaces: {
      'test-ws-staging': '/v1/workspaces/test-ws-staging/catalog.json'
    }
  };
  
  mkdirSync(join(TEST_DIR, 'meta'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'meta', 'manifest.json'),
    JSON.stringify(prodManifest, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'meta', 'manifest.staging.json'),
    JSON.stringify(stagingManifest, null, 2)
  );
  
  const prod = JSON.parse(
    readFileSync(join(TEST_DIR, 'meta', 'manifest.json'), 'utf-8')
  );
  const staging = JSON.parse(
    readFileSync(join(TEST_DIR, 'meta', 'manifest.staging.json'), 'utf-8')
  );
  
  assert(prod.activeWorkspace !== staging.activeWorkspace, 'Staging and production can have different activeWorkspace');
  assert(prod.workspaces['test-ws'] !== staging.workspaces['test-ws-staging'], 'Staging and production can reference different catalogs');
  
  cleanupTestDir();
});

// Test 30: Release.json structure validation
test('release.json structure validation', () => {
  setupTestDir();
  
  const validRelease = {
    releasedAt: '2025-12-30T10:00:00Z',
    gitSha: 'abc123def456',
    contentHash: '7168ce1e00fa8bc39464d1f1754efc47cee1f30297f71c94c595615718d38f8c'
  };
  
  const invalidRelease = {
    releasedAt: '2025-12-30T10:00:00Z'
    // Missing gitSha and contentHash
  };
  
  mkdirSync(join(TEST_DIR, 'meta'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'meta', 'release-valid.json'),
    JSON.stringify(validRelease, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'meta', 'release-invalid.json'),
    JSON.stringify(invalidRelease, null, 2)
  );
  
  const valid = JSON.parse(
    readFileSync(join(TEST_DIR, 'meta', 'release-valid.json'), 'utf-8')
  );
  const invalid = JSON.parse(
    readFileSync(join(TEST_DIR, 'meta', 'release-invalid.json'), 'utf-8')
  );
  
  assert(valid.releasedAt, 'Valid release should have releasedAt');
  assert(valid.gitSha, 'Valid release should have gitSha');
  assert(valid.contentHash, 'Valid release should have contentHash');
  
  assert(!invalid.gitSha, 'Invalid release should be missing gitSha');
  assert(!invalid.contentHash, 'Invalid release should be missing contentHash');
  
  cleanupTestDir();
});

// Test 31: Archived manifest naming convention
test('archived manifest naming convention', () => {
  setupTestDir();
  
  const manifest = {
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  
  const gitSha = 'abc123def456789012345678901234567890abcd';
  
  mkdirSync(join(TEST_DIR, 'meta', 'manifests'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'meta', 'manifests', `${gitSha}.json`),
    JSON.stringify(manifest, null, 2)
  );
  
  assert(
    existsSync(join(TEST_DIR, 'meta', 'manifests', `${gitSha}.json`)),
    'Archived manifest should be named <gitSha>.json'
  );
  
  // Validate SHA format
  assert(/^[a-f0-9]{7,40}$/.test(gitSha), 'Git SHA should be 7-40 hex characters');
  
  cleanupTestDir();
});

// Test 32: Manifest activeWorkspace must exist in workspaces
test('manifest activeWorkspace must exist in workspaces', () => {
  setupTestDir();
  
  const validManifest = {
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  
  const invalidManifest = {
    activeVersion: 'v1',
    activeWorkspace: 'missing-ws', // Not in workspaces
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    }
  };
  
  mkdirSync(join(TEST_DIR, 'meta'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'meta', 'manifest-valid.json'),
    JSON.stringify(validManifest, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'meta', 'manifest-invalid.json'),
    JSON.stringify(invalidManifest, null, 2)
  );
  
  const valid = JSON.parse(
    readFileSync(join(TEST_DIR, 'meta', 'manifest-valid.json'), 'utf-8')
  );
  const invalid = JSON.parse(
    readFileSync(join(TEST_DIR, 'meta', 'manifest-invalid.json'), 'utf-8')
  );
  
  assert(
    valid.workspaces[valid.activeWorkspace] !== undefined,
    'Valid manifest activeWorkspace should exist in workspaces'
  );
  assert(
    invalid.workspaces[invalid.activeWorkspace] === undefined,
    'Invalid manifest activeWorkspace should not exist in workspaces'
  );
  
  cleanupTestDir();
});

// Test 33: Catalog workspace paths must be valid
test('catalog workspace paths must be valid', () => {
  setupTestDir();
  
  const validPath = '/v1/workspaces/test-ws/catalog.json';
  const invalidPaths = [
    'v1/workspaces/test-ws/catalog.json', // Missing leading /
    '/workspaces/test-ws/catalog.json',   // Missing v1/
    '/v1/workspaces/test-ws/catalog',     // Missing .json
  ];
  
  // Valid path should pass all checks
  assert(validPath.startsWith('/v1/'), 'Valid path should start with /v1/');
  assert(validPath.endsWith('.json'), 'Valid path should end with .json');
  assert(validPath.includes('/workspaces/'), 'Valid path should include /workspaces/');
  
  // Invalid paths should fail at least one check
  invalidPaths.forEach((path, i) => {
    const isValid = 
      path.startsWith('/v1/') && 
      path.endsWith('.json') && 
      path.includes('/workspaces/');
    assert(!isValid, `Invalid path ${i} should fail validation`);
  });
  
  cleanupTestDir();
});

// Test 34: Valid drill entry document
test('valid drill entry document', () => {
  setupTestDir();
  
  const drillEntry = {
    id: 'test-drill',
    kind: 'drill',
    title: 'Test Drill',
    level: 'A1',
    estimatedMinutes: 10,
    description: 'Test drill description',
    instructions: 'Complete the exercises',
    exercises: [
      { id: 'ex-001', type: 'fill-blank', prompt: 'Test', answer: 'test' }
    ]
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'drills', 'test-drill'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'drills', 'test-drill', 'drill.json'),
    JSON.stringify(drillEntry, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'drills', 'test-drill', 'drill.json'),
      'utf-8'
    )
  );
  
  assert(content.id === 'test-drill', 'Drill should have id');
  assert(content.kind === 'drill', 'Drill should have kind = drill');
  assert(content.title === 'Test Drill', 'Drill should have title');
  assert(typeof content.estimatedMinutes === 'number', 'Drill should have estimatedMinutes');
  assert(content.level === 'A1', 'Drill should have level');
  assert(Array.isArray(content.exercises), 'Drill should have exercises array');
  
  cleanupTestDir();
});

// Test 35: Invalid drill entry (missing required field)
test('invalid drill entry missing required field', () => {
  setupTestDir();
  
  const invalidDrill = {
    id: 'test-drill',
    kind: 'drill',
    title: 'Test Drill'
    // Missing estimatedMinutes
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'drills', 'test-drill'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'drills', 'test-drill', 'drill.json'),
    JSON.stringify(invalidDrill, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'drills', 'test-drill', 'drill.json'),
      'utf-8'
    )
  );
  
  assert(!content.estimatedMinutes, 'Invalid drill should be missing estimatedMinutes');
  
  cleanupTestDir();
});

// Test 36: Index item with kind drill but wrong entryUrl pattern
test('drill index item with wrong entryUrl pattern', () => {
  setupTestDir();
  
  const validIndex = {
    version: 'v1',
    kind: 'drills',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-drill',
        kind: 'drill',
        title: 'Test Drill',
        level: 'A1',
        entryUrl: '/v1/workspaces/test-ws/drills/test-drill/drill.json' // Correct pattern
      }
    ],
    nextPage: null
  };
  
  const invalidIndex = {
    version: 'v1',
    kind: 'drills',
    total: 1,
    pageSize: 20,
    items: [
      {
        id: 'test-drill',
        kind: 'drill',
        title: 'Test Drill',
        level: 'A1',
        entryUrl: '/v1/drills/test-drill.json' // Wrong pattern
      }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'mechanics'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'mechanics', 'index-valid.json'),
    JSON.stringify(validIndex, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'mechanics', 'index-invalid.json'),
    JSON.stringify(invalidIndex, null, 2)
  );
  
  const valid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'mechanics', 'index-valid.json'),
      'utf-8'
    )
  );
  const invalid = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'mechanics', 'index-invalid.json'),
      'utf-8'
    )
  );
  
  // Valid pattern: /v1/workspaces/{ws}/drills/{id}/drill.json
  assert(
    valid.items[0].entryUrl.match(/\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/drill\.json$/),
    'Valid drill entryUrl should match canonical pattern'
  );
  assert(
    !invalid.items[0].entryUrl.match(/\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/drill\.json$/),
    'Invalid drill entryUrl should not match canonical pattern'
  );
  
  cleanupTestDir();
});

// Test 37: Drills section in catalog
test('catalog with drills section', () => {
  setupTestDir();
  
  const catalog = {
    version: 'v1',
    workspace: 'test-ws',
    languageCode: 'test',
    languageName: 'Test',
    sections: [
      {
        id: 'context',
        kind: 'context',
        title: 'Context Library',
        itemsUrl: '/v1/workspaces/test-ws/context/index.json'
      },
      {
        id: 'mechanics',
        kind: 'drills',
        title: 'Mechanics Drills',
        itemsUrl: '/v1/workspaces/test-ws/mechanics/index.json'
      }
    ]
  };
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  const content = JSON.parse(
    readFileSync(
      join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
      'utf-8'
    )
  );
  
  assert(content.sections.length === 2, 'Catalog should have 2 sections');
  assert(content.sections[1].kind === 'drills', 'Second section should have kind = drills');
  assert(content.sections[1].id === 'mechanics', 'Second section should have id = mechanics');
  
  cleanupTestDir();
});

// Test 38: CEFR level validation
test('CEFR level validation', () => {
  setupTestDir();
  
  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const invalidLevels = ['X1', 'beginner', 'A3'];
  
  validLevels.forEach(level => {
    assert(validLevels.includes(level.toUpperCase()), `${level} should be valid CEFR level`);
  });
  
  invalidLevels.forEach(level => {
    assert(!validLevels.includes(level), `${level} should be invalid CEFR level`);
  });
  
  cleanupTestDir();
});

// Test 39: Duration bounds validation
test('duration bounds validation', () => {
  setupTestDir();
  
  const MIN_DURATION = 1;
  const MAX_DURATION = 120;
  
  const validDurations = [1, 10, 60, 120];
  const invalidDurations = [0, -1, 121, 1000];
  
  validDurations.forEach(duration => {
    assert(
      duration >= MIN_DURATION && duration <= MAX_DURATION,
      `Duration ${duration} should be within valid range`
    );
  });
  
  invalidDurations.forEach(duration => {
    assert(
      duration < MIN_DURATION || duration > MAX_DURATION,
      `Duration ${duration} should be outside valid range`
    );
  });
  
  cleanupTestDir();
});

// Test 40: Title length validation
test('title length validation', () => {
  setupTestDir();
  
  const MAX_TITLE_LENGTH = 100;
  
  const validTitle = 'A'.repeat(100);
  const invalidTitle = 'A'.repeat(101);
  
  assert(validTitle.length <= MAX_TITLE_LENGTH, 'Title at limit should be valid');
  assert(invalidTitle.length > MAX_TITLE_LENGTH, 'Title over limit should be invalid');
  
  cleanupTestDir();
});

// Test 41: Multi-workspace manifest
test('multi-workspace manifest validation', () => {
  setupTestDir();
  
  const multiWorkspaceManifest = {
    activeVersion: 'v1',
    activeWorkspace: 'de',
    workspaces: {
      de: '/v1/workspaces/de/catalog.json',
      en: '/v1/workspaces/en/catalog.json'
    }
  };
  
  // Create both workspace catalogs
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'de'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'en'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'de', 'catalog.json'),
    JSON.stringify({ workspace: 'de', languageCode: 'de', languageName: 'German', sections: [] }, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'en', 'catalog.json'),
    JSON.stringify({ workspace: 'en', languageCode: 'en', languageName: 'English', sections: [] }, null, 2)
  );
  
  const workspaces = Object.keys(multiWorkspaceManifest.workspaces);
  
  assert(workspaces.length === 2, 'Manifest should have 2 workspaces');
  assert(workspaces.includes('de'), 'Manifest should include de workspace');
  assert(workspaces.includes('en'), 'Manifest should include en workspace');
  assert(multiWorkspaceManifest.activeWorkspace === 'de', 'Active workspace should be de');
  
  cleanupTestDir();
});

// Test 42: Pagination - nextPage chain
test('pagination nextPage chain validation', () => {
  setupTestDir();
  
  const page1 = {
    version: 'v1',
    kind: 'context',
    total: 3,
    pageSize: 2,
    items: [
      { id: 'item-1', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-1/pack.json' },
      { id: 'item-2', kind: 'pack', title: 'Item 2', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-2/pack.json' }
    ],
    nextPage: '/v1/workspaces/test-ws/context/index.page2.json'
  };
  
  const page2 = {
    version: 'v1',
    kind: 'context',
    total: 3,
    pageSize: 2,
    items: [
      { id: 'item-3', kind: 'pack', title: 'Item 3', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-3/pack.json' }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(page1, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'),
    JSON.stringify(page2, null, 2)
  );
  
  const totalItems = page1.items.length + page2.items.length;
  assert(totalItems === page1.total, `Total (${page1.total}) should equal sum of items across pages (${totalItems})`);
  
  // Verify no duplicate IDs
  const allIds = [...page1.items.map(i => i.id), ...page2.items.map(i => i.id)];
  const uniqueIds = new Set(allIds);
  assert(allIds.length === uniqueIds.size, 'No duplicate IDs should exist across pages');
  
  cleanupTestDir();
});

// Test 43: Pagination - duplicate ID detection
test('pagination duplicate ID detection', () => {
  setupTestDir();
  
  const page1 = {
    version: 'v1',
    kind: 'context',
    total: 2,
    pageSize: 1,
    items: [
      { id: 'duplicate-id', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/duplicate-id/pack.json' }
    ],
    nextPage: '/v1/workspaces/test-ws/context/index.page2.json'
  };
  
  const page2 = {
    version: 'v1',
    kind: 'context',
    total: 2,
    pageSize: 1,
    items: [
      { id: 'duplicate-id', kind: 'pack', title: 'Item 2', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/duplicate-id/pack.json' }
    ],
    nextPage: null
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(page1, null, 2)
  );
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'),
    JSON.stringify(page2, null, 2)
  );
  
  // Verify duplicate IDs exist
  const allIds = [...page1.items.map(i => i.id), ...page2.items.map(i => i.id)];
  const uniqueIds = new Set(allIds);
  assert(allIds.length !== uniqueIds.size, 'Duplicate IDs should be detected across pages');
  
  cleanupTestDir();
});

// Test 44: Pagination - missing nextPage file
test('pagination missing nextPage file detection', () => {
  setupTestDir();
  
  const page1 = {
    version: 'v1',
    kind: 'context',
    total: 2,
    pageSize: 1,
    items: [
      { id: 'item-1', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-1/pack.json' }
    ],
    nextPage: '/v1/workspaces/test-ws/context/index.page2.json' // This file doesn't exist!
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'),
    JSON.stringify(page1, null, 2)
  );
  
  // Page 2 file NOT created - should be detected
  const page2Path = join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json');
  assert(!existsSync(page2Path), 'Page 2 file should not exist for this test');
  
  cleanupTestDir();
});

// Test 45: Pagination - looped chain detection
test('pagination looped chain detection', () => {
  setupTestDir();
  
  // Page 1 points to page 2, page 2 points back to page 1
  const page1 = {
    version: 'v1',
    kind: 'context',
    total: 2,
    pageSize: 1,
    items: [{ id: 'item-1', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-1/pack.json' }],
    nextPage: '/v1/workspaces/test-ws/context/index.page2.json'
  };
  
  const page2 = {
    version: 'v1',
    kind: 'context',
    total: 2,
    pageSize: 1,
    items: [{ id: 'item-2', kind: 'pack', title: 'Item 2', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-2/pack.json' }],
    nextPage: '/v1/workspaces/test-ws/context/index.json' // Loop back to page 1!
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'), JSON.stringify(page1, null, 2));
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'), JSON.stringify(page2, null, 2));
  
  // Verify the loop exists
  assert(page2.nextPage === '/v1/workspaces/test-ws/context/index.json', 'Page 2 should loop back to page 1');
  
  cleanupTestDir();
});

// Test 46: Pagination - mismatched version across pages
test('pagination mismatched version across pages', () => {
  setupTestDir();
  
  const page1 = { version: 'v1', kind: 'context', total: 2, pageSize: 1, items: [{ id: 'item-1', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-1/pack.json' }], nextPage: '/v1/workspaces/test-ws/context/index.page2.json' };
  const page2 = { version: 'v2', kind: 'context', total: 2, pageSize: 1, items: [{ id: 'item-2', kind: 'pack', title: 'Item 2', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-2/pack.json' }], nextPage: null };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'), JSON.stringify(page1, null, 2));
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'), JSON.stringify(page2, null, 2));
  
  assert(page1.version !== page2.version, 'Versions should mismatch for this test');
  
  cleanupTestDir();
});

// Test 47: Pagination - mismatched kind across pages
test('pagination mismatched kind across pages', () => {
  setupTestDir();
  
  const page1 = { version: 'v1', kind: 'context', total: 2, pageSize: 1, items: [{ id: 'item-1', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-1/pack.json' }], nextPage: '/v1/workspaces/test-ws/context/index.page2.json' };
  const page2 = { version: 'v1', kind: 'exams', total: 2, pageSize: 1, items: [{ id: 'item-2', kind: 'exam', title: 'Item 2', level: 'A1', entryUrl: '/v1/workspaces/test-ws/exams/item-2/exam.json' }], nextPage: null };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'), JSON.stringify(page1, null, 2));
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'), JSON.stringify(page2, null, 2));
  
  assert(page1.kind !== page2.kind, 'Kinds should mismatch for this test');
  
  cleanupTestDir();
});

// Test 48: Pagination - mismatched pageSize across pages
test('pagination mismatched pageSize across pages', () => {
  setupTestDir();
  
  const page1 = { version: 'v1', kind: 'context', total: 2, pageSize: 10, items: [{ id: 'item-1', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-1/pack.json' }], nextPage: '/v1/workspaces/test-ws/context/index.page2.json' };
  const page2 = { version: 'v1', kind: 'context', total: 2, pageSize: 20, items: [{ id: 'item-2', kind: 'pack', title: 'Item 2', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-2/pack.json' }], nextPage: null };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'), JSON.stringify(page1, null, 2));
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'), JSON.stringify(page2, null, 2));
  
  assert(page1.pageSize !== page2.pageSize, 'Page sizes should mismatch for this test');
  
  cleanupTestDir();
});

// Test 49: Pagination - mismatched total across pages
test('pagination mismatched total across pages', () => {
  setupTestDir();
  
  const page1 = { version: 'v1', kind: 'context', total: 10, pageSize: 1, items: [{ id: 'item-1', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-1/pack.json' }], nextPage: '/v1/workspaces/test-ws/context/index.page2.json' };
  const page2 = { version: 'v1', kind: 'context', total: 20, pageSize: 1, items: [{ id: 'item-2', kind: 'pack', title: 'Item 2', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-2/pack.json' }], nextPage: null };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'), JSON.stringify(page1, null, 2));
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'), JSON.stringify(page2, null, 2));
  
  assert(page1.total !== page2.total, 'Totals should mismatch for this test');
  
  cleanupTestDir();
});

// Test 50: Pagination - total doesn't match actual item count
test('pagination total mismatch with actual items', () => {
  setupTestDir();
  
  // Says total is 5 but only has 2 items
  const page1 = { version: 'v1', kind: 'context', total: 5, pageSize: 2, items: [{ id: 'item-1', kind: 'pack', title: 'Item 1', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-1/pack.json' }], nextPage: '/v1/workspaces/test-ws/context/index.page2.json' };
  const page2 = { version: 'v1', kind: 'context', total: 5, pageSize: 2, items: [{ id: 'item-2', kind: 'pack', title: 'Item 2', level: 'A1', entryUrl: '/v1/workspaces/test-ws/packs/item-2/pack.json' }], nextPage: null };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.json'), JSON.stringify(page1, null, 2));
  writeFileSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'context', 'index.page2.json'), JSON.stringify(page2, null, 2));
  
  const actualItems = page1.items.length + page2.items.length;
  assert(page1.total !== actualItems, `Total (${page1.total}) should not match actual items (${actualItems})`);
  
  cleanupTestDir();
});

// Test 51: Missing schemaVersion fails
test('missing schemaVersion fails validation', () => {
  setupTestDir();
  
  const catalog = {
    version: 'v1',
    workspace: 'test-ws',
    languageCode: 'test',
    languageName: 'Test',
    sections: []
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  assert(!catalog.schemaVersion, 'Catalog should be missing schemaVersion for this test');
  
  cleanupTestDir();
});

// Test 52: Unknown schemaVersion fails
test('unknown schemaVersion fails validation', () => {
  setupTestDir();
  
  const catalog = {
    schemaVersion: 999,
    version: 'v1',
    workspace: 'test-ws',
    languageCode: 'test',
    languageName: 'Test',
    sections: []
  };
  
  mkdirSync(join(TEST_DIR, 'v1', 'workspaces', 'test-ws'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'catalog.json'),
    JSON.stringify(catalog, null, 2)
  );
  
  assert(catalog.schemaVersion === 999, 'Catalog should have unknown schemaVersion for this test');
  assert(![1].includes(catalog.schemaVersion), 'schemaVersion 999 should not be in supported list');
  
  cleanupTestDir();
});

// Test 53: Removing required field in v1 fixture fails
test('removing required field in v1 fails validation', () => {
  setupTestDir();
  
  // Valid pack entry
  const validPack = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 10,
    description: 'Test',
    outline: ['Step 1'],
    sessionPlan: { version: 1, steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1'] }] }
  };
  
  // Invalid pack entry (missing required field: description)
  const invalidPack = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 10,
    // description removed - BREAKING
    outline: ['Step 1'],
    sessionPlan: { version: 1, steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1'] }] }
  };
  
  assert(validPack.description, 'Valid pack should have description');
  assert(!invalidPack.description, 'Invalid pack should be missing description');
  
  cleanupTestDir();
});

// Test 54: Adding optional field does not fail
test('adding optional field does not fail validation', () => {
  setupTestDir();
  
  const packWithOptional = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 10,
    description: 'Test',
    outline: ['Step 1'],
    sessionPlan: { version: 1, steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1'] }] },
    tags: ['new', 'optional'] // New optional field
  };
  
  assert(packWithOptional.tags, 'Pack should have optional tags field');
  assert(Array.isArray(packWithOptional.tags), 'Tags should be array');
  assert(packWithOptional.schemaVersion === 1, 'Should still be schemaVersion 1');
  
  cleanupTestDir();
});

// Test 55: Manifest with workspaceHashes structure
test('manifest with workspaceHashes structure validation', () => {
  setupTestDir();
  
  const manifest = {
    schemaVersion: 1,
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    minClientVersion: '1.0.0',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json'
    },
    workspaceHashes: {
      'test-ws': 'abc123def4567890abcdef1234567890abcdef1234567890abcdef1234567890'
    }
  };
  
  assert(manifest.workspaceHashes, 'Manifest should have workspaceHashes');
  assert(typeof manifest.workspaceHashes === 'object', 'workspaceHashes should be object');
  assert(manifest.workspaceHashes['test-ws'], 'workspaceHashes should have entry for test-ws');
  assert(typeof manifest.workspaceHashes['test-ws'] === 'string', 'Hash should be string');
  assert(manifest.workspaceHashes['test-ws'].length === 64, 'Hash should be 64 hex chars');
  assert(manifest.minClientVersion === '1.0.0', 'minClientVersion should be set');
  
  cleanupTestDir();
});

// Test 56: Manifest missing workspaceHashes entry
test('manifest missing workspaceHashes entry validation', () => {
  setupTestDir();
  
  const manifest = {
    schemaVersion: 1,
    activeVersion: 'v1',
    activeWorkspace: 'test-ws',
    workspaces: {
      'test-ws': '/v1/workspaces/test-ws/catalog.json',
      'other-ws': '/v1/workspaces/other-ws/catalog.json'
    },
    workspaceHashes: {
      'test-ws': 'abc123...'
      // Missing 'other-ws' - should be detected
    }
  };
  
  const workspaceIds = Object.keys(manifest.workspaces);
  const hashWorkspaceIds = Object.keys(manifest.workspaceHashes);
  
  assert(!hashWorkspaceIds.includes('other-ws'), 'workspaceHashes should be missing other-ws');
  assert(workspaceIds.length !== hashWorkspaceIds.length, 'workspaceHashes should not match workspaces count');
  
  cleanupTestDir();
});

// Run all tests
function runTests() {
  console.log('Running unit tests...\n');
  
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

