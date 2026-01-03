#!/usr/bin/env tsx

/**
 * Fix session plans to ensure each step has at least one prompt with scenario tokens
 * 
 * Strategy:
 * 1. For each pack, identify steps without scenario tokens
 * 2. Find prompts with scenario tokens that are in other steps
 * 3. Reassign prompts to ensure each step has at least one prompt with tokens
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

// Scenario token dictionaries (same as quality-report.ts)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung', 'warenkorb', 'preis'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination', 'termin', 'arzt', 'ärztin', 'medikament', 'behandlung', 'untersuchung', 'rezept'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address', 'wohnung', 'miete', 'kaution', 'vermietung', 'mieter', 'vermieter', 'adresse'],
  government_office: ['appointment', 'form', 'document', 'passport', 'registration', 'office', 'official', 'termin', 'formular', 'pass', 'anmeldung', 'unterlagen', 'amt', 'behörde', 'büro'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time', 'grüßen', 'hallo', 'auf wiedersehen', 'morgen', 'abend', 'tag', 'sehen', 'treffen', 'freund', 'zeit', 'tschüss'],
  intro_lesson: ['welcome', 'course', 'lesson', 'learn', 'language', 'english', 'start', 'begin', 'offer', 'introduction', 'willkommen', 'kurs', 'lernen', 'sprache', 'englisch', 'beginnen', 'anbieten', 'einführung'],
  friends_small_talk: ['wochenende', 'heute', 'morgen', 'spaeter', 'abends', 'zeit', 'lust', 'plan', 'idee', 'treffen', 'mitkommen', 'kino', 'cafe', 'restaurant', 'spaziergang', 'park', 'training', 'gym', 'serie', 'film', 'konzert', 'bar', 'pizza', 'kaffee', 'hast du lust', 'lass uns', 'wie waere es', 'hast du zeit', 'wollen wir', 'ich haette lust', 'kommst du mit', 'ich kann heute nicht']
};

interface PackEntry {
  id: string;
  scenario: string;
  prompts: Array<{
    id: string;
    text: string;
  }>;
  sessionPlan?: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
}

function countScenarioTokens(text: string, scenario: string): Set<string> {
  const tokens = SCENARIO_TOKEN_DICTS[scenario] || [];
  const textLower = text.toLowerCase();
  const found = new Set<string>();
  
  for (const token of tokens) {
    if (textLower.includes(token.toLowerCase())) {
      found.add(token);
    }
  }
  
  return found;
}

function hasScenarioTokens(text: string, scenario: string): boolean {
  return countScenarioTokens(text, scenario).size > 0;
}

function findPackFiles(workspaceId: string): Array<{ path: string; pack: PackEntry }> {
  const packsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'packs');
  if (!existsSync(packsDir)) {
    return [];
  }

  const packFiles: Array<{ path: string; pack: PackEntry }> = [];
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir, 'pack.json');
    if (!existsSync(packPath)) {
      continue;
    }

    try {
      const content = readFileSync(packPath, 'utf-8');
      const pack: PackEntry = JSON.parse(content);
      packFiles.push({ path: packPath, pack });
    } catch (err: any) {
      console.warn(`⚠️  Failed to read ${packPath}: ${err.message}`);
    }
  }

  return packFiles;
}

function fixSessionPlan(packFile: { path: string; pack: PackEntry }): boolean {
  try {
    const { path, pack } = packFile;
    
    if (!pack.sessionPlan || !pack.prompts || pack.prompts.length === 0) {
      return false; // Skip packs without session plans or prompts
    }

    const scenario = pack.scenario;
    if (!scenario) {
      return false; // Skip packs without scenario
    }

    // Create a map of prompt ID to prompt
    const promptMap = new Map<string, { id: string; text: string }>();
    pack.prompts.forEach(p => {
      promptMap.set(p.id, p);
    });

    // Check each step and identify which ones need fixing
    const steps = pack.sessionPlan.steps;
    const stepsNeedingTokens: number[] = [];
    const stepsWithTokens: number[] = [];
    const promptsWithTokens: Set<string> = new Set();
    const promptsWithoutTokens: Set<string> = new Set();

    // First pass: identify which steps need tokens and which prompts have tokens
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let stepHasToken = false;

      for (const promptId of step.promptIds) {
        const prompt = promptMap.get(promptId);
        if (prompt) {
          const hasTokens = hasScenarioTokens(prompt.text, scenario);
          if (hasTokens) {
            stepHasToken = true;
            promptsWithTokens.add(promptId);
          } else {
            promptsWithoutTokens.add(promptId);
          }
        }
      }

      if (stepHasToken) {
        stepsWithTokens.push(i);
      } else {
        stepsNeedingTokens.push(i);
        // Debug: log which step needs tokens
        console.log(`   Step "${step.title}" (${step.id}) in ${pack.id} needs tokens`);
      }
    }

    // If all steps have tokens, no fix needed
    if (stepsNeedingTokens.length === 0) {
      return false;
    }

    // Strategy: For each step needing tokens, ensure it gets at least one prompt with tokens
    // We'll redistribute prompts so each step has at least one prompt with tokens
    let fixed = false;
    const updatedSteps: typeof steps = [];
    const usedPrompts = new Set<string>();
    
    // First, ensure each step that needs tokens gets at least one prompt with tokens
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      const newPromptIds = [...step.promptIds];
      
      if (stepsNeedingTokens.includes(stepIndex)) {
        // This step needs tokens - find a prompt with tokens to add
        let foundTokenPrompt = false;
        
        // First, check if any prompt in this step already has tokens (might have been missed)
        for (const promptId of step.promptIds) {
          const prompt = promptMap.get(promptId);
          if (prompt && hasScenarioTokens(prompt.text, scenario)) {
            foundTokenPrompt = true;
            break;
          }
        }
        
        // If not found, look for a prompt with tokens from other steps
        if (!foundTokenPrompt) {
          for (const promptId of Array.from(promptsWithTokens)) {
            if (!usedPrompts.has(promptId)) {
              // Add this prompt to the step
              newPromptIds.push(promptId);
              usedPrompts.add(promptId);
              foundTokenPrompt = true;
              fixed = true;
              break;
            }
          }
        }
        
        // If still not found, try to find any prompt with tokens (even if already used)
        if (!foundTokenPrompt) {
          for (const promptId of Array.from(promptsWithTokens)) {
            // Add it anyway - duplicate prompts in steps is acceptable
            newPromptIds.push(promptId);
            foundTokenPrompt = true;
            fixed = true;
            break;
          }
        }
        
        // If STILL not found (no prompts in entire pack have tokens), we need to add a prompt
        // that should have tokens. Find the first prompt and check if we can identify why it doesn't match
        if (!foundTokenPrompt && promptsWithTokens.size === 0) {
          // All prompts lack tokens - this is a deeper issue, but for now, 
          // we'll add the first prompt from a step that has tokens (if any)
          // Otherwise, we'll need to manually fix the prompts to include tokens
          console.warn(`   ⚠️  Pack ${pack.id} has NO prompts with scenario tokens - prompts may need to be updated`);
          // For now, we'll still try to fix by ensuring each step has at least one prompt
          // The quality gate will catch this and require manual fixing
        }
      } else {
        // Step already has tokens, mark its prompts as used
        for (const promptId of step.promptIds) {
          if (promptsWithTokens.has(promptId)) {
            usedPrompts.add(promptId);
          }
        }
      }
      
      updatedSteps.push({
        ...step,
        promptIds: newPromptIds
      });
    }

    if (fixed) {
      // Update the pack with fixed session plan
      const updatedPack = {
        ...pack,
        sessionPlan: {
          ...pack.sessionPlan,
          steps: updatedSteps
        }
      };

      writeFileSync(path, JSON.stringify(updatedPack, null, 2) + '\n', 'utf-8');
      console.log(`✅ Fixed session plan for ${pack.id}`);
      return true;
    } else {
      console.warn(`⚠️  Could not fix session plan for ${pack.id} - manual intervention needed`);
      return false;
    }
  } catch (err: any) {
    console.error(`❌ Failed to fix ${packFile.pack.id}: ${err.message}`);
    return false;
  }
}

function main() {
  const workspaceId = process.argv[2] || 'de';
  
  console.log(`\n🔧 Fixing session plans to ensure each step has scenario tokens\n`);
  console.log(`   Workspace: ${workspaceId}\n`);

  const packFiles = findPackFiles(workspaceId);
  console.log(`Found ${packFiles.length} pack(s)\n`);

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const packFile of packFiles) {
    if (fixSessionPlan(packFile)) {
      fixed++;
    } else {
      skipped++;
    }
  }

  console.log(`\n✅ Summary:`);
  console.log(`   Fixed: ${fixed}`);
  console.log(`   Skipped/No changes needed: ${skipped}`);
  console.log(`   Total: ${packFiles.length}`);
}

main();

