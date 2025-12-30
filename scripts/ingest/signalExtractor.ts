/**
 * Extract structured signals from text chunks
 */

import type { ExtractedSignal, TextChunk } from './ingestTypes.js';

// German question words
const GERMAN_QUESTION_WORDS = [
  'wer', 'was', 'wo', 'wohin', 'woher', 'wann', 'wie', 'warum', 'weshalb', 'wieso',
  'welche', 'welcher', 'welches', 'welchen', 'welchem', 'welcher'
];

// Common German action verbs (can be extended per scenario)
const COMMON_ACTION_VERBS = [
  'brauche', 'benötige', 'möchte', 'kann', 'muss', 'soll', 'will',
  'vereinbare', 'hole', 'bringen', 'zeigen', 'geben', 'nehmen',
  'bestellen', 'kaufen', 'bezahlen', 'fragen', 'antworten', 'sagen',
  'machen', 'tun', 'gehen', 'kommen', 'sein', 'haben'
];

/**
 * Extract signals from a text chunk
 */
export function extractSignals(chunk: TextChunk, scenario: string): ExtractedSignal {
  const text = chunk.normalizedText.toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 2);
  
  // Token frequency
  const tokenCounts = new Map<string, number>();
  for (const word of words) {
    const normalized = word.replace(/[.,!?;:()]/g, '').toLowerCase();
    if (normalized.length > 2) {
      tokenCounts.set(normalized, (tokenCounts.get(normalized) || 0) + 1);
    }
  }
  
  // Top tokens (sorted by frequency)
  const topTokens = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([token]) => token);
  
  // Detect entities
  const entities = detectEntities(chunk.normalizedText);
  
  // Detect action verbs
  const actionVerbs = detectActionVerbs(chunk.normalizedText, scenario);
  
  // Detect question patterns
  const questionPatterns = detectQuestionPatterns(chunk.normalizedText);
  
  // Detect intents based on patterns
  const detectedIntents = detectIntents(chunk.normalizedText, scenario);
  
  // Evidence (tokens with counts)
  const evidence = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([token, count]) => ({ token, count }));
  
  return {
    chunkId: chunk.chunkId,
    topTokens,
    detectedIntents,
    evidence,
    entities,
    actionVerbs,
    questionPatterns
  };
}

/**
 * Detect entities (dates, times, money, addresses, capitalized terms)
 */
function detectEntities(text: string): ExtractedSignal['entities'] {
  const entities: ExtractedSignal['entities'] = [];
  const words = text.split(/\s+/);
  
  // Date patterns: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
  const datePattern = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/g;
  let match;
  while ((match = datePattern.exec(text)) !== null) {
    entities.push({
      type: 'date',
      value: match[1],
      position: match.index
    });
  }
  
  // Time patterns: HH:MM, HH Uhr
  const timePattern = /\b(\d{1,2}:\d{2}|\d{1,2}\s*uhr)\b/gi;
  while ((match = timePattern.exec(text)) !== null) {
    entities.push({
      type: 'time',
      value: match[1],
      position: match.index
    });
  }
  
  // Money patterns: €, $, EUR, USD
  const moneyPattern = /\b(\d+[.,]?\d*\s*[€$]|\d+[.,]?\d*\s*(eur|usd|euro))\b/gi;
  while ((match = moneyPattern.exec(text)) !== null) {
    entities.push({
      type: 'money',
      value: match[1],
      position: match.index
    });
  }
  
  // Address patterns: street names, postal codes
  const addressPattern = /\b(\d{5}\s+[A-ZÄÖÜ][a-zäöüß]+|\b[A-ZÄÖÜ][a-zäöüß]+\s+(straße|str\.|weg|platz|allee))\b/gi;
  while ((match = addressPattern.exec(text)) !== null) {
    entities.push({
      type: 'address',
      value: match[1],
      position: match.index
    });
  }
  
  // Capitalized terms (likely proper nouns or important terms)
  const capitalizedPattern = /\b([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)\b/g;
  while ((match = capitalizedPattern.exec(text)) !== null) {
    // Skip if it's at start of sentence
    if (match.index > 0 && text[match.index - 1] !== '.') {
      entities.push({
        type: 'capitalized',
        value: match[1],
        position: match.index
      });
    }
  }
  
  return entities;
}

/**
 * Detect action verbs in text
 */
function detectActionVerbs(text: string, scenario: string): string[] {
  const textLower = text.toLowerCase();
  const found: string[] = [];
  
  // Check against common action verbs
  for (const verb of COMMON_ACTION_VERBS) {
    // Match verb in various forms (with common endings)
    const verbPattern = new RegExp(`\\b${verb}(?:e|st|t|en|et)?\\b`, 'i');
    if (verbPattern.test(textLower)) {
      found.push(verb);
    }
  }
  
  // Scenario-specific verbs (can be extended)
  const scenarioVerbs: Record<string, string[]> = {
    government_office: ['anmelden', 'beantragen', 'vorlegen', 'abholen', 'einreichen'],
    work: ['besprechen', 'organisieren', 'planen', 'erledigen', 'abschließen'],
    restaurant: ['bestellen', 'reservieren', 'empfehlen', 'bezahlen'],
    shopping: ['kaufen', 'bezahlen', 'umtauschen', 'zurückgeben'],
    housing: ['mieten', 'kündigen', 'renovieren', 'reparieren']
  };
  
  const scenarioSpecific = scenarioVerbs[scenario] || [];
  for (const verb of scenarioSpecific) {
    const verbPattern = new RegExp(`\\b${verb}(?:e|st|t|en|et)?\\b`, 'i');
    if (verbPattern.test(textLower)) {
      found.push(verb);
    }
  }
  
  return [...new Set(found)]; // Remove duplicates
}

/**
 * Detect question patterns
 */
function detectQuestionPatterns(text: string): boolean {
  // Check for question mark
  if (text.includes('?')) {
    return true;
  }
  
  // Check for German question words at start
  const textLower = text.toLowerCase().trim();
  for (const qword of GERMAN_QUESTION_WORDS) {
    if (textLower.startsWith(qword + ' ')) {
      return true;
    }
  }
  
  // Check for question word anywhere (with case sensitivity)
  for (const qword of GERMAN_QUESTION_WORDS) {
    const pattern = new RegExp(`\\b${qword}\\b`, 'i');
    if (pattern.test(text)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detect intents from text patterns
 */
function detectIntents(text: string, scenario: string): string[] {
  const textLower = text.toLowerCase();
  const intents: string[] = [];
  
  // Request patterns
  if (/\b(möchte|brauche|benötige|hätte|kann|könnte|würde)\b/i.test(text)) {
    intents.push('request');
  }
  
  // Question patterns
  if (/\?/.test(text) || /\b(kann|könnte|darf|sollte|muss|können|dürfen|sollen|müssen)\b/i.test(text)) {
    intents.push('ask');
  }
  
  // Schedule/appointment patterns
  if (/\b(termin|vereinbare|appointment|um \d|am \w+tag)\b/i.test(text)) {
    intents.push('schedule');
  }
  
  // Document submission patterns
  if (/\b(formular|unterlagen|dokument|pass|ausweis|bescheinigung)\b/i.test(text)) {
    intents.push('submit_documents');
  }
  
  // Registration patterns
  if (/\b(anmeldung|anmelden|registrieren)\b/i.test(text)) {
    intents.push('register');
  }
  
  // Information request patterns
  if (/\b(information|auskunft|fragen|wissen)\b/i.test(text)) {
    intents.push('request_information');
  }
  
  // Scenario-specific intents
  if (scenario === 'government_office') {
    if (/\b(termin|appointment)\b/i.test(text)) {
      intents.push('request_appointment');
    }
    if (/\b(formular|unterlagen)\b/i.test(text)) {
      intents.push('submit_documents');
    }
  }
  
  if (scenario === 'work') {
    if (/\b(meeting|besprechung)\b/i.test(text)) {
      intents.push('schedule_meeting');
    }
  }
  
  if (scenario === 'restaurant') {
    if (/\b(bestellen|order)\b/i.test(text)) {
      intents.push('order');
    }
    if (/\b(reservieren|reservation)\b/i.test(text)) {
      intents.push('make_reservation');
    }
  }
  
  if (scenario === 'shopping') {
    if (/\b(kosten|preis|€|\$)\b/i.test(text)) {
      intents.push('ask_price');
    }
  }
  
  // Default: inform if no other intent
  if (intents.length === 0) {
    intents.push('inform');
  }
  
  return [...new Set(intents)]; // Remove duplicates
}

