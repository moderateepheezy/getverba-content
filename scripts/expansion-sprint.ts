#!/usr/bin/env tsx

/**
 * Content Expansion Sprint v1
 * 
 * Generates a batch of packs and drills deterministically for content expansion.
 * All generated content defaults to review.status="needs_review".
 * 
 * Usage:
 *   tsx scripts/expansion-sprint.ts --workspace de --scenarios government_office,work,doctor,housing --levels A1,A2 --packsCount 35 --drillsCount 15
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v1', 'scenarios');
const REVIEW_DIR = join(__dirname, '..', 'content', 'review');

interface SprintConfig {
  workspace: string;
  scenarios: string[];
  levels: string[];
  packsCount: number;
  drillsCount: number;
}

interface GeneratedItem {
  id: string;
  kind: 'pack' | 'drill';
  scenario?: string;
  level: string;
  path: string;
}

/**
 * Generate a single pack using the existing generator
 */
function generatePack(
  workspace: string,
  packId: string,
  scenario: string,
  level: string,
  seed: number
): GeneratedItem {
  const command = `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${packId} --scenario ${scenario} --level ${level} --seed ${seed}`;
  
  try {
    execSync(command, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', packId, 'pack.json');
    return {
      id: packId,
      kind: 'pack',
      scenario,
      level,
      path: packPath
    };
  } catch (error: any) {
    throw new Error(`Failed to generate pack ${packId}: ${error.message}`);
  }
}

/**
 * Generate a simple drill deterministically
 */
function generateDrill(
  workspace: string,
  drillId: string,
  level: string,
  seed: number
): GeneratedItem {
  const drillDir = join(CONTENT_DIR, 'workspaces', workspace, 'drills', drillId);
  const drillPath = join(drillDir, 'drill.json');
  
  if (existsSync(drillPath)) {
    throw new Error(`Drill ${drillId} already exists`);
  }
  
  mkdirSync(drillDir, { recursive: true });
  
  // Simple deterministic drill generator
  // For now, create a basic drill structure
  // In production, this could be enhanced with more sophisticated generation
  const title = drillId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  // Generate exercises deterministically based on seed
  const exercises = [];
  const exerciseCount = 5 + (seed % 5); // 5-9 exercises
  
  for (let i = 1; i <= exerciseCount; i++) {
    exercises.push({
      id: `ex-${String(i).padStart(3, '0')}`,
      type: i % 2 === 0 ? 'multiple-choice' : 'fill-blank',
      prompt: `Exercise ${i}: Complete the sentence.`,
      answer: `Answer ${i}`,
      hint: `Hint for exercise ${i}`
    });
  }
  
  const drill = {
    id: drillId,
    schemaVersion: 1,
    kind: 'drill',
    title,
    level,
    estimatedMinutes: 10,
    description: `Practice grammar at ${level} level.`,
    instructions: 'Complete each exercise to practice this grammar concept.',
    exercises,
    passingScore: 70,
    tags: ['grammar'],
    provenance: {
      source: 'template',
      sourceRef: 'expansion-sprint',
      extractorVersion: '1.0.0',
      generatedAt: new Date().toISOString()
    },
    review: {
      status: 'needs_review'
    }
  };
  
  writeFileSync(drillPath, JSON.stringify(drill, null, 2) + '\n', 'utf-8');
  
  // Add to review pending queue
  const pendingPath = join(REVIEW_DIR, 'pending.json');
  let pendingItems: Array<{
    id: string;
    kind: string;
    workspace: string;
    scenario?: string;
    level: string;
    title: string;
    createdAt: string;
    sourceTemplate?: string;
  }> = [];
  
  if (existsSync(pendingPath)) {
    try {
      const pendingContent = readFileSync(pendingPath, 'utf-8');
      pendingItems = JSON.parse(pendingContent);
    } catch (err) {
      // Start fresh if parse fails
    }
  }
  
  // Check if already in pending (avoid duplicates)
  const existingIndex = pendingItems.findIndex(item => item.id === drillId && item.workspace === workspace);
  if (existingIndex < 0) {
    pendingItems.push({
      id: drillId,
      kind: 'drill',
      workspace,
      level,
      title,
      createdAt: new Date().toISOString(),
      sourceTemplate: 'expansion-sprint'
    });
    
    if (!existsSync(REVIEW_DIR)) {
      mkdirSync(REVIEW_DIR, { recursive: true });
    }
    writeFileSync(pendingPath, JSON.stringify(pendingItems, null, 2) + '\n', 'utf-8');
  }
  
  return {
    id: drillId,
    kind: 'drill',
    level,
    path: drillPath
  };
}

/**
 * Run validation on generated content
 */
function runValidation(): void {
  console.log('\n🔍 Running validation...');
  try {
    execSync('npm run content:validate', {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      encoding: 'utf-8'
    });
    console.log('✅ Validation passed');
  } catch (error: any) {
    throw new Error(`Validation failed: ${error.message}`);
  }
}

/**
 * Main expansion sprint function
 */
function runExpansionSprint(config: SprintConfig): GeneratedItem[] {
  console.log('🚀 Starting Content Expansion Sprint v1');
  console.log(`   Workspace: ${config.workspace}`);
  console.log(`   Scenarios: ${config.scenarios.join(', ')}`);
  console.log(`   Levels: ${config.levels.join(', ')}`);
  console.log(`   Packs: ${config.packsCount}`);
  console.log(`   Drills: ${config.drillsCount}`);
  console.log('');
  
  const generated: GeneratedItem[] = [];
  let packCounter = 0;
  let drillCounter = 0;
  let seed = 1;
  
  // Generate packs
  console.log('📦 Generating packs...');
  for (const scenario of config.scenarios) {
    // Check if template exists
    const templatePath = join(TEMPLATES_DIR, `${scenario}.json`);
    if (!existsSync(templatePath)) {
      console.warn(`⚠️  Warning: Template not found for scenario "${scenario}", skipping`);
      continue;
    }
    
    for (const level of config.levels) {
      const packsPerScenarioLevel = Math.ceil(config.packsCount / (config.scenarios.length * config.levels.length));
      
      for (let i = 0; i < packsPerScenarioLevel && packCounter < config.packsCount; i++) {
        const packId = `sprint-${scenario}-${level.toLowerCase()}-${String(packCounter + 1).padStart(3, '0')}`;
        
        try {
          console.log(`   Generating pack: ${packId} (seed: ${seed})`);
          const item = generatePack(config.workspace, packId, scenario, level, seed);
          generated.push(item);
          packCounter++;
          seed++;
        } catch (error: any) {
          console.error(`   ❌ Failed to generate pack ${packId}: ${error.message}`);
          throw error;
        }
      }
    }
  }
  
  console.log(`✅ Generated ${packCounter} packs`);
  
  // Generate drills
  console.log('\n🔧 Generating drills...');
  for (const level of config.levels) {
    const drillsPerLevel = Math.ceil(config.drillsCount / config.levels.length);
    
    for (let i = 0; i < drillsPerLevel && drillCounter < config.drillsCount; i++) {
      const drillId = `sprint-drill-${level.toLowerCase()}-${String(drillCounter + 1).padStart(3, '0')}`;
      
      try {
        console.log(`   Generating drill: ${drillId} (seed: ${seed})`);
        const item = generateDrill(config.workspace, drillId, level, seed);
        generated.push(item);
        drillCounter++;
        seed++;
      } catch (error: any) {
        console.error(`   ❌ Failed to generate drill ${drillId}: ${error.message}`);
        throw error;
      }
    }
  }
  
  console.log(`✅ Generated ${drillCounter} drills`);
  
  // Regenerate indexes
  console.log('\n🔄 Regenerating indexes...');
  try {
    execSync(`npm run content:generate-indexes -- --workspace ${config.workspace}`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    console.log('✅ Indexes regenerated');
  } catch (error: any) {
    console.warn(`⚠️  Warning: Failed to regenerate indexes: ${error.message}`);
  }
  
  // Run validation
  runValidation();
  
  console.log('\n✅ Expansion sprint completed successfully!');
  console.log(`   Total generated: ${generated.length} items`);
  console.log(`   - Packs: ${packCounter}`);
  console.log(`   - Drills: ${drillCounter}`);
  console.log('\n⚠️  Next steps:');
  console.log('   1. Review generated content in content/review/pending.json');
  console.log('   2. Run: npm run content:quality');
  console.log('   3. Generate sprint report: tsx scripts/sprint-report.ts --workspace ' + config.workspace);
  
  return generated;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace = 'de';
  let scenarios: string[] = ['government_office', 'work', 'doctor', 'housing'];
  let levels: string[] = ['A1', 'A2'];
  let packsCount = 35;
  let drillsCount = 15;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--scenarios' && i + 1 < args.length) {
      scenarios = args[i + 1].split(',').map(s => s.trim());
      i++;
    } else if (args[i] === '--levels' && i + 1 < args.length) {
      levels = args[i + 1].split(',').map(l => l.trim().toUpperCase());
      i++;
    } else if (args[i] === '--packsCount' && i + 1 < args.length) {
      packsCount = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--drillsCount' && i + 1 < args.length) {
      drillsCount = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: tsx scripts/expansion-sprint.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --workspace <ws>      Workspace ID (default: de)');
      console.log('  --scenarios <list>   Comma-separated list of scenarios (default: government_office,work,doctor,housing)');
      console.log('  --levels <list>      Comma-separated list of levels (default: A1,A2)');
      console.log('  --packsCount <n>     Number of packs to generate (default: 35)');
      console.log('  --drillsCount <n>    Number of drills to generate (default: 15)');
      console.log('');
      console.log('Example:');
      console.log('  tsx scripts/expansion-sprint.ts --workspace de --scenarios government_office,work --levels A1,A2 --packsCount 20 --drillsCount 10');
      process.exit(0);
    }
  }
  
  // Validate
  if (packsCount < 1 || drillsCount < 1) {
    console.error('❌ Error: packsCount and drillsCount must be at least 1');
    process.exit(1);
  }
  
  if (packsCount + drillsCount < 20 || packsCount + drillsCount > 50) {
    console.warn(`⚠️  Warning: Total count (${packsCount + drillsCount}) is outside recommended range (20-50)`);
  }
  
  const config: SprintConfig = {
    workspace,
    scenarios,
    levels,
    packsCount,
    drillsCount
  };
  
  try {
    runExpansionSprint(config);
  } catch (error: any) {
    console.error(`\n❌ Expansion sprint failed: ${error.message}`);
    process.exit(1);
  }
}

main();

