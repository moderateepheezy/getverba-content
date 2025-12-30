#!/usr/bin/env tsx

/**
 * Unit tests for PDF ingestion utilities
 * 
 * Tests normalization, segmentation, quality checks, text normalization, and scenario scoring.
 */

import { normalizeText } from './pdf-ingestion/normalize.js';
import { segmentText, validateSegmentation } from './pdf-ingestion/segment.js';
import { checkCandidateQuality } from './pdf-ingestion/quality.js';
import { normalizeForMatching, matchesPhrase } from './pdf-ingestion/textNormalize.js';
import { scoreCandidate } from './pdf-ingestion/scenarioScore.js';
import type { PageText } from './pdf-ingestion/extract.js';
import type { Candidate } from './pdf-ingestion/segment.js';

// Simple test framework helpers
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

function expect(actual: any, expected: any, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function expectTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Expected true, got false');
  }
}

function expectFalse(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Expected false, got true');
  }
}

// Test data
const samplePages: PageText[] = [
  { pageNumber: 1, text: 'Header Line\n\nGuten Tag. Wie kann ich Ihnen helfen?\n\nIch brauche einen Termin.\n\nFooter Line', charCount: 60 },
  { pageNumber: 2, text: 'Header Line\n\nDas Formular ist hier.\n\nBitte füllen Sie es aus.\n\nFooter Line', charCount: 55 },
  { pageNumber: 3, text: 'Header Line\n\nDer Pass ist fertig.\n\nSie können ihn abholen.\n\nFooter Line', charCount: 58 }
];

// Run all tests
function runTests() {
  console.log('Running PDF ingestion tests...\n');
  
  try {
    test('Normalization removes header/footer lines appearing on >60% of pages', () => {
      const result = normalizeText(samplePages);
      expectTrue(result.headerFooterLines.length > 0, 'Should detect header/footer lines');
      expectTrue(result.normalizedText.includes('Guten Tag'), 'Should preserve content');
      expectFalse(result.normalizedText.includes('Header Line'), 'Should remove header');
      expectFalse(result.normalizedText.includes('Footer Line'), 'Should remove footer');
    });
    
    test('Normalization de-hyphenates line breaks', () => {
      const pages: PageText[] = [
        { pageNumber: 1, text: 'Infor-\nmation ist wichtig.', charCount: 30 }
      ];
      const result = normalizeText(pages);
      expectTrue(result.normalizedText.includes('Information'), 'Should de-hyphenate');
      expectFalse(result.normalizedText.includes('Infor-\nmation'), 'Should not contain hyphenated word');
    });
    
    test('Segmentation produces candidates', () => {
      const text = 'Guten Tag. Wie kann ich helfen? Ich brauche einen Termin.';
      const result = segmentText(text, 12345);
      expectTrue(result.candidates.length > 0, 'Should produce candidates');
    });
    
    test('Segmentation validates quality', () => {
      const text = 'Sentence one. Sentence two. Sentence three.';
      const result = segmentText(text, 12345);
      const validation = validateSegmentation(result, 12);
      expectFalse(validation.valid, 'Should fail validation when insufficient candidates');
      expectTrue(validation.errors.length > 0, 'Should have error messages');
    });
    
    test('Quality checks detect banned phrases', () => {
      const candidates: Candidate[] = [
        { id: 'c001', text: "Let's practice German today.", charCount: 30, type: 'sentence' }
      ];
      const result = checkCandidateQuality(candidates, 'work', []);
      expectFalse(result.valid, 'Should fail when banned phrases detected');
    });
    
    test('Deterministic generation produces same output with same seed', () => {
      const text = 'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.';
      const result1 = segmentText(text, 12345);
      const result2 = segmentText(text, 12345);
      expect(result1.candidates.length, result2.candidates.length, 'Should produce same number of candidates');
      expect(result1.candidates.map(c => c.id), result2.candidates.map(c => c.id), 'Should produce same candidate IDs');
    });
    
    test('Text normalization handles umlauts and ß', () => {
      expect(normalizeForMatching('Müller'), 'mueller');
      expect(normalizeForMatching('Größe'), 'groesse');
      expect(normalizeForMatching('Straße'), 'strasse');
      expect(normalizeForMatching('Büro'), 'buero');
    });
    
    test('Text normalization strips punctuation and collapses whitespace', () => {
      expect(normalizeForMatching('Hello, world!'), 'hello world');
      expect(normalizeForMatching('Test   multiple    spaces'), 'test multiple spaces');
    });
    
    test('Phrase matching works correctly', () => {
      const text = normalizeForMatching('Ich suche einen Job');
      expectTrue(matchesPhrase(text, 'ich suche einen job'), 'Should match full phrase');
      expectTrue(matchesPhrase(text, 'job'), 'Should match single word');
      expectFalse(matchesPhrase(text, 'termin vereinbaren'), 'Should not match unrelated phrase');
    });
    
    test('Scenario scoring supports phrase tokens', () => {
      const candidate: Candidate = {
        id: 'c001',
        text: 'Ich suche einen Job im Büro',
        charCount: 25,
        type: 'sentence'
      };
      
      const tokens = ['job', 'büro', 'ich suche einen job', 'im büro'];
      const strongTokens = ['ich suche einen job', 'im büro'];
      
      const score = scoreCandidate(candidate, tokens, 'de', 2, strongTokens);
      
      expectTrue(score.scenarioTokenHits > 0, 'Should have token hits');
      expectTrue(score.strongTokenHits > 0, 'Should have strong token hits');
      expectTrue(score.matchedTokens.length > 0, 'Should have matched tokens');
    });
    
    test('minScenarioHits=1 requires strong token', () => {
      const candidate: Candidate = {
        id: 'c002',
        text: 'Vorstellungsgespräch morgen',
        charCount: 25,
        type: 'sentence'
      };
      
      const tokens = ['vorstellungsgespraech', 'morgen'];
      const strongTokens = ['vorstellungsgespraech'];
      
      const score = scoreCandidate(candidate, tokens, 'de', 1, strongTokens);
      
      expectTrue(score.scenarioTokenHits >= 1, 'Should have at least 1 hit');
      expectTrue(score.strongTokenHits > 0, 'Should have strong token hit');
    });
    
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Tests failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run tests
runTests();
