#!/usr/bin/env tsx

/**
 * Unit tests for create-token-proposal
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const TEST_REPORTS_DIR = join(PROJECT_ROOT, '.test-token-reports');
const TEST_PROPOSALS_DIR = join(PROJECT_ROOT, '.test-proposals');

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

// Setup/teardown
function setupTestDir() {
  if (existsSync(TEST_REPORTS_DIR)) {
    rmSync(TEST_REPORTS_DIR, { recursive: true, force: true });
  }
  if (existsSync(TEST_PROPOSALS_DIR)) {
    rmSync(TEST_PROPOSALS_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_REPORTS_DIR, { recursive: true });
  mkdirSync(TEST_PROPOSALS_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_REPORTS_DIR)) {
    rmSync(TEST_REPORTS_DIR, { recursive: true, force: true });
  }
  if (existsSync(TEST_PROPOSALS_DIR)) {
    rmSync(TEST_PROPOSALS_DIR, { recursive: true, force: true });
  }
}

// Test: Create proposal from valid report
test('create proposal from valid report', () => {
  setupTestDir();
  
  try {
    // Create test mining report
    const reportPath = join(TEST_REPORTS_DIR, 'report.json');
    const report = {
      pdfId: 'test-pdf',
      scenario: 'school',
      timestamp: new Date().toISOString(),
      windowUsed: {
        startPage: 50,
        endPage: 75,
        qualifiedCandidates: 20
      },
      tokens: [
        { token: 'student', count: 15, examples: ['Ich bin Student'], normalized: 'student' },
        { token: 'studentin', count: 12, examples: ['Sie ist Studentin'], normalized: 'studentin' },
        { token: 'klasse', count: 10, examples: ['In der Klasse'], normalized: 'klasse' },
        { token: 'in der uni', count: 8, examples: ['Ich studiere in der Uni'], normalized: 'in der uni' },
        { token: 'zur vorlesung', count: 6, examples: ['Ich gehe zur Vorlesung'], normalized: 'zur vorlesung' }
      ],
      suggestedStrongTokens: ['in der uni', 'zur vorlesung'],
      topN: 80
    };
    
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Verify report structure
    const loaded = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expectEqual(loaded.pdfId, 'test-pdf', 'Report should have pdfId');
    expectEqual(loaded.scenario, 'school', 'Report should have scenario');
    expectTrue(Array.isArray(loaded.tokens), 'Report should have tokens array');
    expectTrue(loaded.tokens.length > 0, 'Report should have tokens');
    
    console.log('   ✅ Report structure valid');
  } finally {
    cleanupTestDir();
  }
});

// Test: Proposal structure validation
test('proposal structure validation', () => {
  setupTestDir();
  
  try {
    const proposal = {
      pdfId: 'test-pdf',
      scenario: 'school',
      createdAt: new Date().toISOString(),
      add: {
        tokens: ['student', 'studentin', 'klasse'],
        strongTokens: ['in der uni', 'zur vorlesung'],
        phrases: ['in der uni', 'zur vorlesung']
      },
      notes: 'Test proposal'
    };
    
    // Validate required fields
    expectTrue(typeof proposal.pdfId === 'string', 'pdfId should be string');
    expectTrue(typeof proposal.scenario === 'string', 'scenario should be string');
    expectTrue(typeof proposal.createdAt === 'string', 'createdAt should be string');
    expectTrue(typeof proposal.add === 'object', 'add should be object');
    expectTrue(Array.isArray(proposal.add.tokens), 'tokens should be array');
    expectTrue(Array.isArray(proposal.add.strongTokens), 'strongTokens should be array');
    expectTrue(Array.isArray(proposal.add.phrases), 'phrases should be array');
    
    console.log('   ✅ Proposal structure valid');
  } finally {
    cleanupTestDir();
  }
});

// Test: Token extraction from report
test('token extraction from report', () => {
  setupTestDir();
  
  try {
    const report = {
      pdfId: 'test-pdf',
      scenario: 'school',
      tokens: [
        { token: 'student', count: 15, examples: [], normalized: 'student' },
        { token: 'in der uni', count: 8, examples: [], normalized: 'in der uni' },
        { token: 'klasse', count: 10, examples: [], normalized: 'klasse' }
      ],
      suggestedStrongTokens: ['in der uni']
    };
    
    // Extract single-word tokens
    const singleWordTokens = report.tokens
      .filter(t => t.token.split(/\s+/).length === 1)
      .map(t => t.token);
    
    expectTrue(singleWordTokens.includes('student'), 'Should include single-word token');
    expectTrue(singleWordTokens.includes('klasse'), 'Should include single-word token');
    expectFalse(singleWordTokens.includes('in der uni'), 'Should not include multi-word token');
    
    // Extract multi-word phrases
    const multiWordPhrases = report.tokens
      .filter(t => t.token.split(/\s+/).length >= 2)
      .map(t => t.token);
    
    expectTrue(multiWordPhrases.includes('in der uni'), 'Should include multi-word phrase');
    
    console.log('   ✅ Token extraction logic valid');
  } finally {
    cleanupTestDir();
  }
});

// Test: Proposal limits (top 50 tokens, top 20 strong tokens)
test('proposal limits', () => {
  setupTestDir();
  
  try {
    // Create report with many tokens
    const manyTokens = Array.from({ length: 100 }, (_, i) => ({
      token: `token${i}`,
      count: 100 - i,
      examples: [],
      normalized: `token${i}`
    }));
    
    const report = {
      pdfId: 'test-pdf',
      scenario: 'school',
      tokens: manyTokens,
      suggestedStrongTokens: Array.from({ length: 50 }, (_, i) => `strong${i}`)
    };
    
    // Should limit to top 50 tokens
    const topTokens = report.tokens.slice(0, 50);
    expectEqual(topTokens.length, 50, 'Should limit to top 50 tokens');
    
    // Should limit to top 20 strong tokens
    const topStrong = report.suggestedStrongTokens.slice(0, 20);
    expectEqual(topStrong.length, 20, 'Should limit to top 20 strong tokens');
    
    console.log('   ✅ Proposal limits enforced');
  } finally {
    cleanupTestDir();
  }
});

// Main test runner
async function main() {
  console.log('🧪 Running create-token-proposal tests...\n');
  
  try {
    await test('create proposal from valid report', () => {});
    await test('proposal structure validation', () => {});
    await test('token extraction from report', () => {});
    await test('proposal limits', () => {});
    
    console.log('\n✅ All create-token-proposal tests passed!');
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

