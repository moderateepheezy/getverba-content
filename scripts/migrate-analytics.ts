#!/usr/bin/env tsx

/**
 * Migration script to add analytics metadata to existing packs
 * 
 * Generates minimal analytics based on existing pack metadata.
 * Usage: tsx scripts/migrate-analytics.ts [--workspace <ws>] [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface PackEntry {
  id: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  level?: string;
  analytics?: any;
}

/**
 * Generate minimal analytics from existing pack metadata
 */
function generateMinimalAnalytics(pack: PackEntry): PackEntry['analytics'] {
  const scenario = pack.scenario || 'general';
  const register = pack.register || 'neutral';
  const primaryStructure = pack.primaryStructure || 'basic_phrases';
  const variationSlots = pack.variationSlots || ['subject', 'verb'];
  const level = pack.level || 'A1';
  
  // Determine drillType
  let drillType: 'substitution' | 'pattern-switch' | 'roleplay-bounded';
  if (scenario === 'government_office' || scenario === 'work' || scenario === 'restaurant') {
    drillType = 'roleplay-bounded';
  } else if (primaryStructure.includes('switch') || primaryStructure.includes('pattern')) {
    drillType = 'pattern-switch';
  } else {
    drillType = 'substitution';
  }
  
  // Determine cognitiveLoad
  let cognitiveLoad: 'low' | 'medium' | 'high';
  if (level === 'A1' && variationSlots.length <= 2) {
    cognitiveLoad = 'low';
  } else if (level === 'A1' || (level === 'A2' && variationSlots.length <= 3)) {
    cognitiveLoad = 'medium';
  } else {
    cognitiveLoad = 'high';
  }
  
  // Generate goal
  const goal = `Practice ${scenario} scenarios at ${level} level`;
  
  // Generate constraints
  const constraints: string[] = [];
  if (register) {
    constraints.push(`${register} register maintained`);
  }
  if (scenario) {
    constraints.push(`${scenario} scenario context`);
  }
  if (primaryStructure) {
    constraints.push(`${primaryStructure} structure focus`);
  }
  
  // Generate levers from variationSlots
  const leverDescriptions: Record<string, string> = {
    subject: 'subject variation',
    verb: 'verb substitution',
    object: 'object variation',
    modifier: 'modifier changes',
    time: 'time expressions',
    location: 'location phrases',
    tense: 'tense variation',
    polarity: 'negation patterns'
  };
  
  const levers = variationSlots.map(slot => 
    leverDescriptions[slot] || `${slot} variation`
  );
  
  // Generate successCriteria
  const successCriteria = [
    `Uses ${scenario} vocabulary appropriately`,
    `Varies ${variationSlots.slice(0, 2).join(' and ')} across prompts`,
    `Maintains ${register} register consistency`
  ];
  
  // Generate commonMistakes
  const commonMistakes = [
    `Missing ${scenario} vocabulary`,
    `Inconsistent ${register} register usage`,
    `Incorrect ${primaryStructure} structure`
  ];
  
  return {
    goal: goal.length <= 120 ? goal : goal.substring(0, 117) + '...',
    constraints: constraints.slice(0, 6),
    levers: levers.slice(0, 6),
    successCriteria: successCriteria.slice(0, 6),
    commonMistakes: commonMistakes.slice(0, 6),
    drillType,
    cognitiveLoad
  };
}

function main() {
  const args = process.argv.slice(2);
  let workspace: string | null = null;
  let dryRun = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  if (!existsSync(workspacesDir)) {
    console.error('❌ Error: workspaces directory not found');
    process.exit(1);
  }
  
  const workspaces = workspace 
    ? [workspace]
    : readdirSync(workspacesDir).filter(item => {
        const itemPath = join(workspacesDir, item);
        return existsSync(itemPath);
      });
  
  let migrated = 0;
  let skipped = 0;
  
  for (const ws of workspaces) {
    const packsDir = join(workspacesDir, ws, 'packs');
    if (!existsSync(packsDir)) {
      continue;
    }
    
    const packDirs = readdirSync(packsDir).filter(item => {
      const itemPath = join(packsDir, item);
      return existsSync(join(itemPath, 'pack.json'));
    });
    
    for (const packDir of packDirs) {
      const packPath = join(packsDir, packDir, 'pack.json');
      try {
        const content = readFileSync(packPath, 'utf-8');
        const pack: PackEntry = JSON.parse(content);
        
        // Skip if analytics already exists
        if (pack.analytics && typeof pack.analytics === 'object') {
          skipped++;
          continue;
        }
        
        // Generate analytics
        const analytics = generateMinimalAnalytics(pack);
        
        if (dryRun) {
          console.log(`[DRY RUN] Would add analytics to ${ws}:${pack.id}`);
        } else {
          pack.analytics = analytics;
          writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n', 'utf-8');
          console.log(`✅ Migrated ${ws}:${pack.id}`);
        }
        
        migrated++;
      } catch (err: any) {
        console.warn(`⚠️  Failed to migrate ${packPath}: ${err.message}`);
      }
    }
  }
  
  console.log(`\n📊 Migration summary:`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped (already has analytics): ${skipped}`);
  
  if (dryRun) {
    console.log(`\n⚠️  DRY RUN - No files were modified`);
  }
}

main();

