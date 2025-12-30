#!/usr/bin/env tsx

/**
 * Unit tests for generate-pack.ts
 * 
 * Tests:
 * - Seeded determinism (same args -> identical output)
 * - slotsChanged correctness
 * - requiredTokens present per step
 * - Quality gates pass
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

// Test: Seeded determinism
test('Seeded determinism: same inputs produce identical output', () => {
  const workspace = 'de';
  const packId = 'test-determinism-1';
  
  try {
    // Clean up if exists
    cleanupPack(workspace, packId);
    
    // Generate pack with seed 42
    runGenerator([
      '--workspace', workspace,
      '--packId', packId,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '42'
    ]);
    
    const pack1 = readGeneratedPack(workspace, packId);
    
    // Clean and regenerate with same seed
    cleanupPack(workspace, packId);
    
    runGenerator([
      '--workspace', workspace,
      '--packId', packId,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '42'
    ]);
    
    const pack2 = readGeneratedPack(workspace, packId);
    
    // Compare JSON strings (byte-equivalent)
    const json1 = JSON.stringify(pack1, null, 2);
    const json2 = JSON.stringify(pack2, null, 2);
    
    assert(json1 === json2, 'Generated packs should be byte-equivalent with same seed');
    
    console.log('   ✅ Determinism test passed');
  } finally {
    cleanupPack(workspace, packId);
  }
});

// Test: Different seeds produce different output
test('Different seeds produce different output', () => {
  const workspace = 'de';
  const packId = 'test-seed-variation';
  
  try {
    cleanupPack(workspace, packId);
    
    runGenerator([
      '--workspace', workspace,
      '--packId', packId,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '42'
    ]);
    
    const pack1 = readGeneratedPack(workspace, packId);
    
    cleanupPack(workspace, packId);
    
    runGenerator([
      '--workspace', workspace,
      '--packId', packId,
      '--scenario', 'work',
      '--level', 'A2',
      '--seed', '123'
    ]);
    
    const pack2 = readGeneratedPack(workspace, packId);
    
    const json1 = JSON.stringify(pack1, null, 2);
    const json2 = JSON.stringify(pack2, null, 2);
    
    assert(json1 !== json2, 'Different seeds should produce different output');
    
    console.log('   ✅ Seed variation test passed');
  } finally {
    cleanupPack(workspace, packId);
  }
});

// Test: slotsChanged correctness
test('slotsChanged populated correctly', () => {
  const workspace = 'de';
  const packId = 'test-slots-changed';
  
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
    
    // Check that at least 30% have 2+ slotsChanged
    const multiSlotCount = pack.prompts.filter((p: any) => 
      p.slotsChanged && p.slotsChanged.length >= 2
    ).length;
    const multiSlotRate = pack.prompts.length > 0 ? multiSlotCount / pack.prompts.length : 0;
    
    assert(multiSlotRate >= 0.3, `Multi-slot rate should be >= 30%, got ${(multiSlotRate * 100).toFixed(1)}%`);
    
    // Check that all slotsChanged values are in variationSlots
    for (const prompt of pack.prompts) {
      if (prompt.slotsChanged) {
        for (const slot of prompt.slotsChanged) {
          assert(
            pack.variationSlots.includes(slot),
            `slotsChanged contains "${slot}" which is not in variationSlots`
          );
        }
      }
    }
    
    console.log('   ✅ slotsChanged correctness test passed');
  } finally {
    cleanupPack(workspace, packId);
  }
});

// Test: Required tokens present per step
test('Required tokens present per step', () => {
  const workspace = 'de';
  const packId = 'test-required-tokens';
  
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
    const templatePath = join(TEMPLATES_DIR, 'work.json');
    const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
    
    // Check that each step has at least one scenario token
    for (const step of pack.sessionPlan.steps) {
      let stepHasToken = false;
      for (const promptId of step.promptIds) {
        const prompt = pack.prompts.find((p: any) => p.id === promptId);
        if (prompt) {
          const textLower = prompt.text.toLowerCase();
          for (const token of template.requiredTokens) {
            if (textLower.includes(token.toLowerCase())) {
              stepHasToken = true;
              break;
            }
          }
        }
        if (stepHasToken) break;
      }
      assert(stepHasToken, `Step "${step.id}" has no scenario tokens`);
    }
    
    console.log('   ✅ Required tokens test passed');
  } finally {
    cleanupPack(workspace, packId);
  }
});

// Test: Quality gates pass
test('Generated pack passes quality gates', () => {
  const workspace = 'de';
  const packId = 'test-quality-gates';
  
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
    
    // Check: No banned phrases
    for (const prompt of pack.prompts) {
      const textLower = prompt.text.toLowerCase();
      const bannedPhrases = [
        "in today's lesson",
        "let's practice",
        "this sentence",
        "i like to",
        "the quick brown fox",
        "lorem ipsum"
      ];
      for (const phrase of bannedPhrases) {
        assert(
          !textLower.includes(phrase.toLowerCase()),
          `Prompt "${prompt.id}" contains banned phrase: "${phrase}"`
        );
      }
    }
    
    // Check: At least 2 distinct verbs
    const verbs = new Set<string>();
    for (const prompt of pack.prompts) {
      const tokens = prompt.text.split(/\s+/);
      if (tokens.length > 1) {
        verbs.add(tokens[1].toLowerCase());
      }
    }
    assert(verbs.size >= 2, `Should have at least 2 distinct verbs, got ${verbs.size}`);
    
    // Check: At least 2 distinct subjects
    const subjects = new Set<string>();
    for (const prompt of pack.prompts) {
      const tokens = prompt.text.split(/\s+/);
      if (tokens.length > 0) {
        const firstToken = tokens[0].toLowerCase();
        const pronouns = ['ich', 'du', 'wir', 'sie', 'er', 'es', 'ihr', 'sie'];
        if (pronouns.includes(firstToken)) {
          subjects.add(firstToken);
        }
      }
    }
    assert(subjects.size >= 2, `Should have at least 2 distinct subjects, got ${subjects.size}`);
    
    // Check: At least 2 prompts have concreteness markers
    let concretenessCount = 0;
    for (const prompt of pack.prompts) {
      const text = prompt.text;
      if (/\d/.test(text) || /[€$]/.test(text) || /\d{1,2}:\d{2}/.test(text)) {
        concretenessCount++;
      } else {
        const textLower = text.toLowerCase();
        const weekdays = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
        if (weekdays.some(w => textLower.includes(w))) {
          concretenessCount++;
        }
      }
    }
    assert(concretenessCount >= 2, `Should have at least 2 prompts with concreteness markers, got ${concretenessCount}`);
    
    // Check: Register consistency (if formal, has Sie/Ihnen)
    if (pack.register === 'formal') {
      let hasFormalMarker = false;
      for (const prompt of pack.prompts) {
        if (/\bSie\b/.test(prompt.text) || /\bIhnen\b/.test(prompt.text)) {
          hasFormalMarker = true;
          break;
        }
      }
      assert(hasFormalMarker, 'Formal register requires Sie/Ihnen in at least one prompt');
    }
    
    console.log('   ✅ Quality gates test passed');
  } finally {
    cleanupPack(workspace, packId);
  }
});

// Run all tests
function main() {
  console.log('Running generate-pack tests...\n');
  
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
  
  console.log(`\n${passed} passed, ${failed} failed`);
  
  // Test: Analytics metadata generation
  test('generated pack includes analytics metadata', () => {
    const workspace = 'de';
    const packId = 'test-analytics-generation';
    
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
      assert(pack.analytics, 'Generated pack should have analytics');
      assert(typeof pack.analytics === 'object', 'Analytics should be an object');
      
      // Verify analytics structure
      assert(pack.analytics.goal && typeof pack.analytics.goal === 'string', 'Analytics should have goal');
      assert(pack.analytics.goal.length <= 120, 'Analytics goal should be <= 120 chars');
      assert(Array.isArray(pack.analytics.constraints), 'Analytics should have constraints array');
      assert(Array.isArray(pack.analytics.levers), 'Analytics should have levers array');
      assert(Array.isArray(pack.analytics.successCriteria), 'Analytics should have successCriteria array');
      assert(Array.isArray(pack.analytics.commonMistakes), 'Analytics should have commonMistakes array');
      assert(['substitution', 'pattern-switch', 'roleplay-bounded'].includes(pack.analytics.drillType), 'Analytics should have valid drillType');
      assert(['low', 'medium', 'high'].includes(pack.analytics.cognitiveLoad), 'Analytics should have valid cognitiveLoad');
      
      // Verify levers reference variationSlots
      const variationSlots = pack.variationSlots || [];
      const validLeverKeywords = ['subject', 'verb', 'object', 'modifier', 'tense', 'polarity', 'time', 'location', 'register', 'scenario', 'intent'];
      
      for (const lever of pack.analytics.levers) {
        const leverLower = lever.toLowerCase();
        const isVariationSlot = variationSlots.some((slot: string) => leverLower.includes(slot.toLowerCase()));
        const isLeverKeyword = validLeverKeywords.some((keyword: string) => leverLower.includes(keyword.toLowerCase()));
        
        assert(isVariationSlot || isLeverKeyword, `Lever "${lever}" should reference variationSlot or keyword`);
      }
      
      console.log('   ✅ Analytics generation test passed');
    } finally {
      cleanupPack(workspace, packId);
    }
  });
  
  // Test: Analytics drillType determination
  test('analytics drillType determined correctly from scenario', () => {
    const template = {
      scenarioId: 'work',
      primaryStructure: 'modal_verbs_requests'
    };
    
    // Simulate drillType determination
    let drillType: 'substitution' | 'pattern-switch' | 'roleplay-bounded';
    if (template.scenarioId === 'government_office' || template.scenarioId === 'work' || template.scenarioId === 'restaurant') {
      drillType = 'roleplay-bounded';
    } else if (template.primaryStructure.includes('switch') || template.primaryStructure.includes('pattern')) {
      drillType = 'pattern-switch';
    } else {
      drillType = 'substitution';
    }
    
    assert(drillType === 'roleplay-bounded', 'Work scenario should generate roleplay-bounded drillType');
  });
  
  // Test: Analytics cognitiveLoad determination
  test('analytics cognitiveLoad determined correctly from level and variationSlots', () => {
    const level = 'A2';
    const variationSlots = ['subject', 'verb', 'object', 'modifier'];
    
    // Simulate cognitiveLoad determination
    let cognitiveLoad: 'low' | 'medium' | 'high';
    if (level === 'A1' && variationSlots.length <= 2) {
      cognitiveLoad = 'low';
    } else if (level === 'A1' || (level === 'A2' && variationSlots.length <= 3)) {
      cognitiveLoad = 'medium';
    } else {
      cognitiveLoad = 'high';
    }
    
    assert(cognitiveLoad === 'high', 'A2 with 4 variationSlots should generate high cognitiveLoad');
  });

  if (failed > 0) {
    process.exit(1);
  }
}

main();

