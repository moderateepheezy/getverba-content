#!/usr/bin/env tsx

/**
 * Review Harness Tests
 * 
 * Tests for review harness features:
 * - Approval preflight check
 * - Duplicate detection
 * - Natural_en requirement enforcement
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const REVIEW_DIR = join(__dirname, '..', 'content', 'review');
const META_DIR = join(__dirname, '..', 'content', 'meta');

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

// Test 1: Approval preflight fails when staging references unapproved IDs
test('Approval preflight fails when staging references unapproved IDs', () => {
  // Setup: Create test manifest with unapproved item
  const testManifest = {
    workspaces: ['de'],
    workspaceHashes: {}
  };
  
  const testManifestPath = join(META_DIR, 'manifest.test.json');
  writeFileSync(testManifestPath, JSON.stringify(testManifest, null, 2));
  testCleanup.push(testManifestPath);
  
  // Create test catalog and index with unapproved item
  const workspaceDir = join(CONTENT_DIR, 'workspaces', 'de');
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  testCleanup.push(workspaceDir);
  
  const catalogPath = join(workspaceDir, 'catalog.json');
  const catalog = {
    workspace: 'de',
    language: 'German',
    sections: [{
      id: 'context',
      kind: 'context',
      title: 'Context Library',
      itemsUrl: '/v1/workspaces/de/context/index.json'
    }]
  };
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  
  const contextDir = join(workspaceDir, 'context');
  if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
  }
  
  const indexPath = join(contextDir, 'index.json');
  const index = {
    version: '1.0',
    kind: 'context',
    total: 1,
    items: [{
      id: 'test_unapproved_pack',
      kind: 'pack',
      title: 'Test Unapproved Pack',
      level: 'A1',
      durationMinutes: 15,
      entryUrl: '/v1/workspaces/de/packs/test_unapproved_pack/pack.json'
    }]
  };
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  
  // Ensure approved.json doesn't have this item
  const approvedPath = join(REVIEW_DIR, 'approved.json');
  const approved = existsSync(approvedPath) ? JSON.parse(readFileSync(approvedPath, 'utf-8')) : [];
  const filteredApproved = approved.filter((item: any) => 
    !(item.id === 'test_unapproved_pack' && item.workspace === 'de')
  );
  writeFileSync(approvedPath, JSON.stringify(filteredApproved, null, 2));
  
  // Run check-approvals - should fail
  try {
    execSync(`npx tsx ${join(__dirname, 'check-approvals.ts')} ${testManifestPath}`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    throw new Error('Expected check-approvals to fail but it passed');
  } catch (err: any) {
    if (err.status === 0) {
      throw new Error('Expected check-approvals to fail but it passed');
    }
    // Expected failure - test passes
  }
});

// Test 2: Dedupe hard fail on exact duplicates
test('Dedupe hard fail on exact duplicates', () => {
  // Setup: Create test pack with duplicate prompts
  const workspaceDir = join(CONTENT_DIR, 'workspaces', 'de');
  const testPackDir = join(workspaceDir, 'packs', 'test_duplicate_pack');
  if (!existsSync(testPackDir)) {
    mkdirSync(testPackDir, { recursive: true });
  }
  testCleanup.push(testPackDir);
  
  const packPath = join(testPackDir, 'pack.json');
  const pack = {
    schemaVersion: 1,
    id: 'test_duplicate_pack',
    kind: 'pack',
    title: 'Test Duplicate Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack with duplicates',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich gehe zur Arbeit.',
        intent: 'inform',
        gloss_en: 'I go to work.'
      },
      {
        id: 'prompt-002',
        text: 'Ich gehe zur Arbeit.', // Exact duplicate
        intent: 'inform',
        gloss_en: 'I go to work.'
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [{
        id: 'step-1',
        title: 'Step 1',
        promptIds: ['prompt-001', 'prompt-002']
      }]
    },
    tags: []
  };
  writeFileSync(packPath, JSON.stringify(pack, null, 2));
  
  // Run dedupe - should fail
  try {
    execSync(`npx tsx ${join(__dirname, 'dedupe-content.ts')} --workspace de`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    throw new Error('Expected dedupe to fail but it passed');
  } catch (err: any) {
    if (err.status === 0) {
      throw new Error('Expected dedupe to fail but it passed');
    }
    // Expected failure - test passes
  }
});

// Test 3: Natural_en requirement enforcement
test('Natural_en requirement enforcement for government_office', () => {
  // Setup: Create test pack with missing natural_en
  const workspaceDir = join(CONTENT_DIR, 'workspaces', 'de');
  const testPackDir = join(workspaceDir, 'packs', 'test_missing_natural_en');
  if (!existsSync(testPackDir)) {
    mkdirSync(testPackDir, { recursive: true });
  }
  testCleanup.push(testPackDir);
  
  const packPath = join(testPackDir, 'pack.json');
  const pack = {
    schemaVersion: 1,
    id: 'test_missing_natural_en',
    kind: 'pack',
    title: 'Test Missing Natural EN',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test pack missing natural_en',
    scenario: 'government_office', // Requires natural_en
    register: 'formal',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich brauche einen Termin.',
        intent: 'request',
        gloss_en: 'I need to make an appointment.'
        // Missing natural_en - should fail validation
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [{
        id: 'step-1',
        title: 'Step 1',
        promptIds: ['prompt-001']
      }]
    },
    tags: []
  };
  writeFileSync(packPath, JSON.stringify(pack, null, 2));
  
  // Also add to context index so validation finds it
  const contextDir = join(workspaceDir, 'context');
  if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
  }
  const indexPath = join(contextDir, 'index.json');
  let index: any = { version: '1.0', kind: 'context', total: 0, items: [] };
  if (existsSync(indexPath)) {
    try {
      const existingContent = readFileSync(indexPath, 'utf-8');
      index = JSON.parse(existingContent);
      // Remove test item if it already exists
      index.items = index.items.filter((item: any) => item.id !== pack.id);
    } catch {}
  }
  // Add test item
  index.items.push({
    id: pack.id,
    kind: 'pack',
    title: pack.title,
    level: pack.level,
    durationMinutes: pack.estimatedMinutes,
    entryUrl: `/v1/workspaces/de/packs/${pack.id}/pack.json`
  });
  index.total = index.items.length;
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  testCleanup.push(indexPath);
  
  // Verify the pack and index are set up correctly
  if (!existsSync(packPath)) {
    throw new Error('Test pack file was not created');
  }
  if (!existsSync(indexPath)) {
    throw new Error('Test index file was not created');
  }
  
  // Verify the pack structure is correct for the test
  const packContent = JSON.parse(readFileSync(packPath, 'utf-8'));
  if (packContent.scenario !== 'government_office') {
    throw new Error('Test pack scenario is not government_office');
  }
  if (!packContent.prompts || packContent.prompts.length === 0) {
    throw new Error('Test pack has no prompts');
  }
  if (packContent.prompts[0].natural_en) {
    throw new Error('Test pack should not have natural_en, but it does');
  }
  
  // Run validation and capture both stdout and stderr
  let validationOutput = '';
  let validationHadError = false;
  try {
    validationOutput = execSync(`npx tsx ${join(__dirname, 'validate-content.ts')}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      cwd: join(__dirname, '..'),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    }).toString();
  } catch (err: any) {
    validationHadError = true;
    validationOutput = (err.stdout || err.stderr || '').toString();
    // Also check stderr separately
    if (err.stderr) {
      validationOutput += '\n' + err.stderr.toString();
    }
  }
  
  // The validation should find the error. Check for the specific error message pattern
  // Error format: "Item X pack entry prompt Y missing or invalid field: natural_en (required for government_office scenario"
  const errorPatterns = [
    /natural_en.*required.*government_office/i,
    /natural_en.*government_office.*required/i,
    /missing.*natural_en.*government_office/i
  ];
  
  const hasNaturalEnError = errorPatterns.some(pattern => pattern.test(validationOutput));
  
  if (!hasNaturalEnError) {
    // Check if we got a warning instead (which would be wrong)
    if (validationOutput.includes('recommended') && validationOutput.includes('optional') && validationOutput.includes('natural_en')) {
      throw new Error('Expected hard error for missing natural_en in government_office pack, but got warning instead. This indicates the validation logic is incorrect.');
    }
    // If validation passed without error, that's also wrong
    if (!validationHadError && !validationOutput.includes('natural_en')) {
      throw new Error('Validation passed without checking natural_en for government_office pack. This indicates the validation is not running on the test pack.');
    }
    // Log the output for debugging
    console.error('Validation output (first 1000 chars):', validationOutput.substring(0, 1000));
    throw new Error('Expected natural_en validation error for government_office pack, but error not found in validation output.');
  }
  
  // Test passes if we found the natural_en error
});

console.log('\n✅ All review harness tests completed');

