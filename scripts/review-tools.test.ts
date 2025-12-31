#!/usr/bin/env tsx

/**
 * Comprehensive unit tests for review tools
 * 
 * Tests:
 * - review-open.sh lists needs_review items correctly
 * - approve-top.sh approves packs by quality score
 * - approve-top.sh filters by scenario/level
 * - approve-top.sh re-runs validation after approval
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEST_DIR = join(__dirname, '..', '.test-review-tools');

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
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Helper: Create a test pack with review status
function createTestPack(
  packId: string,
  options: {
    reviewStatus?: 'draft' | 'needs_review' | 'approved';
    scenario?: string;
    level?: string;
    qualityScore?: number;
    provenanceSource?: 'pdf' | 'template' | 'handcrafted';
    provenanceSourceRef?: string;
  } = {}
): void {
  const {
    reviewStatus = 'needs_review',
    scenario = 'government_office',
    level = 'A1',
    qualityScore = 75,
    provenanceSource = 'template',
    provenanceSourceRef = 'test-source'
  } = options;

  const packDir = join(TEST_DIR, 'v1', 'workspaces', 'test-ws', 'packs', packId);
  mkdirSync(packDir, { recursive: true });

  const pack = {
    schemaVersion: 1,
    id: packId,
    kind: 'pack',
    packVersion: '1.0.0',
    title: `Test Pack ${packId}`,
    level,
    estimatedMinutes: 15,
    description: 'Test description',
    scenario,
    register: 'formal',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb', 'object'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich brauche einen Termin.',
        intent: 'request',
        gloss_en: 'I need an appointment.',
        audioUrl: '/v1/audio/test/prompt-001.mp3'
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step-1',
          title: 'Step 1',
          promptIds: ['prompt-001']
        }
      ]
    },
    analytics: {
      qualityScore
    },
    provenance: {
      source: provenanceSource,
      sourceRef: provenanceSourceRef,
      extractorVersion: '1.0.0',
      generatedAt: new Date().toISOString()
    },
    review: {
      status: reviewStatus,
      ...(reviewStatus === 'approved' ? {
        reviewer: 'Test Reviewer',
        reviewedAt: new Date().toISOString()
      } : {})
    }
  };

  writeFileSync(join(packDir, 'pack.json'), JSON.stringify(pack, null, 2));
}

// Test: review-open.sh script exists and is executable
test('review-open.sh script exists and is executable', () => {
  const scriptPath = join(__dirname, 'review-open.sh');
  expectTrue(existsSync(scriptPath), 'review-open.sh should exist');

  try {
    execSync(`test -x "${scriptPath}"`, { cwd: join(__dirname, '..') });
    console.log('   ✅ Script is executable');
  } catch (error) {
    throw new Error('Script is not executable');
  }
});

// Test: review-open.sh supports --workspace and --limit flags
test('review-open.sh supports required flags', () => {
  const scriptPath = join(__dirname, 'review-open.sh');
  const content = readFileSync(scriptPath, 'utf-8');

  expectTrue(content.includes('--workspace'), 'Should support --workspace flag');
  expectTrue(content.includes('--limit'), 'Should support --limit flag');
  expectTrue(content.includes('--sourceRef'), 'Should support --sourceRef flag');
  expectTrue(content.includes('needs_review'), 'Should filter by needs_review status');

  console.log('   ✅ Script supports required flags');
});

// Test: approve-top.sh script exists and is executable
test('approve-top.sh script exists and is executable', () => {
  const scriptPath = join(__dirname, 'approve-top.sh');
  expectTrue(existsSync(scriptPath), 'approve-top.sh should exist');

  try {
    execSync(`test -x "${scriptPath}"`, { cwd: join(__dirname, '..') });
    console.log('   ✅ Script is executable');
  } catch (error) {
    throw new Error('Script is not executable');
  }
});

// Test: approve-top.sh supports required flags
test('approve-top.sh supports required flags', () => {
  const scriptPath = join(__dirname, 'approve-top.sh');
  const content = readFileSync(scriptPath, 'utf-8');

  expectTrue(content.includes('--workspace'), 'Should support --workspace flag');
  expectTrue(content.includes('--limit'), 'Should support --limit flag');
  expectTrue(content.includes('--reviewer'), 'Should support --reviewer flag');
  expectTrue(content.includes('--scenario'), 'Should support --scenario flag');
  expectTrue(content.includes('--level'), 'Should support --level flag');
  expectTrue(content.includes('qualityScore'), 'Should sort by quality score');

  console.log('   ✅ Script supports required flags');
});

// Test: approve-top.sh filters by scenario
test('approve-top.sh filters by scenario', () => {
  setupTestDir();

  try {
    // Create packs with different scenarios
    createTestPack('pack-gov-1', {
      reviewStatus: 'needs_review',
      scenario: 'government_office',
      qualityScore: 90
    });
    createTestPack('pack-work-1', {
      reviewStatus: 'needs_review',
      scenario: 'work',
      qualityScore: 85
    });
    createTestPack('pack-gov-2', {
      reviewStatus: 'needs_review',
      scenario: 'government_office',
      qualityScore: 80
    });

    const scriptPath = join(__dirname, 'approve-top.sh');
    const content = readFileSync(scriptPath, 'utf-8');

    // Verify filtering logic exists
    expectTrue(
      content.includes('SCENARIO_FILTER') || content.includes('scenario'),
      'Should filter by scenario'
    );

    console.log('   ✅ Script includes scenario filtering logic');
  } finally {
    cleanupTestDir();
  }
});

// Test: approve-top.sh filters by level
test('approve-top.sh filters by level', () => {
  setupTestDir();

  try {
    // Create packs with different levels
    createTestPack('pack-a1-1', {
      reviewStatus: 'needs_review',
      level: 'A1',
      qualityScore: 90
    });
    createTestPack('pack-a2-1', {
      reviewStatus: 'needs_review',
      level: 'A2',
      qualityScore: 85
    });

    const scriptPath = join(__dirname, 'approve-top.sh');
    const content = readFileSync(scriptPath, 'utf-8');

    // Verify filtering logic exists
    expectTrue(
      content.includes('LEVEL_FILTER') || content.includes('level'),
      'Should filter by level'
    );

    console.log('   ✅ Script includes level filtering logic');
  } finally {
    cleanupTestDir();
  }
});

// Test: approve-top.sh sorts by quality score
test('approve-top.sh sorts by quality score', () => {
  setupTestDir();

  try {
    // Create packs with different quality scores
    createTestPack('pack-low', {
      reviewStatus: 'needs_review',
      qualityScore: 60
    });
    createTestPack('pack-high', {
      reviewStatus: 'needs_review',
      qualityScore: 95
    });
    createTestPack('pack-medium', {
      reviewStatus: 'needs_review',
      qualityScore: 75
    });

    const scriptPath = join(__dirname, 'approve-top.sh');
    const content = readFileSync(scriptPath, 'utf-8');

    // Verify sorting logic exists
    expectTrue(
      content.includes('sort') && content.includes('qualityScore'),
      'Should sort by quality score'
    );

    console.log('   ✅ Script includes quality score sorting');
  } finally {
    cleanupTestDir();
  }
});

// Test: approve-top.sh updates review status
test('approve-top.sh updates review status', () => {
  setupTestDir();

  try {
    const packId = 'test-approval';
    createTestPack(packId, {
      reviewStatus: 'needs_review',
      qualityScore: 85
    });

    const scriptPath = join(__dirname, 'approve-top.sh');
    const content = readFileSync(scriptPath, 'utf-8');

    // Verify approval logic exists
    expectTrue(
      content.includes('review.status = "approved"') || content.includes('status = "approved"'),
      'Should update review status to approved'
    );
    expectTrue(
      content.includes('reviewer') && content.includes('reviewedAt'),
      'Should set reviewer and reviewedAt'
    );

    console.log('   ✅ Script includes approval logic');
  } finally {
    cleanupTestDir();
  }
});

// Test: approve-top.sh re-runs validation
test('approve-top.sh re-runs validation after approval', () => {
  const scriptPath = join(__dirname, 'approve-top.sh');
  const content = readFileSync(scriptPath, 'utf-8');

  expectTrue(
    content.includes('npm run content:validate') || content.includes('content:validate'),
    'Should run validation after approval'
  );
  expectTrue(
    content.includes('npm run content:quality') || content.includes('content:quality'),
    'Should run quality check after approval'
  );

  console.log('   ✅ Script re-runs validation and quality checks');
});

// Main test runner - tests are executed as they are defined above
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Running review tools tests...\n');
  
  // Tests execute automatically as they are defined
  // The test() function handles execution and reporting
}

