#!/usr/bin/env tsx

/**
 * Review Content Tests
 * 
 * Tests for review harness rules:
 * - TODO detection in analytics
 * - Generic goal denylist
 * - Required metadata fields
 * - Session plan validation
 * - Prompt completeness
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEST_DIR = join(__dirname, '..', '.test-review');

let testCleanup: string[] = [];

function cleanup() {
  for (const path of testCleanup) {
    try {
      if (existsSync(path)) {
        if (path.endsWith('.json')) {
          rmSync(path);
        } else {
          rmSync(path, { recursive: true, force: true });
        }
      }
    } catch {}
  }
  testCleanup = [];
}

process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        console.log(`✅ ${name}`);
      }).catch(err => {
        console.error(`❌ ${name}: ${err.message}`);
        process.exit(1);
      });
    } else {
      console.log(`✅ ${name}`);
    }
  } catch (err: any) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  }
}

// Setup test directory
if (!existsSync(TEST_DIR)) {
  mkdirSync(TEST_DIR, { recursive: true });
  testCleanup.push(TEST_DIR);
}

const TEST_WORKSPACE = join(TEST_DIR, 'workspaces', 'test');
const TEST_PACKS_DIR = join(TEST_WORKSPACE, 'packs');

function createTestPack(packId: string, packData: any): string {
  const packDir = join(TEST_PACKS_DIR, packId);
  if (!existsSync(packDir)) {
    mkdirSync(packDir, { recursive: true });
  }
  const packPath = join(packDir, 'pack.json');
  writeFileSync(packPath, JSON.stringify(packData, null, 2));
  testCleanup.push(packPath);
  return packPath;
}

function runReview(workspace: string = 'test'): { success: boolean; output: string } {
  try {
    // Temporarily override CONTENT_DIR in the script
    const scriptPath = join(__dirname, 'review-content.ts');
    const output = execSync(
      `cd "${__dirname}/.." && CONTENT_DIR="${TEST_DIR}" tsx "${scriptPath}" --workspace ${workspace}`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: error.stdout || error.message };
  }
}

// Test 1: Valid pack should pass
test('valid pack passes review', () => {
  const packData = {
    id: 'valid_pack',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Valid Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'A valid pack',
    scenario: 'shopping',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1', 'Step 2'],
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
        text: 'Ich zahle 50€.',
        intent: 'inform',
        gloss_en: "I'm paying 50 euros."
      }
    ],
    analytics: {
      goal: 'Practice shopping payment scenarios with real-world amounts',
      constraints: ['neutral register'],
      levers: ['subject variation'],
      successCriteria: ['Uses shopping vocabulary'],
      commonMistakes: ['Missing vocabulary'],
      drillType: 'substitution',
      cognitiveLoad: 'medium'
    }
  };
  
  createTestPack('valid_pack', packData);
  const result = runReview();
  
  if (!result.success) {
    throw new Error(`Valid pack failed review: ${result.output}`);
  }
});

// Test 2: Pack with TODO in analytics should fail
test('pack with TODO in analytics fails review', () => {
  const packData = {
    id: 'todo_pack',
    schemaVersion: 1,
    kind: 'pack',
    title: 'TODO Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'A pack with TODO',
    scenario: 'shopping',
    register: 'neutral',
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
        text: 'Ich zahle 50€.',
        intent: 'inform',
        gloss_en: "I'm paying 50 euros."
      }
    ],
    analytics: {
      goal: 'TODO: Add goal here',
      constraints: ['neutral register'],
      levers: ['subject variation'],
      successCriteria: ['Uses shopping vocabulary'],
      commonMistakes: ['Missing vocabulary'],
      drillType: 'substitution',
      cognitiveLoad: 'medium'
    }
  };
  
  createTestPack('todo_pack', packData);
  const result = runReview();
  
  if (result.success) {
    throw new Error('Pack with TODO should fail review');
  }
  
  if (!result.output.includes('TODO')) {
    throw new Error('Review output should mention TODO');
  }
});

// Test 3: Pack with generic goal should fail
test('pack with generic goal fails review', () => {
  const packData = {
    id: 'generic_goal_pack',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Generic Goal Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'A pack with generic goal',
    scenario: 'shopping',
    register: 'neutral',
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
        text: 'Ich zahle 50€.',
        intent: 'inform',
        gloss_en: "I'm paying 50 euros."
      }
    ],
    analytics: {
      goal: 'practice german',
      constraints: ['neutral register'],
      levers: ['subject variation'],
      successCriteria: ['Uses shopping vocabulary'],
      commonMistakes: ['Missing vocabulary'],
      drillType: 'substitution',
      cognitiveLoad: 'medium'
    }
  };
  
  createTestPack('generic_goal_pack', packData);
  const result = runReview();
  
  if (result.success) {
    throw new Error('Pack with generic goal should fail review');
  }
});

// Test 4: Pack missing scenario should fail
test('pack missing scenario fails review', () => {
  const packData = {
    id: 'missing_scenario_pack',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Missing Scenario Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'A pack missing scenario',
    register: 'neutral',
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
        text: 'Ich zahle 50€.',
        intent: 'inform',
        gloss_en: "I'm paying 50 euros."
      }
    ],
    analytics: {
      goal: 'Practice shopping payment scenarios',
      constraints: ['neutral register'],
      levers: ['subject variation'],
      successCriteria: ['Uses shopping vocabulary'],
      commonMistakes: ['Missing vocabulary'],
      drillType: 'substitution',
      cognitiveLoad: 'medium'
    }
  };
  
  createTestPack('missing_scenario_pack', packData);
  const result = runReview();
  
  if (result.success) {
    throw new Error('Pack missing scenario should fail review');
  }
});

// Test 5: Pack missing gloss_en should fail
test('pack missing gloss_en fails review', () => {
  const packData = {
    id: 'missing_gloss_pack',
    schemaVersion: 1,
    kind: 'pack',
    title: 'Missing Gloss Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'A pack missing gloss_en',
    scenario: 'shopping',
    register: 'neutral',
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
        text: 'Ich zahle 50€.',
        intent: 'inform'
      }
    ],
    analytics: {
      goal: 'Practice shopping payment scenarios',
      constraints: ['neutral register'],
      levers: ['subject variation'],
      successCriteria: ['Uses shopping vocabulary'],
      commonMistakes: ['Missing vocabulary'],
      drillType: 'substitution',
      cognitiveLoad: 'medium'
    }
  };
  
  createTestPack('missing_gloss_pack', packData);
  const result = runReview();
  
  if (result.success) {
    throw new Error('Pack missing gloss_en should fail review');
  }
});

console.log('\n✅ All review harness tests passed!');

