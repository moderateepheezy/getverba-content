#!/usr/bin/env tsx

/**
 * Automated Niche Pack Generation
 * 
 * Ingests PDF/URL/text, extracts signals, and generates draft packs.
 * 
 * Usage:
 *   tsx scripts/ingest-niche.ts --workspace de --scenario government_office --level A1 --input-text "..."
 *   tsx scripts/ingest-niche.ts --workspace de --scenario work --level A2 --pdf ./inputs/office_handbook.pdf
 *   tsx scripts/ingest-niche.ts --workspace de --scenario housing --level A2 --url "https://example.com/rental-process"
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractText } from './ingest/extractText.js';
import { segmentText } from './ingest/segmenter.js';
import { extractSignals } from './ingest/signalExtractor.js';
import { planPacks } from './ingest/packPlanner.js';
import { generateDraftPrompts } from './ingest/draftPromptGenerator.js';
import { generateReport, writeReport } from './ingest/ingestReport.js';
import type { DraftPack, TextChunk, ExtractedSignal, PlannedPack } from './ingest/ingestTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

/**
 * Generate draft pack from planned pack
 */
async function generateDraftPack(
  plannedPack: PlannedPack,
  signals: ExtractedSignal[],
  scenario: string,
  level: string,
  source: string,
  sourcePath?: string,
  sourceUrl?: string
): Promise<DraftPack> {
  const prompts = generateDraftPrompts(plannedPack, signals, scenario, level);
  
  // Generate session plan from template
  const templatePath = join(__dirname, '..', 'content', 'templates', 'v1', 'scenarios', `${scenario}.json`);
  const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
  
  const sessionPlanSteps = template.stepBlueprint.map((step: any, stepIndex: number) => {
    const stepPromptStart = template.stepBlueprint
      .slice(0, stepIndex)
      .reduce((sum: number, s: any) => sum + s.promptCount, 0);
    const promptIds = prompts
      .slice(stepPromptStart, stepPromptStart + step.promptCount)
      .map(p => p.id);
    
    return {
      id: step.id,
      title: step.title,
      promptIds
    };
  });
  
  // Calculate estimated minutes
  const estimatedMinutes = Math.max(15, Math.min(120, prompts.length));
  
  // Generate analytics (simplified)
  const analytics = {
    goal: `Practice ${scenario} scenarios at ${level} level`,
    constraints: [
      `${plannedPack.register} register maintained`,
      `${scenario} scenario context`,
      `${plannedPack.primaryStructure} structure focus`
    ],
    levers: plannedPack.variationSlots.map(slot => `${slot} variation`),
    successCriteria: [
      `Uses scenario-appropriate vocabulary`,
      `Varies key slots across prompts`,
      `Maintains register consistency`
    ],
    commonMistakes: [
      `Missing scenario vocabulary`,
      `Inconsistent register usage`,
      `Incorrect slot variation`
    ],
    drillType: (scenario === 'government_office' || scenario === 'work' || scenario === 'restaurant')
      ? 'roleplay-bounded' as const
      : 'substitution' as const,
    cognitiveLoad: (level === 'A1' && plannedPack.variationSlots.length <= 2)
      ? 'low' as const
      : (level === 'A1' || (level === 'A2' && plannedPack.variationSlots.length <= 3))
      ? 'medium' as const
      : 'high' as const
  };
  
  const pack: DraftPack = {
    schemaVersion: 1,
    id: plannedPack.packId,
    kind: 'pack',
    title: plannedPack.title,
    level,
    estimatedMinutes,
    description: `Practice ${scenario} scenarios at ${level} level`,
    scenario,
    register: plannedPack.register,
    primaryStructure: plannedPack.primaryStructure,
    variationSlots: plannedPack.variationSlots,
    outline: template.stepBlueprint.map((step: any) => step.title),
    prompts,
    sessionPlan: {
      version: 1,
      steps: sessionPlanSteps
    },
    tags: plannedPack.tags,
    analytics,
    _ingestionMetadata: {
      source: source as any,
      sourcePath,
      sourceUrl,
      generatedAt: new Date().toISOString(),
      chunkIds: plannedPack.targetChunks
    }
  };
  
  return pack;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  let workspace = 'de';
  let scenario: string | null = null;
  let level = 'A1';
  let inputText: string | undefined;
  let pdfPath: string | undefined;
  let url: string | undefined;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--scenario' && i + 1 < args.length) {
      scenario = args[i + 1];
      i++;
    } else if (args[i] === '--level' && i + 1 < args.length) {
      level = args[i + 1];
      i++;
    } else if (args[i] === '--input-text' && i + 1 < args.length) {
      inputText = args[i + 1];
      i++;
    } else if (args[i] === '--pdf' && i + 1 < args.length) {
      pdfPath = args[i + 1];
      i++;
    } else if (args[i] === '--url' && i + 1 < args.length) {
      url = args[i + 1];
      i++;
    }
  }
  
  // Validate inputs
  if (!scenario) {
    console.error('❌ Error: --scenario is required');
    process.exit(1);
  }
  
  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  if (!validLevels.includes(level.toUpperCase())) {
    console.error(`❌ Error: Invalid level "${level}". Must be one of: ${validLevels.join(', ')}`);
    process.exit(1);
  }
  level = level.toUpperCase();
  
  // Determine source type
  let source: 'pdf' | 'url' | 'text';
  if (pdfPath) {
    source = 'pdf';
  } else if (url) {
    source = 'url';
  } else if (inputText) {
    source = 'text';
  } else {
    console.error('❌ Error: Must provide one of --input-text, --pdf, or --url');
    process.exit(1);
  }
  
  console.log(`\n📥 Starting ingestion pipeline...`);
  console.log(`   Workspace: ${workspace}`);
  console.log(`   Scenario: ${scenario}`);
  console.log(`   Level: ${level}`);
  console.log(`   Source: ${source}`);
  
  try {
    // Step 1: Extract text
    console.log(`\n1️⃣  Extracting text from ${source}...`);
    const rawText = await extractText(source, pdfPath, inputText, url);
    console.log(`   ✅ Extracted ${rawText.length} characters`);
    
    // Step 2: Segment text
    console.log(`\n2️⃣  Segmenting text into chunks...`);
    const chunks: TextChunk[] = segmentText(rawText);
    console.log(`   ✅ Created ${chunks.length} chunks`);
    
    // Step 3: Extract signals
    console.log(`\n3️⃣  Extracting signals from chunks...`);
    const signals: ExtractedSignal[] = chunks.map(chunk => extractSignals(chunk, scenario));
    console.log(`   ✅ Extracted signals from ${signals.length} chunks`);
    
    // Step 4: Plan packs
    console.log(`\n4️⃣  Planning packs from signals...`);
    const plannedPacks: PlannedPack[] = planPacks(signals, scenario, level);
    console.log(`   ✅ Planned ${plannedPacks.length} packs`);
    
    // Step 5: Generate draft packs
    console.log(`\n5️⃣  Generating draft packs...`);
    const draftPacks: DraftPack[] = await Promise.all(
      plannedPacks.map(plannedPack =>
        generateDraftPack(
          plannedPack,
          signals,
          scenario,
          level,
          source,
          pdfPath,
          url
        )
      )
    );
    console.log(`   ✅ Generated ${draftPacks.length} draft packs`);
    
    // Step 6: Write draft packs to draft folder
    console.log(`\n6️⃣  Writing draft packs...`);
    const draftDir = join(CONTENT_DIR, 'workspaces', workspace, 'draft', 'packs');
    for (const pack of draftPacks) {
      const packDir = join(draftDir, pack.id);
      if (!existsSync(packDir)) {
        mkdirSync(packDir, { recursive: true });
      }
      const packPath = join(packDir, 'pack.json');
      writeFileSync(packPath, JSON.stringify(pack, null, 2) + '\n', 'utf-8');
      console.log(`   ✅ Wrote ${pack.id} (${pack.prompts.length} prompts)`);
    }
    
    // Step 7: Generate report
    console.log(`\n7️⃣  Generating report...`);
    const report = generateReport(
      draftPacks,
      workspace,
      scenario,
      level,
      source,
      pdfPath,
      url,
      chunks.length,
      signals.length
    );
    writeReport(report);
    
    console.log(`\n✅ Ingestion complete!`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Generated ${draftPacks.length} draft packs`);
    console.log(`   - Total prompts: ${report.qualityGateSummary.totalPrompts}`);
    console.log(`   - Pass rate: ${(report.qualityGateSummary.passRate * 100).toFixed(1)}%`);
    console.log(`\n⚠️  Next steps:`);
    console.log(`   1. Review draft packs in: content/v1/workspaces/${workspace}/draft/packs/`);
    console.log(`   2. Check report: exports/ingest-report.${workspace}.${scenario}.*.md`);
    console.log(`   3. Fix any quality gate failures`);
    console.log(`   4. Promote approved packs: npm run content:promote-drafts -- ${draftPacks.map(p => p.id).join(' ')}`);
    
  } catch (error) {
    console.error(`\n❌ Error:`, error);
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error(`\nStack trace:\n${error.stack}`);
      }
    }
    process.exit(1);
  }
}

main();

