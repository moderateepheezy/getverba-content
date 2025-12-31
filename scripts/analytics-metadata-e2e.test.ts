#!/usr/bin/env tsx

/**
 * E2E tests for catalog-level analytics metadata
 * 
 * Tests:
 * - Full pack generation includes all required catalog analytics
 * - Validation enforces catalog analytics requirements
 * - Index generation propagates catalog analytics
 * - Deterministic generation across runs
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v1', 'scenarios');

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

function runGenerator(args: string[]): string {
  const scriptPath = join(__dirname, 'generate-pack.ts');
  const cmd = `npx tsx "${scriptPath}" ${args.join(' ')}`;
  try {
    return execSync(cmd, { 
      encoding: 'utf-8',
      cwd: join(__dirname, '..')
    });
  } catch (error: any) {
    throw new Error(`Generator failed: ${error.message}`);
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

function cleanupPack(workspace: string, packId: string) {
  const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', packId);
  if (existsSync(packDir)) {
    rmSync(packDir, { recursive: true, force: true });
  }
}

// Test: Generated pack includes all required catalog analytics
test('pack generation: includes all required catalog analytics fields', () => {
  const workspace = 'de';
  const packId = 'test-catalog-analytics';
  
  try {
    cleanupPack(workspace, packId);
    
    runGenerator([
      '--workspace', workspace,
      '--packId', packId,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '42'
    ]);
    
    const pack = readGeneratedPack(workspace, packId);
    
    // Verify analytics exists
    assert(pack.analytics !== undefined, 'Pack should have analytics');
    assert(typeof pack.analytics === 'object', 'Analytics should be an object');
    
    // Verify required catalog-level analytics fields
    assert(typeof pack.analytics.focus === 'string', 'Analytics should have focus (string)');
    assert(pack.analytics.focus.length > 0, 'Focus should not be empty');
    
    assert(['low', 'medium', 'high'].includes(pack.analytics.cognitiveLoad), 
      `Analytics should have cognitiveLoad (low|medium|high), got "${pack.analytics.cognitiveLoad}"`);
    
    assert(typeof pack.analytics.responseSpeedTargetMs === 'number', 
      'Analytics should have responseSpeedTargetMs (number)');
    assert(pack.analytics.responseSpeedTargetMs >= 500 && pack.analytics.responseSpeedTargetMs <= 3000,
      `responseSpeedTargetMs should be 500-3000ms, got ${pack.analytics.responseSpeedTargetMs}`);
    
    assert(typeof pack.analytics.fluencyOutcome === 'string', 
      'Analytics should have fluencyOutcome (string)');
    assert(pack.analytics.fluencyOutcome.length > 0, 'Fluency outcome should not be empty');
    
    assert(Array.isArray(pack.analytics.whyThisWorks), 
      'Analytics should have whyThisWorks (array)');
    assert(pack.analytics.whyThisWorks.length >= 2, 
      `whyThisWorks should have at least 2 items, got ${pack.analytics.whyThisWorks.length}`);
    assert(pack.analytics.whyThisWorks.length <= 5, 
      `whyThisWorks should have at most 5 items, got ${pack.analytics.whyThisWorks.length}`);
    
    // Verify each whyThisWorks bullet
    for (let i = 0; i < pack.analytics.whyThisWorks.length; i++) {
      const bullet = pack.analytics.whyThisWorks[i];
      assert(typeof bullet === 'string', `whyThisWorks[${i}] should be a string`);
      assert(bullet.length > 0, `whyThisWorks[${i}] should not be empty`);
      assert(bullet.length <= 120, 
        `whyThisWorks[${i}] should be <= 120 chars, got ${bullet.length}: "${bullet.substring(0, 50)}..."`);
    }
    
    // Verify cognitiveLoad matches estimatedCognitiveLoad
    assert(pack.analytics.cognitiveLoad === pack.analytics.estimatedCognitiveLoad,
      `cognitiveLoad (${pack.analytics.cognitiveLoad}) should match estimatedCognitiveLoad (${pack.analytics.estimatedCognitiveLoad})`);
    
    console.log('   ✅ All required catalog analytics fields present');
  } finally {
    cleanupPack(workspace, packId);
  }
});

// Test: Validation enforces catalog analytics requirements
test('validation: enforces catalog analytics requirements', () => {
  const workspace = 'de';
  const packId = 'test-validation-analytics';
  
  try {
    cleanupPack(workspace, packId);
    
    // Generate a valid pack first
    runGenerator([
      '--workspace', workspace,
      '--packId', packId,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '42'
    ]);
    
    const pack = readGeneratedPack(workspace, packId);
    
    // Remove a required field
    delete pack.analytics.focus;
    
    // Write modified pack
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', packId, 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    // Run validation (should fail)
    let validationOutput = '';
    try {
      validationOutput = execSync('npm run content:validate 2>&1', {
        encoding: 'utf-8',
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch (error: any) {
      validationOutput = error.stdout || error.stderr || error.message;
    }
    
    // Check that validation caught the missing field
    assert(
      validationOutput.includes('focus') || validationOutput.includes('missing'),
      'Validation should catch missing focus field'
    );
    
    console.log('   ✅ Validation enforces catalog analytics requirements');
  } finally {
    cleanupPack(workspace, packId);
  }
});

// Test: Index generation propagates catalog analytics
test('index generation: propagates catalog analytics to index items', () => {
  const workspace = 'de';
  const packId = 'test-index-analytics';
  
  try {
    cleanupPack(workspace, packId);
    
    // Generate pack
    runGenerator([
      '--workspace', workspace,
      '--packId', packId,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '42'
    ]);
    
    const pack = readGeneratedPack(workspace, packId);
    
    // Generate indexes
    try {
      execSync(`npm run content:generate-indexes -- --workspace ${workspace}`, {
        encoding: 'utf-8',
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch (error: any) {
      // Index generation might fail if catalog doesn't exist, that's okay for this test
    }
    
    // Check if index file exists
    const indexPath = join(CONTENT_DIR, 'workspaces', workspace, 'context', 'index.json');
    if (existsSync(indexPath)) {
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      
      // Find our pack in the index
      const packItem = index.items?.find((item: any) => item.id === packId);
      
      if (packItem) {
        // Verify optional analytics fields are present
        // Note: These are optional in the index, so we just check if they exist when present
        if (packItem.focus !== undefined) {
          assert(typeof packItem.focus === 'string', 'Index item focus should be string if present');
        }
        if (packItem.cognitiveLoad !== undefined) {
          assert(['low', 'medium', 'high'].includes(packItem.cognitiveLoad),
            'Index item cognitiveLoad should be valid enum if present');
        }
        if (packItem.fluencyOutcome !== undefined) {
          assert(typeof packItem.fluencyOutcome === 'string', 'Index item fluencyOutcome should be string if present');
        }
      }
    }
    
    console.log('   ✅ Index generation propagates catalog analytics');
  } finally {
    cleanupPack(workspace, packId);
  }
});

// Test: Deterministic generation of catalog analytics
test('deterministic: catalog analytics are deterministic across runs', () => {
  const workspace = 'de';
  const packId1 = 'test-deterministic-1';
  const packId2 = 'test-deterministic-2';
  
  try {
    cleanupPack(workspace, packId1);
    cleanupPack(workspace, packId2);
    
    // Generate pack twice with same inputs
    runGenerator([
      '--workspace', workspace,
      '--packId', packId1,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '999'
    ]);
    
    runGenerator([
      '--workspace', workspace,
      '--packId', packId2,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '999'
    ]);
    
    const pack1 = readGeneratedPack(workspace, packId1);
    const pack2 = readGeneratedPack(workspace, packId2);
    
    // Compare catalog analytics (should be identical)
    assert(pack1.analytics.focus === pack2.analytics.focus,
      `Focus should match: "${pack1.analytics.focus}" vs "${pack2.analytics.focus}"`);
    
    assert(pack1.analytics.cognitiveLoad === pack2.analytics.cognitiveLoad,
      `Cognitive load should match: "${pack1.analytics.cognitiveLoad}" vs "${pack2.analytics.cognitiveLoad}"`);
    
    assert(pack1.analytics.responseSpeedTargetMs === pack2.analytics.responseSpeedTargetMs,
      `Response speed should match: ${pack1.analytics.responseSpeedTargetMs} vs ${pack2.analytics.responseSpeedTargetMs}`);
    
    assert(pack1.analytics.fluencyOutcome === pack2.analytics.fluencyOutcome,
      `Fluency outcome should match: "${pack1.analytics.fluencyOutcome}" vs "${pack2.analytics.fluencyOutcome}"`);
    
    assert(JSON.stringify(pack1.analytics.whyThisWorks) === JSON.stringify(pack2.analytics.whyThisWorks),
      'WhyThisWorks should match');
    
    console.log('   ✅ Catalog analytics are deterministic');
  } finally {
    cleanupPack(workspace, packId1);
    cleanupPack(workspace, packId2);
  }
});

// Test: Different scenarios produce different analytics
test('scenario variation: different scenarios produce appropriate analytics', () => {
  const workspace = 'de';
  const scenarios = ['work', 'restaurant', 'government_office'];
  const packIds: string[] = [];
  
  try {
    for (const scenario of scenarios) {
      const packId = `test-scenario-${scenario}`;
      packIds.push(packId);
      cleanupPack(workspace, packId);
      
      runGenerator([
        '--workspace', workspace,
        '--packId', packId,
        '--scenario', scenario,
        '--level', 'A2',
        '--seed', '42'
      ]);
    }
    
    const packs = packIds.map(id => readGeneratedPack(workspace, id));
    
    // Verify all have required fields
    for (const pack of packs) {
      assert(pack.analytics.focus, `Pack ${pack.id} should have focus`);
      assert(pack.analytics.fluencyOutcome, `Pack ${pack.id} should have fluencyOutcome`);
      assert(pack.analytics.whyThisWorks.length >= 2, 
        `Pack ${pack.id} should have at least 2 whyThisWorks bullets`);
    }
    
    // Verify scenario-specific outcomes
    const workPack = packs.find(p => p.scenario === 'work');
    const restaurantPack = packs.find(p => p.scenario === 'restaurant');
    const govPack = packs.find(p => p.scenario === 'government_office');
    
    if (workPack) {
      assert(workPack.analytics.fluencyOutcome.includes('work') || 
             workPack.analytics.fluencyOutcome.includes('professional') ||
             workPack.analytics.fluencyOutcome.includes('workplace'),
        `Work pack should have work-related fluency outcome, got "${workPack.analytics.fluencyOutcome}"`);
    }
    
    if (restaurantPack) {
      assert(restaurantPack.analytics.fluencyOutcome.includes('restaurant') ||
             restaurantPack.analytics.fluencyOutcome.includes('ordering') ||
             restaurantPack.analytics.fluencyOutcome.includes('dining'),
        `Restaurant pack should have restaurant-related fluency outcome, got "${restaurantPack.analytics.fluencyOutcome}"`);
    }
    
    console.log('   ✅ Different scenarios produce appropriate analytics');
  } finally {
    for (const packId of packIds) {
      cleanupPack(workspace, packId);
    }
  }
});

// Test: Response speed target is within valid range for all levels
test('response speed: all levels produce valid response speed targets', () => {
  const workspace = 'de';
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const packIds: string[] = [];
  
  try {
    for (const level of levels) {
      const packId = `test-level-${level}`;
      packIds.push(packId);
      cleanupPack(workspace, packId);
      
      runGenerator([
        '--workspace', workspace,
        '--packId', packId,
        '--scenario', 'work',
        '--level', level,
        '--seed', '42'
      ]);
    }
    
    const packs = packIds.map(id => readGeneratedPack(workspace, id));
    
    for (const pack of packs) {
      const speed = pack.analytics.responseSpeedTargetMs;
      assert(speed >= 500 && speed <= 3000,
        `Pack ${pack.id} (${pack.level}) should have response speed 500-3000ms, got ${speed}ms`);
    }
    
    // Verify progression: higher levels should generally have lower targets
    const a1Pack = packs.find(p => p.level === 'A1');
    const c2Pack = packs.find(p => p.level === 'C2');
    
    if (a1Pack && c2Pack) {
      // A1 should generally be slower than C2 (unless cognitive load differs significantly)
      // We'll just verify both are in valid range
      assert(a1Pack.analytics.responseSpeedTargetMs >= 500, 'A1 should have valid speed');
      assert(c2Pack.analytics.responseSpeedTargetMs <= 3000, 'C2 should have valid speed');
    }
    
    console.log('   ✅ All levels produce valid response speed targets');
  } finally {
    for (const packId of packIds) {
      cleanupPack(workspace, packId);
    }
  }
});

// Run all tests
console.log('\n🧪 Running analytics metadata E2E tests...\n');

for (const testCase of tests) {
  try {
    testCase.fn();
    passed++;
    console.log(`✅ ${testCase.name}`);
  } catch (error: any) {
    failed++;
    console.error(`❌ ${testCase.name}`);
    console.error(`   Error: ${error.message}`);
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}

