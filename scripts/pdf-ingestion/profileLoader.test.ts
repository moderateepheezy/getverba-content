#!/usr/bin/env tsx

/**
 * Unit tests for profile loader
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadProfile, loadProfileFromPath, shouldSkipPage, isPreferredPage, shouldRejectCandidate, countAnchorHits } from './profileLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const TEST_PROFILES_DIR = join(PROJECT_ROOT, '.test-profiles');

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
  if (existsSync(TEST_PROFILES_DIR)) {
    rmSync(TEST_PROFILES_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_PROFILES_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_PROFILES_DIR)) {
    rmSync(TEST_PROFILES_DIR, { recursive: true, force: true });
  }
}

// Test: Load profile from path
test('load profile from path', () => {
  setupTestDir();
  
  try {
    const profilePath = join(TEST_PROFILES_DIR, 'test-profile.json');
    const profile = {
      pdfId: 'test-pdf',
      language: 'de',
      defaultScenarios: ['government_office', 'work'],
      anchors: ['Termin', 'Büro']
    };
    
    writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    
    const loaded = loadProfileFromPath(profilePath);
    expectEqual(loaded.pdfId, 'test-pdf', 'Should load pdfId');
    expectEqual(loaded.language, 'de', 'Should load language');
    expectEqual(loaded.defaultScenarios.length, 2, 'Should load defaultScenarios');
    expectEqual(loaded.anchors.length, 2, 'Should load anchors');
  } finally {
    cleanupTestDir();
  }
});

// Test: shouldSkipPage with array format
test('shouldSkipPage with array format', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: [],
    skipPages: [0, 1, 2, 10, 11]
  };
  
  expectTrue(shouldSkipPage(0, profile), 'Page 0 should be skipped');
  expectTrue(shouldSkipPage(1, profile), 'Page 1 should be skipped');
  expectTrue(shouldSkipPage(10, profile), 'Page 10 should be skipped');
  expectTrue(!shouldSkipPage(5, profile), 'Page 5 should not be skipped');
});

// Test: shouldSkipPage with ranges format
test('shouldSkipPage with ranges format', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: [],
    skipPages: {
      ranges: ['0-12', '350-380']
    }
  };
  
  expectTrue(shouldSkipPage(0, profile), 'Page 0 should be skipped');
  expectTrue(shouldSkipPage(10, profile), 'Page 10 should be skipped');
  expectTrue(shouldSkipPage(12, profile), 'Page 12 should be skipped');
  expectTrue(shouldSkipPage(350, profile), 'Page 350 should be skipped');
  expectTrue(shouldSkipPage(365, profile), 'Page 365 should be skipped');
  expectTrue(shouldSkipPage(380, profile), 'Page 380 should be skipped');
  expectTrue(!shouldSkipPage(13, profile), 'Page 13 should not be skipped');
  expectTrue(!shouldSkipPage(349, profile), 'Page 349 should not be skipped');
});

// Test: isPreferredPage
test('isPreferredPage', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: [],
    preferPageRanges: ['50-200', '250-300']
  };
  
  expectTrue(isPreferredPage(50, profile), 'Page 50 should be preferred');
  expectTrue(isPreferredPage(100, profile), 'Page 100 should be preferred');
  expectTrue(isPreferredPage(200, profile), 'Page 200 should be preferred');
  expectTrue(isPreferredPage(250, profile), 'Page 250 should be preferred');
  expectTrue(isPreferredPage(275, profile), 'Page 275 should be preferred');
  expectTrue(isPreferredPage(300, profile), 'Page 300 should be preferred');
  expectTrue(!isPreferredPage(49, profile), 'Page 49 should not be preferred');
  expectTrue(!isPreferredPage(201, profile), 'Page 201 should not be preferred');
  expectTrue(!isPreferredPage(249, profile), 'Page 249 should not be preferred');
});

// Test: shouldRejectCandidate
test('shouldRejectCandidate', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: [],
    rejectSections: ['Inhaltsverzeichnis', 'Kapitel', 'Grammatik']
  };
  
  expectTrue(shouldRejectCandidate('Das ist ein Inhaltsverzeichnis', profile), 'Should reject Inhaltsverzeichnis');
  expectTrue(shouldRejectCandidate('Kapitel 1: Einführung', profile), 'Should reject Kapitel');
  expectTrue(shouldRejectCandidate('Grammatik Übungen', profile), 'Should reject Grammatik');
  expectTrue(!shouldRejectCandidate('Ich brauche einen Termin', profile), 'Should not reject normal text');
});

// Test: countAnchorHits
test('countAnchorHits', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: ['Termin', 'Büro', 'Anmeldung']
  };
  
  expectEqual(countAnchorHits('Ich brauche einen Termin', profile), 1, 'Should find 1 anchor');
  expectEqual(countAnchorHits('Termin im Büro für Anmeldung', profile), 3, 'Should find 3 anchors');
  expectEqual(countAnchorHits('Ich gehe zur Arbeit', profile), 0, 'Should find 0 anchors');
});

// Test: Load profile with missing required fields fails
test('load profile with missing required fields fails', () => {
  setupTestDir();
  
  try {
    const profilePath = join(TEST_PROFILES_DIR, 'invalid-profile.json');
    const invalidProfile = {
      pdfId: 'test'
      // Missing required fields
    };
    
    writeFileSync(profilePath, JSON.stringify(invalidProfile, null, 2));
    
    let errorThrown = false;
    try {
      loadProfileFromPath(profilePath);
    } catch (error: any) {
      errorThrown = true;
      expectTrue(error.message.includes('required fields') || error.message.includes('missing'), 'Should error on missing fields');
    }
    expectTrue(errorThrown, 'Should throw error for invalid profile');
  } finally {
    cleanupTestDir();
  }
});

// Test: Load profile with invalid language fails
test('load profile with invalid language fails', () => {
  setupTestDir();
  
  try {
    const profilePath = join(TEST_PROFILES_DIR, 'invalid-lang.json');
    const invalidProfile = {
      pdfId: 'test',
      language: 'invalid',
      defaultScenarios: [],
      anchors: []
    };
    
    writeFileSync(profilePath, JSON.stringify(invalidProfile, null, 2));
    
    let errorThrown = false;
    try {
      loadProfileFromPath(profilePath);
    } catch (error: any) {
      errorThrown = true;
      expectTrue(error.message.includes('language'), 'Should error on invalid language');
    }
    expectTrue(errorThrown, 'Should throw error for invalid language');
  } finally {
    cleanupTestDir();
  }
});

// Test: shouldSkipPage returns false when no skipPages
test('shouldSkipPage returns false when no skipPages', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: []
  };
  
  expectFalse(shouldSkipPage(0, profile), 'Should not skip when no skipPages defined');
  expectFalse(shouldSkipPage(100, profile), 'Should not skip when no skipPages defined');
});

// Test: isPreferredPage returns true when no preferPageRanges
test('isPreferredPage returns true when no preferPageRanges', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: []
  };
  
  expectTrue(isPreferredPage(0, profile), 'Should prefer all pages when no ranges defined');
  expectTrue(isPreferredPage(100, profile), 'Should prefer all pages when no ranges defined');
});

// Test: shouldRejectCandidate returns false when no rejectSections
test('shouldRejectCandidate returns false when no rejectSections', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: []
  };
  
  expectFalse(shouldRejectCandidate('Inhaltsverzeichnis', profile), 'Should not reject when no rejectSections defined');
  expectFalse(shouldRejectCandidate('Any text', profile), 'Should not reject when no rejectSections defined');
});

// Test: countAnchorHits with empty anchors
test('countAnchorHits with empty anchors', () => {
  const profile = {
    pdfId: 'test',
    language: 'de' as const,
    defaultScenarios: [],
    anchors: []
  };
  
  expectEqual(countAnchorHits('Ich brauche einen Termin', profile), 0, 'Should return 0 for empty anchors');
});

// Main test runner
async function main() {
  console.log('🧪 Running profile loader tests...\n');
  
  try {
    await test('load profile from path', () => {});
    await test('shouldSkipPage with array format', () => {});
    await test('shouldSkipPage with ranges format', () => {});
    await test('isPreferredPage', () => {});
    await test('shouldRejectCandidate', () => {});
    await test('countAnchorHits', () => {});
    await test('load profile with missing required fields fails', () => {});
    await test('load profile with invalid language fails', () => {});
    await test('shouldSkipPage returns false when no skipPages', () => {});
    await test('isPreferredPage returns true when no preferPageRanges', () => {});
    await test('shouldRejectCandidate returns false when no rejectSections', () => {});
    await test('countAnchorHits with empty anchors', () => {});
    
    console.log('\n✅ All profile loader tests passed!');
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

