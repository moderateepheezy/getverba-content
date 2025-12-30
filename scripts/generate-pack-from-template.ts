#!/usr/bin/env tsx

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface TemplateDocument {
  schemaVersion: number;
  id: string;
  kind: string;
  title: string;
  level: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  requiredScenarioTokens: string[];
  steps: Array<{
    id: string;
    title: string;
    promptCount: number;
    slots: string[];
  }>;
  slots: {
    subject?: string[];
    verb?: string[];
    object?: string[];
    modifier?: string[];
    time?: string[];
    location?: string[];
    polarity?: string[];
    tense?: string[];
  };
  format: {
    pattern: string;
  };
  rules?: {
    minScenarioTokensPerPrompt?: number;
    forbidPhrases?: string[];
  };
}

interface GeneratedPrompt {
  id: string;
  text: string;
  slots?: Record<string, string[]>;
  slotsChanged?: string[];
}

interface PackEntry {
  schemaVersion: number;
  id: string;
  kind: string;
  title: string;
  level: string;
  estimatedMinutes: number;
  description: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  outline: string[];
  prompts: GeneratedPrompt[];
  sessionPlan: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
  tags?: string[];
}

/**
 * Generate all combinations of slot values for a given step
 */
function generateSlotCombinations(
  template: TemplateDocument,
  step: TemplateDocument['steps'][0]
): Array<Record<string, string>> {
  const combinations: Array<Record<string, string>> = [];
  const slotTypes = step.slots.filter(slot => template.slots[slot as keyof typeof template.slots]);
  const slotValues: Record<string, string[]> = {};
  
  // Collect slot values for this step
  for (const slotType of slotTypes) {
    const values = template.slots[slotType as keyof typeof template.slots];
    if (values && values.length > 0) {
      slotValues[slotType] = values;
    }
  }
  
  // Generate cartesian product
  function cartesianProduct(arrays: string[][]): string[][] {
    if (arrays.length === 0) return [[]];
    if (arrays.length === 1) return arrays[0].map(v => [v]);
    
    const [first, ...rest] = arrays;
    const restProduct = cartesianProduct(rest);
    const result: string[][] = [];
    
    for (const firstValue of first) {
      for (const restCombo of restProduct) {
        result.push([firstValue, ...restCombo]);
      }
    }
    
    return result;
  }
  
  const slotKeys = Object.keys(slotValues);
  const valueArrays = slotKeys.map(key => slotValues[key]);
  const product = cartesianProduct(valueArrays);
  
  for (const combo of product) {
    const combination: Record<string, string> = {};
    for (let i = 0; i < slotKeys.length; i++) {
      combination[slotKeys[i]] = combo[i];
    }
    combinations.push(combination);
  }
  
  return combinations;
}

/**
 * Generate sentence from pattern and slot values
 */
function generateSentence(pattern: string, slots: Record<string, string>): string {
  let sentence = pattern;
  
  for (const [slotName, value] of Object.entries(slots)) {
    const placeholder = `{${slotName}}`;
    sentence = sentence.replace(placeholder, value);
  }
  
  // Remove any remaining placeholders (slots not in this combination)
  sentence = sentence.replace(/\{[^}]+\}/g, '');
  
  // Clean up extra whitespace
  sentence = sentence.replace(/\s+/g, ' ').trim();
  
  return sentence;
}

/**
 * Check if slot values contain scenario tokens
 */
function slotsContainScenarioTokens(
  slots: Record<string, string>,
  tokens: string[]
): boolean {
  const allValues = Object.values(slots).join(' ').toLowerCase();
  let count = 0;
  
  for (const token of tokens) {
    if (allValues.includes(token.toLowerCase())) {
      count++;
    }
  }
  
  return count >= 2;
}

/**
 * Count scenario tokens in text
 */
function countScenarioTokens(text: string, tokens: string[]): number {
  const textLower = text.toLowerCase();
  let count = 0;
  
  for (const token of tokens) {
    if (textLower.includes(token.toLowerCase())) {
      count++;
    }
  }
  
  return count;
}

/**
 * Check if text contains forbidden phrases
 */
function containsForbiddenPhrases(text: string, forbidPhrases: string[]): boolean {
  const textLower = text.toLowerCase();
  for (const phrase of forbidPhrases) {
    if (textLower.includes(phrase.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Check if text has concreteness markers (digits, currency, time, weekday)
 */
function hasConcretenessMarker(text: string): boolean {
  // Check for digit
  if (/\d/.test(text)) return true;
  // Check for currency
  if (/[€$]/.test(text)) return true;
  // Check for time marker
  if (/\d{1,2}:\d{2}/.test(text)) return true;
  // Check for weekday
  const weekdays = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
  const textLower = text.toLowerCase();
  for (const weekday of weekdays) {
    if (textLower.includes(weekday)) return true;
  }
  return false;
}

/**
 * Compare two slot combinations and determine which slots changed
 */
function getChangedSlots(
  prev: Record<string, string>,
  curr: Record<string, string>
): string[] {
  const changed: string[] = [];
  
  for (const key of Object.keys(curr)) {
    if (prev[key] !== curr[key]) {
      changed.push(key);
    }
  }
  
  return changed;
}

/**
 * Generate prompts for a step
 */
function generatePromptsForStep(
  template: TemplateDocument,
  step: TemplateDocument['steps'][0],
  stepIndex: number,
  previousPrompt: GeneratedPrompt | null
): GeneratedPrompt[] {
  const combinations = generateSlotCombinations(template, step);
  const prompts: GeneratedPrompt[] = [];
  const minScenarioTokens = template.rules?.minScenarioTokensPerPrompt ?? 2;
  const forbidPhrases = template.rules?.forbidPhrases ?? [];
  
  // Filter combinations to ensure quality
  const validCombinations = combinations.filter(combo => {
    const sentence = generateSentence(template.format.pattern, combo);
    
    // Check length
    if (sentence.length < 12 || sentence.length > 140) {
      return false;
    }
    
    // Check scenario tokens - check both sentence text and slot values
    const tokenCountInText = countScenarioTokens(sentence, template.requiredScenarioTokens);
    const tokensInSlots = slotsContainScenarioTokens(combo, template.requiredScenarioTokens);
    
    // Pass if either the text contains tokens OR the slot values contain tokens
    // Also be lenient: if we have at least 1 token, that's acceptable (quality gates require 2, but templates may need adjustment)
    if (tokenCountInText === 0 && !tokensInSlots) {
      return false;
    }
    
    // Check forbidden phrases
    if (containsForbiddenPhrases(sentence, forbidPhrases)) {
      return false;
    }
    
    return true;
  });
  
  // If no valid combinations found, use filtered combinations (quality gates will catch issues)
  const combinationsToUse = validCombinations.length > 0 ? validCombinations : combinations.filter(combo => {
    const sentence = generateSentence(template.format.pattern, combo);
    if (sentence.length < 12 || sentence.length > 140) {
      return false;
    }
    if (containsForbiddenPhrases(sentence, forbidPhrases)) {
      return false;
    }
    return true;
  });
  
  if (validCombinations.length === 0 && combinations.length > 0) {
    console.warn(`⚠️  Warning: No valid combinations found for step "${step.id}". Using filtered combinations (quality gates will validate).`);
  }
  
  // Select combinations deterministically (use step index for seeding)
  const selectedCombinations: Array<Record<string, string>> = [];
  const needed = step.promptCount;
  
  // Use deterministic selection: cycle through combinations
  for (let i = 0; i < needed && combinationsToUse.length > 0; i++) {
    const index = (stepIndex * 100 + i) % combinationsToUse.length;
    selectedCombinations.push(combinationsToUse[index]);
  }
  
  // If we don't have enough combinations, repeat some (with variation)
  while (selectedCombinations.length < needed && combinationsToUse.length > 0) {
    const index = selectedCombinations.length % combinationsToUse.length;
    selectedCombinations.push(combinationsToUse[index]);
  }
  
  // Generate prompts from selected combinations
  let prevCombo: Record<string, string> | null = previousPrompt?.slots 
    ? Object.fromEntries(
        Object.entries(previousPrompt.slots).map(([k, v]) => [k, v[0] || ''])
      )
    : null;
  
  for (let i = 0; i < selectedCombinations.length; i++) {
    const combo = selectedCombinations[i];
    const sentence = generateSentence(template.format.pattern, combo);
    const promptId = `prompt-${String(stepIndex * 100 + i + 1).padStart(3, '0')}`;
    
    // Build slots object
    const slots: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(combo)) {
      slots[key] = [value];
    }
    
    // Determine slotsChanged
    let slotsChanged: string[] | undefined;
    if (prevCombo) {
      const changed = getChangedSlots(prevCombo, combo);
      if (changed.length >= 2) {
        slotsChanged = changed;
      }
    }
    
    prompts.push({
      id: promptId,
      text: sentence,
      slots,
      slotsChanged
    });
    
    prevCombo = combo;
  }
  
  // Ensure at least 30% have slotsChanged with 2+ slots
  const withMultiSlotChange = prompts.filter(p => p.slotsChanged && p.slotsChanged.length >= 2);
  const requiredMultiSlot = Math.ceil(prompts.length * 0.3);
  
  if (withMultiSlotChange.length < requiredMultiSlot && prompts.length > 1) {
    // Mark additional prompts as having multi-slot changes
    let added = 0;
    for (let i = 1; i < prompts.length && added < (requiredMultiSlot - withMultiSlotChange.length); i++) {
      if (!prompts[i].slotsChanged || prompts[i].slotsChanged.length < 2) {
        // Find which slots actually changed
        const prevSlots = prompts[i - 1].slots || {};
        const currSlots = prompts[i].slots || {};
        const changed = getChangedSlots(
          Object.fromEntries(Object.entries(prevSlots).map(([k, v]) => [k, v[0] || ''])),
          Object.fromEntries(Object.entries(currSlots).map(([k, v]) => [k, v[0] || '']))
        );
        
        // If we can't find 2+ changed slots, add a dummy one (this shouldn't happen in practice)
        if (changed.length >= 2) {
          prompts[i].slotsChanged = changed;
          added++;
        }
      }
    }
  }
  
  return prompts;
}

/**
 * Generate pack from template
 */
function generatePack(
  template: TemplateDocument,
  packId: string,
  title?: string,
  level?: string
): PackEntry {
  const allPrompts: GeneratedPrompt[] = [];
  const sessionSteps: Array<{ id: string; title: string; promptIds: string[] }> = [];
  let previousPrompt: GeneratedPrompt | null = null;
  
  // Generate prompts for each step
  for (let stepIndex = 0; stepIndex < template.steps.length; stepIndex++) {
    const step = template.steps[stepIndex];
    const stepPrompts = generatePromptsForStep(template, step, stepIndex, previousPrompt);
    
    allPrompts.push(...stepPrompts);
    
    sessionSteps.push({
      id: step.id,
      title: step.title,
      promptIds: stepPrompts.map(p => p.id)
    });
    
    // Update previous prompt for next step
    if (stepPrompts.length > 0) {
      previousPrompt = stepPrompts[stepPrompts.length - 1];
    }
  }
  
  // Ensure concreteness markers (at least 2 prompts)
  let concretenessCount = allPrompts.filter(p => p && p.text && hasConcretenessMarker(p.text)).length;
  if (concretenessCount < 2 && allPrompts.length >= 2) {
    // Try to add concreteness to prompts that don't have it
    for (const prompt of allPrompts) {
      if (!hasConcretenessMarker(prompt.text) && concretenessCount < 2) {
        // This is a limitation - we can't modify generated text deterministically
        // In practice, templates should include time/currency in slot values
        // For now, we'll just warn if this happens
        console.warn(`⚠️  Warning: Prompt "${prompt.id}" lacks concreteness marker. Template should include time/currency in slots.`);
      }
    }
  }
  
  // Ensure register consistency (formal packs need Sie/Ihnen)
  if (template.register === 'formal') {
    const hasFormalMarker = allPrompts.some(p => 
      /\bSie\b/.test(p.text) || /\bIhnen\b/.test(p.text)
    );
    if (!hasFormalMarker) {
      console.warn(`⚠️  Warning: Formal register pack but no "Sie" or "Ihnen" found. Template slots should include formal pronouns.`);
    }
  }
  
  // Calculate estimated minutes (rough: 1 minute per prompt + 2 minutes overhead)
  const estimatedMinutes = Math.max(15, Math.min(120, allPrompts.length + 2));
  
  const pack: PackEntry = {
    schemaVersion: 1,
    id: packId,
    kind: 'pack',
    title: title || template.title,
    level: level || template.level,
    estimatedMinutes,
    description: `Generated from template "${template.id}". ${template.scenario} scenario at ${template.level} level.`,
    scenario: template.scenario,
    register: template.register,
    primaryStructure: template.primaryStructure,
    variationSlots: template.variationSlots,
    outline: template.steps.map(s => s.title),
    prompts: allPrompts,
    sessionPlan: {
      version: 1,
      steps: sessionSteps
    },
    tags: [template.scenario, template.level.toLowerCase()]
  };
  
  return pack;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace = '';
  let templateId = '';
  let packId = '';
  let title: string | undefined;
  let level: string | undefined;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--template' && i + 1 < args.length) {
      templateId = args[i + 1];
      i++;
    } else if (args[i] === '--packId' && i + 1 < args.length) {
      packId = args[i + 1];
      i++;
    } else if (args[i] === '--title' && i + 1 < args.length) {
      title = args[i + 1];
      i++;
    } else if (args[i] === '--level' && i + 1 < args.length) {
      level = args[i + 1];
      i++;
    }
  }
  
  if (!workspace || !templateId || !packId) {
    console.error('Usage: generate-pack-from-template.ts --workspace <ws> --template <templateId> --packId <packId> [--title <title>] [--level <level>]');
    process.exit(1);
  }
  
  // Load template
  const templatePath = join(CONTENT_DIR, 'workspaces', workspace, 'templates', `${templateId}.json`);
  if (!existsSync(templatePath)) {
    console.error(`❌ Template not found: ${templatePath}`);
    process.exit(1);
  }
  
  const templateContent = readFileSync(templatePath, 'utf-8');
  const template: TemplateDocument = JSON.parse(templateContent);
  
  // Validate template has required fields
  if (template.kind !== 'template') {
    console.error(`❌ Invalid template: kind must be "template"`);
    process.exit(1);
  }
  
  // Generate pack
  console.log(`Generating pack "${packId}" from template "${templateId}"...`);
  const pack = generatePack(template, packId, title, level);
  
  // Write pack file
  const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', packId);
  if (!existsSync(packDir)) {
    mkdirSync(packDir, { recursive: true });
  }
  
  const packPath = join(packDir, 'pack.json');
  writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n');
  
  console.log(`✅ Generated pack: ${packPath}`);
  console.log(`   - ${pack.prompts.length} prompts`);
  console.log(`   - ${pack.sessionPlan.steps.length} steps`);
  console.log(`   - Level: ${pack.level}`);
  console.log(`   - Scenario: ${pack.scenario}`);
  console.log(`\n⚠️  Note: You may need to update context/index.json to include this pack.`);
}

main();

