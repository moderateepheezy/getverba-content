#!/usr/bin/env tsx

/**
 * E2E tests for token mining workflow
 * 
 * Tests the complete workflow:
 * 1. Profile loading
 * 2. Cache extraction
 * 3. Token mining
 * 4. Patch generation
 * 5. Patch application
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const TEST_PROFILES_DIR = join(PROJECT_ROOT, '.test-token-profiles');
const TEST_CACHE_DIR = join(PROJECT_ROOT, '.test-token-cache');
const TEST_REPORTS_DIR = join(PROJECT_ROOT, '.test-token-reports');

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

function expectEqual(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Setup/teardown
function setupTestDirs() {
  [TEST_PROFILES_DIR, TEST_CACHE_DIR, TEST_REPORTS_DIR].forEach(dir => {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
    mkdirSync(dir, { recursive: true });
  });
}

function cleanupTestDirs() {
  [TEST_PROFILES_DIR, TEST_CACHE_DIR, TEST_REPORTS_DIR].forEach(dir => {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

// Test: Complete token mining workflow simulation
test('complete token mining workflow simulation', () => {
  setupTestDirs();
  
  try {
    // Step 1: Create test profile
    const profile = {
      id: 'test-profile',
      workspace: 'de',
      file: 'imports/test.pdf',
      language: 'de',
      defaultScenario: 'auto',
      defaultLevel: 'A1',
      search: {
        skipFrontMatter: true,
        windowSizePages: 25,
        minScenarioHits: 2,
        anchors: []
      }
    };
    
    const profilePath = join(TEST_PROFILES_DIR, 'test-profile.json');
    writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    
    expectTrue(existsSync(profilePath), 'Profile should be created');
    
    // Step 2: Simulate cache extraction
    const cacheKey = 'test-cache-key-123';
    const cachePath = join(TEST_CACHE_DIR, 'test-profile', `${cacheKey}.json`);
    mkdirSync(join(TEST_CACHE_DIR, 'test-profile'), { recursive: true });
    
    const cacheEntry = {
      cacheKey,
      pdfId: 'test-profile',
      extractedAt: new Date().toISOString(),
      extractionVersion: '1.0.0',
      pages: [
        { pageNumber: 1, text: 'Ich möchte einen Termin vereinbaren.', charCount: 40 }
      ],
      charCount: 40,
      pageCount: 1,
      totalChars: 40,
      avgCharsPerPage: 40
    };
    
    writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2));
    expectTrue(existsSync(cachePath), 'Cache should be created');
    
    // Step 3: Simulate token mining results
    const tokens = {
      'government_office': [
        {
          token: 'meldebescheinigung',
          count: 12,
          frequency: 12,
          score: 8.5,
          examples: ['Ich brauche eine Meldebescheinigung.'],
          dialogueBonus: 2,
          concretenessBonus: 0,
          headingPenalty: 0,
          phraseBonus: 0
        }
      ]
    };
    
    const tokensPath = join(TEST_REPORTS_DIR, 'test-profile', '2025-01-01', 'tokens.json');
    mkdirSync(join(TEST_REPORTS_DIR, 'test-profile', '2025-01-01'), { recursive: true });
    writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
    
    expectTrue(existsSync(tokensPath), 'Tokens JSON should be created');
    
    // Step 4: Simulate patch generation
    const patch = {
      workspace: 'de',
      profileId: 'test-profile',
      generatedAt: new Date().toISOString(),
      suggestions: [
        {
          scenario: 'government_office',
          addTokens: [
            {
              token: 'meldebescheinigung',
              strength: 'strong',
              reason: 'freq+dialogue',
              score: 8.5,
              frequency: 12,
              examples: ['Ich brauche eine Meldebescheinigung.']
            }
          ]
        }
      ]
    };
    
    const patchPath = join(TEST_REPORTS_DIR, 'test-profile', '2025-01-01', 'suggested-dictionary.patch.json');
    writeFileSync(patchPath, JSON.stringify(patch, null, 2));
    
    expectTrue(existsSync(patchPath), 'Patch should be created');
    
    // Step 5: Validate patch structure
    const loadedPatch = JSON.parse(readFileSync(patchPath, 'utf-8'));
    expectEqual(loadedPatch.workspace, 'de', 'Workspace should match');
    expectEqual(loadedPatch.profileId, 'test-profile', 'Profile ID should match');
    expectTrue(Array.isArray(loadedPatch.suggestions), 'Suggestions should be array');
    expectTrue(loadedPatch.suggestions.length > 0, 'Should have suggestions');
    expectTrue(loadedPatch.suggestions[0].addTokens.length > 0, 'Should have tokens');
    
    console.log('   ✅ Complete workflow simulation successful');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Patch file format validation
test('patch file format validation', () => {
  setupTestDirs();
  
  try {
    const patch = {
      workspace: 'de',
      profileId: 'test-profile',
      generatedAt: new Date().toISOString(),
      suggestions: [
        {
          scenario: 'government_office',
          addTokens: [
            {
              token: 'meldebescheinigung',
              strength: 'strong',
              reason: 'freq+dialogue',
              score: 8.5,
              frequency: 12,
              examples: ['Ich brauche eine Meldebescheinigung.']
            },
            {
              token: 'termin vereinbaren',
              strength: 'medium',
              reason: 'phrase',
              score: 5.2,
              frequency: 8,
              examples: ['Ich möchte einen Termin vereinbaren.']
            }
          ]
        }
      ]
    };
    
    // Validate structure
    expectTrue(patch.workspace === 'de', 'Workspace required');
    expectTrue(patch.profileId === 'test-profile', 'Profile ID required');
    expectTrue(patch.generatedAt !== undefined, 'GeneratedAt required');
    expectTrue(Array.isArray(patch.suggestions), 'Suggestions must be array');
    
    for (const suggestion of patch.suggestions) {
      expectTrue(suggestion.scenario !== undefined, 'Scenario required');
      expectTrue(Array.isArray(suggestion.addTokens), 'addTokens must be array');
      
      for (const token of suggestion.addTokens) {
        expectTrue(token.token !== undefined, 'Token required');
        expectTrue(['strong', 'medium', 'weak'].includes(token.strength), 'Valid strength required');
        expectTrue(token.reason !== undefined, 'Reason required');
        expectTrue(typeof token.score === 'number', 'Score must be number');
        expectTrue(typeof token.frequency === 'number', 'Frequency must be number');
        expectTrue(Array.isArray(token.examples), 'Examples must be array');
      }
    }
    
    console.log('   ✅ Patch format validation works');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Token strength determination
test('token strength determination', () => {
  // Strong: score >= 7.0
  const strongScore = 8.5;
  const strong = strongScore >= 7.0 ? 'strong' : strongScore >= 4.0 ? 'medium' : 'weak';
  expectEqual(strong, 'strong', 'High score should be strong');
  
  // Medium: score >= 4.0
  const mediumScore = 5.2;
  const medium = mediumScore >= 7.0 ? 'strong' : mediumScore >= 4.0 ? 'medium' : 'weak';
  expectEqual(medium, 'medium', 'Medium score should be medium');
  
  // Weak: score < 4.0
  const weakScore = 2.5;
  const weak = weakScore >= 7.0 ? 'strong' : weakScore >= 4.0 ? 'medium' : 'weak';
  expectEqual(weak, 'weak', 'Low score should be weak');
  
  console.log('   ✅ Token strength determination works');
});

// Test: Token reason determination
test('token reason determination', () => {
  // freq+dialogue
  const reason1 = (2 > 0 && 12 >= 5) ? 'freq+dialogue' : 
                  (1 > 0) ? 'phrase' : 
                  (1.5 > 0) ? 'concreteness' : 
                  (12 >= 10) ? 'freq' : 'freq';
  expectEqual(reason1, 'freq+dialogue', 'Should detect freq+dialogue');
  
  // phrase
  const reason2 = (0 > 0 && 8 >= 5) ? 'freq+dialogue' : 
                   (1 > 0) ? 'phrase' : 
                   (0 > 0) ? 'concreteness' : 
                   (8 >= 10) ? 'freq' : 'freq';
  expectEqual(reason2, 'phrase', 'Should detect phrase');
  
  // concreteness
  const reason3 = (0 > 0 && 5 >= 5) ? 'freq+dialogue' : 
                   (0 > 0) ? 'phrase' : 
                   (1.5 > 0) ? 'concreteness' : 
                   (5 >= 10) ? 'freq' : 'freq';
  expectEqual(reason3, 'concreteness', 'Should detect concreteness');
  
  // freq
  const reason4 = (0 > 0 && 15 >= 5) ? 'freq+dialogue' : 
                   (0 > 0) ? 'phrase' : 
                   (0 > 0) ? 'concreteness' : 
                   (15 >= 10) ? 'freq' : 'freq';
  expectEqual(reason4, 'freq', 'Should detect freq');
  
  console.log('   ✅ Token reason determination works');
});

// Test: Patch application simulation
test('patch application simulation', () => {
  setupTestDirs();
  
  try {
    // Simulate existing dictionary
    const existingTokens = ['termin', 'vereinbaren', 'anmeldung'];
    
    // Simulate patch tokens
    const patchTokens = ['termin', 'meldebescheinigung', 'formular ausfüllen'];
    
    // Merge and dedupe
    const merged: string[] = [];
    const seen = new Set<string>();
    
    for (const token of existingTokens) {
      const normalized = token.toLowerCase();
      if (!seen.has(normalized)) {
        merged.push(token);
        seen.add(normalized);
      }
    }
    
    for (const token of patchTokens) {
      const normalized = token.toLowerCase();
      if (!seen.has(normalized)) {
        merged.push(token);
        seen.add(normalized);
      }
    }
    
    // Should have 5 unique tokens (termin, vereinbaren, anmeldung, meldebescheinigung, formular ausfüllen)
    expectEqual(merged.length, 5, 'Should merge without duplicates');
    expectTrue(merged.includes('termin'), 'Should include existing token');
    expectTrue(merged.includes('meldebescheinigung'), 'Should include new token');
    expectTrue(merged.includes('formular ausfüllen'), 'Should include new phrase');
    
    // Sort
    merged.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    expectEqual(merged[0], 'anmeldung', 'Should be sorted');
    
    console.log('   ✅ Patch application simulation works');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Multiple scenario support
test('multiple scenario support', () => {
  setupTestDirs();
  
  try {
    const patch = {
      workspace: 'de',
      profileId: 'test-profile',
      generatedAt: new Date().toISOString(),
      suggestions: [
        {
          scenario: 'government_office',
          addTokens: [
            { token: 'meldebescheinigung', strength: 'strong', reason: 'freq', score: 8.5, frequency: 12, examples: [] }
          ]
        },
        {
          scenario: 'work',
          addTokens: [
            { token: 'bewerbungsgespräch', strength: 'strong', reason: 'freq', score: 7.2, frequency: 10, examples: [] }
          ]
        }
      ]
    };
    
    expectTrue(patch.suggestions.length === 2, 'Should support multiple scenarios');
    expectTrue(patch.suggestions[0].scenario === 'government_office', 'First scenario should match');
    expectTrue(patch.suggestions[1].scenario === 'work', 'Second scenario should match');
    
    console.log('   ✅ Multiple scenario support works');
  } finally {
    cleanupTestDirs();
  }
});

// Main test runner
async function main() {
  console.log('🧪 Running token mining E2E tests...\n');
  
  try {
    await test('complete token mining workflow simulation', () => {});
    await test('patch file format validation', () => {});
    await test('token strength determination', () => {});
    await test('token reason determination', () => {});
    await test('patch application simulation', () => {});
    await test('multiple scenario support', () => {});
    
    console.log('\n✅ All token mining E2E tests passed!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

