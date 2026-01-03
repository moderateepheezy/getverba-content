#!/usr/bin/env tsx
/**
 * Validate Translation Coverage
 * 
 * Checks that all required translations are present for a given phase.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TARGET_LOCALES, TRANSLATION_PHASES } from './translation-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ValidationResult {
  file: string;
  entryId: string;
  missing: Array<{ field: string; locale: string }>;
  totalFields: number;
  translatedFields: number;
}

function findFiles(dir: string, pattern: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        findFiles(fullPath, pattern, files);
      } else if (entry.name === pattern) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Ignore
  }
  return files;
}

function validatePhase1(workspace: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const contentDir = join(__dirname, '..', 'content', 'v1', 'workspaces', workspace);
  
  const packFiles = findFiles(join(contentDir, 'packs'), 'pack.json');
  const drillFiles = findFiles(join(contentDir, 'drills'), 'drill.json');
  const examFiles = findFiles(join(contentDir, 'exams'), 'exam.json');
  
  const allFiles = [...packFiles, ...drillFiles, ...examFiles];
  
  for (const filePath of allFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(content);
      const missing: Array<{ field: string; locale: string }> = [];
      let totalFields = 0;
      let translatedFields = 0;
      
      // Check title_i18n
      if (entry.title_i18n?.en) {
        totalFields += TARGET_LOCALES.length;
        for (const locale of TARGET_LOCALES) {
          if (entry.title_i18n[locale]) {
            translatedFields++;
          } else {
            missing.push({ field: 'title_i18n', locale });
          }
        }
      }
      
      // Check description_i18n
      if (entry.description_i18n?.en) {
        totalFields += TARGET_LOCALES.length;
        for (const locale of TARGET_LOCALES) {
          if (entry.description_i18n[locale]) {
            translatedFields++;
          } else {
            missing.push({ field: 'description_i18n', locale });
          }
        }
      }
      
      // Check shortTitle_i18n
      if (entry.shortTitle_i18n?.en) {
        totalFields += TARGET_LOCALES.length;
        for (const locale of TARGET_LOCALES) {
          if (entry.shortTitle_i18n[locale]) {
            translatedFields++;
          } else {
            missing.push({ field: 'shortTitle_i18n', locale });
          }
        }
      }
      
      // Check subtitle_i18n (for drills)
      if (entry.subtitle && entry.subtitle_i18n?.en) {
        totalFields += TARGET_LOCALES.length;
        for (const locale of TARGET_LOCALES) {
          if (entry.subtitle_i18n[locale]) {
            translatedFields++;
          } else {
            missing.push({ field: 'subtitle_i18n', locale });
          }
        }
      }
      
      // Check shortTitle_i18n
      if (entry.shortTitle && entry.shortTitle_i18n?.en) {
        totalFields += TARGET_LOCALES.length;
        for (const locale of TARGET_LOCALES) {
          if (entry.shortTitle_i18n[locale]) {
            translatedFields++;
          } else {
            missing.push({ field: 'shortTitle_i18n', locale });
          }
        }
      }
      
      if (missing.length > 0) {
        results.push({
          file: filePath.replace(process.cwd() + '/', ''),
          entryId: entry.id,
          missing,
          totalFields,
          translatedFields,
        });
      }
    } catch (err) {
      // Skip invalid files
    }
  }
  
  return results;
}

function validatePackScenario(workspace: string, scenario: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const contentDir = join(__dirname, '..', 'content', 'v1', 'workspaces', workspace);
  const packFiles = findFiles(join(contentDir, 'packs'), 'pack.json');
  
  for (const filePath of packFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(content);
      
      if (entry.scenario !== scenario) continue;
      
      const missing: Array<{ field: string; locale: string }> = [];
      let totalFields = 0;
      let translatedFields = 0;
      
      if (entry.prompts && Array.isArray(entry.prompts)) {
        for (const prompt of entry.prompts) {
          if (prompt.gloss_en_i18n?.en) {
            totalFields += TARGET_LOCALES.length;
            for (const locale of TARGET_LOCALES) {
              if (prompt.gloss_en_i18n[locale]) {
                translatedFields++;
              } else {
                missing.push({ field: `prompt.${prompt.id}.gloss_en_i18n`, locale });
              }
            }
          }
        }
      }
      
      if (missing.length > 0) {
        results.push({
          file: filePath.replace(process.cwd() + '/', ''),
          entryId: entry.id,
          missing,
          totalFields,
          translatedFields,
        });
      }
    } catch (err) {
      // Skip invalid files
    }
  }
  
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const phaseArg = args.find(a => a.startsWith('--phase='))?.split('=')[1] ||
                   args.find(a => a === '--phase') && args[args.indexOf('--phase') + 1];
  
  if (!phaseArg) {
    console.log('Usage: npx tsx scripts/validate-translations.ts --phase=<phase>');
    console.log('\nAvailable phases:');
    TRANSLATION_PHASES.forEach(p => {
      console.log(`  ${p.id}: ${p.name}`);
    });
    process.exit(1);
  }
  
  const phase = TRANSLATION_PHASES.find(p => p.id === phaseArg);
  if (!phase) {
    console.error(`Unknown phase: ${phaseArg}`);
    process.exit(1);
  }
  
  const workspace = 'de';
  let results: ValidationResult[] = [];
  
  console.log(`Validating ${phase.name}...\n`);
  
  switch (phase.id) {
    case 'phase1':
      results = validatePhase1(workspace);
      break;
    case 'phase2':
      results = validatePackScenario(workspace, 'doctor');
      break;
    case 'phase3':
      results = validatePackScenario(workspace, 'friends_small_talk');
      break;
    case 'phase4':
      results = validatePackScenario(workspace, 'government_office');
      break;
    case 'phase5':
      results = validatePackScenario(workspace, 'housing');
      break;
    case 'phase6':
      results = validatePackScenario(workspace, 'work');
      break;
    case 'phase7':
      // TODO: Implement drill validation
      console.log('Phase 7 validation not yet implemented');
      break;
    case 'phase8':
      // TODO: Implement exam validation
      console.log('Phase 8 validation not yet implemented');
      break;
  }
  
  if (results.length === 0) {
    console.log('✅ All translations complete!');
    console.log('  100% coverage achieved for this phase.');
    process.exit(0);
  }
  
  console.log(`❌ Found ${results.length} entries with missing translations:\n`);
  
  let totalMissing = 0;
  let totalFields = 0;
  let totalTranslated = 0;
  
  results.slice(0, 20).forEach(result => {
    totalMissing += result.missing.length;
    totalFields += result.totalFields;
    totalTranslated += result.translatedFields;
    
    console.log(`${result.entryId}:`);
    console.log(`  Missing: ${result.missing.length} translations`);
    console.log(`  Coverage: ${((result.translatedFields / result.totalFields) * 100).toFixed(1)}%`);
    if (result.missing.length <= 5) {
      result.missing.forEach(m => {
        console.log(`    - ${m.field}[${m.locale}]`);
      });
    }
    console.log('');
  });
  
  if (results.length > 20) {
    console.log(`... and ${results.length - 20} more entries\n`);
  }
  
  const overallCoverage = totalFields > 0 
    ? ((totalTranslated / totalFields) * 100).toFixed(1)
    : '0';
  
  console.log(`Summary:`);
  console.log(`  Entries with missing translations: ${results.length}`);
  console.log(`  Total missing translations: ${totalMissing}`);
  console.log(`  Overall coverage: ${overallCoverage}%`);
  console.log(`\n⚠️  Phase is not complete. Fix missing translations before proceeding.`);
  
  process.exit(1);
}

main();

