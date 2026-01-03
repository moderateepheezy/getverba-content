#!/usr/bin/env tsx
/**
 * Batch Translation Script
 * 
 * Translates content using a translation service (e.g., DeepL, Google Translate).
 * Processes content in phases to ensure accuracy before moving to next phase.
 * 
 * Usage:
 *   npx tsx scripts/translate-batch.ts --phase phase1 --dry-run
 *   npx tsx scripts/translate-batch.ts --phase phase1 --write
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TARGET_LOCALES, TRANSLATION_PHASES, type TargetLocale } from './translation-config';
import { translateText as translateTextAPI } from './translate-api.js';
import { translateText as translateTextAPI } from './translate-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TranslationResult {
  text: string;
  locale: string;
  success: boolean;
  error?: string;
}

/**
 * Translate text using translation service
 * Uses translate-api.ts which supports multiple providers
 */
async function translateText(
  text: string,
  sourceLocale: string,
  targetLocale: string
): Promise<TranslationResult> {
  return translateTextAPI(text, sourceLocale, targetLocale);
}

/**
 * Find all pack files
 */
function findPackFiles(workspace: string): string[] {
  const packsDir = join(__dirname, '..', 'content', 'v1', 'workspaces', workspace, 'packs');
  const files: string[] = [];
  
  function traverse(dir: string) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.name === 'pack.json') {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore
    }
  }
  
  traverse(packsDir);
  return files;
}

/**
 * Find all drill files
 */
function findDrillFiles(workspace: string): string[] {
  const drillsDir = join(__dirname, '..', 'content', 'v1', 'workspaces', workspace, 'drills');
  const files: string[] = [];
  
  function traverse(dir: string) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.name === 'drill.json') {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore
    }
  }
  
  traverse(drillsDir);
  return files;
}

/**
 * Find all exam files
 */
function findExamFiles(workspace: string): string[] {
  const examsDir = join(__dirname, '..', 'content', 'v1', 'workspaces', workspace, 'exams');
  const files: string[] = [];
  
  function traverse(dir: string) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.name === 'exam.json') {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore
    }
  }
  
  traverse(examsDir);
  return files;
}

/**
 * Phase 1: Translate entry metadata (titles, descriptions, etc.)
 */
async function translatePhase1(workspace: string, dryRun: boolean): Promise<void> {
  console.log('Phase 1: Translating entry metadata...\n');
  
  const packFiles = findPackFiles(workspace);
  const drillFiles = findDrillFiles(workspace);
  const examFiles = findExamFiles(workspace);
  
  console.log(`Found ${packFiles.length} packs, ${drillFiles.length} drills, ${examFiles.length} exams\n`);
  
  // Process drills first (they have subtitles)
  for (const filePath of drillFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const entry = JSON.parse(content);
    let updated = false;
    
    // Translate title_i18n
    if (entry.title && entry.title_i18n?.en) {
      for (const locale of TARGET_LOCALES) {
        if (!entry.title_i18n[locale]) {
          const result = await translateText(entry.title_i18n.en, 'en', locale);
          if (result.success) {
            if (!entry.title_i18n) entry.title_i18n = {};
            entry.title_i18n[locale] = result.text;
            updated = true;
            console.log(`  ✅ ${entry.id}: title → ${locale}`);
          } else {
            console.log(`  ⚠️  ${entry.id}: title → ${locale} failed: ${result.error}`);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // Translate subtitle_i18n (drills have this)
    if (entry.subtitle && entry.subtitle_i18n?.en) {
      for (const locale of TARGET_LOCALES) {
        if (!entry.subtitle_i18n[locale]) {
          const result = await translateText(entry.subtitle_i18n.en, 'en', locale);
          if (result.success) {
            if (!entry.subtitle_i18n) entry.subtitle_i18n = {};
            entry.subtitle_i18n[locale] = result.text;
            updated = true;
            console.log(`  ✅ ${entry.id}: subtitle → ${locale}`);
          } else {
            console.log(`  ⚠️  ${entry.id}: subtitle → ${locale} failed: ${result.error}`);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // Translate shortTitle_i18n if exists
    if (entry.shortTitle && entry.shortTitle_i18n?.en) {
      for (const locale of TARGET_LOCALES) {
        if (!entry.shortTitle_i18n[locale]) {
          const result = await translateText(entry.shortTitle_i18n.en, 'en', locale);
          if (result.success) {
            if (!entry.shortTitle_i18n) entry.shortTitle_i18n = {};
            entry.shortTitle_i18n[locale] = result.text;
            updated = true;
            console.log(`  ✅ ${entry.id}: shortTitle → ${locale}`);
          } else {
            console.log(`  ⚠️  ${entry.id}: shortTitle → ${locale} failed: ${result.error}`);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    if (updated && !dryRun) {
      writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
    }
  }
  
  // Process packs
  for (const filePath of packFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const entry = JSON.parse(content);
    let updated = false;
    
    // Translate title_i18n
    if (entry.title && entry.title_i18n?.en) {
      for (const locale of TARGET_LOCALES) {
        if (!entry.title_i18n[locale]) {
          const result = await translateText(entry.title_i18n.en, 'en', locale);
          if (result.success) {
            if (!entry.title_i18n) entry.title_i18n = {};
            entry.title_i18n[locale] = result.text;
            updated = true;
            console.log(`  ✅ ${entry.id}: title → ${locale}`);
          } else {
            console.log(`  ⚠️  ${entry.id}: title → ${locale} failed: ${result.error}`);
          }
          // Add delay to avoid rate limits (500ms between translations)
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // Translate description_i18n
    if (entry.description && entry.description_i18n?.en) {
      for (const locale of TARGET_LOCALES) {
        if (!entry.description_i18n[locale]) {
          const result = await translateText(entry.description_i18n.en, 'en', locale);
          if (result.success) {
            if (!entry.description_i18n) entry.description_i18n = {};
            entry.description_i18n[locale] = result.text;
            updated = true;
            console.log(`  ✅ ${entry.id}: description → ${locale}`);
          } else {
            console.log(`  ⚠️  ${entry.id}: description → ${locale} failed: ${result.error}`);
          }
          // Add delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // Translate shortTitle_i18n if exists
    if (entry.shortTitle && entry.shortTitle_i18n?.en) {
      for (const locale of TARGET_LOCALES) {
        if (!entry.shortTitle_i18n[locale]) {
          const result = await translateText(entry.shortTitle_i18n.en, 'en', locale);
          if (result.success) {
            if (!entry.shortTitle_i18n) entry.shortTitle_i18n = {};
            entry.shortTitle_i18n[locale] = result.text;
            updated = true;
            console.log(`  ✅ ${entry.id}: shortTitle → ${locale}`);
          }
        }
      }
    }
    
    if (updated && !dryRun) {
      writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
    }
  }
  
  // Process exams
  for (const filePath of examFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const entry = JSON.parse(content);
    let updated = false;
    
    // Translate title_i18n
    if (entry.title && entry.title_i18n?.en) {
      for (const locale of TARGET_LOCALES) {
        if (!entry.title_i18n[locale]) {
          const result = await translateText(entry.title_i18n.en, 'en', locale);
          if (result.success) {
            if (!entry.title_i18n) entry.title_i18n = {};
            entry.title_i18n[locale] = result.text;
            updated = true;
            console.log(`  ✅ ${entry.id}: title → ${locale}`);
          } else {
            console.log(`  ⚠️  ${entry.id}: title → ${locale} failed: ${result.error}`);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // Translate description_i18n
    if (entry.description && entry.description_i18n?.en) {
      for (const locale of TARGET_LOCALES) {
        if (!entry.description_i18n[locale]) {
          const result = await translateText(entry.description_i18n.en, 'en', locale);
          if (result.success) {
            if (!entry.description_i18n) entry.description_i18n = {};
            entry.description_i18n[locale] = result.text;
            updated = true;
            console.log(`  ✅ ${entry.id}: description → ${locale}`);
          } else {
            console.log(`  ⚠️  ${entry.id}: description → ${locale} failed: ${result.error}`);
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    if (updated && !dryRun) {
      writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
    }
  }
}

/**
 * Phase 2-6: Translate pack prompts by scenario
 */
async function translatePackScenario(
  workspace: string,
  scenario: string,
  dryRun: boolean
): Promise<void> {
  console.log(`Translating ${scenario} scenario packs...\n`);
  
  const packFiles = findPackFiles(workspace);
  const scenarioPacks = packFiles.filter(filePath => {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(content);
      return entry.scenario === scenario;
    } catch {
      return false;
    }
  });
  
  console.log(`Found ${scenarioPacks.length} packs in ${scenario} scenario\n`);
  
  for (const filePath of scenarioPacks) {
    const content = readFileSync(filePath, 'utf-8');
    const entry = JSON.parse(content);
    let updated = false;
    
    if (entry.prompts && Array.isArray(entry.prompts)) {
      for (const prompt of entry.prompts) {
        if (prompt.gloss_en && prompt.gloss_en_i18n?.en) {
          for (const locale of TARGET_LOCALES) {
            if (!prompt.gloss_en_i18n[locale]) {
              const result = await translateText(prompt.gloss_en_i18n.en, 'en', locale);
              if (result.success) {
                if (!prompt.gloss_en_i18n) prompt.gloss_en_i18n = {};
                prompt.gloss_en_i18n[locale] = result.text;
                updated = true;
                console.log(`  ✅ ${entry.id}/${prompt.id}: gloss_en → ${locale}`);
              }
            }
          }
        }
      }
    }
    
    if (updated && !dryRun) {
      writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
    }
  }
}

/**
 * Phase 7: Translate all drill prompts
 */
async function translatePhase7(workspace: string, dryRun: boolean): Promise<void> {
  console.log('Phase 7: Translating all drill prompts...\n');
  
  const drillFiles = findDrillFiles(workspace);
  console.log(`Found ${drillFiles.length} drills\n`);
  
  for (const filePath of drillFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const entry = JSON.parse(content);
    let updated = false;
    
    if (entry.prompts && Array.isArray(entry.prompts)) {
      for (const prompt of entry.prompts) {
        if (prompt.gloss_en && prompt.gloss_en_i18n?.en) {
          for (const locale of TARGET_LOCALES) {
            if (!prompt.gloss_en_i18n[locale]) {
              const result = await translateText(prompt.gloss_en_i18n.en, 'en', locale);
              if (result.success) {
                if (!prompt.gloss_en_i18n) prompt.gloss_en_i18n = {};
                prompt.gloss_en_i18n[locale] = result.text;
                updated = true;
                console.log(`  ✅ ${entry.id}/${prompt.id}: gloss_en → ${locale}`);
              }
            }
          }
        }
      }
    }
    
    if (updated && !dryRun) {
      writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const phaseArg = args.find(a => a.startsWith('--phase='))?.split('=')[1] ||
                   args.find(a => a === '--phase') && args[args.indexOf('--phase') + 1];
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const write = args.includes('--write') || args.includes('-w');
  
  if (!phaseArg) {
    console.log('Usage: npx tsx scripts/translate-batch.ts --phase=<phase> [--dry-run|--write]');
    console.log('\nAvailable phases:');
    TRANSLATION_PHASES.forEach(p => {
      console.log(`  ${p.id}: ${p.name}`);
      console.log(`     ${p.description}`);
    });
    process.exit(1);
  }
  
  const phase = TRANSLATION_PHASES.find(p => p.id === phaseArg);
  if (!phase) {
    console.error(`Unknown phase: ${phaseArg}`);
    process.exit(1);
  }
  
  if (!dryRun && !write) {
    console.log('⚠️  Running in dry-run mode. Use --write to apply changes.');
    console.log('');
  }
  
  const workspace = 'de'; // Default workspace
  
  console.log(`Starting ${phase.name}`);
  console.log(`${phase.description}\n`);
  
  try {
    switch (phase.id) {
      case 'phase1':
        await translatePhase1(workspace, dryRun || !write);
        break;
      case 'phase2':
        await translatePackScenario(workspace, 'doctor', dryRun || !write);
        break;
      case 'phase3':
        await translatePackScenario(workspace, 'friends_small_talk', dryRun || !write);
        break;
      case 'phase4':
        await translatePackScenario(workspace, 'government_office', dryRun || !write);
        break;
      case 'phase5':
        await translatePackScenario(workspace, 'housing', dryRun || !write);
        break;
      case 'phase6':
        await translatePackScenario(workspace, 'work', dryRun || !write);
        break;
      case 'phase7':
        await translatePhase7(workspace, dryRun || !write);
        break;
      case 'phase8':
        // TODO: Implement exam translation
        console.log('Phase 8 not yet implemented');
        break;
    }
    
    if (dryRun || !write) {
      console.log('\n✅ Dry run complete. Use --write to apply changes.');
    } else {
      console.log('\n✅ Translation complete!');
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();

