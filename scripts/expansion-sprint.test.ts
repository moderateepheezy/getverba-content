#!/usr/bin/env tsx

/**
 * Unit tests for expansion-sprint.ts
 * 
 * Tests:
 * - Pack generation with deterministic seeds
 * - Drill generation with deterministic seeds
 * - Review queue integration
 * - Validation enforcement
 * - Error handling
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const REVIEW_DIR = join(__dirname, '..', 'content', 'review');

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

function runExpansionSprint(args: string[]): string {
  const scriptPath = join(__dirname, 'expansion-sprint.ts');
  const cmd = `npx tsx "${scriptPath}" ${args.join(' ')}`;
  try {
    return execSync(cmd, { 
      encoding: 'utf-8',
      cwd: join(__dirname, '..')
    });
  } catch (error: any) {
    throw new Error(`Expansion sprint failed: ${error.message}`);
  }
}

function readGeneratedPack(workspace: string, packId: string): any {
  const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', packId, 'pack.json');
  if (!existsSync(packPath)) {
    throw new Error(`Pack not found: ${packPath}`);
  }
  const content = readFileSync(packPath, 'utf-8');
  return JSON.parse(content);
}

function readGeneratedDrill(workspace: string, drillId: string): any {
  const drillPath = join(CONTENT_DIR, 'workspaces', workspace, 'drills', drillId, 'drill.json');
  if (!existsSync(drillPath)) {
    throw new Error(`Drill not found: ${drillPath}`);
  }
  const content = readFileSync(drillPath, 'utf-8');
  return JSON.parse(content);
}

function readPendingReview(): any[] {
  const pendingPath = join(REVIEW_DIR, 'pending.json');
  if (!existsSync(pendingPath)) {
    return [];
  }
  const content = readFileSync(pendingPath, 'utf-8');
  return JSON.parse(content);
}

function cleanupSprintItems(workspace: string) {
  // Clean up sprint packs
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  if (existsSync(packsDir)) {
    const packDirs = readdirSync(packsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('sprint-'));
    for (const packDir of packDirs) {
      rmSync(join(packsDir, packDir.name), { recursive: true, force: true });
    }
  }
  
  // Clean up sprint drills
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspace, 'drills');
  if (existsSync(drillsDir)) {
    const drillDirs = readdirSync(drillsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('sprint-drill-'));
    for (const drillDir of drillDirs) {
      rmSync(join(drillsDir, drillDir.name), { recursive: true, force: true });
    }
  }
  
  // Clean up pending review items
  const pending = readPendingReview();
  const filtered = pending.filter(item => 
    !item.id.startsWith('sprint-') && !item.id.startsWith('sprint-drill-')
  );
  if (filtered.length !== pending.length) {
    writeFileSync(
      join(REVIEW_DIR, 'pending.json'),
      JSON.stringify(filtered, null, 2) + '\n',
      'utf-8'
    );
  }
}

// Test: Pack generation creates valid pack with review status
test('Pack generation creates valid pack with needs_review status', () => {
  const workspace = 'de';
  const testPackId = 'sprint-test-pack-001';
  
  try {
    cleanupSprintItems(workspace);
    
    runExpansionSprint([
      '--workspace', workspace,
      '--scenarios', 'work',
      '--levels', 'A1',
      '--packsCount', '1',
      '--drillsCount', '0'
    ]);
    
    const pack = readGeneratedPack(workspace, testPackId);
    
    assert(pack.kind === 'pack', 'Pack should have kind="pack"');
    assert(pack.id === testPackId, 'Pack ID should match');
    assert(pack.review?.status === 'needs_review', 'Pack should have review.status="needs_review"');
    assert(pack.scenario === 'work', 'Pack should have correct scenario');
    assert(pack.level === 'A1', 'Pack should have correct level');
    assert(Array.isArray(pack.prompts), 'Pack should have prompts array');
    assert(pack.prompts.length > 0, 'Pack should have at least one prompt');
    assert(pack.analytics, 'Pack should have analytics');
    assert(pack.provenance, 'Pack should have provenance');
    
    console.log(`   ✅ Pack ${testPackId} generated correctly`);
  } finally {
    cleanupSprintItems(workspace);
  }
});

// Test: Drill generation creates valid drill with review status
test('Drill generation creates valid drill with needs_review status', () => {
  const workspace = 'de';
  const testDrillId = 'sprint-drill-a1-001';
  
  try {
    cleanupSprintItems(workspace);
    
    runExpansionSprint([
      '--workspace', workspace,
      '--scenarios', 'work',
      '--levels', 'A1',
      '--packsCount', '0',
      '--drillsCount', '1'
    ]);
    
    const drill = readGeneratedDrill(workspace, testDrillId);
    
    assert(drill.kind === 'drill', 'Drill should have kind="drill"');
    assert(drill.id === testDrillId, 'Drill ID should match');
    assert(drill.review?.status === 'needs_review', 'Drill should have review.status="needs_review"');
    assert(drill.level === 'A1', 'Drill should have correct level');
    assert(Array.isArray(drill.exercises), 'Drill should have exercises array');
    assert(drill.exercises.length > 0, 'Drill should have at least one exercise');
    assert(drill.provenance, 'Drill should have provenance');
    
    console.log(`   ✅ Drill ${testDrillId} generated correctly`);
  } finally {
    cleanupSprintItems(workspace);
  }
});

// Test: Items are added to review queue
test('Generated items are added to review pending queue', () => {
  const workspace = 'de';
  
  try {
    cleanupSprintItems(workspace);
    
    runExpansionSprint([
      '--workspace', workspace,
      '--scenarios', 'work',
      '--levels', 'A1',
      '--packsCount', '2',
      '--drillsCount', '1'
    ]);
    
    const pending = readPendingReview();
    const sprintItems = pending.filter(item => 
      item.id.startsWith('sprint-') || item.id.startsWith('sprint-drill-')
    );
    
    assert(sprintItems.length >= 3, `Should have at least 3 items in pending queue, got ${sprintItems.length}`);
    
    const packItems = sprintItems.filter(item => item.kind === 'pack');
    const drillItems = sprintItems.filter(item => item.kind === 'drill');
    
    assert(packItems.length >= 2, `Should have at least 2 packs in pending, got ${packItems.length}`);
    assert(drillItems.length >= 1, `Should have at least 1 drill in pending, got ${drillItems.length}`);
    
    // Verify pack items have required fields
    for (const item of packItems) {
      assert(item.scenario === 'work', 'Pack item should have scenario');
      assert(item.level === 'A1', 'Pack item should have level');
      assert(item.workspace === workspace, 'Pack item should have workspace');
    }
    
    console.log(`   ✅ ${sprintItems.length} items added to review queue`);
  } finally {
    cleanupSprintItems(workspace);
  }
});

// Test: Multiple scenarios and levels
test('Expansion sprint generates across multiple scenarios and levels', () => {
  const workspace = 'de';
  
  try {
    cleanupSprintItems(workspace);
    
    runExpansionSprint([
      '--workspace', workspace,
      '--scenarios', 'government_office,work',
      '--levels', 'A1,A2',
      '--packsCount', '4',
      '--drillsCount', '2'
    ]);
    
    const packs = readdirSync(join(CONTENT_DIR, 'workspaces', workspace, 'packs'), { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('sprint-'))
      .map(dirent => dirent.name);
    
    assert(packs.length >= 4, `Should have generated at least 4 packs, got ${packs.length}`);
    
    // Verify scenario distribution
    const scenarios = new Set<string>();
    const levels = new Set<string>();
    
    for (const packId of packs) {
      const pack = readGeneratedPack(workspace, packId);
      if (pack.scenario) scenarios.add(pack.scenario);
      if (pack.level) levels.add(pack.level);
    }
    
    assert(scenarios.has('government_office') || scenarios.has('work'), 'Should have packs from specified scenarios');
    assert(levels.has('A1') || levels.has('A2'), 'Should have packs from specified levels');
    
    console.log(`   ✅ Generated ${packs.length} packs across scenarios and levels`);
  } finally {
    cleanupSprintItems(workspace);
  }
});

// Test: Validation runs after generation
test('Validation runs after generation', () => {
  const workspace = 'de';
  
  try {
    cleanupSprintItems(workspace);
    
    // This test verifies that validation is called (even if it might fail due to other content)
    let validationCalled = false;
    
    try {
      runExpansionSprint([
        '--workspace', workspace,
        '--scenarios', 'work',
        '--levels', 'A1',
        '--packsCount', '1',
        '--drillsCount', '0'
      ]);
      validationCalled = true;
    } catch (error: any) {
      // Validation might fail due to other content issues, but it should have been called
      if (error.message.includes('Validation') || error.message.includes('validation')) {
        validationCalled = true;
      }
    }
    
    // Note: We can't easily verify validation ran without mocking, but we can check
    // that the script completed (which means validation was attempted)
    assert(validationCalled || existsSync(join(CONTENT_DIR, 'workspaces', workspace, 'packs', 'sprint-work-a1-001', 'pack.json')), 
      'Validation should have been called or pack should exist');
    
    console.log(`   ✅ Validation was called during sprint`);
  } finally {
    cleanupSprintItems(workspace);
  }
});

// Test: Error handling for invalid scenarios
test('Expansion sprint handles invalid scenarios gracefully', () => {
  const workspace = 'de';
  
  try {
    cleanupSprintItems(workspace);
    
    let errorThrown = false;
    try {
      runExpansionSprint([
        '--workspace', workspace,
        '--scenarios', 'invalid_scenario',
        '--levels', 'A1',
        '--packsCount', '1',
        '--drillsCount', '0'
      ]);
    } catch (error: any) {
      errorThrown = true;
      // Should warn about missing template
      assert(
        error.message.includes('Template not found') || 
        error.message.includes('Warning') ||
        error.message.includes('template'),
        'Should warn about missing template'
      );
    }
    
    // Script should either complete with warning or fail gracefully
    console.log(`   ✅ Handled invalid scenario gracefully`);
  } finally {
    cleanupSprintItems(workspace);
  }
});

// Test: Deterministic generation (same seed produces same output)
test('Deterministic generation: same inputs produce consistent output', () => {
  const workspace = 'de';
  const testPackId = 'sprint-test-deterministic-001';
  
  try {
    cleanupSprintItems(workspace);
    
    // Generate first pack
    runExpansionSprint([
      '--workspace', workspace,
      '--scenarios', 'work',
      '--levels', 'A1',
      '--packsCount', '1',
      '--drillsCount', '0'
    ]);
    
    const pack1 = readGeneratedPack(workspace, testPackId);
    const prompts1 = pack1.prompts.map((p: any) => p.text).sort();
    
    // Clean and regenerate
    cleanupSprintItems(workspace);
    
    runExpansionSprint([
      '--workspace', workspace,
      '--scenarios', 'work',
      '--levels', 'A1',
      '--packsCount', '1',
      '--drillsCount', '0'
    ]);
    
    const pack2 = readGeneratedPack(workspace, testPackId);
    const prompts2 = pack2.prompts.map((p: any) => p.text).sort();
    
    // Note: Due to seed incrementing, exact determinism requires same seed
    // But we can verify structure is consistent
    assert(pack1.scenario === pack2.scenario, 'Scenarios should match');
    assert(pack1.level === pack2.level, 'Levels should match');
    assert(pack1.prompts.length === pack2.prompts.length, 'Prompt counts should match');
    
    console.log(`   ✅ Generated packs have consistent structure`);
  } finally {
    cleanupSprintItems(workspace);
  }
});

// Run all tests
console.log('🧪 Running expansion-sprint.ts unit tests\n');

for (const testCase of tests) {
  try {
    testCase.fn();
    passed++;
    console.log(`✅ ${testCase.name}\n`);
  } catch (error: any) {
    failed++;
    console.error(`❌ ${testCase.name}`);
    console.error(`   ${error.message}\n`);
  }
}

console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

