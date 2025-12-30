#!/usr/bin/env tsx

/**
 * Unit tests for telemetry validation
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const EXPORTS_DIR = join(__dirname, '..', 'exports', 'analytics');
const TEST_DIR = join(__dirname, '..', 'tmp', 'telemetry-test');

// Import validation functions (we'll need to extract them or test via CLI)
// For now, we'll test by creating fixture events and running the validator

interface TestCase {
  name: string;
  events: any[];
  shouldPass: boolean;
  expectedErrors?: string[];
}

const testCases: TestCase[] = [
  {
    name: 'valid session flow',
    shouldPass: true,
    events: [
      {
        eventVersion: 1,
        eventName: 'content_session_started',
        occurredAt: '2025-01-15T10:30:00.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1',
        scenario: 'shopping',
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb']
      },
      {
        eventVersion: 1,
        eventName: 'content_step_started',
        occurredAt: '2025-01-15T10:30:05.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1',
        scenario: 'shopping',
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb'],
        stepId: 'step-1'
      },
      {
        eventVersion: 1,
        eventName: 'content_prompt_attempted',
        occurredAt: '2025-01-15T10:30:10.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1',
        scenario: 'shopping',
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb'],
        stepId: 'step-1',
        promptId: 'prompt-1',
        attemptIndex: 1
      },
      {
        eventVersion: 1,
        eventName: 'content_prompt_result',
        occurredAt: '2025-01-15T10:30:15.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1',
        scenario: 'shopping',
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb'],
        stepId: 'step-1',
        promptId: 'prompt-1',
        attemptIndex: 1,
        result: 'pass'
      },
      {
        eventVersion: 1,
        eventName: 'content_session_completed',
        occurredAt: '2025-01-15T10:30:20.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1',
        scenario: 'shopping',
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb']
      }
    ]
  },
  {
    name: 'missing required field',
    shouldPass: false,
    expectedErrors: ['Missing required field'],
    events: [
      {
        eventVersion: 1,
        eventName: 'content_session_started',
        occurredAt: '2025-01-15T10:30:00.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        // Missing contentId
        level: 'A1'
      }
    ]
  },
  {
    name: 'invalid eventName',
    shouldPass: false,
    expectedErrors: ['Invalid eventName'],
    events: [
      {
        eventVersion: 1,
        eventName: 'invalid_event',
        occurredAt: '2025-01-15T10:30:00.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1'
      }
    ]
  },
  {
    name: 'invalid level enum',
    shouldPass: false,
    expectedErrors: ['Invalid level'],
    events: [
      {
        eventVersion: 1,
        eventName: 'content_session_started',
        occurredAt: '2025-01-15T10:30:00.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'X1' // Invalid
      }
    ]
  },
  {
    name: 'non-monotonic timestamps',
    shouldPass: false,
    expectedErrors: ['Timestamp not monotonic'],
    events: [
      {
        eventVersion: 1,
        eventName: 'content_session_started',
        occurredAt: '2025-01-15T10:30:00.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1'
      },
      {
        eventVersion: 1,
        eventName: 'content_session_completed',
        occurredAt: '2025-01-15T10:29:00.000Z', // Earlier than start
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1'
      }
    ]
  },
  {
    name: 'invalid attemptIndex sequence',
    shouldPass: false,
    expectedErrors: ['Invalid attemptIndex'],
    events: [
      {
        eventVersion: 1,
        eventName: 'content_session_started',
        occurredAt: '2025-01-15T10:30:00.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1'
      },
      {
        eventVersion: 1,
        eventName: 'content_prompt_attempted',
        occurredAt: '2025-01-15T10:30:05.000Z',
        deviceSessionId: 'device-1',
        appSessionId: 'session-1',
        workspace: 'de',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        kind: 'pack',
        contentId: 'test_pack',
        level: 'A1',
        stepId: 'step-1',
        promptId: 'prompt-1',
        attemptIndex: 2 // Should start at 1
      }
    ]
  }
];

/**
 * Setup test fixtures
 */
function setupTestFixtures() {
  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  
  // Create minimal content dimension (we'll skip join key validation in tests)
  if (!existsSync(EXPORTS_DIR)) {
    mkdirSync(EXPORTS_DIR, { recursive: true });
  }
  
  const gitSha = 'test-sha';
  const dimensionPath = join(EXPORTS_DIR, `content-dimension.${gitSha}.json`);
  
  const dimension = {
    version: 'v1',
    generatedAt: new Date().toISOString(),
    gitSha,
    workspace: 'de',
    totalItems: 1,
    items: [
      {
        workspace: 'de',
        kind: 'pack',
        contentId: 'test_pack',
        entryUrl: '/v1/workspaces/de/packs/test_pack/pack.json',
        title: 'Test Pack',
        level: 'A1',
        scenario: 'shopping',
        register: null,
        primaryStructure: 'verb_position',
        variationSlots: ['subject', 'verb'],
        promptCount: 1,
        stepCount: 1,
        estimatedMinutes: 15
      }
    ]
  };
  
  writeFileSync(dimensionPath, JSON.stringify(dimension, null, 2), 'utf-8');
}

/**
 * Run validator on test events
 */
function runValidator(eventsPath: string, workspace: string): { exitCode: number; output: string } {
  try {
    const output = execSync(
      `npm run telemetry:validate -- --events ${eventsPath} --workspace ${workspace}`,
      { encoding: 'utf-8', cwd: join(__dirname, '..') }
    );
    return { exitCode: 0, output };
  } catch (err: any) {
    return { exitCode: err.status || 1, output: err.stdout || err.stderr || err.message };
  }
}

/**
 * Run tests
 */
function runTests() {
  console.log('🧪 Running telemetry validation tests...\n');
  
  setupTestFixtures();
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const eventsPath = join(TEST_DIR, `${testCase.name.replace(/\s+/g, '_')}.ndjson`);
    const eventsNdjson = testCase.events.map(e => JSON.stringify(e)).join('\n');
    writeFileSync(eventsPath, eventsNdjson, 'utf-8');
    
    const result = runValidator(eventsPath, 'de');
    const didPass = result.exitCode === 0;
    const shouldPass = testCase.shouldPass;
    
    if (didPass === shouldPass) {
      // Check expected errors if specified
      if (testCase.expectedErrors && !shouldPass) {
        const hasExpectedError = testCase.expectedErrors.some(err => 
          result.output.includes(err)
        );
        if (!hasExpectedError) {
          console.log(`❌ ${testCase.name}: Expected error not found`);
          console.log(`   Output: ${result.output.substring(0, 200)}`);
          failed++;
          continue;
        }
      }
      
      console.log(`✅ ${testCase.name}`);
      passed++;
    } else {
      console.log(`❌ ${testCase.name}: Expected ${shouldPass ? 'pass' : 'fail'}, got ${didPass ? 'pass' : 'fail'}`);
      if (!shouldPass) {
        console.log(`   Output: ${result.output.substring(0, 300)}`);
      }
      failed++;
    }
  }
  
  // Cleanup
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

