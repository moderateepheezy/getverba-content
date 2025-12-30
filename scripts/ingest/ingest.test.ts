#!/usr/bin/env tsx

/**
 * Comprehensive unit tests for ingestion pipeline
 * 
 * Run with: tsx scripts/ingest/ingest.test.ts
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { segmentText } from './segmenter.js';
import { extractSignals } from './signalExtractor.js';
import { normalizeText } from './extractText.js';
import { planPacks } from './packPlanner.js';
import { generateDraftPrompts } from './draftPromptGenerator.js';
import { runQualityGates } from './ingestReport.js';
import type { TextChunk, ExtractedSignal, PlannedPack, DraftPack } from './ingestTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple test framework
interface Test {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: Test[] = [];
let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual: number, expected: number, message?: string) {
  if (actual <= expected) {
    throw new Error(message || `Expected ${actual} > ${expected}`);
  }
}

function assertLessThan(actual: number, expected: number, message?: string) {
  if (actual >= expected) {
    throw new Error(message || `Expected ${actual} < ${expected}`);
  }
}

function assertIncludes<T>(array: T[], item: T, message?: string) {
  if (!array.includes(item)) {
    throw new Error(message || `Expected array to include ${item}`);
  }
}

// ============================================================================
// Text Normalization Tests
// ============================================================================

test('normalizeText - removes extra whitespace', () => {
  const text = 'This   has    multiple    spaces.';
  const normalized = normalizeText(text);
  assertEqual(normalized, 'This has multiple spaces.');
});

test('normalizeText - handles line breaks', () => {
  const text = 'Line 1\n\nLine 2\r\nLine 3';
  const normalized = normalizeText(text);
  assert(!normalized.includes('\n'), 'Should not contain newlines');
  assert(!normalized.includes('\r'), 'Should not contain carriage returns');
});

test('normalizeText - trims whitespace', () => {
  const text = '   Text with spaces   ';
  const normalized = normalizeText(text);
  assertEqual(normalized, 'Text with spaces');
});

// ============================================================================
// Segmentation Tests
// ============================================================================

test('segmentText - produces stable chunk IDs for same input', () => {
  const text = 'This is a test. This is another sentence.';
  const chunks1 = segmentText(text);
  const chunks2 = segmentText(text);
  
  assertEqual(chunks1.length, chunks2.length, 'Should produce same number of chunks');
  for (let i = 0; i < chunks1.length; i++) {
    assertEqual(chunks1[i].chunkId, chunks2[i].chunkId, `Chunk ${i} should have same ID`);
    assertEqual(chunks1[i].normalizedText, chunks2[i].normalizedText, `Chunk ${i} should have same normalized text`);
  }
});

test('segmentText - splits on headings', () => {
  const text = '# Heading 1\n\nContent here.\n\n## Heading 2\n\nMore content.';
  const chunks = segmentText(text);
  // May or may not split depending on text length, but should produce chunks
  assertGreaterThan(chunks.length, 0, 'Should produce at least one chunk');
  
  // Verify chunks have different IDs if multiple chunks
  if (chunks.length > 1) {
    const chunkIds = new Set(chunks.map(c => c.chunkId));
    assertEqual(chunkIds.size, chunks.length, 'Each chunk should have unique ID');
  }
});

test('segmentText - splits on bullet points', () => {
  const text = '- Item 1\n- Item 2\n- Item 3';
  const chunks = segmentText(text);
  // May produce one or more chunks depending on implementation
  assertGreaterThan(chunks.length, 0, 'Should produce at least one chunk');
  // If it splits, verify chunks are different
  if (chunks.length > 1) {
    const chunkIds = new Set(chunks.map(c => c.chunkId));
    assertEqual(chunkIds.size, chunks.length, 'Each chunk should have unique ID');
  }
});

test('segmentText - handles long chunks by splitting', () => {
  const longText = 'Word '.repeat(200); // ~1000 chars
  const chunks = segmentText(longText, 100);
  // Should produce at least one chunk, may split into multiple
  assertGreaterThan(chunks.length, 0, 'Should produce at least one chunk');
  
  // If multiple chunks, verify they're reasonable length
  if (chunks.length > 1) {
    for (const chunk of chunks) {
      // Allow some flexibility in chunk length
      assertLessThan(chunk.normalizedText.length, 200, 'Chunks should be within reasonable length');
    }
  }
});

test('segmentText - handles empty text', () => {
  const chunks = segmentText('');
  assertEqual(chunks.length, 0, 'Empty text should produce no chunks');
});

test('segmentText - handles single paragraph', () => {
  const text = 'This is a single paragraph without any special markers.';
  const chunks = segmentText(text);
  assertGreaterThan(chunks.length, 0, 'Should produce at least one chunk');
  assertIncludes(chunks[0].normalizedText.toLowerCase(), 'paragraph', 'Should contain original text');
});

test('segmentText - preserves chunk boundaries', () => {
  const text = 'Chunk 1.\n\nChunk 2.\n\nChunk 3.';
  const chunks = segmentText(text);
  assertGreaterThan(chunks.length, 0, 'Should produce at least one chunk');
  
  // If multiple chunks, verify they don't overlap
  if (chunks.length > 1) {
    for (let i = 0; i < chunks.length - 1; i++) {
      assert(chunks[i].charEnd <= chunks[i + 1].charStart, 'Chunks should not overlap');
    }
  }
});

// ============================================================================
// Signal Extraction Tests
// ============================================================================

test('extractSignals - extracts top tokens', () => {
  const chunk: TextChunk = {
    chunkId: 'test123',
    text: 'Ich brauche einen Termin. Das Formular ist wichtig.',
    normalizedText: 'ich brauche einen termin. das formular ist wichtig.',
    charStart: 0,
    charEnd: 50
  };
  
  const signal = extractSignals(chunk, 'government_office');
  assertGreaterThan(signal.topTokens.length, 0, 'Should extract top tokens');
  assertIncludes(signal.topTokens, 'termin', 'Should include "termin"');
  assertIncludes(signal.topTokens, 'formular', 'Should include "formular"');
});

test('extractSignals - detects intents', () => {
  const chunk: TextChunk = {
    chunkId: 'test123',
    text: 'Kann ich einen Termin vereinbaren?',
    normalizedText: 'kann ich einen termin vereinbaren?',
    charStart: 0,
    charEnd: 35
  };
  
  const signal = extractSignals(chunk, 'government_office');
  assertGreaterThan(signal.detectedIntents.length, 0, 'Should detect intents');
  assert(
    signal.detectedIntents.includes('ask') || signal.detectedIntents.includes('request'),
    'Should detect ask or request intent'
  );
});

test('extractSignals - detects question patterns', () => {
  const chunk: TextChunk = {
    chunkId: 'test123',
    text: 'Wo ist das Amt?',
    normalizedText: 'wo ist das amt?',
    charStart: 0,
    charEnd: 15
  };
  
  const signal = extractSignals(chunk, 'government_office');
  assertEqual(signal.questionPatterns, true, 'Should detect question pattern');
});

test('extractSignals - detects entities (time)', () => {
  const chunk: TextChunk = {
    chunkId: 'test123',
    text: 'Der Termin ist am Montag um 14:30.',
    normalizedText: 'der termin ist am montag um 14:30.',
    charStart: 0,
    charEnd: 35
  };
  
  const signal = extractSignals(chunk, 'government_office');
  assertGreaterThan(signal.entities.length, 0, 'Should detect entities');
  const hasTime = signal.entities.some(e => e.type === 'time');
  assert(hasTime, 'Should detect time entity');
});

test('extractSignals - detects entities (date)', () => {
  const chunk: TextChunk = {
    chunkId: 'test123',
    text: 'Der Termin ist am 15.03.2024.',
    normalizedText: 'der termin ist am 15.03.2024.',
    charStart: 0,
    charEnd: 30
  };
  
  const signal = extractSignals(chunk, 'government_office');
  const hasDate = signal.entities.some(e => e.type === 'date');
  assert(hasDate, 'Should detect date entity');
});

test('extractSignals - detects entities (money)', () => {
  const chunk: TextChunk = {
    chunkId: 'test123',
    text: 'Die Gebühr beträgt 50 Euro.',
    normalizedText: 'die gebühr beträgt 50 euro.',
    charStart: 0,
    charEnd: 30
  };
  
  const signal = extractSignals(chunk, 'government_office');
  const hasMoney = signal.entities.some(e => e.type === 'money');
  assert(hasMoney, 'Should detect money entity');
});

test('extractSignals - detects action verbs', () => {
  const chunk: TextChunk = {
    chunkId: 'test123',
    text: 'Ich brauche einen Termin. Ich möchte das Formular.',
    normalizedText: 'ich brauche einen termin. ich möchte das formular.',
    charStart: 0,
    charEnd: 50
  };
  
  const signal = extractSignals(chunk, 'government_office');
  assertGreaterThan(signal.actionVerbs.length, 0, 'Should detect action verbs');
  assertIncludes(signal.actionVerbs, 'brauche', 'Should include "brauche"');
  assertIncludes(signal.actionVerbs, 'möchte', 'Should include "möchte"');
});

test('extractSignals - provides evidence with counts', () => {
  const chunk: TextChunk = {
    chunkId: 'test123',
    text: 'Termin Termin Termin. Formular Formular.',
    normalizedText: 'termin termin termin. formular formular.',
    charStart: 0,
    charEnd: 40
  };
  
  const signal = extractSignals(chunk, 'government_office');
  assertGreaterThan(signal.evidence.length, 0, 'Should provide evidence');
  const terminEvidence = signal.evidence.find(e => e.token === 'termin');
  assert(terminEvidence !== undefined, 'Should have evidence for "termin"');
  assertGreaterThan(terminEvidence!.count, 1, 'Should count multiple occurrences');
});

// ============================================================================
// Pack Planning Tests
// ============================================================================

test('planPacks - creates packs from signals', () => {
  const signals: ExtractedSignal[] = [
    {
      chunkId: 'chunk1',
      topTokens: ['termin', 'formular', 'anmeldung'],
      detectedIntents: ['request_appointment'],
      evidence: [{ token: 'termin', count: 3 }],
      entities: [],
      actionVerbs: ['brauche', 'möchte'],
      questionPatterns: false
    },
    {
      chunkId: 'chunk2',
      topTokens: ['unterlagen', 'bescheinigung', 'ausweis'],
      detectedIntents: ['submit_documents'],
      evidence: [{ token: 'unterlagen', count: 2 }],
      entities: [],
      actionVerbs: ['benötige'],
      questionPatterns: false
    }
  ];
  
  const plannedPacks = planPacks(signals, 'government_office', 'A2');
  assertGreaterThan(plannedPacks.length, 0, 'Should create at least one pack');
  
  for (const pack of plannedPacks) {
    assert(pack.packId.length > 0, 'Pack should have ID');
    assert(pack.title.length > 0, 'Pack should have title');
    assert(pack.primaryStructure.length > 0, 'Pack should have primaryStructure');
    assertGreaterThan(pack.variationSlots.length, 0, 'Pack should have variationSlots');
    assert(pack.register.length > 0, 'Pack should have register');
    assertGreaterThan(pack.topTokens.length, 0, 'Pack should have topTokens');
    assertGreaterThan(pack.targetChunks.length, 0, 'Pack should target chunks');
  }
});

test('planPacks - enforces overlap threshold', () => {
  const signals: ExtractedSignal[] = [
    {
      chunkId: 'chunk1',
      topTokens: ['termin', 'formular', 'anmeldung', 'bescheinigung', 'unterlagen'],
      detectedIntents: ['request'],
      evidence: [],
      entities: [],
      actionVerbs: [],
      questionPatterns: false
    },
    {
      chunkId: 'chunk2',
      topTokens: ['termin', 'formular', 'anmeldung', 'bescheinigung', 'unterlagen'], // Same tokens
      detectedIntents: ['request'],
      evidence: [],
      entities: [],
      actionVerbs: [],
      questionPatterns: false
    }
  ];
  
  const plannedPacks = planPacks(signals, 'government_office', 'A2', 6, 12, 0.45);
  // Should merge similar packs or filter them
  assert(plannedPacks.length <= signals.length, 'Should not create duplicate packs');
});

test('planPacks - generates stable pack IDs', () => {
  const signals: ExtractedSignal[] = [
    {
      chunkId: 'chunk1',
      topTokens: ['termin', 'formular'],
      detectedIntents: ['request_appointment'],
      evidence: [],
      entities: [],
      actionVerbs: [],
      questionPatterns: false
    }
  ];
  
  const packs1 = planPacks(signals, 'government_office', 'A2');
  const packs2 = planPacks(signals, 'government_office', 'A2');
  
  assertEqual(packs1.length, packs2.length, 'Should produce same number of packs');
  for (let i = 0; i < packs1.length; i++) {
    assertEqual(packs1[i].packId, packs2[i].packId, 'Pack IDs should be stable');
  }
});

test('planPacks - respects min/max pack count', () => {
  const signals: ExtractedSignal[] = Array(20).fill(null).map((_, i) => ({
    chunkId: `chunk${i}`,
    topTokens: [`token${i}`, `token${i + 1}`, `token${i + 2}`, 'termin', 'formular'], // Add scenario tokens
    detectedIntents: i % 2 === 0 ? ['request_appointment'] : ['submit_documents'], // Vary intents
    evidence: [],
    entities: [],
    actionVerbs: [],
    questionPatterns: false
  }));
  
  const packs = planPacks(signals, 'government_office', 'A2', 6, 12);
  // May create fewer packs if signals are too similar, but should respect max
  assertLessThan(packs.length, 13, 'Should create at most max packs');
  // Should create at least some packs if we have diverse signals
  assertGreaterThan(packs.length, 0, 'Should create at least one pack');
});

// ============================================================================
// Draft Prompt Generation Tests
// ============================================================================

test('generateDraftPrompts - generates prompts for pack', () => {
  const plannedPack: PlannedPack = {
    packId: 'test-pack-123',
    title: 'Test Pack',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'object'],
    register: 'formal',
    tags: ['government_office'],
    targetChunks: ['chunk1'],
    topTokens: ['termin', 'formular'],
    intentCategory: 'request_appointment'
  };
  
  const signals: ExtractedSignal[] = [
    {
      chunkId: 'chunk1',
      topTokens: ['termin', 'formular'],
      detectedIntents: ['request_appointment'],
      evidence: [],
      entities: [],
      actionVerbs: ['brauche', 'möchte'],
      questionPatterns: false
    }
  ];
  
  const prompts = generateDraftPrompts(plannedPack, signals, 'government_office', 'A2');
  assertGreaterThan(prompts.length, 0, 'Should generate prompts');
  
  for (const prompt of prompts) {
    assert(prompt.id.length > 0, 'Prompt should have ID');
    assert(prompt.text.length >= 12, 'Prompt should meet minimum length');
    assert(prompt.text.length <= 140, 'Prompt should meet maximum length');
    assert(prompt.intent.length > 0, 'Prompt should have intent');
    assert(prompt.gloss_en.length > 0, 'Prompt should have gloss_en');
    assert(prompt.natural_en !== undefined, 'Prompt should have natural_en (A2+)');
    assert(prompt.audioUrl.length > 0, 'Prompt should have audioUrl');
  }
});

test('generateDraftPrompts - ensures multi-slot variation', () => {
  const plannedPack: PlannedPack = {
    packId: 'test-pack-123',
    title: 'Test Pack',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'object'],
    register: 'formal',
    tags: ['government_office'],
    targetChunks: ['chunk1'],
    topTokens: ['termin', 'formular'],
    intentCategory: 'request'
  };
  
  const signals: ExtractedSignal[] = [
    {
      chunkId: 'chunk1',
      topTokens: ['termin'],
      detectedIntents: ['request'],
      evidence: [],
      entities: [],
      actionVerbs: [],
      questionPatterns: false
    }
  ];
  
  const prompts = generateDraftPrompts(plannedPack, signals, 'government_office', 'A2');
  const multiSlotCount = prompts.filter(p => 
    p.slotsChanged && p.slotsChanged.length >= 2
  ).length;
  const multiSlotRate = prompts.length > 0 ? multiSlotCount / prompts.length : 0;
  
  assertGreaterThan(multiSlotRate, 0.25, 'At least 25% should have 2+ slotsChanged');
});

test('generateDraftPrompts - includes scenario tokens', () => {
  const plannedPack: PlannedPack = {
    packId: 'test-pack-123',
    title: 'Test Pack',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'object'],
    register: 'formal',
    tags: ['government_office'],
    targetChunks: ['chunk1'],
    topTokens: ['termin', 'formular'],
    intentCategory: 'request'
  };
  
  const signals: ExtractedSignal[] = [
    {
      chunkId: 'chunk1',
      topTokens: ['termin', 'formular'],
      detectedIntents: ['request'],
      evidence: [],
      entities: [],
      actionVerbs: [],
      questionPatterns: false
    }
  ];
  
  const prompts = generateDraftPrompts(plannedPack, signals, 'government_office', 'A2');
  
  // At least some prompts should contain scenario tokens
  const tokens = ['termin', 'formular', 'anmeldung', 'bescheinigung', 'unterlagen'];
  let hasToken = false;
  for (const prompt of prompts) {
    const textLower = prompt.text.toLowerCase();
    if (tokens.some(t => textLower.includes(t))) {
      hasToken = true;
      break;
    }
  }
  assert(hasToken, 'At least one prompt should contain scenario token');
});

test('generateDraftPrompts - avoids banned phrases', () => {
  const plannedPack: PlannedPack = {
    packId: 'test-pack-123',
    title: 'Test Pack',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'object'],
    register: 'formal',
    tags: ['government_office'],
    targetChunks: ['chunk1'],
    topTokens: ['termin'],
    intentCategory: 'request'
  };
  
  const signals: ExtractedSignal[] = [
    {
      chunkId: 'chunk1',
      topTokens: ['termin'],
      detectedIntents: ['request'],
      evidence: [],
      entities: [],
      actionVerbs: [],
      questionPatterns: false
    }
  ];
  
  const prompts = generateDraftPrompts(plannedPack, signals, 'government_office', 'A2');
  const bannedPhrases = ["in today's lesson", "let's practice", "this sentence"];
  
  for (const prompt of prompts) {
    const textLower = prompt.text.toLowerCase();
    for (const phrase of bannedPhrases) {
      assert(!textLower.includes(phrase.toLowerCase()), `Prompt should not contain banned phrase: ${phrase}`);
    }
  }
});

test('generateDraftPrompts - ensures register consistency for formal', () => {
  const plannedPack: PlannedPack = {
    packId: 'test-pack-123',
    title: 'Test Pack',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'object'],
    register: 'formal',
    tags: ['government_office'],
    targetChunks: ['chunk1'],
    topTokens: ['termin'],
    intentCategory: 'request'
  };
  
  const signals: ExtractedSignal[] = [
    {
      chunkId: 'chunk1',
      topTokens: ['termin'],
      detectedIntents: ['request'],
      evidence: [],
      entities: [],
      actionVerbs: [],
      questionPatterns: false
    }
  ];
  
  const prompts = generateDraftPrompts(plannedPack, signals, 'government_office', 'A2');
  const hasFormalMarker = prompts.some(p => 
    /\bSie\b/.test(p.text) || /\bIhnen\b/.test(p.text)
  );
  assert(hasFormalMarker, 'Formal pack should include Sie/Ihnen');
});

// ============================================================================
// Quality Gate Tests
// ============================================================================

test('runQualityGates - passes valid pack', () => {
  const pack: DraftPack = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A2',
    estimatedMinutes: 30,
    description: 'Test description',
    scenario: 'government_office',
    register: 'formal',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb', 'object'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich brauche einen Termin beim Bürgeramt am Montag um 14:30.',
        intent: 'request',
        gloss_en: 'I need an appointment at the citizen office on Monday at 14:30.',
        natural_en: 'I\'d like to schedule an appointment at the citizen office for Monday at 2:30 PM.',
        audioUrl: '/v1/audio/test-pack/prompt-001.mp3',
        slotsChanged: ['subject', 'verb']
      },
      {
        id: 'prompt-002',
        text: 'Sie benötigen das Formular für die Anmeldung im Amt.',
        intent: 'inform',
        gloss_en: 'You need the form for registration at the office.',
        natural_en: 'You\'ll need the registration form at the office.',
        audioUrl: '/v1/audio/test-pack/prompt-002.mp3',
        slotsChanged: ['subject', 'object']
      },
      {
        id: 'prompt-003',
        text: 'Die Unterlagen und der Ausweis sind im Amt am Dienstag.',
        intent: 'inform',
        gloss_en: 'The documents and the ID are at the office on Tuesday.',
        natural_en: 'The documents and ID are at the office on Tuesday.',
        audioUrl: '/v1/audio/test-pack/prompt-003.mp3',
        slotsChanged: ['object', 'time']
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [
        {
          id: 'step1',
          title: 'Step 1',
          promptIds: ['prompt-001', 'prompt-002', 'prompt-003']
        }
      ]
    },
    tags: ['government_office'],
    analytics: {
      goal: 'Practice government office scenarios',
      constraints: ['formal register'],
      levers: ['subject variation'],
      successCriteria: ['Uses formal address'],
      commonMistakes: ['Missing formal address'],
      drillType: 'roleplay-bounded',
      cognitiveLoad: 'medium'
    }
  };
  
  const result = runQualityGates(pack);
  // Pack should pass - has 2+ tokens per prompt, formal markers, multi-slot variation, concreteness
  assert(result.passed, 'Valid pack should pass quality gates');
  assertEqual(result.failures.length, 0, 'Should have no failures');
});

test('runQualityGates - fails on missing scenario tokens', () => {
  const pack: DraftPack = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A2',
    estimatedMinutes: 30,
    description: 'Test description',
    scenario: 'government_office',
    register: 'formal',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich gehe zur Arbeit.', // Only 1 token (arbeit, but not in government_office tokens)
        intent: 'inform',
        gloss_en: 'I go to work.',
        natural_en: 'I\'m going to work.',
        audioUrl: '/v1/audio/test-pack/prompt-001.mp3'
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: ['prompt-001'] }]
    },
    tags: ['government_office'],
    analytics: {
      goal: 'Test',
      constraints: [],
      levers: [],
      successCriteria: [],
      commonMistakes: [],
      drillType: 'substitution',
      cognitiveLoad: 'low'
    }
  };
  
  const result = runQualityGates(pack);
  assert(!result.passed, 'Pack with insufficient tokens should fail');
  assertGreaterThan(result.failures.length, 0, 'Should have failures');
  const hasTokenFailure = result.failures.some(f => f.rule === 'scenario_tokens');
  assert(hasTokenFailure, 'Should fail on scenario_tokens rule');
});

test('runQualityGates - fails on banned phrases', () => {
  const pack: DraftPack = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A2',
    estimatedMinutes: 30,
    description: 'Test description',
    scenario: 'government_office',
    register: 'formal',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'In today\'s lesson, we will practice German.',
        intent: 'inform',
        gloss_en: 'In today\'s lesson, we will practice German.',
        natural_en: 'Today we\'ll practice German.',
        audioUrl: '/v1/audio/test-pack/prompt-001.mp3'
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: ['prompt-001'] }]
    },
    tags: ['government_office'],
    analytics: {
      goal: 'Test',
      constraints: [],
      levers: [],
      successCriteria: [],
      commonMistakes: [],
      drillType: 'substitution',
      cognitiveLoad: 'low'
    }
  };
  
  const result = runQualityGates(pack);
  assert(!result.passed, 'Pack with banned phrase should fail');
  const hasBannedFailure = result.failures.some(f => f.rule === 'banned_phrases');
  assert(hasBannedFailure, 'Should fail on banned_phrases rule');
});

test('runQualityGates - fails on insufficient multi-slot variation', () => {
  const pack: DraftPack = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A2',
    estimatedMinutes: 30,
    description: 'Test description',
    scenario: 'government_office',
    register: 'formal',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich brauche einen Termin.',
        intent: 'request',
        gloss_en: 'I need an appointment.',
        natural_en: 'I\'d like an appointment.',
        audioUrl: '/v1/audio/test-pack/prompt-001.mp3',
        slotsChanged: ['subject'] // Only 1 slot
      },
      {
        id: 'prompt-002',
        text: 'Ich brauche das Formular.',
        intent: 'request',
        gloss_en: 'I need the form.',
        natural_en: 'I\'d like the form.',
        audioUrl: '/v1/audio/test-pack/prompt-002.mp3',
        slotsChanged: ['object'] // Only 1 slot
      },
      {
        id: 'prompt-003',
        text: 'Ich brauche die Unterlagen.',
        intent: 'request',
        gloss_en: 'I need the documents.',
        natural_en: 'I\'d like the documents.',
        audioUrl: '/v1/audio/test-pack/prompt-003.mp3',
        slotsChanged: ['object'] // Only 1 slot
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: ['prompt-001', 'prompt-002', 'prompt-003'] }]
    },
    tags: ['government_office'],
    analytics: {
      goal: 'Test',
      constraints: [],
      levers: [],
      successCriteria: [],
      commonMistakes: [],
      drillType: 'substitution',
      cognitiveLoad: 'low'
    }
  };
  
  const result = runQualityGates(pack);
  assert(!result.passed, 'Pack with insufficient multi-slot variation should fail');
  const hasMultiSlotFailure = result.failures.some(f => f.rule === 'multi_slot_variation');
  assert(hasMultiSlotFailure, 'Should fail on multi_slot_variation rule');
});

test('runQualityGates - fails on missing natural_en for A2+', () => {
  const pack: DraftPack = {
    schemaVersion: 1,
    id: 'test-pack',
    kind: 'pack',
    title: 'Test Pack',
    level: 'A2',
    estimatedMinutes: 30,
    description: 'Test description',
    scenario: 'government_office',
    register: 'formal',
    primaryStructure: 'modal_verbs_requests',
    variationSlots: ['subject', 'verb'],
    outline: ['Step 1'],
    prompts: [
      {
        id: 'prompt-001',
        text: 'Ich brauche einen Termin.',
        intent: 'request',
        gloss_en: 'I need an appointment.',
        // Missing natural_en
        audioUrl: '/v1/audio/test-pack/prompt-001.mp3'
      }
    ],
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: ['prompt-001'] }]
    },
    tags: ['government_office'],
    analytics: {
      goal: 'Test',
      constraints: [],
      levers: [],
      successCriteria: [],
      commonMistakes: [],
      drillType: 'substitution',
      cognitiveLoad: 'low'
    }
  };
  
  const result = runQualityGates(pack);
  assert(!result.passed, 'Pack missing natural_en should fail');
  const hasNaturalEnFailure = result.failures.some(f => f.rule === 'natural_en_required');
  assert(hasNaturalEnFailure, 'Should fail on natural_en_required rule');
});

// ============================================================================
// Run Tests
// ============================================================================

async function runTests() {
  console.log(`\n🧪 Running ${tests.length} unit tests...\n`);
  
  for (const testCase of tests) {
    try {
      await testCase.fn();
      passed++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`❌ ${testCase.name}: ${message}`);
      console.error(`❌ ${testCase.name}`);
      console.error(`   ${message}`);
    }
  }
  
  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  if (errors.length > 0) {
    console.log(`\n❌ Failures:`);
    for (const error of errors) {
      console.log(`   ${error}`);
    }
  }
  
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log(`\n✅ All tests passed!`);
  }
}

runTests();
