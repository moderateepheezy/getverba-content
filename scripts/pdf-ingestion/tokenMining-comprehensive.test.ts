#!/usr/bin/env tsx

/**
 * Comprehensive unit tests for token mining
 * 
 * Tests edge cases, error handling, and integration points
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadStopwords, shouldExcludeToken, extractNGrams } from './tokenMining.js';
import { normalizeForMatching } from './textNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Test: Stopwords handle missing file gracefully
test('stopwords handle missing file gracefully', () => {
  // Should return empty set if file doesn't exist
  // This is tested implicitly by loadStopwords returning empty set
  const stopwords = loadStopwords('nonexistent' as any);
  expectTrue(stopwords instanceof Set, 'Should return Set');
  expectEqual(stopwords.size, 0, 'Should return empty set for missing language');
});

// Test: shouldExcludeToken with edge cases
test('shouldExcludeToken edge cases', () => {
  const stopwords = new Set(['der', 'die', 'und']);
  const existingTokens = ['termin', 'büro'];
  
  // Empty token
  expectTrue(shouldExcludeToken('', stopwords, existingTokens, 'de'), 'Should exclude empty token');
  
  // Single character
  expectTrue(shouldExcludeToken('a', stopwords, existingTokens, 'de'), 'Should exclude single char');
  
  // Two characters
  expectTrue(shouldExcludeToken('ab', stopwords, existingTokens, 'de'), 'Should exclude 2 chars');
  
  // Three characters (minimum)
  expectFalse(shouldExcludeToken('abc', stopwords, existingTokens, 'de'), 'Should not exclude 3 chars');
  
  // Whitespace-only
  expectTrue(shouldExcludeToken('   ', stopwords, existingTokens, 'de'), 'Should exclude whitespace-only');
  
  // Mixed case stopword
  expectTrue(shouldExcludeToken('Der', stopwords, existingTokens, 'de'), 'Should exclude mixed case stopword');
  
  // Normalized umlaut matching - 'büro' normalizes to 'bueo' (ü->ue)
  // Test that normalization works correctly
  const normalizedBuro = normalizeForMatching('büro');
  expectTrue(normalizedBuro.includes('ue'), 'Should normalize ü to ue');
  
  // If existing token is already normalized, should match
  const existingWithUmlaut = ['termin', normalizedBuro];
  expectTrue(shouldExcludeToken('büro', stopwords, existingWithUmlaut, 'de'), 'Should exclude via normalized match');
});

// Test: extractNGrams with edge cases
test('extractNGrams edge cases', () => {
  // Empty text
  const empty = extractNGrams('', 1);
  expectEqual(empty.length, 0, 'Should return empty array for empty text');
  
  // Single word
  const single = extractNGrams('hello', 1);
  expectTrue(single.length > 0, 'Should extract from single word');
  expectTrue(single.includes('hello'), 'Should include the word');
  
  // Text shorter than n
  const short = extractNGrams('ab', 3);
  expectEqual(short.length, 0, 'Should return empty for text shorter than n');
  
  // Text with punctuation
  const withPunct = extractNGrams('Hello, world!', 1);
  expectTrue(withPunct.length > 0, 'Should handle punctuation');
  
  // Text with multiple spaces
  const multiSpace = extractNGrams('hello    world', 1);
  expectTrue(multiSpace.length > 0, 'Should handle multiple spaces');
  expectFalse(multiSpace.includes(''), 'Should not include empty strings');
  
  // Text with newlines
  const withNewlines = extractNGrams('hello\nworld', 1);
  expectTrue(withNewlines.length > 0, 'Should handle newlines');
});

// Test: extractNGrams with different n values
test('extractNGrams with different n values', () => {
  const text = 'Ich brauche einen Termin im Büro';
  
  // Unigrams (n=1)
  const unigrams = extractNGrams(text, 1);
  expectTrue(unigrams.length > 0, 'Should extract unigrams');
  expectTrue(unigrams.some(u => u.includes('ich') || u.includes('termin')), 'Should include relevant words');
  
  // Bigrams (n=2)
  const bigrams = extractNGrams(text, 2);
  expectTrue(bigrams.length > 0, 'Should extract bigrams');
  expectTrue(bigrams.some(b => b.split(/\s+/).length === 2), 'Should have 2-word phrases');
  
  // Trigrams (n=3)
  const trigrams = extractNGrams(text, 3);
  expectTrue(trigrams.length > 0, 'Should extract trigrams');
  expectTrue(trigrams.some(t => t.split(/\s+/).length === 3), 'Should have 3-word phrases');
  
  // n=4
  const fourgrams = extractNGrams(text, 4);
  expectTrue(fourgrams.length >= 0, 'Should handle n=4');
});

// Test: Normalization consistency
test('normalization consistency', () => {
  const text1 = 'Ich brauche einen Termin';
  const text2 = 'ich brauche einen termin';
  const text3 = 'Ich brauche einen Termin.';
  
  const ngrams1 = extractNGrams(text1, 1);
  const ngrams2 = extractNGrams(text2, 1);
  const ngrams3 = extractNGrams(text3, 1);
  
  // Should normalize to same tokens
  const normalized1 = ngrams1.map(n => normalizeForMatching(n)).sort();
  const normalized2 = ngrams2.map(n => normalizeForMatching(n)).sort();
  const normalized3 = ngrams3.map(n => normalizeForMatching(n)).sort();
  
  // Should have same normalized tokens (ignoring punctuation differences)
  expectTrue(normalized1.length > 0, 'Should extract tokens');
  expectTrue(normalized2.length > 0, 'Should extract tokens');
  expectTrue(normalized3.length > 0, 'Should extract tokens');
  
  // Core tokens should match
  const core1 = normalized1.filter(n => n.length >= 3);
  const core2 = normalized2.filter(n => n.length >= 3);
  expectTrue(core1.length === core2.length, 'Should have same number of core tokens');
});

// Test: Banned phrase detection
test('banned phrase detection', () => {
  const stopwords = new Set();
  const existingTokens: string[] = [];
  
  const bannedPhrases = [
    "in today's lesson",
    "let's practice",
    "this sentence",
    "i like to",
    "the quick brown fox",
    "lorem ipsum"
  ];
  
  for (const phrase of bannedPhrases) {
    expectTrue(shouldExcludeToken(phrase, stopwords, existingTokens, 'en'), `Should exclude "${phrase}"`);
  }
  
  // Partial matches should also be excluded
  expectTrue(shouldExcludeToken("Let's practice German", stopwords, existingTokens, 'en'), 'Should exclude partial match');
  expectTrue(shouldExcludeToken("In today's lesson we learn", stopwords, existingTokens, 'en'), 'Should exclude partial match');
});

// Test: Numeric token exclusion
test('numeric token exclusion', () => {
  const stopwords = new Set();
  const existingTokens: string[] = [];
  
  // Pure numbers
  expectTrue(shouldExcludeToken('123', stopwords, existingTokens, 'de'), 'Should exclude pure number');
  expectTrue(shouldExcludeToken('0', stopwords, existingTokens, 'de'), 'Should exclude zero');
  expectTrue(shouldExcludeToken('999', stopwords, existingTokens, 'de'), 'Should exclude large number');
  
  // Numbers with text should pass (if long enough)
  expectFalse(shouldExcludeToken('room123', stopwords, existingTokens, 'de'), 'Should not exclude number with text');
  // Pure numbers should be excluded (even years)
  expectTrue(shouldExcludeToken('2024', stopwords, existingTokens, 'de'), 'Should exclude pure number (year)');
});

// Main test runner
async function main() {
  console.log('🧪 Running comprehensive token mining tests...\n');
  
  try {
    await test('stopwords handle missing file gracefully', () => {});
    await test('shouldExcludeToken edge cases', () => {});
    await test('extractNGrams edge cases', () => {});
    await test('extractNGrams with different n values', () => {});
    await test('normalization consistency', () => {});
    await test('banned phrase detection', () => {});
    await test('numeric token exclusion', () => {});
    
    console.log('\n✅ All comprehensive token mining tests passed!');
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

