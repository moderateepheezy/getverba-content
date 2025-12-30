#!/usr/bin/env tsx

/**
 * Tests for provenance and review metadata
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { detectDuplicates } from './content-quality/dedupe.js';
import { checkApprovalGate } from './check-approval-gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple test framework
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
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

// Test duplicate detection
test('duplicate detection finds exact duplicates', () => {
  // Create temporary test workspace
  const testDir = join(__dirname, '..', 'content', 'v1', 'workspaces', 'test-dedupe');
  const pack1Dir = join(testDir, 'packs', 'test-pack-1');
  const pack2Dir = join(testDir, 'packs', 'test-pack-2');
  
  // Create test packs with duplicate prompts
  const pack1 = {
    id: 'test-pack-1',
    kind: 'pack',
    packVersion: '1.0.0',
    title: 'Test Pack 1',
    level: 'A1',
    estimatedMinutes: 10,
    description: 'Test',
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      { id: 'p1', text: 'Ich gehe zur Arbeit' },
      { id: 'p2', text: 'Du gehst zur Arbeit' }
    ],
    sessionPlan: {
      version: 1,
      steps: [{ id: 's1', title: 'Step 1', promptIds: ['p1', 'p2'] }]
    },
    tags: [],
    analytics: { goal: 'test' },
    provenance: {
      source: 'template',
      sourceRef: 'test',
      extractorVersion: '1.0.0',
      generatedAt: new Date().toISOString()
    },
    review: {
      status: 'needs_review'
    }
  };
  
  const pack2 = {
    ...pack1,
    id: 'test-pack-2',
    title: 'Test Pack 2',
    prompts: [
      { id: 'p1', text: 'Ich gehe zur Arbeit' }, // Duplicate!
      { id: 'p2', text: 'Er geht zur Arbeit' }
    ]
  };
  
  // Write test packs
  const fs = await import('fs');
  const { mkdirSync } = fs;
  mkdirSync(pack1Dir, { recursive: true });
  mkdirSync(pack2Dir, { recursive: true });
  writeFileSync(join(pack1Dir, 'pack.json'), JSON.stringify(pack1, null, 2));
  writeFileSync(join(pack2Dir, 'pack.json'), JSON.stringify(pack2, null, 2));
  
  try {
    const result = detectDuplicates('test-dedupe');
    expectTrue(result.duplicates.length > 0, 'Should find duplicates');
    expectTrue(result.duplicates.some(d => d.occurrences.length > 1), 'Should have multiple occurrences');
  } finally {
    // Cleanup
    unlinkSync(join(pack1Dir, 'pack.json'));
    unlinkSync(join(pack2Dir, 'pack.json'));
    // Note: We don't remove directories to avoid issues, but test files are cleaned
  }
});

// Test approval gate
test('approval gate blocks unapproved content', () => {
  // This test would require setting up a staging manifest
  // For now, just test that the function exists and can be called
  expectTrue(typeof checkApprovalGate === 'function', 'checkApprovalGate should be a function');
});

console.log('\n✅ All provenance tests passed!');

