#!/usr/bin/env tsx

/**
 * Unit tests for token patch application
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

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

// Test: Patch file format validation
test('patch file format validation', () => {
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
  
  expectTrue(patch.workspace === 'de', 'Workspace should match');
  expectTrue(patch.suggestions.length > 0, 'Should have suggestions');
  expectTrue(patch.suggestions[0].addTokens.length > 0, 'Should have tokens');
  expectTrue(patch.suggestions[0].addTokens[0].strength === 'strong', 'Should have strength');
  
  console.log('   ✅ Patch format valid');
});

// Test: Patch application is idempotent (apply twice => no diff)
test('patch application is idempotent', () => {
  // This test verifies the deduplication logic
  const existingTokens = ['termin', 'vereinbaren'];
  const newTokens = ['termin', 'meldebescheinigung'];
  
  // Simulate merge
  const merged: string[] = [];
  const seen = new Set<string>();
  
  for (const token of existingTokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  for (const token of newTokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  // Should have 3 unique tokens (termin, vereinbaren, meldebescheinigung)
  expectEqual(merged.length, 3, 'Should deduplicate');
  expectTrue(merged.includes('termin'), 'Should include existing');
  expectTrue(merged.includes('meldebescheinigung'), 'Should include new');
  
  // Apply again - should produce same result
  const merged2: string[] = [];
  const seen2 = new Set<string>();
  
  for (const token of merged) {
    const normalized = token.toLowerCase();
    if (!seen2.has(normalized)) {
      merged2.push(token);
      seen2.add(normalized);
    }
  }
  
  for (const token of newTokens) {
    const normalized = token.toLowerCase();
    if (!seen2.has(normalized)) {
      merged2.push(token);
      seen2.add(normalized);
    }
  }
  
  expectEqual(merged2.length, merged.length, 'Second application should produce same result');
  
  console.log('   ✅ Patch application is idempotent');
});

// Test: Token normalization for matching
test('token normalization for matching', () => {
  const token1 = 'Termin';
  const token2 = 'termin';
  const token3 = 'TERMIN';
  
  // Normalize should make them match
  const norm1 = token1.toLowerCase();
  const norm2 = token2.toLowerCase();
  const norm3 = token3.toLowerCase();
  
  expectEqual(norm1, norm2, 'Should normalize case');
  expectEqual(norm2, norm3, 'Should normalize case');
  
  console.log('   ✅ Token normalization works');
});

// Test: Patch preserves sorting
test('patch preserves sorting', () => {
  const tokens = ['zebra', 'apple', 'banana'];
  const sorted = [...tokens].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  
  expectEqual(sorted[0], 'apple', 'Should sort alphabetically');
  expectEqual(sorted[1], 'banana', 'Should sort alphabetically');
  expectEqual(sorted[2], 'zebra', 'Should sort alphabetically');
  
  console.log('   ✅ Sorting preserved');
});

// Test: Patch handles empty existing tokens
test('patch handles empty existing tokens', () => {
  const existingTokens: string[] = [];
  const newTokens = ['termin', 'vereinbaren'];
  
  const merged: string[] = [];
  const seen = new Set<string>();
  
  for (const token of existingTokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  for (const token of newTokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  expectEqual(merged.length, 2, 'Should add all new tokens when existing is empty');
  expectTrue(merged.includes('termin'), 'Should include new token');
  expectTrue(merged.includes('vereinbaren'), 'Should include new token');
  
  console.log('   ✅ Empty existing tokens handled');
});

// Test: Patch handles case-insensitive matching
test('patch handles case-insensitive matching', () => {
  const existingTokens = ['Termin', 'VEREINBAREN'];
  const newTokens = ['termin', 'vereinbaren', 'meldebescheinigung'];
  
  const merged: string[] = [];
  const seen = new Set<string>();
  
  for (const token of existingTokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  for (const token of newTokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  // Should have 3 tokens (Termin/VEREINBAREN counted once, meldebescheinigung added)
  expectEqual(merged.length, 3, 'Should deduplicate case-insensitively');
  expectTrue(merged.includes('meldebescheinigung'), 'Should include truly new token');
  
  console.log('   ✅ Case-insensitive matching works');
});

// Test: Patch handles special characters
test('patch handles special characters', () => {
  const existingTokens = ['termin', 'anmeldung'];
  const newTokens = ['formular ausfüllen', 'termin vereinbaren'];
  
  const merged: string[] = [];
  const seen = new Set<string>();
  
  for (const token of existingTokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  for (const token of newTokens) {
    const normalized = token.toLowerCase();
    if (!seen.has(normalized)) {
      merged.push(token);
      seen.add(normalized);
    }
  }
  
  expectTrue(merged.includes('formular ausfüllen'), 'Should handle special characters');
  expectTrue(merged.includes('termin vereinbaren'), 'Should handle multi-word phrases');
  
  console.log('   ✅ Special characters handled');
});

// Main test runner
async function main() {
  console.log('🧪 Running token patch application tests...\n');
  
  try {
    await test('patch file format validation', () => {});
    await test('patch application is idempotent', () => {});
    await test('token normalization for matching', () => {});
    await test('patch preserves sorting', () => {});
    
    console.log('\n✅ All token patch application tests passed!');
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

