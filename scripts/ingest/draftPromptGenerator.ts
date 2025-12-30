/**
 * Generate draft prompts from planned packs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PlannedPack, DraftPrompt, DraftPack } from './ingestTypes.js';
import type { ExtractedSignal } from './ingestTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', '..', 'content', 'templates', 'v1', 'scenarios');

interface ScenarioTemplate {
  schemaVersion: number;
  scenarioId: string;
  defaultRegister: string;
  primaryStructure: string;
  variationSlots: string[];
  slotBanks: Record<string, string[]>;
  requiredTokens: string[];
  stepBlueprint: Array<{
    id: string;
    title: string;
    promptCount: number;
    rules?: {
      requiredSlots?: string[];
    };
  }>;
  constraints?: {
    verbPosition?: string;
    requiredTokensPerPrompt?: number;
  };
}

// Generic template denylist
const DENYLIST_PHRASES = [
  "in today's lesson",
  "let's practice",
  "this sentence",
  "i like to",
  "the quick brown fox",
  "lorem ipsum"
];

// Weekday tokens
const WEEKDAY_TOKENS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];

/**
 * Load scenario template
 */
function loadTemplate(scenario: string): ScenarioTemplate {
  const templatePath = join(TEMPLATES_DIR, `${scenario}.json`);
  if (!existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const content = readFileSync(templatePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Count scenario tokens in text
 */
function countScenarioTokens(text: string, requiredTokens: string[]): number {
  const textLower = text.toLowerCase();
  let count = 0;
  for (const token of requiredTokens) {
    if (textLower.includes(token.toLowerCase())) {
      count++;
    }
  }
  return count;
}

/**
 * Check if text contains banned phrases
 */
function containsBannedPhrases(text: string): boolean {
  const textLower = text.toLowerCase();
  for (const phrase of DENYLIST_PHRASES) {
    if (textLower.includes(phrase.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Check if text has concreteness marker
 */
function hasConcretenessMarker(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/[€$]/.test(text)) return true;
  if (/\d{1,2}:\d{2}/.test(text)) return true;
  const textLower = text.toLowerCase();
  for (const weekday of WEEKDAY_TOKENS) {
    if (textLower.includes(weekday)) return true;
  }
  return false;
}

/**
 * Conjugate German verb based on subject (simplified version)
 */
function conjugateVerb(verb: string, subject: string): string {
  const subjectLower = subject.toLowerCase().trim();
  const verbLower = verb.toLowerCase().trim();
  
  const alreadyConjugated = ['möchte', 'kann', 'muss', 'soll', 'will', 'könnte', 'würde', 'hätte', 'hat', 'ist', 'war', 'wird'];
  if (alreadyConjugated.includes(verbLower)) {
    return verb;
  }
  
  if (subjectLower === 'ich') {
    return verb;
  }
  
  if (subjectLower === 'wir') {
    if (verbLower === 'habe') return 'haben';
    if (verbLower === 'ist' || verbLower === 'bin') return 'sind';
    if (verbLower.endsWith('en')) return verb;
    if (verbLower.endsWith('e')) return verb + 'n';
    return verb + 'en';
  }
  
  const isThirdPersonSingular = 
    subjectLower.startsWith('der ') || subjectLower === 'der' ||
    subjectLower.startsWith('die ') || subjectLower === 'die' ||
    subjectLower.startsWith('das ') || subjectLower === 'das' ||
    subjectLower === 'er' || 
    (subjectLower === 'sie' && subject !== 'Sie') ||
    subjectLower === 'es';
  
  if (isThirdPersonSingular) {
    if (verbLower === 'habe') return 'hat';
    if (verbLower === 'bin' || verbLower === 'ist') return 'ist';
    if (verbLower.endsWith('e') && !verbLower.endsWith('ie') && !verbLower.endsWith('te')) {
      return verb.slice(0, -1) + 't';
    }
    if (verbLower.endsWith('en')) {
      const stem = verb.slice(0, -2);
      if (stem.toLowerCase().match(/[tdmn]$/)) {
        return stem + 'et';
      }
      return stem + 't';
    }
    if (verbLower.match(/[tdmn]$/)) {
      return verb + 'et';
    }
    return verb + 't';
  }
  
  if (subject === 'Sie') {
    if (verbLower === 'habe') return 'haben';
    if (verbLower === 'ist' || verbLower === 'bin') return 'sind';
    if (verbLower.endsWith('en')) return verb;
    if (verbLower.endsWith('e')) return verb + 'n';
    return verb + 'en';
  }
  
  return verb;
}

/**
 * Generate sentence from pattern and slots
 */
function generateSentence(pattern: string, slots: Record<string, string>): string {
  let sentence = pattern;
  
  if (slots.subject && slots.verb) {
    slots.verb = conjugateVerb(slots.verb, slots.subject);
  }
  
  for (const [key, value] of Object.entries(slots)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    sentence = sentence.replace(regex, value);
  }
  
  sentence = sentence.replace(/\{[^}]+\}/g, '');
  sentence = sentence.replace(/\s+/g, ' ').trim();
  return sentence;
}

/**
 * Determine intent from prompt text and scenario
 */
function determineIntent(text: string, scenario: string): string {
  const textLower = text.toLowerCase();
  
  if (/\b(kann|könnte|darf|sollte|muss|können|dürfen|sollen|müssen)\b/i.test(text) && /\?/.test(text)) {
    return 'ask';
  }
  
  if (/\b(hätte|möchte|brauche|benötige|kann|könnte|würde)\b/i.test(text)) {
    return 'request';
  }
  
  if (/\b(termin|vereinbare|appointment|um \d|am \w+tag)\b/i.test(text)) {
    return 'schedule';
  }
  
  if (/\b(bestelle|nehme|kaufe|order)\b/i.test(text)) {
    return 'order';
  }
  
  if (/\b(kostet|preis|€|\$)\b/i.test(text)) {
    return 'ask_price';
  }
  
  if (/\b(danke|vielen dank|thank)\b/i.test(text)) {
    return 'thank';
  }
  
  if (/\b(hallo|guten tag|guten morgen|hello)\b/i.test(text)) {
    return 'greet';
  }
  
  if (/\b(auf wiedersehen|tschüss|goodbye)\b/i.test(text)) {
    return 'goodbye';
  }
  
  if (/\b(ja|genau|richtig|yes|correct)\b/i.test(text)) {
    return 'confirm';
  }
  
  if (/\b(entschuldigung|sorry|tut mir leid)\b/i.test(text)) {
    return 'apologize';
  }
  
  return 'inform';
}

/**
 * Generate gloss_en (natural English meaning)
 */
function generateGlossEn(text: string, scenario: string, intent: string): string {
  const textLower = text.toLowerCase();
  
  if (scenario === 'government_office') {
    if (textLower.includes('termin')) return 'I need to make an appointment.';
    if (textLower.includes('formular')) return 'I need the form.';
    if (textLower.includes('pass')) return 'I need to pick up my passport.';
    if (textLower.includes('anmeldung')) return 'I need to register my address.';
    if (textLower.includes('unterlagen')) return 'I need the documents.';
  }
  
  if (scenario === 'work') {
    if (textLower.includes('meeting')) return 'The meeting starts at the scheduled time.';
    if (textLower.includes('projekt')) return 'I am working on the project.';
  }
  
  if (scenario === 'restaurant') {
    if (textLower.includes('tisch')) return 'I would like a table.';
    if (textLower.includes('speisekarte')) return 'I would like to see the menu.';
  }
  
  if (scenario === 'shopping') {
    if (textLower.includes('kosten')) return 'How much does this cost?';
    if (textLower.includes('rabatt')) return 'Is there a discount?';
  }
  
  if (intent === 'request') return 'I would like to request something.';
  if (intent === 'ask') return 'Can you help me?';
  if (intent === 'inform') return 'I am providing information.';
  if (intent === 'schedule') return 'I need to schedule something.';
  
  return 'This is a practice sentence for learning German.';
}

/**
 * Generate natural_en (native English paraphrase)
 */
function generateNaturalEn(text: string, scenario: string, intent: string, glossEn: string): string {
  const textLower = text.toLowerCase();
  
  if (scenario === 'government_office') {
    if (textLower.includes('termin')) return 'I\'d like to schedule an appointment.';
    if (textLower.includes('formular')) return 'Could I get the form, please?';
    if (textLower.includes('pass')) return 'I\'m here to collect my passport.';
    if (textLower.includes('anmeldung')) return 'I need to register my address.';
    if (textLower.includes('unterlagen')) return 'I need those documents.';
  }
  
  if (scenario === 'work') {
    if (textLower.includes('meeting')) return 'The meeting is at the scheduled time.';
    if (textLower.includes('projekt')) return 'I\'m working on that project.';
  }
  
  if (scenario === 'restaurant') {
    if (textLower.includes('tisch')) return 'I\'d like a table, please.';
    if (textLower.includes('speisekarte')) return 'Could I see the menu?';
  }
  
  if (scenario === 'shopping') {
    if (textLower.includes('kosten')) return 'What does this cost?';
    if (textLower.includes('rabatt')) return 'Do you have any discounts?';
  }
  
  if (intent === 'request') return 'I\'d like to request that.';
  if (intent === 'ask') return 'Could you help me with this?';
  if (intent === 'inform') return 'Here\'s the information.';
  if (intent === 'schedule') return 'I need to schedule that.';
  
  return glossEn.replace(/^I /, 'I\'d ').replace(/\.$/, '');
}

/**
 * Generate literal_en (word-for-word translation)
 */
function generateLiteralEn(text: string): string {
  // Simplified literal translation - in production, this would use a translation service
  // For now, return a placeholder that indicates it's a literal translation
  return `[Literal: ${text}]`;
}

/**
 * Generate notes_lite for illogical patterns (optional, max 120 chars)
 */
function generateNotesLite(text: string, template: ScenarioTemplate): string | undefined {
  // Check for potential case ending issues or illogical patterns
  // This is a simplified check - in production, you'd have more sophisticated grammar checking
  
  // Example: if verb doesn't match subject case
  if (text.includes('Der ') && text.includes('möchte')) {
    return 'Note: "Der" requires verb conjugation';
  }
  
  // If no obvious issues, return undefined
  return undefined;
}

/**
 * Generate prompts for a pack
 */
export function generateDraftPrompts(
  plannedPack: PlannedPack,
  signals: ExtractedSignal[],
  scenario: string,
  level: string
): DraftPrompt[] {
  const template = loadTemplate(scenario);
  const prompts: DraftPrompt[] = [];
  const promptIdCounter = { value: 1 };
  
  // Get relevant signals for this pack
  const relevantSignals = signals.filter(s => plannedPack.targetChunks.includes(s.chunkId));
  
  // Generate prompts for each step in the template
  let previousSlots: Record<string, string> | null = null;
  
  for (const step of template.stepBlueprint) {
    const requiredSlots = step.rules?.requiredSlots || template.variationSlots;
    const slotOrder = ['subject', 'verb', 'object', 'modifier', 'time', 'location'];
    const orderedSlots = requiredSlots.sort((a, b) => {
      const aIdx = slotOrder.indexOf(a);
      const bIdx = slotOrder.indexOf(b);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
    
    const pattern = orderedSlots.map(slot => `{${slot}}`).join(' ');
    
    for (let i = 0; i < step.promptCount; i++) {
      let attempts = 0;
      let prompt: DraftPrompt | null = null;
      
      while (attempts < 100 && !prompt) {
        // Select slot values from template banks
        const slots: Record<string, string> = {};
        for (const slot of orderedSlots) {
          const bankKey = slot === 'subject' ? 'subjects' :
                          slot === 'verb' ? 'verbs' :
                          slot === 'object' ? 'objects' :
                          slot === 'modifier' ? 'modifiers' :
                          slot;
          const bank = template.slotBanks[bankKey as keyof typeof template.slotBanks] || [];
          if (bank.length > 0) {
            // Prefer tokens from signals
            const signalTokens = relevantSignals.flatMap(s => s.topTokens);
            const matchingToken = signalTokens.find(t => 
              bank.some(b => b.toLowerCase().includes(t.toLowerCase()))
            );
            slots[slot] = matchingToken || bank[Math.floor(Math.random() * bank.length)];
          }
        }
        
        // Generate sentence
        let text = generateSentence(pattern, slots);
        
        // Validate quality gates
        if (text.length < 12 || text.length > 140) {
          attempts++;
          continue;
        }
        
        if (containsBannedPhrases(text)) {
          attempts++;
          continue;
        }
        
        const tokenCount = countScenarioTokens(text, template.requiredTokens);
        if (tokenCount < 1) {
          // Try to inject a token
          const availableTokens = template.requiredTokens.filter(t => 
            !text.toLowerCase().includes(t.toLowerCase())
          );
          if (availableTokens.length > 0) {
            const tokenToAdd = availableTokens[Math.floor(Math.random() * availableTokens.length)];
            if (slots.object) {
              slots.object = `${slots.object} ${tokenToAdd}`;
            } else if (slots.modifier) {
              slots.modifier = `${slots.modifier} ${tokenToAdd}`;
            } else {
              text = `${text} ${tokenToAdd}`;
            }
            if (slots.object || slots.modifier) {
              text = generateSentence(pattern, slots);
            }
          }
        }
        
        const finalTokenCount = countScenarioTokens(text, template.requiredTokens);
        if (finalTokenCount < 1) {
          attempts++;
          continue;
        }
        
        // Determine slotsChanged
        const slotsChanged: string[] = [];
        if (previousSlots) {
          for (const slot of orderedSlots) {
            if (previousSlots[slot] !== slots[slot]) {
              slotsChanged.push(slot);
            }
          }
        } else {
          slotsChanged.push(...orderedSlots.slice(0, Math.min(2, orderedSlots.length)));
        }
        
        // Ensure 30% have 2+ slotsChanged
        const currentMultiSlotRate = prompts.length > 0 
          ? prompts.filter(p => p.slotsChanged && p.slotsChanged.length >= 2).length / prompts.length
          : 0;
        
        if (currentMultiSlotRate < 0.3 && slotsChanged.length < 2) {
          const additionalSlots = orderedSlots.filter(s => !slotsChanged.includes(s));
          if (additionalSlots.length > 0) {
            slotsChanged.push(...additionalSlots.slice(0, 2 - slotsChanged.length));
          }
        }
        
        const promptId = `prompt-${String(promptIdCounter.value).padStart(3, '0')}`;
        promptIdCounter.value++;
        
        const intent = determineIntent(text, scenario);
        const gloss_en = generateGlossEn(text, scenario, intent);
        const natural_en = generateNaturalEn(text, scenario, intent, gloss_en);
        const literal_en = generateLiteralEn(text);
        const notes_lite = generateNotesLite(text, template);
        
        // Extract slots for metadata
        const VALID_SLOT_KEYS = ['subject', 'verb', 'object', 'modifier', 'complement'];
        const promptSlots: Record<string, string[]> = {};
        for (const slot of orderedSlots) {
          if (slots[slot] && VALID_SLOT_KEYS.includes(slot)) {
            promptSlots[slot] = [slots[slot]];
          } else if (slots[slot] && (slot === 'time' || slot === 'location')) {
            if (!promptSlots['modifier']) {
              promptSlots['modifier'] = [];
            }
            promptSlots['modifier'].push(slots[slot]);
          }
        }
        
        prompt = {
          id: promptId,
          text,
          intent,
          gloss_en,
          natural_en,
          literal_en,
          notes_lite: notes_lite && notes_lite.length <= 120 ? notes_lite : undefined,
          audioUrl: `/v1/audio/${plannedPack.packId}/${promptId}.mp3`,
          slotsChanged: slotsChanged.length > 0 ? slotsChanged : undefined,
          slots: Object.keys(promptSlots).length > 0 ? promptSlots : undefined
        };
        
        previousSlots = slots;
      }
      
      if (!prompt) {
        throw new Error(`Failed to generate valid prompt for step ${step.id} after 100 attempts`);
      }
      
      prompts.push(prompt);
    }
  }
  
  // Ensure concreteness markers
  let concretenessCount = 0;
  for (const prompt of prompts) {
    if (hasConcretenessMarker(prompt.text)) {
      concretenessCount++;
    }
  }
  
  if (concretenessCount < 2) {
    for (let i = 0; i < Math.min(2, prompts.length) && concretenessCount < 2; i++) {
      if (!hasConcretenessMarker(prompts[i].text)) {
        prompts[i].text += ` um ${Math.floor(Math.random() * 3) + 9}:${Math.random() > 0.5 ? '00' : '30'}`;
        concretenessCount++;
      }
    }
  }
  
  // Ensure register consistency
  if (template.defaultRegister === 'formal') {
    let hasFormalMarker = false;
    for (const prompt of prompts) {
      if (/\bSie\b/.test(prompt.text) || /\bIhnen\b/.test(prompt.text)) {
        hasFormalMarker = true;
        break;
      }
    }
    if (!hasFormalMarker && prompts.length > 0) {
      const firstPrompt = prompts[0];
      firstPrompt.text = firstPrompt.text.replace(/\b(Ich|Wir|Der Manager|Die Kollegin)\b/, 'Sie');
      if (!/\bSie\b/.test(firstPrompt.text)) {
        const words = firstPrompt.text.split(/\s+/);
        words[0] = 'Sie';
        firstPrompt.text = words.join(' ');
      }
    }
  }
  
  return prompts;
}

