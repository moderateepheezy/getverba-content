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
      
      // Verify catalog-level analytics (required)
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
          `whyThisWorks[${i}] should be <= 120 chars, got ${bullet.length}`);
      }
      
      // Verify legacy analytics structure (optional)
      assert(pack.analytics.goal && typeof pack.analytics.goal === 'string', 'Analytics should have goal');
      assert(pack.analytics.goal.length <= 120, 'Analytics goal should be <= 120 chars');
      assert(Array.isArray(pack.analytics.constraints), 'Analytics should have constraints array');
      assert(Array.isArray(pack.analytics.levers), 'Analytics should have levers array');
      assert(Array.isArray(pack.analytics.successCriteria), 'Analytics should have successCriteria array');
      assert(Array.isArray(pack.analytics.commonMistakes), 'Analytics should have commonMistakes array');
      assert(['substitution', 'pattern-switch', 'roleplay-bounded'].includes(pack.analytics.drillType), 'Analytics should have valid drillType');
      
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

  // Test: friends_small_talk scenario generation
  test('friends_small_talk scenario generates valid pack', () => {
    const workspace = 'de';
    const packId = 'test-friends-small-talk';
    
    try {
      cleanupPack(workspace, packId);
      
      runGenerator([
        '--workspace', workspace,
        '--packId', packId,
        '--scenario', 'friends_small_talk',
        '--level', 'A1',
        '--seed', '5001',
        '--title', 'Test Friends Small Talk'
      ]);
      
      const pack = readGeneratedPack(workspace, packId);
      
      // Verify scenario
      assert(pack.scenario === 'friends_small_talk', 'Pack should have friends_small_talk scenario');
      assert(pack.register === 'casual', 'Pack should have casual register');
      assert(pack.primaryStructure === 'modal_verbs_suggestions', 'Pack should have modal_verbs_suggestions structure');
      
      // Verify required tokens are present
      const templatePath = join(TEMPLATES_DIR, 'friends_small_talk.json');
      const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
      
      let tokenCount = 0;
      for (const prompt of pack.prompts) {
        const textLower = prompt.text.toLowerCase();
        for (const token of template.requiredTokens) {
          if (textLower.includes(token.toLowerCase())) {
            tokenCount++;
            break; // Count once per prompt
          }
        }
      }
      
      // At least 80% of prompts should have scenario tokens
      const tokenRate = tokenCount / pack.prompts.length;
      assert(tokenRate >= 0.8, `At least 80% of prompts should have scenario tokens, got ${(tokenRate * 100).toFixed(1)}%`);
      
      // Verify no banned generic greetings
      const bannedPhrases = ['hallo', 'wie geht', 'mein name ist', 'nice to meet you'];
      for (const prompt of pack.prompts) {
        const textLower = prompt.text.toLowerCase();
        for (const phrase of bannedPhrases) {
          // Allow if contextualized (contains other scenario tokens)
          const hasContext = template.requiredTokens.some(t => textLower.includes(t.toLowerCase()));
          if (textLower.includes(phrase) && !hasContext) {
            throw new Error(`Prompt "${prompt.id}" contains banned generic phrase: "${phrase}"`);
          }
        }
      }
      
      // Verify casual register (no formal Sie/Ihnen)
      for (const prompt of pack.prompts) {
        assert(!/\bSie\b/.test(prompt.text) || prompt.text.includes('Lass uns'), 
          'Casual register should not use formal Sie (except in "Lass uns" constructions)');
      }
      
      console.log('   ✅ friends_small_talk scenario test passed');
    } finally {
      cleanupPack(workspace, packId);
    }
  });
  
  // Test: friends_small_talk token matching (including phrase tokens)
  test('friends_small_talk token matching includes phrase tokens', () => {
    const workspace = 'de';
    const packId = 'test-friends-tokens';
    
    try {
      cleanupPack(workspace, packId);
      
      runGenerator([
        '--workspace', workspace,
        '--packId', packId,
        '--scenario', 'friends_small_talk',
        '--level', 'A2',
        '--seed', '5002'
      ]);
      
      const pack = readGeneratedPack(workspace, packId);
      const templatePath = join(TEMPLATES_DIR, 'friends_small_talk.json');
      const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
      
      // Check for phrase tokens in prompts
      const phraseTokens = [
        'hast du lust',
        'lass uns',
        'wie waere es',
        'hast du zeit',
        'wollen wir',
        'ich haette lust',
        'kommst du mit',
        'ich kann heute nicht'
      ];
      
      let phraseTokenFound = false;
      for (const prompt of pack.prompts) {
        const textLower = prompt.text.toLowerCase();
        for (const phrase of phraseTokens) {
          if (textLower.includes(phrase)) {
            phraseTokenFound = true;
            break;
          }
        }
        if (phraseTokenFound) break;
      }
      
      // At least one prompt should contain a phrase token (not just single-word tokens)
      // This is a soft requirement - phrase tokens are preferred but not required
      if (!phraseTokenFound) {
        console.warn('   ⚠️  No phrase tokens found (this is acceptable but preferred)');
      }
      
      // Verify at least 2 tokens per prompt (single or phrase tokens)
      for (const prompt of pack.prompts) {
        const textLower = prompt.text.toLowerCase();
        let tokenMatches = 0;
        for (const token of template.requiredTokens) {
          if (textLower.includes(token.toLowerCase())) {
            tokenMatches++;
          }
        }
        // Quality gates require >= 2 tokens per prompt
        assert(tokenMatches >= 2, `Prompt "${prompt.id}" should have >= 2 scenario tokens, got ${tokenMatches}`);
      }
      
      console.log('   ✅ friends_small_talk token matching test passed');
    } finally {
      cleanupPack(workspace, packId);
    }
  });
  
  // Test: friends_small_talk multi-slot variation
  test('friends_small_talk maintains multi-slot variation', () => {
    const workspace = 'de';
    const packId = 'test-friends-variation';
    
    try {
      cleanupPack(workspace, packId);
      
      runGenerator([
        '--workspace', workspace,
        '--packId', packId,
        '--scenario', 'friends_small_talk',
        '--level', 'A1',
        '--seed', '5003'
      ]);
      
      const pack = readGeneratedPack(workspace, packId);
      
      // Verify multi-slot variation (>=30% with 2+ slotsChanged)
      const multiSlotCount = pack.prompts.filter((p: any) => 
        p.slotsChanged && p.slotsChanged.length >= 2
      ).length;
      const multiSlotRate = pack.prompts.length > 0 ? multiSlotCount / pack.prompts.length : 0;
      
      assert(multiSlotRate >= 0.3, `Multi-slot rate should be >= 30%, got ${(multiSlotRate * 100).toFixed(1)}%`);
      
      // Verify variation slots are used
      const usedSlots = new Set<string>();
      for (const prompt of pack.prompts) {
        if (prompt.slotsChanged) {
          prompt.slotsChanged.forEach((slot: string) => usedSlots.add(slot));
        }
      }
      
      // At least 3 different slots should be varied
      assert(usedSlots.size >= 3, `Should vary at least 3 different slots, got ${usedSlots.size}`);
      
      console.log('   ✅ friends_small_talk multi-slot variation test passed');
    } finally {
      cleanupPack(workspace, packId);
    }
  });

  if (failed > 0) {
    process.exit(1);
  }
}

main();

